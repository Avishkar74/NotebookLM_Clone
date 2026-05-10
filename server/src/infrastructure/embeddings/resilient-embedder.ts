import type { DocumentChunk, EmbeddedChunk } from '../../domain/models.js';
import type { Embedder } from '../../domain/ports.js';
import { logger } from '../../utils/logger.js';

export class ResilientEmbedder implements Embedder {
  private lastDocumentEmbedder: 'primary' | 'fallback' | null = null;

  constructor(
    private readonly primary: Embedder,
    private readonly fallback: Embedder,
  ) {}

  public async embedDocuments(chunks: DocumentChunk[], sessionId?: string): Promise<EmbeddedChunk[]> {
    try {
      const result = await this.primary.embedDocuments(chunks, sessionId);
      this.lastDocumentEmbedder = 'primary';
      return result;
    } catch (error) {
      logger.warn('primary_embed_documents_failed_using_fallback', {
        error: error instanceof Error ? error.message : 'unknown_error',
        chunkCount: chunks.length,
      });
      this.lastDocumentEmbedder = 'fallback';
      return this.fallback.embedDocuments(chunks, sessionId);
    }
  }

  public async embedQuery(text: string): Promise<number[]> {
    try {
      const result = await this.primary.embedQuery(text);
      if (this.lastDocumentEmbedder === 'fallback') {
        logger.warn('embedder_mismatch_docs_used_fallback_query_used_primary', {
          message: 'Documents were embedded with fallback but query is using primary. Retrieval results may be unreliable.',
        });
      }
      return result;
    } catch (error) {
      logger.warn('primary_embed_query_failed_using_fallback', {
        error: error instanceof Error ? error.message : 'unknown_error',
      });
      if (this.lastDocumentEmbedder === 'primary') {
        logger.warn('embedder_mismatch_docs_used_primary_query_used_fallback', {
          message: 'Documents were embedded with primary but query is using fallback. Retrieval results may be unreliable.',
        });
      }
      return this.fallback.embedQuery(text);
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
}

