import type { DocumentChunk, EmbeddedChunk } from '../../domain/models.js';
import type { Embedder } from '../../domain/ports.js';
import { logger } from '../../utils/logger.js';

export class ResilientEmbedder implements Embedder {
  // Track per-source which embedder was used, keyed by sourceId
  // This survives across query requests within the same server instance
  private readonly sourceEmbedderMap = new Map<string, 'primary' | 'fallback'>();
  private lastDocumentEmbedder: 'primary' | 'fallback' | null = null;

  constructor(
    private readonly primary: Embedder,
    private readonly fallback: Embedder,
  ) {}

  public async embedDocuments(chunks: DocumentChunk[], sessionId?: string): Promise<EmbeddedChunk[]> {
    // Extract sourceId from first chunk's metadata for tracking
    const sourceId = (chunks[0]?.metadata?.sourceId as string | undefined) ?? 'unknown';

    try {
      const result = await this.primary.embedDocuments(chunks, sessionId);
      this.lastDocumentEmbedder = 'primary';
      this.sourceEmbedderMap.set(sourceId, 'primary');
      logger.info('embed_documents_primary_success', { sourceId, chunkCount: chunks.length });
      return result;
    } catch (error) {
      logger.warn('primary_embed_documents_failed_using_fallback', {
        error: error instanceof Error ? error.message : 'unknown_error',
        chunkCount: chunks.length,
        sourceId,
      });
      this.lastDocumentEmbedder = 'fallback';
      this.sourceEmbedderMap.set(sourceId, 'fallback');

      try {
        return await this.fallback.embedDocuments(chunks, sessionId);
      } catch (fallbackError) {
        // Both embedders failed — this is a hard error, not a silent degradation
        logger.error('both_embedders_failed', {
          primaryError: error instanceof Error ? error.message : 'unknown_error',
          fallbackError: fallbackError instanceof Error ? fallbackError.message : 'unknown_error',
          sourceId,
        });
        throw new Error(`Embedding completely failed. Primary: ${error instanceof Error ? error.message : 'unknown'}. Fallback: ${fallbackError instanceof Error ? fallbackError.message : 'unknown'}`);
      }
    }
  }

  /**
   * Embed a query, using the correct embedder based on which sources are being queried.
   * 
   * CRITICAL FIX: Documents and queries MUST use the same embedding space.
   * If documents were embedded with the fallback (hash) embedder, queries must also use
   * the fallback — otherwise cosine similarity will be near 0 and retrieval silently fails.
   */
  public async embedQuery(text: string, sourceIds?: string[]): Promise<number[]> {
    // Determine which embedder to use based on source context
    const requiredEmbedder = this.resolveQueryEmbedder(sourceIds);

    if (requiredEmbedder === 'fallback') {
      logger.warn('query_using_fallback_embedder_for_consistency', {
        reason: 'sources_were_indexed_with_fallback',
        sourceIds,
      });
      try {
        return await this.fallback.embedQuery(text);
      } catch (error) {
        logger.error('fallback_embed_query_failed', { error: error instanceof Error ? error.message : 'unknown_error' });
        throw error;
      }
    }

    // Use primary embedder
    try {
      return await this.primary.embedQuery(text);
    } catch (error) {
      logger.warn('primary_embed_query_failed_using_fallback', {
        error: error instanceof Error ? error.message : 'unknown_error',
      });
      return this.fallback.embedQuery(text, sourceIds);
    }
  }

  public async getDimension(): Promise<number> {
    try {
      return await this.primary.getDimension();
    } catch {
      return this.fallback.getDimension();
    }
  }

  public getStatus(): 'primary' | 'fallback' {
    return this.lastDocumentEmbedder || 'primary';
  }

  /**
   * Determine which embedder to use for a query.
   * If ALL selected sources used fallback → use fallback.
   * If ANY selected source used primary → use primary (mixed case, best effort).
   * If no source info available → use primary (optimistic).
   */
  private resolveQueryEmbedder(sourceIds?: string[]): 'primary' | 'fallback' {
    if (!sourceIds || sourceIds.length === 0) {
      // No source context: use whatever was used last, or primary
      return this.lastDocumentEmbedder ?? 'primary';
    }

    const embedderUsages = sourceIds
      .map((id) => this.sourceEmbedderMap.get(id))
      .filter((e): e is 'primary' | 'fallback' => e !== undefined);

    if (embedderUsages.length === 0) {
      // No tracking info for these sources (e.g. server restarted after indexing)
      // Optimistically try primary; if scores are all 0, user will see no results
      return this.lastDocumentEmbedder ?? 'primary';
    }

    // If ALL sources used fallback, use fallback
    const allFallback = embedderUsages.every((e) => e === 'fallback');
    return allFallback ? 'fallback' : 'primary';
  }

  /**
   * Register which embedder was used for a source (called externally when source info is loaded from storage)
   */
  public registerSourceEmbedder(sourceId: string, embedder: 'primary' | 'fallback'): void {
    this.sourceEmbedderMap.set(sourceId, embedder);
  }

  /**
   * Check if all given sources used the same embedder (for warning purposes)
   */
  public hasEmbedderMismatch(sourceIds: string[]): boolean {
    const embedders = new Set(
      sourceIds.map((id) => this.sourceEmbedderMap.get(id)).filter(Boolean)
    );
    return embedders.size > 1;
  }
}
