import type { DocumentChunk, EmbeddedChunk } from '../../domain/models.js';
import type { Embedder } from '../../domain/ports.js';
import { logger } from '../../utils/logger.js';

export class ResilientEmbedder implements Embedder {
  // Track per-source which embedder was used, keyed by sourceId
  // This survives across query requests within the same server instance
  private readonly sourceEmbedderMap = new Map<string, number>();
  private lastDocumentEmbedderIndex: number | null = null;

  constructor(
    private readonly embedders: Embedder[],
  ) {}

  public async embedDocuments(chunks: DocumentChunk[], sessionId?: string): Promise<EmbeddedChunk[]> {
    const sourceId = (chunks[0]?.metadata?.sourceId as string | undefined) ?? 'unknown';
    const errors: string[] = [];

    for (let i = 0; i < this.embedders.length; i++) {
      try {
        const result = await this.embedders[i].embedDocuments(chunks, sessionId);
        this.lastDocumentEmbedderIndex = i;
        this.sourceEmbedderMap.set(sourceId, i);
        logger.info('embed_documents_success', { sourceId, embedderIndex: i, chunkCount: chunks.length });
        return result;
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        errors.push(`[${i}] ${msg}`);
        logger.warn('embedder_failed_trying_next', { sourceId, index: i, error: msg });
      }
    }

    logger.error('all_embedders_failed', { sourceId, errors });
    throw new Error(`All embedders failed. Chain: ${errors.join(' | ')}`);
  }

  public async embedQuery(text: string, sourceIds?: string[]): Promise<number[]> {
    const requiredIndex = this.resolveQueryEmbedderIndex(sourceIds);

    for (let i = requiredIndex; i < this.embedders.length; i++) {
      try {
        return await this.embedders[i].embedQuery(text);
      } catch (error) {
        logger.warn('query_embedder_failed_trying_next', { index: i, error: error instanceof Error ? error.message : 'unknown' });
      }
    }

    if (requiredIndex > 0) {
      for (let i = 0; i < requiredIndex; i++) {
        try {
          return await this.embedders[i].embedQuery(text);
        } catch (error) {
          logger.warn('query_embedder_fallback_failed', { index: i });
        }
      }
    }

    throw new Error('All query embedders failed');
  }

  public async getDimension(): Promise<number> {
    for (const e of this.embedders) {
      try {
        return await e.getDimension();
      } catch { continue; }
    }
    return 384;
  }

  public getStatus(): string {
    if (this.lastDocumentEmbedderIndex === null) return 'idle';
    return `embedder_${this.lastDocumentEmbedderIndex}`;
  }

  private resolveQueryEmbedderIndex(sourceIds?: string[]): number {
    if (!sourceIds || sourceIds.length === 0) {
      return this.lastDocumentEmbedderIndex ?? 0;
    }

    const indices = sourceIds
      .map((id) => this.sourceEmbedderMap.get(id))
      .filter((i): i is number => i !== undefined);

    if (indices.length === 0) {
      return this.lastDocumentEmbedderIndex ?? 0;
    }

    return Math.max(...indices);
  }

  public registerSourceEmbedder(sourceId: string, type: 'primary' | 'fallback' | number): void {
    if (typeof type === 'number') {
      this.sourceEmbedderMap.set(sourceId, type);
    } else {
      this.sourceEmbedderMap.set(sourceId, type === 'primary' ? 0 : 1);
    }
  }

  public hasEmbedderMismatch(sourceIds: string[]): boolean {
    const indices = new Set(
      sourceIds.map((id) => this.sourceEmbedderMap.get(id)).filter((i) => i !== undefined)
    );
    return indices.size > 1;
  }
}
