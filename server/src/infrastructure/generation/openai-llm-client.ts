import OpenAI from 'openai';
import type { LLMClient } from '../../domain/ports.js';

export class OpenAiLlmClient implements LLMClient {
  private readonly client: OpenAI;
  private readonly modelName: string;

  constructor(
    apiKey: string,
    baseURL?: string,
    modelName = 'gpt-4o-mini',
  ) {
    this.client = new OpenAI({
      apiKey,
      ...(baseURL ? { baseURL } : {}),
    });
    this.modelName = modelName;
  }

  public async generate(prompt: string, options?: { maxTokens?: number }): Promise<string> {
    try {
      const response = await this.client.chat.completions.create({
        model: this.modelName,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: options?.maxTokens ?? 2048,
      });

      return response.choices[0]?.message?.content ?? '';
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'unknown_error';
      console.error('OpenAI generation failed:', errorMessage);
      throw new Error(`OpenAI generation failed: ${errorMessage}`);
    }
  }
}
