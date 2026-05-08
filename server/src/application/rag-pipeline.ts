import type { Embedder, LLMClient, MemoryStore, VectorStore } from '../domain/ports.js';
import type { RagAnswer, RetrievedChunk, RagSource } from '../domain/models.js';
import { logger } from '../utils/logger.js';

export class RagPipeline {
  constructor(
    private readonly embedder: Embedder,
    private readonly vectorStore: VectorStore,
    private readonly llmClient: LLMClient,
    private readonly memoryStore: MemoryStore,
  ) {}

  public async answer(input: {
    userId: string;
    sessionId: string;
    query: string;
    topK?: number;
    maxChunks?: number;
    maxContextChars?: number;
  }): Promise<RagAnswer> {
    const query = input.query.trim();
    if (!query) {
      return {
        query: input.query,
        response: 'Please provide a valid question.',
        sourcesUsed: [],
        retrievalCount: 0,
        mode: 'chat',
      };
    }

    const warnings: string[] = [];
    const searchResults = await this.tryRetrieve(query, input.topK ?? 10, warnings);
    const hasContext = searchResults.length > 0;

    const { context, sources } = this.formatContext(searchResults, input.maxChunks ?? 8, input.maxContextChars ?? 4000);
    let memoryContext = '';
    try {
      memoryContext = await this.memoryStore.getContext({ userId: input.userId, sessionId: input.sessionId });
    } catch (error) {
      logger.warn('memory_context_lookup_failed', {
        error: error instanceof Error ? error.message : 'unknown_error',
      });
    }

    const prompt = hasContext
      ? `You are an AI assistant that answers questions using only the provided source context.

Citation rules:
1. Every factual statement must include citations like [1], [2], etc.
2. Only use facts present in the context.
3. If the context does not contain the answer, say so clearly.
4. Prefer concise but complete answers.

Conversation memory context:
${memoryContext || 'No prior memory available.'}

Source context:
${context}

Question: ${query}

Answer with citations:`
      : `You are a research assistant in chat mode.

You currently have no retrievable source context or retrieval is unavailable. Provide the best helpful answer from general knowledge.
If you are uncertain, say so clearly.

Conversation memory context:
${memoryContext || 'No prior memory available.'}

Question: ${query}

Answer clearly and concisely:`;

    let response = '';
    try {
      response = await this.llmClient.generate(prompt, { maxTokens: 2000 });
    } catch (error) {
      logger.error('llm_generation_failed', {
        error: error instanceof Error ? error.message : 'unknown_error',
      });
      response = this.buildOfflineFallbackAnswer(query, searchResults);
      warnings.push('Chat generation is temporarily unavailable.');
    }

    const ragAnswer: RagAnswer = {
      query,
      response,
      sourcesUsed: hasContext ? sources : [],
      retrievalCount: searchResults.length,
      mode: hasContext ? 'rag' : 'chat',
      warnings,
    };

    try {
      await this.memoryStore.saveTurn({
        userId: input.userId,
        sessionId: input.sessionId,
        query,
        response,
        sourcesUsed: hasContext ? sources : [],
      });
    } catch (error) {
      logger.warn('memory_turn_save_failed', {
        error: error instanceof Error ? error.message : 'unknown_error',
      });
    }

    return ragAnswer;
  }

  public async summarize(input: {
    userId: string;
    sessionId: string;
    topK?: number;
    summaryLength?: 'short' | 'medium' | 'long';
  }): Promise<RagAnswer> {
    const searchResults = await this.vectorStore.search(await this.embedder.embedQuery('main topics key findings important information overview'), input.topK ?? 15);
    if (!searchResults.length) {
      return {
        query: 'Document Summary',
        response: 'No documents are available for summarization.',
        sourcesUsed: [],
        retrievalCount: 0,
      };
    }

    const { context, sources } = this.formatContext(searchResults, input.topK ?? 15, 6000);
    const lengthInstruction = {
      short: 'Provide a concise 2-3 paragraph summary highlighting the most important points.',
      medium: 'Provide a comprehensive 4-5 paragraph summary covering key topics and findings.',
      long: 'Provide a detailed summary with multiple sections covering all major topics and supporting details.',
    }[input.summaryLength ?? 'medium'];

    const prompt = `Summarize the provided document content using the citation references exactly as written.

${lengthInstruction}

Context:
${context}

Summary:`;

    const response = await this.llmClient.generate(prompt, { maxTokens: 1000 });

    return {
      query: 'Document Summary',
      response,
      sourcesUsed: sources,
      retrievalCount: searchResults.length,
    };
  }

  private formatContext(searchResults: RetrievedChunk[], maxChunks: number, maxContextChars: number): { context: string; sources: RagSource[] } {
    const contextParts: string[] = [];
    const sources: RagSource[] = [];
    let totalChars = 0;

    searchResults.slice(0, maxChunks).forEach((result, index) => {
      const citationRef = `[${index + 1}]`;
      const chunkText = `${citationRef} ${result.content}`;
      if (totalChars + chunkText.length > maxContextChars && contextParts.length) {
        return;
      }

      contextParts.push(chunkText);
      totalChars += chunkText.length;
      sources.push({
        reference: citationRef,
        sourceFile: result.citation.sourceFile,
        sourceType: result.citation.sourceType,
        pageNumber: result.citation.pageNumber ?? null,
        chunkId: result.id,
        relevanceScore: result.score,
      });
    });

    return {
      context: contextParts.join('\n\n'),
      sources,
    };
  }

  private async tryRetrieve(query: string, topK: number, warnings: string[]): Promise<RetrievedChunk[]> {
    try {
      const queryVector = await this.embedder.embedQuery(query);
      return await this.vectorStore.search(queryVector, topK);
    } catch (error) {
      logger.warn('retrieval_path_failed_falling_back_to_chat', {
        error: error instanceof Error ? error.message : 'unknown_error',
      });
      warnings.push('Retrieval is unavailable right now. Responding in chat mode.');
      return [];
    }
  }

  private buildOfflineFallbackAnswer(query: string, searchResults: RetrievedChunk[]): string {
    if (!searchResults.length) {
      return `I cannot reach the language model right now, but your request was received: "${query}". Please retry in a moment.`;
    }

    const snippets = searchResults
      .slice(0, 3)
      .map((item, index) => {
        const compact = item.content.replace(/\s+/g, ' ').trim().slice(0, 180);
        return `${index + 1}. ${compact}${compact.length >= 180 ? '…' : ''} [${index + 1}]`;
      })
      .join('\n');

    return `The language model is temporarily unavailable, so here are the most relevant source excerpts for your query:\n\n${snippets}`;
  }
}