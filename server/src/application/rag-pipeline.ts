import type { Embedder, LLMClient, MemoryStore, VectorStore } from '../domain/ports.js';
import type { RagAnswer, RetrievedChunk, RagSource } from '../domain/models.js';
import { GroundingLevel, QueryIntent } from '../domain/models.js';
import { logger } from '../utils/logger.js';
import type { ResilientEmbedder } from '../infrastructure/embeddings/resilient-embedder.js';

const MINIMUM_RETRIEVAL_SCORE = 0.20;
const STRONG_RETRIEVAL_SCORE = 0.55;
const MAX_MEMORY_CHARS = 1500;

// ─── Intent Classification ────────────────────────────────────────────────────

function classifyIntent(query: string): QueryIntent {
  const q = query.toLowerCase();

  // Metadata / source listing queries — NEVER need vector search
  if (/\b(what files|which files|what sources|list (my |the |)sources|what (do i|have i) (uploaded|added)|show (me |)(my |)(files|sources|documents))\b/.test(q)) {
    return QueryIntent.SOURCE_LISTING;
  }
  if (/\b(what (are|is) (in |)(my |the |)(sources|files|documents)|what (do i|have i) (have|got))\b/.test(q) && !/\b(content|say|about|discuss|explain|describe|detail)\b/.test(q)) {
    return QueryIntent.METADATA_QUERY;
  }

  // Summarization
  if (/\b(summarize|summary|overview|tldr|tl;dr|key (points|ideas|takeaways)|main (points|ideas|topics))\b/.test(q)) {
    return QueryIntent.SUMMARIZATION;
  }

  // Default to semantic content search
  return QueryIntent.SEMANTIC_CONTENT;
}

// ─── Grounding level determination ───────────────────────────────────────────

function determineGroundingLevel(
  retrievedChunks: RetrievedChunk[],
  hasFailedSources: boolean,
  hasFallbackSources: boolean,
  sourceCount: number,
): GroundingLevel {
  if (sourceCount === 0) return GroundingLevel.NO_SOURCES;
  if (retrievedChunks.length === 0 && hasFailedSources) return GroundingLevel.METADATA_ONLY;
  if (retrievedChunks.length === 0 && hasFallbackSources) return GroundingLevel.FALLBACK_INDEX;
  if (retrievedChunks.length === 0) return GroundingLevel.METADATA_ONLY;

  const avgScore = retrievedChunks.reduce((sum, r) => sum + r.score, 0) / retrievedChunks.length;
  if (retrievedChunks.length >= 3 && avgScore >= STRONG_RETRIEVAL_SCORE) return GroundingLevel.STRONG_GROUNDED;
  if (retrievedChunks.length > 0 && hasFailedSources) return GroundingLevel.PARTIAL_INDEX;
  return GroundingLevel.CHUNKS_RETRIEVED;
}

// ─── Source state info passed from the query handler ─────────────────────────

