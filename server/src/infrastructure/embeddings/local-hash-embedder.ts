import { EmbeddedChunk, type DocumentChunk } from '../../domain/models.js';
import type { Embedder } from '../../domain/ports.js';

export class LocalHashEmbedder implements Embedder {
  constructor(private readonly dimensions = 384) {}

  public async embedDocuments(chunks: DocumentChunk[]): Promise<EmbeddedChunk[]> {
    return chunks.map((chunk) => new EmbeddedChunk(chunk, this.createVector(chunk.content), 'local-hash-embedder'));
  }

  public async embedQuery(text: string): Promise<number[]> {
    return this.createVector(text);
  }

  public async getDimension(): Promise<number> {
    return this.dimensions;
  }

  private createVector(text: string): number[] {
    const values = new Array<number>(this.dimensions).fill(0);
    const normalized = text.normalize('NFKC');

    for (let index = 0; index < normalized.length; index += 1) {
      const code = normalized.charCodeAt(index);
      const slot = (code * 31 + index * 17) % this.dimensions;
      values[slot] += 1;
    }

    const magnitude = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0));
    if (!magnitude) {
      return values;
    }

    return values.map((value) => value / magnitude);
  }
}
