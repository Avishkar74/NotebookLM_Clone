import fs from 'node:fs/promises';
import path from 'node:path';
import type { DocumentLoader } from '../../domain/ports.js';
import { DocumentChunk, type SourceType } from '../../domain/models.js';
import { TextChunker } from '../../utils/text-chunker.js';

export class LocalDocumentLoader implements DocumentLoader {
  private readonly chunker: TextChunker;

  constructor(chunkSize = 1000, chunkOverlap = 200) {
    this.chunker = new TextChunker(chunkSize, chunkOverlap);
  }

  public async load(filePath: string): Promise<DocumentChunk[]> {
    const absolutePath = path.resolve(filePath);
    const stats = await fs.stat(absolutePath);
    const extension = path.extname(absolutePath).toLowerCase();
    const sourceType = this.getSourceType(extension);

    if (!sourceType) {
      throw new Error(`Unsupported file format: ${extension}`);
    }

    if (sourceType === 'pdf') {
      const buffer = await fs.readFile(absolutePath);
      const pdfParseModule = await import('pdf-parse');
      const pdfParse: any = pdfParseModule.default;
      const pdf = await pdfParse(buffer);
      const pages = pdf.text.split(/\f+/g);
      const chunks: DocumentChunk[] = [];

      pages.forEach((pageText: string, index: number) => {
        const pageChunks = this.chunker.chunk({
          text: pageText,
          sourceFile: path.basename(absolutePath),
          sourceType: 'pdf',
          pageNumber: index + 1,
          metadata: {
            totalPages: pages.length,
            fileSize: stats.size,
            parsedAt: new Date().toISOString(),
          },
        });
        chunks.push(...pageChunks);
      });

      return chunks;
    }

    const content = await fs.readFile(absolutePath, 'utf8');
    return this.chunker.chunk({
      text: content,
      sourceFile: path.basename(absolutePath),
      sourceType,
      metadata: {
        fileSize: stats.size,
        encoding: 'utf8',
        parsedAt: new Date().toISOString(),
      },
    });
  }

  private getSourceType(extension: string): SourceType | null {
    if (extension === '.pdf') {
      return 'pdf';
    }
    if (extension === '.txt') {
      return 'txt';
    }
    if (extension === '.md') {
      return 'md';
    }
    return null;
  }
}