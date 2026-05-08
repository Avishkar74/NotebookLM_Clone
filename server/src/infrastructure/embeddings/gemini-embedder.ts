import { GoogleGenerativeAI } from '@google/generative-ai';
import { EmbeddedChunk, type DocumentChunk } from '../../domain/models.js';
import type { Embedder } from '../../domain/ports.js';

export class GeminiEmbedder implements Embedder {
  private readonly client: GoogleGenerativeAI;
  private readonly modelCache = new Map<string, ReturnType<GoogleGenerativeAI['getGenerativeModel']>>();
  private readonly modelCandidates: string[];

  constructor(
    apiKey: string,
    modelName = 'gemini-embedding-001',
    private readonly targetDimensions = 384,
  ) {
    this.client = new GoogleGenerativeAI(apiKey);
    this.modelCandidates = [modelName, 'gemini-embedding-001', 'gemini-embedding-2']
      .filter((value, index, all) => value && all.indexOf(value) === index);
  }

  private getModel(modelName: string) {
    if (!this.modelCache.has(modelName)) {
      this.modelCache.set(modelName, this.client.getGenerativeModel({ model: modelName }));
    }

    return this.modelCache.get(modelName)!;
  }

  public async embedDocuments(chunks: DocumentChunk[]): Promise<EmbeddedChunk[]> {
    const embeddings = await Promise.all(chunks.map((chunk) => this.embedDocumentText(chunk)));
    return chunks.map((chunk, index) => new EmbeddedChunk(chunk, embeddings[index], this.modelCandidates[0] ?? 'gemini-embedding-001'));
  }

  public async embedQuery(text: string): Promise<number[]> {
    return this.embedText(this.formatQueryText(text));
  }

  public async getDimension(): Promise<number> {
    const embedding = await this.embedText(this.formatQueryText('dimension probe'));
    return embedding.length;
  }

  private async embedDocumentText(chunk: DocumentChunk): Promise<number[]> {
    const title = chunk.sourceFile?.trim() || 'none';
    return this.embedText(`title: ${title} | text: ${chunk.content}`);
  }

  private formatQueryText(text: string): string {
    return `task: search result | query: ${text}`;
  }

  private async embedText(text: string): Promise<number[]> {
    const errors: string[] = [];

    for (const modelName of this.modelCandidates) {
      try {
        const response = await this.getModel(modelName).embedContent(text);
        const values = response.embedding?.values ?? [];
        if (!values.length) {
          throw new Error('Gemini embedding response did not include values');
        }

        return values.slice(0, this.targetDimensions);
      } catch (error) {
        errors.push(`${modelName}: ${error instanceof Error ? error.message : 'unknown_error'}`);
      }
    }

    throw new Error(`Gemini embedding failed for all models. ${errors.join(' | ')}`);
  }
}