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

      const pageTexts: string[] = [];
      const pdf = await pdfParse(buffer, {
        pagerender: async (pageData: any) => {
          const textContent = await pageData.getTextContent();
          const text = textContent.items.map((item: any) => item.str).join(' ');
          pageTexts.push(text);
          return text;
        },
      });

      const rawPages = pageTexts.length > 0
        ? pageTexts
        : pdf.text.split(/\f+/g).filter((p: string) => p.trim().length > 0);

      const chunks: DocumentChunk[] = [];
      rawPages.forEach((pageText: string, index: number) => {
        const pageChunks = this.chunker.chunk({
          text: pageText.trim(),
          sourceFile: path.basename(absolutePath),
          sourceType: 'pdf',
          pageNumber: index + 1,
          metadata: {
            totalPages: rawPages.length,
            fileSize: stats.size,
            parsedAt: new Date().toISOString(),
          },
        });
        chunks.push(...pageChunks);
      });

      return chunks.filter((c) => c.content.trim().length > 20); // drop noise chunks
    }

    if (sourceType === 'csv') {
      let content = '';
      try {
        if (extension === '.csv') {
          // Try UTF-8 read first
          content = await fs.readFile(absolutePath, 'utf8');
        } else {
          // Force xlsx for .xlsx
          throw new Error('Use xlsx');
        }
      } catch (e) {
        const buffer = await fs.readFile(absolutePath);
        const XLSX = await import('xlsx');
        const workbook = XLSX.read(buffer, { type: 'buffer' });
        content = '';
        for (const sheetName of workbook.SheetNames) {
          const sheet = workbook.Sheets[sheetName];
          content += XLSX.utils.sheet_to_csv(sheet) + '\n\n';
        }
      }
      
      if (!content.trim()) {
        throw new Error('CSV/Excel file is empty or could not be read.');
      }

      return this.chunker.chunk({
        text: content,
        sourceFile: path.basename(absolutePath),
        sourceType: 'csv',
        metadata: {
          fileSize: stats.size,
          parsedAt: new Date().toISOString(),
        },
      });
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
    if (extension === '.xml') {
      return 'xml';
    }
    if (extension === '.csv' || extension === '.xlsx') {
      return 'csv';
    }
    return null;
  }
}