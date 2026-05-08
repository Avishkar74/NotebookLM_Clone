import type { Chunker } from '../domain/ports.js';
import { DocumentChunk, type SourceType } from '../domain/models.js';

export class TextChunker implements Chunker {
  constructor(
    private readonly chunkSize = 1000,
    private readonly chunkOverlap = 200,
  ) {}

  public chunk(input: {
    text: string;
    sourceFile: string;
    sourceType: SourceType;
    pageNumber?: number | null;
    metadata?: Record<string, unknown>;
  }): DocumentChunk[] {
    const text = input.text.trim();
    if (!text) {
      return [];
    }

    const chunks: DocumentChunk[] = [];
    let start = 0;
    let chunkIndex = 0;

    while (start < text.length) {
      let end = Math.min(start + this.chunkSize, text.length);

      if (end < text.length) {
        const lastPeriod = text.lastIndexOf('.', end);
        const lastNewline = text.lastIndexOf('\n', end);
        const boundary = Math.max(lastPeriod, lastNewline);
        if (boundary > start + this.chunkSize * 0.5) {
          end = boundary + 1;
        }
      }

      const chunkText = text.slice(start, end).trim();
      if (chunkText) {
        chunks.push(
          new DocumentChunk(
            chunkText,
            input.sourceFile,
            input.sourceType,
            input.pageNumber ?? null,
            chunkIndex,
            start,
            end - 1,
            { ...(input.metadata ?? {}) },
          ),
        );
        chunkIndex += 1;
      }

      start = Math.max(start + 1, end - this.chunkOverlap);
    }

    return chunks;
  }
}