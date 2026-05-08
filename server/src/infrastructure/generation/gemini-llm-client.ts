import { GoogleGenerativeAI } from '@google/generative-ai';
import type { LLMClient } from '../../domain/ports.js';

export class GeminiLlmClient implements LLMClient {
  private readonly client: GoogleGenerativeAI;
  private readonly modelNames: string[];
  private readonly modelCache = new Map<string, ReturnType<GoogleGenerativeAI['getGenerativeModel']>>();

  constructor(
    apiKey: string,
    modelName = 'gemini-2.5-flash',
  ) {
    this.client = new GoogleGenerativeAI(apiKey);
    this.modelNames = [modelName, 'gemini-2.5-flash', 'gemini-1.5-flash']
      .filter((value, index, all) => value && all.indexOf(value) === index);
  }

  private getModel(modelName: string) {
    if (!this.modelCache.has(modelName)) {
      this.modelCache.set(modelName, this.client.getGenerativeModel({ model: modelName }));
    }

    return this.modelCache.get(modelName)!;
  }

  public async generate(prompt: string, options?: { maxTokens?: number }): Promise<string> {
    const errors: string[] = [];

    for (const modelName of this.modelNames) {
      try {
        const result = await this.getModel(modelName).generateContent({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            maxOutputTokens: options?.maxTokens ?? 2048,
          },
        });

        return result.response.text();
      } catch (error) {
        errors.push(`${modelName}: ${error instanceof Error ? error.message : 'unknown_error'}`);
      }
    }

    throw new Error(`All configured Gemini generation models failed. ${errors.join(' | ')}`);
  }
}