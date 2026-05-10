import crypto from 'node:crypto';

export enum SourceState {
  UPLOADED = 'uploaded',
  CHUNKED = 'chunked',
  EMBEDDING_PENDING = 'embedding_pending',
  EMBEDDING_FAILED = 'embedding_failed',
  INDEXED = 'indexed',
  RETRIEVAL_READY = 'retrieval_ready',
}

export enum GroundingLevel {
  NO_SOURCES = 'no_sources',
  METADATA_ONLY = 'metadata_only',
  PARTIAL_INDEX = 'partial_index',
  CHUNKS_RETRIEVED = 'chunks_retrieved',
  STRONG_GROUNDED_CONTEXT = 'strong_grounded_context',
}

export type SourceType = 'pdf' | 'txt' | 'md' | 'web' | 'audio' | 'xml' | 'csv';

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
    // FIXED: include sourceFile and sourceId in hash to prevent cross-source collisions
    // Previously only hashed content, so duplicate content in different sources → same chunkId
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
    // FIXED: include source_id field for stable source filtering
    const sourceId = (this.chunk.metadata?.sourceId as string | undefined) ?? this.chunk.sourceFile;
    return {
      id: this.chunk.chunkId,
      vector: this.embedding,
      session_id: this.sessionId ?? 'default',
      source_id: sourceId,            // ← NEW: stable canonical source identifier
      content: this.chunk.content,
      source_file: this.chunk.sourceFile,  // kept for display/citation purposes
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
  attribution?: Array<{ statement: string; source: 'metadata' | 'retrieved_chunk' | 'cached_summary' | 'pretrained_model_knowledge' }>;
}

export interface IngestSummary {
  id: string;       // ← Now matches source_id stored in vector DB
  name: string;     // display name
  sourceType: SourceType;
  chunkCount: number;
  vectorIds: string[];
  warnings?: string[];
  state: SourceState;
}
