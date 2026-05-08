import crypto from 'node:crypto';

export type SourceType = 'pdf' | 'txt' | 'md' | 'web' | 'audio';

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
    const hash = crypto.createHash('md5').update(this.content).digest('hex').slice(0, 8);
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
  ) {}

  public toVectorRecord(): Record<string, unknown> {
    return {
      id: this.chunk.chunkId,
      vector: this.embedding,
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
}

export interface IngestSummary {
  id: string;
  name: string;
  sourceType: SourceType;
  chunkCount: number;
  vectorIds: string[];
  warnings?: string[];
}
