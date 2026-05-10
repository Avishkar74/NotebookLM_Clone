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
    const embeddings = await Promise.all(chunks.map((chunk) => this.embedText(chunk.content)));
    return chunks.map((chunk, index) => new EmbeddedChunk(chunk, embeddings[index], this.modelName, sessionId));
  }

  public async embedQuery(text: string): Promise<number[]> {
    return this.embedText(text);
  }

  public async getDimension(): Promise<number> {
    const embedding = await this.embedText('dimension probe');
    return embedding.length;
  }

  private async embedText(text: string): Promise<number[]> {
    try {
      const response = await this.client.embeddings.create({
        model: this.modelName,
        input: text,
        dimensions: this.targetDimensions,
      });

      const values = response.data[0]?.embedding ?? [];
      return values.slice(0, this.targetDimensions);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'unknown_error';
      throw new Error(`OpenAI embedding failed: ${errorMessage}`);
    }
  }
}
