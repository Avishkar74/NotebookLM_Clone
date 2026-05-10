import type { Embedder, LLMClient, MemoryStore, VectorStore } from '../domain/ports.js';
import type { RagAnswer, RetrievedChunk, RagSource } from '../domain/models.js';
import { GroundingLevel, SourceState } from '../domain/models.js';
import { logger } from '../utils/logger.js';

const MINIMUM_RETRIEVAL_SCORE = 0.20; 
const MAX_MEMORY_CHARS = 1500;        

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
    const { userId, sessionId, query, sourceFiles } = input;
    const warnings: string[] = [];

    // 1. Fetch metadata and evaluate grounding readiness
    const selectedSourcesMetadata: Array<{ id: string; name: string; state: SourceState }> = [];
    if (sourceFiles && sourceFiles.length > 0) {
      for (const id of sourceFiles) {
        try {
          const meta = await this.memoryStore.getMetadata({ userId, sessionId, sourceId: id });
          const parts = id.split('::');
          const name = parts.length > 1 ? parts[1] : id;
          selectedSourcesMetadata.push({
            id,
            name,
            state: (meta?.state as SourceState) ?? SourceState.RETRIEVAL_READY,
          });
        } catch (error) {
          logger.warn('metadata_fetch_failed', { id, error });
        }
      }
    }

    const failedSources = selectedSourcesMetadata.filter(s => s.state === SourceState.EMBEDDING_FAILED);
    if (failedSources.length > 0) {
      warnings.push(`The following sources have failed embeddings and cannot be used for semantic search: ${failedSources.map(s => s.name).join(', ')}`);
    }

    // 2. Intent Classification
    const isMetadataQuery = /what (are|is|in) (your |the |my |)sources|assignments|files|uploaded|index/i.test(query);
    
    // 3. Retrieval Orchestration
    let searchResults: RetrievedChunk[] = [];
    let groundingLevel = GroundingLevel.NO_SOURCES;

    if (selectedSourcesMetadata.length > 0) {
      groundingLevel = GroundingLevel.METADATA_ONLY;
      
      // Only perform vector search if we have valid sources and it's not a pure metadata query
      const hasReadySources = selectedSourcesMetadata.some(s => s.state === SourceState.RETRIEVAL_READY);
      if (!isMetadataQuery && hasReadySources) {
        searchResults = await this.tryRetrieve(query, sessionId, input.topK ?? 10, warnings, sourceFiles);
      }
    }

    const diverseResults = this.applyMMR(searchResults, 0.6, input.maxChunks ?? 8);
    const { context, sources } = this.formatContext(diverseResults, input.maxChunks ?? 8, input.maxContextChars ?? 4000);
    const hasContext = diverseResults.length > 0;

    if (hasContext) {
      groundingLevel = diverseResults.some(r => r.score > 0.6) 
        ? GroundingLevel.STRONG_GROUNDED_CONTEXT 
        : GroundingLevel.CHUNKS_RETRIEVED;
    }

    // 4. Memory/History
    const memoryContext = await this.memoryStore.getContext({ userId, sessionId, activeSourceFiles: sourceFiles });

    // 5. Prompt Engineering with Attribution Tracking
    const sourceListString = selectedSourcesMetadata.map(s => `- ${s.name} [State: ${s.state}]`).join('\n');

    const prompt = `You are a professional research assistant (NotebookLM Clone). Your goal is to provide STRICTLY grounded answers based on the provided documents.

[SELECTED DOCUMENTS — Metadata Only Knowledge]
${sourceListString || 'None selected.'}

[RETRIEVED PASSAGES — Content Knowledge]
${context || 'No matching passages retrieved for this query.'}

STRICT GROUNDING RULES:
1. If sources are selected but no passages are retrieved, NEVER speculate about the content from the filename.
2. If you see "Assignment 03 — Google NotebookLM RAG.pdf" but no passages exist, respond: "I can see this assignment is in your notebook, but I haven't retrieved any matching content from inside it yet."
3. DO NOT use pretrained knowledge to fill gaps. If the document says nothing about a topic, say you don't know.
4. If you use information from the [SELECTED DOCUMENTS] list (like the title), label it as "From Metadata".
5. If you use information from the [RETRIEVED PASSAGES] list, cite it using [1], [2], etc.
6. PROHIBITED: "This assignment likely involves...", "This sounds like...", "Based on my general knowledge...".

[CONVERSATION HISTORY — Tone reference only]
${memoryContext || 'No prior conversation.'}

[QUESTION]
${query}

[ANSWER — Be concise and factual]`;

    const activeLlmClient = input.llmClient ?? this.defaultLlmClient;
    let response = '';
    try {
      response = await activeLlmClient.generate(prompt, { maxTokens: 2000 });
    } catch (error) {
      logger.error('llm_generation_failed', { error: error instanceof Error ? error.message : 'unknown_error' });
      response = this.buildOfflineFallbackAnswer(query, diverseResults);
      warnings.push('LLM generation failed.');
    }

    const ragAnswer: RagAnswer = {
      query,
      response,
      sourcesUsed: sources,
      retrievalCount: searchResults.length,
      mode: (selectedSourcesMetadata.length > 0) ? 'rag' : 'chat',
      warnings,
      embedderStatus: this.getEmbedderStatus(),
      groundingLevel,
    };

    // 6. Persistence
    await this.memoryStore.saveTurn({
      userId,
      sessionId,
      query,
      response,
      sourcesUsed: sources,
      activeSourceFiles: sourceFiles,
    });

    return ragAnswer;
  }

  public async summarize(input: {
    userId: string;
    sessionId: string;
    topK?: number;
    summaryLength?: 'short' | 'medium' | 'long';
    llmClient?: LLMClient;
    sourceFiles?: string[];
  }): Promise<RagAnswer> {
    const searchResults = await this.tryRetrieve(
      'main topics key findings important information overview summary',
      input.sessionId,
      input.topK ?? 15,
      [],
      input.sourceFiles
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

  private async tryRetrieve(
    query: string,
    sessionId: string,
    topK: number,
    warnings: string[],
    sourceFiles?: string[],
  ): Promise<RetrievedChunk[]> {
    if (Array.isArray(sourceFiles) && sourceFiles.length === 0) {
      return [];
    }

    try {
      const queryVector = await this.embedder.embedQuery(query);
      const filter: { sessionId?: string; sourceFiles?: string[] } = { sessionId };
      if (Array.isArray(sourceFiles) && sourceFiles.length > 0) {
        filter.sourceFiles = sourceFiles;
      }
      return await this.vectorStore.search(queryVector, topK, filter);
    } catch (error) {
      logger.warn('retrieval_failed', { error });
      warnings.push('Retrieval is unavailable right now.');
      return [];
    }
  }

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