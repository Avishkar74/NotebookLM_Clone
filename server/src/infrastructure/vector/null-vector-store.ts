import type { EmbeddedChunk, RetrievedChunk } from '../../domain/models.js';
import type { VectorStore } from '../../domain/ports.js';

export class NullVectorStore implements VectorStore {
  public async ensureCollection(): Promise<void> {
    return;
  }

  public async upsert(_chunks: EmbeddedChunk[]): Promise<string[]> {
    return [];
  }

  public async search(_queryVector: number[], _limit: number): Promise<RetrievedChunk[]> {
    return [];
  }

  public async getById(_id: string): Promise<Record<string, unknown> | null> {
    return null;
  }

  public async clear(): Promise<void> {
    return;
  }
}