export interface SourceStateInfo {
  sourceId: string;
  embeddingFailed: boolean;
  embeddingModel: string;
  name: string;
}

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
    sourceStateInfo?: SourceStateInfo[];  // NEW: embedding state per source
  }): Promise<RagAnswer> {
    const query = input.query.trim();
    if (!query) {
      return {
        query: input.query,
        response: 'Please provide a valid question.',
        sourcesUsed: [],
        retrievalCount: 0,
        mode: 'chat',
        groundingLevel: GroundingLevel.NO_SOURCES,
      };
    }

    const warnings: string[] = [];

    // ── Analyze source states ─────────────────────────────────────────────────
    const sourceStateMap = new Map<string, SourceStateInfo>(
      (input.sourceStateInfo ?? []).map((s) => [s.sourceId, s])
    );
    const selectedSourceIds = input.sourceFiles ?? [];
    const hasSelectedSources = selectedSourceIds.length > 0;

    const failedSourceIds = selectedSourceIds.filter((id) => sourceStateMap.get(id)?.embeddingFailed === true);
    const fallbackSourceIds = selectedSourceIds.filter((id) => sourceStateMap.get(id)?.embeddingModel === 'local-hash-embedder');
    const retrievableSourceIds = selectedSourceIds.filter((id) => {
      const state = sourceStateMap.get(id);
      return !state?.embeddingFailed;
    });

    const hasFailedSources = failedSourceIds.length > 0;
    const hasFallbackSources = fallbackSourceIds.length > 0;
    const hasAnyRetrievableSource = retrievableSourceIds.length > 0;

    // Warn about failed sources upfront
    if (hasFailedSources) {
      const failedNames = failedSourceIds
        .map((id) => sourceStateMap.get(id)?.name ?? id)
        .join(', ');
      warnings.push(`Embedding failed for: ${failedNames}. These sources cannot be semantically searched.`);
    }

    if (hasFallbackSources) {
      warnings.push('Some sources use keyword-based indexing (semantic embedding failed). Retrieval quality is reduced.');
    }

    // ── Intent classification ─────────────────────────────────────────────────
    const intent = classifyIntent(query);

    // ── Metadata-only queries bypass vector search entirely ───────────────────
    if (intent === QueryIntent.SOURCE_LISTING || intent === QueryIntent.METADATA_QUERY) {
      return this.handleMetadataQuery(query, input, sourceStateMap, selectedSourceIds, warnings);
    }

    // ── If ALL selected sources have failed embeddings: hard block ────────────
    if (hasSelectedSources && !hasAnyRetrievableSource) {
      return this.buildEmbeddingFailedResponse(query, input, sourceStateMap, selectedSourceIds, warnings);
    }

    // ── Vector retrieval ──────────────────────────────────────────────────────
    const searchResults = await this.tryRetrieve(
      query,
      input.sessionId,
      input.topK ?? 10,
      warnings,
      // Only search sources that are actually retrievable
      retrievableSourceIds.length > 0 ? retrievableSourceIds : input.sourceFiles,
    );

    const filteredResults = searchResults.filter((r) => r.score >= MINIMUM_RETRIEVAL_SCORE);
    const diverseResults = this.applyMMR(filteredResults, 0.7, input.maxChunks ?? 8);
    const hasContext = diverseResults.length > 0;

    const groundingLevel = determineGroundingLevel(
      diverseResults,
      hasFailedSources,
      hasFallbackSources,
      selectedSourceIds.length,
    );

    const { context, sources } = this.formatContext(
      diverseResults,
      input.maxChunks ?? 8,
      input.maxContextChars ?? 3500,
    );

    // ── Memory context ────────────────────────────────────────────────────────
    let memoryContext = '';
    try {
      memoryContext = await this.memoryStore.getContext({
        userId: input.userId,
        sessionId: input.sessionId,
        activeSourceFiles: input.sourceFiles,
      });
      if (memoryContext.length > MAX_MEMORY_CHARS) {
        memoryContext = memoryContext.slice(-MAX_MEMORY_CHARS);
      }
    } catch (error) {
      logger.warn('memory_context_lookup_failed', {
        error: error instanceof Error ? error.message : 'unknown_error',
      });
    }

    // ── Prompt construction ───────────────────────────────────────────────────
    const selectedSourcesMetadata = selectedSourceIds.map((id) => {
      const state = sourceStateMap.get(id);
      const parts = id.split('::');
      return {
        id,
        name: state?.name ?? (parts.length > 1 ? parts[1] : id),
        embeddingFailed: state?.embeddingFailed ?? false,
        embeddingModel: state?.embeddingModel ?? 'unknown',
      };
    });

    const prompt = this.buildPrompt({
      query,
      hasContext,
      context,
      selectedSourcesMetadata,
      memoryContext,
      groundingLevel,
      hasFailedSources,
    });

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

    const ragAnswer: RagAnswer = {
      query,
      response,
      sourcesUsed: hasContext ? sources : [],
      retrievalCount: searchResults.length,
      mode: hasContext || hasSelectedSources ? 'rag' : 'chat',
      warnings,
      embedderStatus: this.getEmbedderStatus(),
      groundingLevel,
    };

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

  // ── Handle metadata/source-listing queries without vector search ─────────────

  private async handleMetadataQuery(
    query: string,
    input: Parameters<RagPipeline['answer']>[0],
    sourceStateMap: Map<string, SourceStateInfo>,
    selectedSourceIds: string[],
    warnings: string[],
  ): Promise<RagAnswer> {
    const sourceList = selectedSourceIds.map((id) => {
      const state = sourceStateMap.get(id);
      const parts = id.split('::');
      const name = state?.name ?? (parts.length > 1 ? parts[1] : id);
      const status = state?.embeddingFailed ? ' [⚠ Embedding Failed — content not searchable]'
        : state?.embeddingModel === 'local-hash-embedder' ? ' [⚡ Keyword Index Only]'
        : ' [✓ Semantic Index]';
      return `- ${name}${status}`;
    }).join('\n');

    const prompt = `You are a document assistant. The user is asking about their uploaded files, not the content inside them.

UPLOADED SOURCES (${selectedSourceIds.length} total):
${sourceList || 'No sources are currently selected.'}

RULES:
- List the sources clearly using the information above.
- If a source shows [⚠ Embedding Failed], explicitly state it cannot be searched.
- Do NOT speculate about the content of any file based on its filename.
- Do NOT say "this likely involves" or make any assumptions about file contents.
- Only state what you can observe: the filename and its indexing status.

USER QUESTION: ${query}

ANSWER:`;

    const activeLlmClient = input.llmClient ?? this.defaultLlmClient;
    let response = '';
    try {
      response = await activeLlmClient.generate(prompt, { maxTokens: 800 });
    } catch {
      response = selectedSourceIds.length > 0
        ? `You have ${selectedSourceIds.length} source(s) selected:\n${sourceList}`
        : 'No sources are currently selected.';
    }

    return {
      query,
      response,
      sourcesUsed: [],
      retrievalCount: 0,
      mode: 'rag',
      warnings,
      groundingLevel: GroundingLevel.METADATA_ONLY,
    };
  }

  // ── Hard block when ALL sources have failed embeddings ───────────────────────

  private buildEmbeddingFailedResponse(
    query: string,
    input: Parameters<RagPipeline['answer']>[0],
    sourceStateMap: Map<string, SourceStateInfo>,
    selectedSourceIds: string[],
    warnings: string[],
  ): RagAnswer {
    const sourceNames = selectedSourceIds
      .map((id) => sourceStateMap.get(id)?.name ?? id.split('::')[1] ?? id)
      .join(', ');

    const response = [
      `**Semantic retrieval is unavailable** for the selected source(s): ${sourceNames}`,
      '',
      'Embeddings were not successfully generated for these files. This means I cannot search their content or answer questions about what is inside them.',
      '',
      '**Why this happens:**',
      '- The embedding API (OpenAI/ChatAnywhere) failed or was rate-limited during upload',
      '- The API key may be invalid or have insufficient quota',
      '',
      '**To fix this:**',
      '1. Check the `CHATANYWHERE_API_KEY` and `BASE_URL` environment variables on the server',
      '2. Re-upload the affected files once the embedding service is working',
      '',
      'I will not speculate about the file contents based on their filenames.',
    ].join('\n');

    return {
      query,
      response,
      sourcesUsed: [],
      retrievalCount: 0,
      mode: 'rag',
      warnings: [...warnings, 'All selected sources have failed embeddings. Semantic retrieval is disabled.'],
      groundingLevel: GroundingLevel.METADATA_ONLY,
    };
  }

  // ── Prompt construction with strict grounding rules ──────────────────────────

  private buildPrompt(input: {
    query: string;
    hasContext: boolean;
    context: string;
    selectedSourcesMetadata: Array<{ id: string; name: string; embeddingFailed: boolean; embeddingModel: string }>;
    memoryContext: string;
    groundingLevel: GroundingLevel;
    hasFailedSources: boolean;
  }): string {
    const { query, hasContext, context, selectedSourcesMetadata, memoryContext, groundingLevel, hasFailedSources } = input;

    const sourceList = selectedSourcesMetadata
      .map((s) => `- ${s.name}${s.embeddingFailed ? ' [EMBEDDING FAILED — not searchable]' : ''}`)
      .join('\n');

    if (hasContext) {
      return `You are a strict source-grounded AI assistant. You ONLY answer from the provided retrieved passages.

[SELECTED DOCUMENTS]
${sourceList || 'None selected.'}

[RETRIEVED PASSAGES — these are the ONLY facts you may use]
${context}

ABSOLUTE RULES — NEVER VIOLATE THESE:
1. ONLY use information from [RETRIEVED PASSAGES] above. Do NOT use any other knowledge.
2. NEVER speculate, infer, or extrapolate beyond what the passages explicitly state.
3. NEVER say "this likely involves" or "this probably means" or "based on the title".
4. NEVER blend in your pre-trained knowledge about the topic.
5. Cite every factual claim with [1], [2], etc. referencing the passage numbers.
6. If the passages don't contain enough to answer fully, say exactly what you found and what's missing.
${hasFailedSources ? '7. Some sources had embedding failures and could not be searched — acknowledge this if relevant.' : ''}

[PRIOR CONVERSATION — for tone reference only, do NOT mix facts from here into your answer]
${memoryContext || 'None.'}

[QUESTION]
${query}

[ANSWER — grounded strictly in the retrieved passages above]`;
    }

    // No context retrieved — strict no-hallucination response
    if (selectedSourcesMetadata.length > 0) {
      const failedSources = selectedSourcesMetadata.filter((s) => s.embeddingFailed);
      const workingSources = selectedSourcesMetadata.filter((s) => !s.embeddingFailed);

      const failedNote = failedSources.length > 0
        ? `\nNote: ${failedSources.map((s) => s.name).join(', ')} had embedding failures and cannot be searched.`
        : '';

      return `You are a strict source-grounded AI assistant.

[SELECTED DOCUMENTS]
${sourceList}${failedNote}

SITUATION: The user's query did not retrieve any matching passages from the document content.

ABSOLUTE RULES — NEVER VIOLATE THESE:
1. Do NOT speculate about what any document contains based on its filename or title.
2. Do NOT say "this assignment likely involves" or any similar inference from filenames.
3. Do NOT draw on your pre-trained knowledge to answer questions about these documents.
4. Do NOT pretend you can see the document contents.

YOU MUST respond with EXACTLY this type of message:
"I can see these files are selected: [list filenames]. However, no matching content was retrieved for your question. ${failedSources.length > 0 ? 'Some sources had embedding failures and their content is not searchable. ' : ''}${workingSources.length > 0 ? "For the sources that are indexed, try rephrasing your question or ask about specific topics you know are in the documents." : "Please re-upload your files once the embedding service is working."}"

Do NOT add anything beyond this. No guesses, no general knowledge, no topic overviews.

[QUESTION]
${query}

[ANSWER]`;
    }

    // No sources selected at all — pure chat mode
    return `You are a helpful AI assistant. No document sources are currently selected.

[PRIOR CONVERSATION]
${memoryContext || 'None.'}

[QUESTION]
${query}

[ANSWER]`;
  }

  public async summarize(input: {
    userId: string;
    sessionId: string;
    topK?: number;
    summaryLength?: 'short' | 'medium' | 'long';
    llmClient?: LLMClient;
    sourceFiles?: string[];
    sourceStateInfo?: SourceStateInfo[];
  }): Promise<RagAnswer> {
    const searchResults = await this.vectorStore.search(
      await this.embedder.embedQuery('main topics key findings important information overview'),
      input.topK ?? 15,
      { sessionId: input.sessionId, sourceFiles: input.sourceFiles },
    );

    if (!searchResults.length) {
      return {
        query: 'Document Summary',
        response: 'No indexed document content is available for summarization. Please ensure your sources were successfully embedded.',
        sourcesUsed: [],
        retrievalCount: 0,
        groundingLevel: GroundingLevel.NO_SOURCES,
      };
    }

    const { context, sources } = this.formatContext(searchResults, input.topK ?? 15, 6000);
    const lengthInstruction = {
      short: 'Provide a concise 2-3 paragraph summary highlighting the most important points.',
      medium: 'Provide a comprehensive 4-5 paragraph summary covering key topics and findings.',
      long: 'Provide a detailed summary with multiple sections covering all major topics and supporting details.',
    }[input.summaryLength ?? 'medium'];

    const prompt = `Summarize the provided document content. Base your summary ONLY on the context below.
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
      groundingLevel: GroundingLevel.CHUNKS_RETRIEVED,
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
      // Pass sourceIds to embedder so it can use the correct embedding space
      const queryVector = await (this.embedder as ResilientEmbedder & Embedder).embedQuery
        ? (this.embedder as any).embedQuery(query, sourceFiles)
        : this.embedder.embedQuery(query);

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