import crypto from 'node:crypto';

export type SourceType = 'pdf' | 'txt' | 'md' | 'web' | 'audio' | 'xml' | 'csv';

// ─── Source ingestion lifecycle states ───────────────────────────────────────
export enum SourceState {
  UPLOADED = 'UPLOADED',
  CHUNKED = 'CHUNKED',
  EMBEDDING_PENDING = 'EMBEDDING_PENDING',
  EMBEDDING_FAILED = 'EMBEDDING_FAILED',
  EMBEDDING_FALLBACK = 'EMBEDDING_FALLBACK',  // embedded but with hash fallback
  INDEXED = 'INDEXED',
  RETRIEVAL_READY = 'RETRIEVAL_READY',
}

// ─── Retrieval grounding quality levels ──────────────────────────────────────
export enum GroundingLevel {
  NO_SOURCES = 'NO_SOURCES',
  METADATA_ONLY = 'METADATA_ONLY',       // sources selected but embeddings failed
  FALLBACK_INDEX = 'FALLBACK_INDEX',     // indexed with hash embedder (low quality)
  PARTIAL_INDEX = 'PARTIAL_INDEX',       // some sources failed, some succeeded
  CHUNKS_RETRIEVED = 'CHUNKS_RETRIEVED', // semantic retrieval succeeded
  STRONG_GROUNDED = 'STRONG_GROUNDED',   // high-score semantic chunks retrieved
}

// ─── Intent classification ────────────────────────────────────────────────────
export enum QueryIntent {
  METADATA_QUERY = 'METADATA_QUERY',       // "what files do I have", "list my sources"
  SOURCE_LISTING = 'SOURCE_LISTING',       // "show me my documents"
  SEMANTIC_CONTENT = 'SEMANTIC_CONTENT',   // "what does X say about Y"
  SUMMARIZATION = 'SUMMARIZATION',         // "summarize", "overview"
  CONVERSATIONAL = 'CONVERSATIONAL',       // general chat
}

export interface CitationInfo {
  sourceFile: string;
  sourceType: SourceType;
  chunkId: string;
  chunkIndex: number;
  pageNumber?: number | null;
  startChar?: number | null;
  endChar?: number | null;
  metadata: Record<string, unknown>;
}

export class DocumentChunk {
  public readonly chunkId: string;

  constructor(
    public readonly content: string,
    public readonly sourceFile: string,
    public readonly sourceType: SourceType,
    public readonly pageNumber: number | null = null,
    public readonly chunkIndex = 0,
    public readonly startChar: number | null = null,
    public readonly endChar: number | null = null,
    public readonly metadata: Record<string, unknown> = {},
    chunkId?: string,
  ) {
    this.chunkId = chunkId ?? this.createChunkId();
  }

  private createChunkId(): string {
    const sourceId = (this.metadata?.sourceId as string | undefined) ?? this.sourceFile;
    const hashInput = `${sourceId}::${this.chunkIndex}::${this.content.slice(0, 200)}`;
    const hash = crypto.createHash('sha256').update(hashInput).digest('hex').slice(0, 12);
    return `${this.sourceType}_${this.chunkIndex}_${hash}`;
  }

  public getCitationInfo(): CitationInfo {
    return {
      sourceFile: this.sourceFile,
      sourceType: this.sourceType,
      chunkId: this.chunkId,
      chunkIndex: this.chunkIndex,
      pageNumber: this.pageNumber,
      startChar: this.startChar,
      endChar: this.endChar,
      metadata: { ...this.metadata },
    };
  }
}

export class EmbeddedChunk {
  constructor(
    public readonly chunk: DocumentChunk,
    public readonly embedding: number[],
    public readonly embeddingModel: string,
    public readonly sessionId?: string,
  ) {}

  public toVectorRecord(): Record<string, unknown> {
    const sourceId = (this.chunk.metadata?.sourceId as string | undefined) ?? this.chunk.sourceFile;
    return {
      id: this.chunk.chunkId,
      vector: this.embedding,
      session_id: this.sessionId ?? 'default',
      source_id: sourceId,
      content: this.chunk.content,
      source_file: this.chunk.sourceFile,
      source_type: this.chunk.sourceType,
      page_number: this.chunk.pageNumber ?? -1,
      chunk_index: this.chunk.chunkIndex,
      start_char: this.chunk.startChar ?? -1,
      end_char: this.chunk.endChar ?? -1,
      metadata: this.chunk.metadata,
      embedding_model: this.embeddingModel,
    };
  }
}

export interface RetrievedChunk {
  id: string;
  score: number;
  content: string;
  citation: {
    sourceFile: string;
    sourceType: SourceType;
    pageNumber?: number | null;
    chunkIndex: number;
    startChar?: number | null;
    endChar?: number | null;
  };
  metadata: Record<string, unknown>;
  embeddingModel: string;
}

export interface RagSource {
  reference: string;
  sourceFile: string;
  sourceType: SourceType;
  pageNumber?: number | null;
  chunkId: string;
  relevanceScore: number;
}

export interface RagAnswer {
  query: string;
  response: string;
  sourcesUsed: RagSource[];
  retrievalCount: number;
  mode?: 'chat' | 'rag';
  warnings?: string[];
  generationTokens?: number;
  embedderStatus?: 'primary' | 'fallback';
  groundingLevel?: GroundingLevel;
}

export interface IngestSummary {
  id: string;
  name: string;
  sourceType: SourceType;
  chunkCount: number;
  vectorIds: string[];
  warnings?: string[];
  embeddingFailed: boolean;
  embeddingModel: string;
}
