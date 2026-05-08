import type { DocumentChunk, EmbeddedChunk, RetrievedChunk, RagAnswer, SourceType } from './models.js';

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
  embedDocuments(chunks: DocumentChunk[]): Promise<EmbeddedChunk[]>;
  embedQuery(text: string): Promise<number[]>;
  getDimension(): Promise<number>;
}

export interface VectorStore {
  ensureCollection(): Promise<void>;
  upsert(chunks: EmbeddedChunk[]): Promise<string[]>;
  search(queryVector: number[], limit: number): Promise<RetrievedChunk[]>;
  getById(id: string): Promise<Record<string, unknown> | null>;
  clear(): Promise<void>;
}

export interface LLMClient {
  generate(prompt: string, options?: { maxTokens?: number }): Promise<string>;
}

export interface MemoryStore {
  ensureSession(input: { userId: string; sessionId: string; userName?: string }): Promise<void>;
  saveTurn(input: { userId: string; sessionId: string; query: string; response: string; sourcesUsed: unknown[] }): Promise<void>;
  saveMetadata(input: { userId: string; sessionId: string; label: string; payload: Record<string, unknown> }): Promise<void>;
  getContext(input: { userId: string; sessionId: string }): Promise<string>;
  searchRelevant(input: { userId: string; query: string; limit?: number }): Promise<Array<Record<string, unknown>>>;
}
