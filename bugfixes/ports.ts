import type { DocumentChunk, EmbeddedChunk, RetrievedChunk, SourceType } from './models.js';

export interface DocumentLoader {
  load(filePath: string): Promise<DocumentChunk[]>;
}

export interface WebLoader {
  load(url: string): Promise<DocumentChunk[]>;
  preview(url: string): Promise<Record<string, unknown>>;
}

export interface AudioTranscriber {
  transcribe(filePath: string): Promise<DocumentChunk[]>;
}

export interface Chunker {
  chunk(input: {
    text: string;
    sourceFile: string;
    sourceType: SourceType;
    pageNumber?: number | null;
    metadata?: Record<string, unknown>;
  }): DocumentChunk[];
}

export interface Embedder {
  embedDocuments(chunks: DocumentChunk[], sessionId?: string): Promise<EmbeddedChunk[]>;
  embedQuery(text: string): Promise<number[]>;
  getDimension(): Promise<number>;
}

export interface VectorStore {
  ensureCollection(): Promise<void>;
  upsert(chunks: EmbeddedChunk[]): Promise<string[]>;
  // FIXED: sourceFiles now documented as part of the filter type (was missing in implementation)
  search(
    queryVector: number[],
    limit: number,
    filter?: { sessionId?: string; sourceFiles?: string[] },
  ): Promise<RetrievedChunk[]>;
  getById(id: string): Promise<Record<string, unknown> | null>;
  clear(): Promise<void>;
}

export interface LLMClient {
  generate(prompt: string, options?: { maxTokens?: number }): Promise<string>;
}

export interface MemoryStore {
  ensureSession(input: { userId: string; sessionId: string; userName?: string }): Promise<void>;
  // FIXED: saveTurn accepts activeSourceFiles to enable source-aware memory filtering
  saveTurn(input: {
    userId: string;
    sessionId: string;
    query: string;
    response: string;
    sourcesUsed: unknown[];
    activeSourceFiles?: string[];
  }): Promise<void>;
  saveMetadata(input: { userId: string; sessionId: string; label: string; payload: Record<string, unknown> }): Promise<void>;
  // FIXED: getContext accepts activeSourceFiles to filter memory by source context
  getContext(input: { userId: string; sessionId: string; activeSourceFiles?: string[] }): Promise<string>;
  searchRelevant(input: { userId: string; query: string; limit?: number }): Promise<Array<Record<string, unknown>>>;
}
