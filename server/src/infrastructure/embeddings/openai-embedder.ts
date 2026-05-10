import OpenAI from 'openai';
import { EmbeddedChunk, type DocumentChunk } from '../../domain/models.js';
import type { Embedder } from '../../domain/ports.js';

export class OpenAiEmbedder implements Embedder {
  private readonly client: OpenAI;
  private readonly modelName: string;

  constructor(
    apiKey: string,
    baseURL: string,
    modelName = 'text-embedding-3-small',
    private readonly targetDimensions = 384,
  ) {
    this.client = new OpenAI({
      apiKey,
      baseURL,
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
    let lastError: any;
    
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const response = await this.client.embeddings.create({
          model: this.modelName,
          input: text,
          dimensions: this.targetDimensions,
        });

        const values = response.data[0]?.embedding ?? [];
        
        // Bug 4 Fix: Strict dimension validation
        if (values.length !== this.targetDimensions) {
          throw new Error(
            `Embedding dimension mismatch: expected ${this.targetDimensions}, got ${values.length}. ` +
            `Check that your BASE_URL provider supports the 'dimensions' parameter.`
          );
        }
        
        return values;
      } catch (error: any) {
        lastError = error;
        const isRateLimit = error?.status === 429 || error?.message?.includes('rate limit');
        
        if (isRateLimit && attempt < retries - 1) {
          const delay = Math.pow(2, attempt) * 1000;
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
        
        if (!isRateLimit) break; // Don't retry non-rate-limit errors
      }
    }

    const errorMessage = lastError instanceof Error ? lastError.message : 'unknown_error';
    throw new Error(`OpenAI embedding failed after ${retries} attempts: ${errorMessage}`);
  }
}
