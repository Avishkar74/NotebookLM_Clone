import fs from 'node:fs/promises';
import path from 'node:path';
import { AssemblyAI } from 'assemblyai';
import type { AudioTranscriber } from '../../domain/ports.js';
import { DocumentChunk } from '../../domain/models.js';
import { TextChunker } from '../../utils/text-chunker.js';

export class AssemblyAiAudioTranscriber implements AudioTranscriber {
  private readonly client: any;
  private readonly chunker: TextChunker;

  constructor(apiKey: string, chunkSize = 1000, chunkOverlap = 100) {
    this.client = new AssemblyAI({ apiKey });
    this.chunker = new TextChunker(chunkSize, chunkOverlap);
  }

  public async transcribe(filePath: string): Promise<DocumentChunk[]> {
    const absolutePath = path.resolve(filePath);
    await fs.stat(absolutePath);

    const transcript = await this.client.transcripts.transcribe({
      audio: absolutePath,
      speaker_labels: true,
      punctuate: true,
      language_code: 'en',
    });

    if (transcript.status === 'error') {
      throw new Error(`Transcription failed: ${transcript.error}`);
    }

    const transcriptText = transcript.text ?? '';
    return this.chunker.chunk({
      text: transcriptText,
      sourceFile: path.basename(absolutePath),
      sourceType: 'audio',
      metadata: {
        transcriptionId: transcript.id,
        confidence: transcript.confidence ?? null,
        audioDuration: transcript.audio_duration ?? null,
        createdAt: new Date().toISOString(),
      },
    });
  }
}