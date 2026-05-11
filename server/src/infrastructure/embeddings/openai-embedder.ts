import OpenAI from 'openai';
import { EmbeddedChunk, type DocumentChunk } from '../../domain/models.js';
import type { Embedder } from '../../domain/ports.js';

export class OpenAiEmbedder implements Embedder {
  private readonly client: OpenAI;
  private readonly modelName: string;

  constructor(
    apiKey: string,
    baseURL?: string,
    modelName = 'text-embedding-3-small',
    private readonly targetDimensions = 384,
  ) {
    this.client = new OpenAI({
      apiKey,
      ...(baseURL ? { baseURL } : {}),
    });
    this.modelName = modelName;
  }

  public async embedDocuments(chunks: DocumentChunk[], sessionId?: string): Promise<EmbeddedChunk[]> {
    return this.embedDocumentsInBatches(chunks, sessionId);
  }

  public async embedQuery(text: string, _sourceIds?: string[]): Promise<number[]> {
    return this.embedText(text);
  }

  public async getDimension(): Promise<number> {
    const embedding = await this.embedText('dimension probe');
    return embedding.length;
  }

  private async embedDocumentsInBatches(
    chunks: DocumentChunk[],
    sessionId?: string,
    batchSize = 3
  ): Promise<EmbeddedChunk[]> {
    const results: EmbeddedChunk[] = [];
    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);
      const embeddings = await Promise.all(
        batch.map((c) => this.embedText(c.content))
      );
      results.push(
        ...batch.map(
          (chunk, idx) =>
            new EmbeddedChunk(chunk, embeddings[idx], this.modelName, sessionId)
        )
      );
      
      if (i + batchSize < chunks.length) {
        // Simple rate limit pause between batches
        await new Promise((r) => setTimeout(r, 500));
      }
    }
    return results;
  }

  private async embedText(text: string, retries = 3): Promise<number[]> {
    let lastError: unknown;

    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const response = await this.client.embeddings.create({
          model: this.modelName,
          input: text,
          // REMOVED: dimensions parameter — not supported by ChatAnywhere/most proxies
          // We normalize the output below instead
        });

        const values = response.data[0]?.embedding ?? [];

        if (values.length === 0) {
          throw new Error('Empty embedding returned from API');
        }

        // Normalize to target dimensions — handles any provider
        if (values.length >= this.targetDimensions) {
          // Truncation is valid for Matryoshka models (text-embedding-3-*)
          // and a safe approximation for ada-002 / other providers
          if (values.length > this.targetDimensions) {
            console.warn(`Embedding provider returned ${values.length} dims instead of requested ${this.targetDimensions}. Truncating.`);
          }
          return values.slice(0, this.targetDimensions);
        }

        // Values shorter than target (unusual) — zero-pad to maintain dimension consistency
        console.warn(`Embedding provider returned ${values.length} dims (fewer than ${this.targetDimensions}). Padding with zeros.`);
        return [
          ...values,
          ...new Array(this.targetDimensions - values.length).fill(0),
        ];
      } catch (error: unknown) {
        lastError = error;
        const errMsg = error instanceof Error ? error.message : String(error);
        const isRateLimit =
          (error as { status?: number })?.status === 429 ||
          errMsg.includes('rate limit') ||
          errMsg.includes('429');

        if (isRateLimit && attempt < retries - 1) {
          const delay = Math.pow(2, attempt) * 1500;
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }

        // Log non-rate-limit errors but still retry once more for transient issues (500s)
        if (!isRateLimit && attempt === retries - 1) {
          break;
        }
        
        // Wait a bit before retrying even non-rate-limit errors
        await new Promise((r) => setTimeout(r, 500));
      }
    }

    const errorMessage = lastError instanceof Error ? lastError.message : 'unknown_error';
    throw new Error(`Embedding failed after ${retries} attempts: ${errorMessage}`);
  }
}
