import type { Embedder, LLMClient, MemoryStore, VectorStore } from '../domain/ports.js';
import type { RagAnswer, RetrievedChunk, RagSource } from '../domain/models.js';
import { logger } from '../utils/logger.js';

const MINIMUM_RETRIEVAL_SCORE = 0.30; // discard low-relevance chunks
const MAX_MEMORY_CHARS = 1500;        // cap memory context to protect source context budget

export class RagPipeline {
  constructor(
    private readonly embedder: Embedder,
    private readonly vectorStore: VectorStore,
    private readonly defaultLlmClient: LLMClient,
    private readonly memoryStore: MemoryStore,
  ) {}

  public async answer(input: {
    userId: string;
    sessionId: string;
    query: string;
    topK?: number;
    maxChunks?: number;
    maxContextChars?: number;
    llmClient?: LLMClient;
    sourceFiles?: string[];
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

    // FIXED: strict distinction between "all sources" (undefined) and "no sources" ([])
    const searchResults = await this.tryRetrieve(
      query,
      input.sessionId,
      input.topK ?? 10,
      warnings,
      input.sourceFiles,
    );

    // Apply score threshold and MMR diversity
    const filteredResults = searchResults.filter((r) => r.score >= MINIMUM_RETRIEVAL_SCORE);
    const diverseResults = this.applyMMR(filteredResults, 0.7, input.maxChunks ?? 8);
    const hasContext = diverseResults.length > 0;

    const { context, sources } = this.formatContext(
      diverseResults,
      input.maxChunks ?? 8,
      input.maxContextChars ?? 3500,
    );

    // FIXED: memory context is source-aware and capped to prevent contamination
    let memoryContext = '';
    try {
      memoryContext = await this.memoryStore.getContext({
        userId: input.userId,
        sessionId: input.sessionId,
        activeSourceFiles: input.sourceFiles,
      });
      // Cap memory context length
      if (memoryContext.length > MAX_MEMORY_CHARS) {
        memoryContext = memoryContext.slice(-MAX_MEMORY_CHARS);
      }
    } catch (error) {
      logger.warn('memory_context_lookup_failed', {
        error: error instanceof Error ? error.message : 'unknown_error',
      });
    }

    // FIXED: Parse stable IDs back to display names for the LLM
    const sourceNames = input.sourceFiles?.map(id => {
      const parts = id.split('::');
      return parts.length > 1 ? parts[1] : id;
    }) ?? [];

    const prompt = hasContext
      ? `You are an AI assistant that answers questions using ONLY the SOURCE CONTEXT blocks below.

STRICT RULES:
- Answer factual questions using ONLY the [SOURCE CONTEXT] section.
- The [CONVERSATION HISTORY] is provided only so you can maintain conversational flow and avoid re-explaining things the user already knows. Do NOT extract facts from it.
- If the source context does not contain the answer, respond: "The selected sources do not contain information about this."
- Cite sources using their reference numbers [1], [2], etc.

[SELECTED SOURCES]
${sourceNames.join(', ') || 'None'}

[CONVERSATION HISTORY — tone reference only, NOT a factual source]
${memoryContext || 'No prior conversation.'}

[SOURCE CONTEXT — your ONLY factual reference]
${context}

[QUESTION]
${query}

[ANSWER]`
      : `You are a research assistant. You have access to the following documents, but the specific question did not match any stored text passages.

[SELECTED SOURCES]
${sourceNames.join(', ') || 'None'}

STRICT RULES:
- If sources are listed above, NEVER claim you cannot access or view them. 
- Acknowledge that the sources exist but explain that no relevant passages were found for this specific query.
- Answer from general knowledge only if relevant, but be transparent about the lack of specific retrieved data.

[CONVERSATION HISTORY]
${memoryContext || 'No prior conversation.'}

[QUESTION]
${query}

[ANSWER]`;

    const activeLlmClient = input.llmClient ?? this.defaultLlmClient;
    let response = '';
    try {
      response = await activeLlmClient.generate(prompt, { maxTokens: 2000 });
    } catch (error) {
      logger.error('llm_generation_failed', {
        error: error instanceof Error ? error.message : 'unknown_error',
      });
      response = this.buildOfflineFallbackAnswer(query, diverseResults);
      warnings.push('Chat generation is temporarily unavailable.');
    }

    const isSourceGrounded = (input.sourceFiles?.length ?? 0) > 0;
    const ragAnswer: RagAnswer = {
      query,
      response,
      sourcesUsed: hasContext ? sources : [],
      retrievalCount: searchResults.length,
      mode: hasContext || isSourceGrounded ? 'rag' : 'chat',
      warnings,
      embedderStatus: this.getEmbedderStatus(),
    };

    // FIXED: saveTurn now includes active source files so memory can be source-scoped
    try {
      await this.memoryStore.saveTurn({
        userId: input.userId,
        sessionId: input.sessionId,
        query,
        response,
        sourcesUsed: hasContext ? sources : [],
        activeSourceFiles: input.sourceFiles ?? [],
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
    llmClient?: LLMClient;
    sourceFiles?: string[];   // FIXED: was missing
  }): Promise<RagAnswer> {
    const searchResults = await this.vectorStore.search(
      await this.embedder.embedQuery('main topics key findings important information overview'),
      input.topK ?? 15,
      { sessionId: input.sessionId, sourceFiles: input.sourceFiles }, // FIXED: pass sourceFiles
    );
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

    const prompt = `Summarize the provided document content.
${lengthInstruction}

Context:
${context}

Summary:`;

    const activeLlmClient = input.llmClient ?? this.defaultLlmClient;
    const response = await activeLlmClient.generate(prompt, { maxTokens: 1000 });

    return {
      query: 'Document Summary',
      response,
      sourcesUsed: sources,
      retrievalCount: searchResults.length,
    };
  }

  private formatContext(
    searchResults: RetrievedChunk[],
    maxChunks: number,
    maxContextChars: number,
  ): { context: string; sources: RagSource[] } {
    const contextParts: string[] = [];
    const sources: RagSource[] = [];
    let totalChars = 0;

    searchResults.slice(0, maxChunks).forEach((result, index) => {
      const citationRef = `[${index + 1}]`;
      const pageInfo = result.citation.pageNumber ? ` p.${result.citation.pageNumber}` : '';
      const confidence = Math.round(result.score * 100);
      const header = `${citationRef} [${result.citation.sourceFile}${pageInfo} — ${confidence}% match]`;
      const chunkText = `${header}\n${result.content}`;

      if (totalChars + chunkText.length >= maxContextChars && contextParts.length > 0) {
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

  // FIXED: explicit distinction between undefined (search all) and [] (no sources, return empty)
  private async tryRetrieve(
    query: string,
    sessionId: string,
    topK: number,
    warnings: string[],
    sourceFiles?: string[],
  ): Promise<RetrievedChunk[]> {
    // Explicitly empty array means "no sources selected" — return nothing
    if (Array.isArray(sourceFiles) && sourceFiles.length === 0) {
      return [];
    }

    try {
      const queryVector = await this.embedder.embedQuery(query);
      const filter: { sessionId?: string; sourceFiles?: string[] } = { sessionId };
      if (Array.isArray(sourceFiles) && sourceFiles.length > 0) {
        filter.sourceFiles = sourceFiles;
      }
      const results = await this.vectorStore.search(queryVector, topK, filter);
      return results;
    } catch (error) {
      logger.warn('retrieval_path_failed_falling_back_to_chat', {
        error: error instanceof Error ? error.message : 'unknown_error',
      });
      warnings.push('Retrieval is unavailable right now. Responding in chat mode.');
      return [];
    }
  }

  // MMR: Maximal Marginal Relevance — balance relevance vs diversity
  private applyMMR(results: RetrievedChunk[], lambda = 0.7, topK = 8): RetrievedChunk[] {
    if (results.length <= topK) return results;

    const selected: RetrievedChunk[] = [results[0]];
    const remaining = [...results.slice(1)];

    while (selected.length < topK && remaining.length > 0) {
      let bestScore = -Infinity;
      let bestIndex = 0;

      remaining.forEach((candidate, i) => {
        const relevance = candidate.score;
        const maxOverlap = Math.max(
          ...selected.map((s) => this.textOverlap(s.content, candidate.content)),
        );
        const mmrScore = lambda * relevance - (1 - lambda) * maxOverlap;
        if (mmrScore > bestScore) {
          bestScore = mmrScore;
          bestIndex = i;
        }
      });

      selected.push(remaining[bestIndex]);
      remaining.splice(bestIndex, 1);
    }

    return selected;
  }

  private textOverlap(a: string, b: string): number {
    const aWords = new Set(a.toLowerCase().split(/\s+/));
    const bWords = b.toLowerCase().split(/\s+/);
    const intersection = bWords.filter((w) => aWords.has(w)).length;
    return intersection / Math.max(aWords.size, bWords.length, 1);
  }

  public getEmbedderStatus(): 'primary' | 'fallback' {
    if ('getStatus' in this.embedder) {
      return (this.embedder as { getStatus(): 'primary' | 'fallback' }).getStatus();
    }
    return 'primary';
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

    return `The language model is temporarily unavailable. Here are the most relevant source excerpts:\n\n${snippets}`;
  }
}