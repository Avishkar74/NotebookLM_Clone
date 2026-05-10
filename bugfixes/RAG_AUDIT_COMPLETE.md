# NotebookLM RAG System — Complete Audit Report

> Senior AI Engineer / RAG Systems Audit  
> Audit Date: 2025  
> Severity legend: 🔴 Critical · 🟠 High · 🟡 Medium · 🔵 Low

---

## Executive Summary

The system suffers from **three independently fatal bugs** that combine to produce both reported issues:

1. **Source ID / `source_file` key mismatch** — the value stored in the vector DB never matches what the frontend sends as a filter, so Milvus always ignores the filter entirely.
2. **Memory context contamination** — every prior conversation turn (from any source selection) is injected verbatim into the next prompt, leaking information across source boundaries.
3. **`MilvusVectorStore.search` parameter type narrower than the port** — TypeScript compile-time regression risk that can silently drop the `sourceFiles` filter at runtime depending on build tooling.

Several additional hidden bugs are also documented below.

---

## Part 1 — Root Cause Analysis

### 🔴 Bug 1A — Source ID / `source_file` Value Mismatch (Primary Cause of Unfiltered Retrieval)

**Files:** `server/src/application/ingestion-service.ts`, `server/src/infrastructure/vector/milvus-vector-store.ts`, `server/src/routes/json-routes.ts`

**What's stored in Milvus `source_file`:**

| Ingest type | `source_file` value stored in vector DB |
|-------------|------------------------------------------|
| Text paste  | `input.title` → e.g. `"Copied Text"` |
| File upload | `input.displayName ?? path.basename(filePath)` → e.g. `"Assignment 03.pdf"` |
| URL         | `chunks[0]?.sourceFile` → scraped page title → e.g. `"Built-in React DOM Hooks"` |

**What `IngestSummary.id` (sent back to frontend) contains:**

| Ingest type | `id` returned to frontend |
|-------------|---------------------------|
| Text paste  | `` `text-${Date.now()}` `` → e.g. `"text-1748612345678"` |
| File upload | `input.filePath` → e.g. `"/tmp/1748612345678-Assignment 03.pdf"` |
| URL         | `input.url` → e.g. `"https://react.dev/..."` |

**Why it fails:** The frontend stores the `id` (returned by ingest) to track selected sources. When the user selects sources and queries, the frontend sends `sourceFiles: ["text-1748612345678"]` in the request body. The backend builds the Milvus filter:

```
source_file in ["text-1748612345678"]
```

`source_file` in Milvus is `"Copied Text"`, not `"text-1748612345678"`. **Zero rows match.** But because `tryRetrieve` then receives an empty array, it falls through to the prompt with no context — OR if the filter is syntactically invalid, Milvus may silently ignore it, returning ALL results. Either way, source isolation is broken.

**Exact broken logic in `ingestion-service.ts`:**
```ts
// ingestText — line 17
return {
  id: `text-${Date.now()}`,   // ← SENT TO FRONTEND as the source identifier
  name: input.title,           // ← STORED in vector DB as source_file
  ...
};

// ingestFile — line 53
return {
  id: input.filePath,          // ← temp path, deleted after ingest!
  name: input.displayName ?? path.basename(input.filePath), // ← stored in vector DB
  ...
};

// ingestUrl — line 80
return {
  id: input.url,               // ← URL
  name: chunks[0]?.sourceFile, // ← scraped page title stored in vector DB
  ...
};
```

The `id` and the `name` (which becomes `source_file`) **are never the same value.**

---

### 🔴 Bug 1B — `MilvusVectorStore.search` Parameter Type Narrower Than Port Interface

**File:** `server/src/infrastructure/vector/milvus-vector-store.ts`, line 71

```ts
// PORT interface (ports.ts) — correct:
search(queryVector: number[], limit: number, filter?: { sessionId?: string; sourceFiles?: string[] }): Promise<RetrievedChunk[]>;

// IMPLEMENTATION (milvus-vector-store.ts) — BROKEN:
public async search(queryVector: number[], limit: number, filter?: { sessionId?: string }): Promise<RetrievedChunk[]> {
//                                                                    ^^^^^^^^^^^^^^^^^^^^ sourceFiles is MISSING from the type
```

The implementation type is narrower than the interface. While TypeScript's structural typing means this compiles (the implementation type satisfies the interface's input contravariance), any strict-mode linter or future refactor that calls `filter.sourceFiles` on the implementation type directly will error. Inside the function body, `filter?.sourceFiles` is accessed — TypeScript will flag this as `Property 'sourceFiles' does not exist on type '{ sessionId?: string }'` in strict mode, potentially causing a build failure that silently removes the filter.

---

### 🔴 Bug 2 — Memory Context Contamination (Source Leak Across Sessions)

**File:** `server/src/application/rag-pipeline.ts`, lines 46–72

```ts
let memoryContext = '';
memoryContext = await this.memoryStore.getContext({ userId, sessionId });

const prompt = hasContext
  ? `You are an AI assistant that answers questions using only the provided source context.
...
Conversation memory context:
${memoryContext}         // ← INJECTS ALL PRIOR TURNS regardless of what sources were selected then

Source context:
${context}

Question: ${query}
Answer:`
```

**Why it fails:** `getContext` returns the last 6 Q&A turns:

```ts
return turns
  .slice(-6)
  .map((turn) => `User: ${turn.query}\nAssistant: ${turn.response}`)
  .join('\n\n');
```

If at turn 3 all 4 sources were selected and the assistant said "The assignment is Assignment 03 — Google NotebookLM which requires building a RAG pipeline...", that full text is now in `memoryContext`. At turn 4 when only "Copied Text" is selected, the LLM receives that prior answer verbatim in the prompt — it can reason from it even if the current source context is empty.

This explains the second screenshot: "what is in the context you have?" correctly reports assignment info because the LLM is reading it from `memoryContext`, not from the current retrieval. The model is technically telling the truth — it **does** have it in its context window, just not from the currently selected source.

---

### 🟠 Bug 3 — `tryRetrieve` Silently Falls Through When `sourceFiles` Is `undefined`

**File:** `server/src/application/rag-pipeline.ts`, lines 117–127

```ts
private async tryRetrieve(query: string, sessionId: string, topK: number, warnings: string[], sourceFiles?: string[]): Promise<RetrievedChunk[]> {
  if (sourceFiles && sourceFiles.length === 0) {
    return [];       // ← correctly handles "no sources selected"
  }
  // If sourceFiles is undefined, we fall through and search ALL chunks in session
  const queryVector = await this.embedder.embedQuery(query);
  return await this.vectorStore.search(queryVector, topK, { sessionId, sourceFiles });
}
```

If the frontend omits `sourceFiles` from the request body (undefined), the check `sourceFiles && sourceFiles.length === 0` is false, and we search without a source filter. This means if the frontend has a bug where it doesn't send `sourceFiles` in some edge case (e.g., on initial load, after state rehydration, or during debounce), retrieval is completely unfiltered.

The check should distinguish between "caller passed no filter" vs "caller explicitly passed an empty filter". The current logic conflates `undefined` with "search all".

---

### 🟠 Bug 4 — Single Shared `defaultSessionId` Mixes All Users' Chunks

**File:** `server/src/config/env.ts`, `server/src/routes/json-routes.ts`

```ts
defaultSessionId: process.env.DEFAULT_SESSION_ID ?? 'default-session',
```

```ts
const sessionId = String(request.body.sessionId ?? container.env.defaultSessionId);
```

If multiple browser tabs, users, or notebook sessions all omit a `sessionId`, they all write to and read from `'default-session'`. The Milvus `session_id` filter then includes everyone's chunks. This is a multi-tenancy failure — even if source filtering were working, session isolation wouldn't be.

---

### 🟡 Bug 5 — `summarize()` in `RagPipeline` Has No Source Filtering

**File:** `server/src/application/rag-pipeline.ts`, lines 88–118

```ts
public async summarize(input: { userId; sessionId; topK?; summaryLength?; llmClient? }): Promise<RagAnswer> {
  const searchResults = await this.vectorStore.search(
    await this.embedder.embedQuery('main topics key findings...'),
    input.topK ?? 15,
    { sessionId: input.sessionId }   // ← sourceFiles not passed
  );
```

Summarization always reads all sources in the session — source selection is ignored entirely for this endpoint.

---

### 🟡 Bug 6 — `chunkId` Collisions Cause Silent Vector Overwrite

**File:** `server/src/domain/models.ts`, `DocumentChunk.createChunkId()`

```ts
private createChunkId(): string {
  const hash = crypto.createHash('md5').update(this.content).digest('hex').slice(0, 8);
  return `${this.sourceType}_${this.chunkIndex}_${hash}`;
}
```

If two different documents have identical text at chunk index 3 (e.g., a copyright footer, a repeated paragraph), they produce the same `chunkId`. Milvus `upsert` will overwrite the first with the second. One source's chunks silently disappear.

---

### 🟡 Bug 7 — Embedder Mismatch Between Document Ingestion and Query Time

**File:** `server/src/infrastructure/embeddings/resilient-embedder.ts`

```ts
public async embedQuery(text: string): Promise<number[]> {
  try {
    const result = await this.primary.embedQuery(text);
    if (this.lastDocumentEmbedder === 'fallback') {
      logger.warn('embedder_mismatch_docs_used_fallback_query_used_primary', ...);
    }
    return result;
  } catch (error) {
    return this.fallback.embedQuery(text);
  }
}
```

The logger warns but **doesn't fix** the mismatch. If documents were embedded with the `LocalHashEmbedder` (384-dim random hash) and the query uses `OpenAiEmbedder` (384-dim semantic), the cosine similarity scores are meaningless — no relevant chunks will be retrieved. This is exactly the "direct question fails, indirect question retrieves it" pattern: hash embeddings may accidentally match on character overlap but not semantics.

---

### 🟡 Bug 8 — PDF Page Splitting Uses Form Feed Character (Often Missing)

**File:** `server/src/infrastructure/document/local-document-loader.ts`, line 37

```ts
const pages = pdf.text.split(/\f+/g);
```

`pdf-parse` uses `\f` (form feed) to delimit pages only for some PDF types. Many modern PDFs — especially digitally exported ones like assignment PDFs — produce a single flat text string with no `\f`. All text lands in `pages[0]`, chunked as "page 1". The assignment content may sit in a single 100k+ character string that gets chunked poorly, splitting key sentences like "Assignment 03 — Google NotebookLM: Build a RAG-powered application" across chunk boundaries, destroying semantic coherence.

---

### 🔵 Bug 9 — `IngestSummary.id` for File Returns Deleted Temp Path

**File:** `server/src/application/ingestion-service.ts`, line 70

```ts
return {
  id: input.filePath,   // ← "/tmp/1748612345678-Assignment 03.pdf"
```

The temp file is deleted in the route handler's `finally` block after ingest. The frontend receives an `id` pointing to a file that no longer exists and can never be used to retrieve the actual file. This is a dead reference.

---

## Part 2 — Exact Code Fixes

### Fix 1 — Align `IngestSummary.id` with `source_file` in Vector DB

The canonical fix: make `id` equal to the value stored as `source_file` in the vector store. Use the `name` (display name) as the canonical source key, and make it unique by appending a timestamp hash only when necessary.

**`server/src/application/ingestion-service.ts`** — replace all three `return` statements:

```ts
// BEFORE (ingestText):
return {
  id: `text-${Date.now()}`,
  name: input.title,
  ...
};

// AFTER:
return {
  id: input.title,          // ← now matches source_file stored in vector DB
  name: input.title,
  sourceType: 'txt',
  chunkCount: chunks.length,
  vectorIds,
  warnings,
};
```

```ts
// BEFORE (ingestFile):
return {
  id: input.filePath,
  name: input.displayName ?? path.basename(input.filePath),
  ...
};

// AFTER:
const sourceName = input.displayName ?? path.basename(input.filePath);
return {
  id: sourceName,           // ← matches source_file in vector DB
  name: sourceName,
  sourceType: chunks[0]?.sourceType ?? 'txt',
  chunkCount: chunks.length,
  vectorIds,
  warnings,
};
```

```ts
// BEFORE (ingestUrl):
return {
  id: input.url,
  name: chunks[0]?.sourceFile ?? new URL(input.url).hostname,
  ...
};

// AFTER:
const urlSourceName = chunks[0]?.sourceFile ?? new URL(input.url).hostname;
return {
  id: urlSourceName,        // ← matches source_file in vector DB
  name: urlSourceName,
  sourceType: 'web',
  chunkCount: chunks.length,
  vectorIds,
  warnings,
};
```

**Caveat — uniqueness:** If two sources share the same display name (two files both named "report.pdf"), `id` collision at the vector filter level will OR them both. To handle this, append a deterministic hash. See the Architectural Improvement section for the recommended `sourceId` metadata field approach.

---

### Fix 2 — Fix `MilvusVectorStore.search` Parameter Type

**`server/src/infrastructure/vector/milvus-vector-store.ts`** — line 71, fix the method signature:

```ts
// BEFORE:
public async search(queryVector: number[], limit: number, filter?: { sessionId?: string }): Promise<RetrievedChunk[]> {

// AFTER:
public async search(
  queryVector: number[],
  limit: number,
  filter?: { sessionId?: string; sourceFiles?: string[] },
): Promise<RetrievedChunk[]> {
```

---

### Fix 3 — Fix Memory Context Contamination

**`server/src/application/rag-pipeline.ts`** — modify the prompt construction to clearly isolate what the model may use, and add source boundary enforcement:

```ts
// REPLACE the prompt construction block (lines ~46–72) with:

const prompt = hasContext
  ? `You are an AI assistant. Answer ONLY from the source context blocks provided below.
Do NOT use information from the conversation history to answer factual questions.
The conversation history is provided only for tone and follow-up context.
If the source context does not contain the answer, say: "The selected sources do not contain information about this."

[CONVERSATION HISTORY - for context continuity only, NOT a source of facts]
${memoryContext || 'No prior conversation.'}

[SOURCE CONTEXT - your ONLY factual reference]
${context}

[QUESTION]
${query}

[ANSWER]`
  : `You are a research assistant. No source documents are currently selected or retrievable.
Answer from general knowledge only. Be clear about what you do and don't know.

[CONVERSATION HISTORY]
${memoryContext || 'No prior conversation.'}

[QUESTION]
${query}

[ANSWER]`;
```

**Additionally**, strip memory turns that reference currently-unselected sources by filtering `saveTurn` data:

```ts
// In rag-pipeline.ts answer(), modify saveTurn call:
await this.memoryStore.saveTurn({
  userId: input.userId,
  sessionId: input.sessionId,
  query,
  response,
  sourcesUsed: hasContext ? sources : [],
  // Tag the turn with which sources were active, for future filtering
  activeSourceFiles: input.sourceFiles ?? [],
});
```

And update `MemoryStore.getContext` to accept optional source filter:

```ts
// In hybrid-memory-store.ts:
public async getContext(
  input: { userId: string; sessionId: string; activeSourceFiles?: string[] }
): Promise<string> {
  const turns = this.turns.get(input.sessionId) ?? [];
  const relevantTurns = input.activeSourceFiles && input.activeSourceFiles.length > 0
    ? turns.filter((turn) => {
        // Include turn if it was from a global query OR shares at least one active source
        if (!turn.activeSourceFiles || turn.activeSourceFiles.length === 0) return true;
        return turn.activeSourceFiles.some((sf) => input.activeSourceFiles!.includes(sf));
      })
    : turns;

  return relevantTurns
    .slice(-4)  // reduced from 6 to limit context window usage
    .map((turn) => `User: ${turn.query}\nAssistant: ${turn.response}`)
    .join('\n\n');
}
```

---

### Fix 4 — Make `tryRetrieve` Fail Closed (No Sources = No Results)

**`server/src/application/rag-pipeline.ts`** — replace `tryRetrieve`:

```ts
private async tryRetrieve(
  query: string,
  sessionId: string,
  topK: number,
  warnings: string[],
  sourceFiles?: string[],
): Promise<RetrievedChunk[]> {
  // CRITICAL: undefined means "caller didn't specify" which is different from "all sources"
  // We treat undefined as "search all in session" — callers MUST pass [] to mean "no sources"
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
    logger.warn('retrieval_path_failed_falling_back_to_chat', {
      error: error instanceof Error ? error.message : 'unknown_error',
    });
    warnings.push('Retrieval is unavailable right now. Responding in chat mode.');
    return [];
  }
}
```

**`server/src/routes/json-routes.ts`** — fix query route to properly normalize `sourceFiles`:

```ts
router.post('/query', async (request, response, next) => {
  try {
    const query = String(request.body.query ?? '');
    const userId = String(request.body.userId ?? container.env.defaultUserId);
    const sessionId = String(request.body.sessionId ?? container.env.defaultSessionId);
    const topK = Number(request.body.topK ?? 10);

    // FIXED: distinguish undefined (not sent) from [] (no sources selected)
    // Frontend MUST send sourceFiles: [] when nothing is selected
    let sourceFiles: string[] | undefined;
    if (Array.isArray(request.body.sourceFiles)) {
      sourceFiles = request.body.sourceFiles.map(String).filter(Boolean);
    }
    // If sourceFiles not in body at all → undefined → search all (backward compat)
    // If sourceFiles: [] → empty array → return no results

    const authHeader = request.headers.authorization;
    let llmClient: OpenAiLlmClient | undefined;
    if (authHeader?.startsWith('Bearer ')) {
      const userKey = authHeader.substring(7).trim();
      if (userKey && userKey !== 'undefined' && userKey !== 'null') {
        llmClient = new OpenAiLlmClient(userKey, undefined, container.env.model);
      }
    }

    await container.memoryStore.ensureSession({ userId, sessionId, userName: container.env.defaultUserName });
    const result = await container.ragPipeline.answer({
      userId, sessionId, query, topK, llmClient, sourceFiles,
    });
    response.json(result);
  } catch (error) {
    next(error);
  }
});
```

---

### Fix 5 — Add `sourceId` Field to Vector Records for Stable Source Filtering

This is the architecturally correct fix. Instead of relying on `source_file` (display name, mutable, non-unique), add a dedicated `source_id` field that is stable and matches what the frontend tracks.

**`server/src/domain/models.ts`** — update `EmbeddedChunk.toVectorRecord()`:

```ts
public toVectorRecord(): Record<string, unknown> {
  return {
    id: this.chunk.chunkId,
    vector: this.embedding,
    session_id: this.sessionId ?? 'default',
    source_id: this.chunk.metadata['sourceId'] as string ?? this.chunk.sourceFile,  // NEW stable ID
    content: this.chunk.content,
    source_file: this.chunk.sourceFile,
    source_type: this.chunk.sourceType,
    page_number: this.chunk.pageNumber ?? -1,
    chunk_index: this.chunk.chunkIndex,
    start_char: this.chunk.startChar ?? -1,
    end_char: this.chunk.endChar ?? -1,
    metadata: this.chunk.metadata,
    embedding_model: this.embeddingModel,
  };
}
```

**`server/src/infrastructure/vector/milvus-vector-store.ts`** — add `source_id` field to collection schema and filter on it:

```ts
// In createCollection fields array, add:
{ name: 'source_id', data_type: DataType.VarChar, max_length: 512 },

// In search(), replace sourceFiles filter:
// BEFORE:
filters.push(`source_file in [${filesStr}]`);

// AFTER:
filters.push(`source_id in [${filesStr}]`);
```

**`server/src/application/ingestion-service.ts`** — pass `sourceId` into chunk metadata:

```ts
// In embedAndStore call for each ingest type, pass sourceId in metadata:
private async embedAndStore(
  chunks: Awaited<ReturnType<DocumentLoader['load']>>,
  metadata: { sourceType: 'file' | 'url' | 'audio'; sourceName: string; sessionId?: string; sourceId: string },
): Promise<{ vectorIds: string[]; warnings: string[] }> {
  // Stamp each chunk with the sourceId
  const stampedChunks = chunks.map((chunk) => {
    const stamped = new DocumentChunk(
      chunk.content,
      chunk.sourceFile,
      chunk.sourceType,
      chunk.pageNumber,
      chunk.chunkIndex,
      chunk.startChar,
      chunk.endChar,
      { ...chunk.metadata, sourceId: metadata.sourceId },
      chunk.chunkId,
    );
    return stamped;
  });
  // ... rest of embed and store
}
```

And update each `embedAndStore` call to pass `sourceId`:

```ts
// ingestText:
const sourceId = `text::${input.title}::${input.sessionId}`;
await this.embedAndStore(chunks, { sourceType: 'file', sourceName: input.title, sessionId: input.sessionId, sourceId });
return { id: sourceId, name: input.title, ... };

// ingestFile:
const sourceName = input.displayName ?? path.basename(input.filePath);
const sourceId = `file::${sourceName}::${input.sessionId}`;
await this.embedAndStore(chunks, { sourceType: 'file', sourceName, sessionId: input.sessionId, sourceId });
return { id: sourceId, name: sourceName, ... };

// ingestUrl:
const urlSourceName = chunks[0]?.sourceFile ?? new URL(input.url).hostname;
const sourceId = `url::${input.url}::${input.sessionId}`;
await this.embedAndStore(chunks, { sourceType: 'url', sourceName: urlSourceName, sessionId: input.sessionId, sourceId });
return { id: sourceId, name: urlSourceName, ... };
```

This makes `sourceId` a stable, type-prefixed, session-scoped identifier that is immune to display-name changes.

---

### Fix 6 — Fix `chunkId` Uniqueness to Prevent Silent Overwrites

**`server/src/domain/models.ts`** — update `createChunkId()`:

```ts
private createChunkId(): string {
  // Include sourceFile in the hash to prevent cross-source collisions
  const input = `${this.sourceFile}::${this.chunkIndex}::${this.content.slice(0, 200)}`;
  const hash = crypto.createHash('sha256').update(input).digest('hex').slice(0, 12);
  return `${this.sourceType}_${this.chunkIndex}_${hash}`;
}
```

---

### Fix 7 — Fix Embedder Mismatch: Track Per-Source Embedding Model

**`server/src/infrastructure/embeddings/resilient-embedder.ts`** — add hard fail-fast on mismatch:

```ts
public async embedQuery(text: string): Promise<number[]> {
  try {
    const result = await this.primary.embedQuery(text);
    if (this.lastDocumentEmbedder === 'fallback') {
      // HARD SWITCH: use fallback for query too to maintain embedding space consistency
      logger.warn('embedder_mismatch_forcing_fallback_for_query_consistency');
      return this.fallback.embedQuery(text);
    }
    return result;
  } catch (error) {
    logger.warn('primary_embed_query_failed_using_fallback');
    return this.fallback.embedQuery(text);
  }
}
```

---

### Fix 8 — Fix PDF Page Splitting

**`server/src/infrastructure/document/local-document-loader.ts`** — improve page detection:

```ts
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

  // Fallback: if pagerender didn't populate (some pdf-parse versions don't support it),
  // split by form feed or double newlines
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

  return chunks.filter((c) => c.content.length > 20); // drop near-empty page chunks
}
```

---

### Fix 9 — Add `sourceFiles` Filter to `summarize()`

**`server/src/application/rag-pipeline.ts`** — update `summarize`:

```ts
public async summarize(input: {
  userId: string;
  sessionId: string;
  topK?: number;
  summaryLength?: 'short' | 'medium' | 'long';
  llmClient?: LLMClient;
  sourceFiles?: string[];   // ← ADD THIS
}): Promise<RagAnswer> {
  const searchResults = await this.vectorStore.search(
    await this.embedder.embedQuery('main topics key findings important information overview'),
    input.topK ?? 15,
    { sessionId: input.sessionId, sourceFiles: input.sourceFiles },  // ← PASS IT
  );
  // ... rest unchanged
}
```

---

## Part 3 — Hidden Bugs Not Yet Noticed

### 🟠 H1 — Session ID Not Unique Per Notebook/User

All requests default to `'default-session'`. Every user hitting the same server shares a vector session. Fix: generate a UUID in the frontend on first load and persist it to `localStorage`. Send it with every request as `sessionId`.

### 🟠 H2 — No Score Threshold Filtering

`tryRetrieve` returns ALL results from `vectorStore.search`, including very-low-relevance chunks. If the top-10 results include 9 chunks with score 0.12 (essentially noise), they all get injected into the prompt. Add a minimum score threshold:

```ts
// In tryRetrieve, after getting results:
const MINIMUM_SCORE = 0.35;
return results.filter((r) => r.score >= MINIMUM_SCORE);
```

### 🟠 H3 — `getContext` in `HybridMemoryStore` Returns Unbounded Zep Context

When Zep is configured, `getContext` returns raw Zep user context with no length limit:

```ts
return String((response as { context?: string }).context ?? '');
```

A long-running session could inject thousands of tokens of Zep memory into every prompt, blowing through the context window and causing truncation of actual source context. Add truncation:

```ts
const zepContext = String((response as { context?: string }).context ?? '');
return zepContext.slice(0, 2000); // cap at 2000 chars
```

### 🟡 H4 — `maxContextChars: 4000` May Leave No Room for System Prompt + Response

In `rag-pipeline.answer()`:
```ts
const { context, sources } = this.formatContext(searchResults, input.maxChunks ?? 8, input.maxContextChars ?? 4000);
```

The prompt template adds ~500 chars of framing + up to 2000 chars of memory context + 4000 chars of source context = ~6500 chars ≈ ~1,600 tokens. For `gpt-4o-mini` (128k context) this is fine, but if the model changes to a shorter-context model, it will fail silently. Make `maxContextChars` configurable and reduce memory context proportionally.

### 🟡 H5 — `formatContext` Off-by-One: Last Chunk May Exceed `maxContextChars`

```ts
if (totalChars + chunkText.length > maxContextChars && contextParts.length) {
  return;  // skip but don't stop iteration
}
contextParts.push(chunkText);
totalChars += chunkText.length;
```

The condition correctly skips oversized chunks, but the loop continues iterating over all remaining chunks looking for a smaller one. This is correct behavior, but if there's a very large final chunk that fits exactly at the limit, it's included even if it pushes `totalChars` slightly over. The logic should be `>=` not `>`.

### 🟡 H6 — `NullVectorStore` Returns No Errors, Silently Drops All Data

When `MILVUS_URI` is not set, the app uses `NullVectorStore`:

```ts
public async upsert(_chunks: EmbeddedChunk[]): Promise<string[]> {
  return [];
}
public async search(...): Promise<RetrievedChunk[]> {
  return [];
}
```

The user gets no error — ingestion appears to succeed (200 response, chunk count shown), but nothing is stored. Every query returns empty context and the LLM falls into "I have no sources" mode. The health endpoint does flag `vectorStore: NullVectorStore` but users aren't told. Should throw or at minimum return a prominent warning in the ingest response.

### 🔵 H7 — Temp File Race Condition on Concurrent Uploads

```ts
tempPath = path.join(os.tmpdir(), `${Date.now()}-${request.file.originalname}`);
```

Two concurrent requests uploading files at the same millisecond with the same original name will produce the same `tempPath`, causing one to overwrite the other's temp file. Use `crypto.randomUUID()` instead of `Date.now()`:

```ts
tempPath = path.join(os.tmpdir(), `${crypto.randomUUID()}-${request.file.originalname}`);
```

### 🔵 H8 — `ingestAudio` Route Is Registered Twice

In `json-routes.ts`, there's both `/ingest/file` which checks for audio extensions AND a dedicated `/ingest/audio` route. The file route correctly handles audio by calling `ingestAudio`. The dedicated `/ingest/audio` is never called from the `/ingest/file` flow and could cause confusion.

---

## Part 4 — RAG Quality Improvements

### Improvement 1 — Hybrid BM25 + Vector Search

Pure vector search fails for exact keyword queries like "what is Assignment 03". Add BM25 keyword scoring:

```ts
// Add to rag-pipeline.ts: hybridRetrieve method
private async hybridRetrieve(
  query: string,
  sessionId: string,
  topK: number,
  sourceFiles?: string[],
): Promise<RetrievedChunk[]> {
  const [vectorResults] = await Promise.all([
    this.tryRetrieve(query, sessionId, topK * 2, [], sourceFiles),
  ]);

  // Simple BM25-like keyword re-ranking on top of vector results
  const keywords = query.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
  const reranked = vectorResults.map((chunk) => {
    const content = chunk.content.toLowerCase();
    const keywordScore = keywords.reduce((score, kw) => {
      const count = (content.match(new RegExp(kw, 'g')) ?? []).length;
      return score + Math.log(1 + count);
    }, 0);
    return {
      ...chunk,
      score: chunk.score * 0.7 + (keywordScore / (keywordScore + 1)) * 0.3,
    };
  });

  return reranked
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}
```

### Improvement 2 — Query Rewriting for Better Semantic Match

Assignment queries like "what is the assignment" semantically match poorly against "Assignment 03 — Google NotebookLM: Build a RAG pipeline...". Rewrite the query before embedding:

```ts
private async rewriteQuery(query: string, llmClient: LLMClient): Promise<string> {
  const rewritePrompt = `Rewrite this search query to be more specific and keyword-rich for document retrieval.
Return ONLY the rewritten query, nothing else.

Original: "${query}"
Rewritten:`;
  try {
    const rewritten = await llmClient.generate(rewritePrompt, { maxTokens: 100 });
    return rewritten.trim() || query;
  } catch {
    return query;
  }
}
```

### Improvement 3 — MMR (Maximal Marginal Relevance) for Diversity

Prevent 8 near-identical chunks dominating the context window:

```ts
private applyMMR(results: RetrievedChunk[], lambda = 0.7, topK = 8): RetrievedChunk[] {
  if (results.length <= topK) return results;
  
  const selected: RetrievedChunk[] = [results[0]];
  const remaining = results.slice(1);

  while (selected.length < topK && remaining.length > 0) {
    let bestScore = -Infinity;
    let bestIndex = 0;

    remaining.forEach((candidate, i) => {
      const relevance = candidate.score;
      // Simple text overlap as proxy for embedding similarity
      const maxOverlap = Math.max(...selected.map((s) => this.textOverlap(s.content, candidate.content)));
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
```

### Improvement 4 — Chunk Size Tuning

Current: `chunkSize=1000, chunkOverlap=200`. For assignment PDFs with short sections:
- Reduce chunk size to 600 chars to avoid mixing multiple sections
- Increase overlap to 150 chars to prevent splitting assignment requirements across boundaries
- Add semantic sentence-boundary detection (already partially implemented in `TextChunker`)

```ts
// In bootstrap.ts:
const ingestionService = new IngestionService(
  documentLoader, webLoader, audioTranscriber, embedder, vectorStore, memoryStore,
  new TextChunker(600, 150),  // ← tighter chunks for better precision
);
```

### Improvement 5 — Citation Quality: Include Page Numbers and Confidence Scores

Update `formatContext` to include page provenance:

```ts
searchResults.slice(0, maxChunks).forEach((result, index) => {
  const citationRef = `[${index + 1}]`;
  const pageInfo = result.citation.pageNumber ? ` (p.${result.citation.pageNumber})` : '';
  const confidence = Math.round(result.score * 100);
  const chunkText = `${citationRef} [${result.citation.sourceFile}${pageInfo}, ${confidence}% match]\n${result.content}`;
  // ...
});
```

---

## Part 5 — Verification Test Plan

After applying fixes, simulate these tests:

### Test 1: Source Isolation — Only Selected Source Used

```
Setup:   4 sources ingested (Copied Text, React DOM, Assignment 01, Assignment 03)
Action:  Select ONLY "Copied Text". Send query: "what is the assignment"
Expected: 
  - API receives sourceFiles: ["text::Copied Text::session-id"]
  - Milvus filter: source_id in ["text::Copied Text::session-id"]
  - Only Copied Text chunks retrieved
  - Response: "The selected sources do not contain information about this."
  - sourcesUsed: [] or only Copied Text entries
Verify:  Check response.sourcesUsed — no Assignment 03 entries
```

### Test 2: Direct Assignment Question on PDF Source

```
Setup:   Select ONLY "Assignment 03"
Action:  Query: "what is assignment 03 about"
Expected:
  - Milvus filter: source_id in ["file::Assignment 03.pdf::session-id"]
  - Assignment PDF chunks retrieved with score > 0.35
  - After hybrid re-ranking, assignment description is in context
  - Response summarizes the assignment correctly
Verify:  Check response.sourcesUsed — entries from Assignment 03 only
```

### Test 3: Deselected Source Cannot Be Accessed

```
Setup:   Deselect Assignment source (select others)
Action:  Query: "tell me about the assignment"
Expected:
  - sourceFiles excludes Assignment source ID
  - Milvus returns 0 results from Assignment 03
  - Response: "The selected sources do not contain assignment information"
Verify:  sourcesUsed has no Assignment 03 entries
```

### Test 4: Memory Context Isolation

```
Setup:   Turn 1: All sources selected, ask about assignment → response includes assignment info
         Turn 2: Deselect Assignment source, ask "what is the assignment"
Expected:
  - Turn 2 memory context includes Turn 1 conversation history
  - But the PROMPT instructs: "conversation history is for tone only, NOT factual reference"
  - Response: "The selected sources do not contain assignment information"
  - Model does NOT extract assignment facts from memory context
```

---

## Part 6 — Updated Architecture Overview (for README)

```
┌─────────────────────────────────────────────────────────────────┐
│                        FRONTEND (React)                         │
│  Source List → Checkbox State → selectedSourceIds (stable IDs)  │
│                                     │                           │
│  Chat Input ──────────────────────► POST /api/query             │
│                              { query, sourceFiles: string[] }   │
└──────────────────────────────────────┬──────────────────────────┘
                                       │
┌──────────────────────────────────────▼──────────────────────────┐
│                     json-routes.ts (/query)                      │
│  Extract sourceFiles[] from body                                 │
│  Normalize: undefined = search all, [] = return empty           │
└──────────────────────────────────────┬──────────────────────────┘
                                       │
┌──────────────────────────────────────▼──────────────────────────┐
│                        RagPipeline.answer()                     │
│  1. tryRetrieve(query, sessionId, topK, sourceFiles)            │
│  2. applyMMR(results) for diversity                              │
│  3. formatContext(results) → citation-annotated context string  │
│  4. getContext(sessionId, activeSourceFiles) → memory context   │
│  5. Build prompt with HARD source boundary instructions         │
│  6. LLM.generate(prompt)                                        │
│  7. saveTurn(turn + activeSourceFiles)                          │
└──────────────────────────────────────┬──────────────────────────┘
                                       │
┌──────────────────────────────────────▼──────────────────────────┐
│                    MilvusVectorStore.search()                   │
│  Filter: session_id == "X" && source_id in ["A", "B"]          │
│  Vector similarity search (COSINE)                              │
│  Returns: RetrievedChunk[] with scores                          │
└─────────────────────────────────────────────────────────────────┘

INGESTION PIPELINE:
┌──────────┐    ┌─────────┐    ┌──────────┐    ┌────────────┐    ┌────────┐
│ Document │ ─► │ Chunker │ ─► │ Embedder │ ─► │ VectorStore│ ─► │Milvus  │
│ Loader   │    │600c/150 │    │ OpenAI / │    │  upsert()  │    │source_id│
│ (PDF/TXT │    │ overlap │    │ Fallback │    │ source_id  │    │session_id│
│ /Web)    │    │         │    │  Hash    │    │ stamped    │    │indexed │
└──────────┘    └─────────┘    └──────────┘    └────────────┘    └────────┘
                                                     │
                                              IngestSummary
                                              { id: sourceId,   ← matches source_id in DB
                                                name: displayName }
```

---

## Part 7 — Known Limitations

1. **No re-ingestion on display name change**: If a user renames a source, old chunks retain the old `sourceId`. Must re-ingest to update.
2. **`LocalHashEmbedder` as fallback is semantically useless**: It produces character-frequency vectors that are not semantically meaningful. Hybrid BM25 scoring partially compensates, but if OpenAI embedder is unavailable, retrieval quality degrades significantly.
3. **No streaming**: LLM response is buffered and returned as a single blob. Large responses (long summaries) may feel slow.
4. **No deduplication on re-ingest**: Ingesting the same file twice doubles all its chunks in Milvus. Add a pre-check by hashing file content.
5. **Zep graph contamination**: `saveTurn` calls `graph/add` with `sourcesUsed`, permanently adding unselected source references to the Zep knowledge graph. These can surface in future `searchRelevant` calls across sessions.
6. **Single-tenant by default**: All requests default to the same `userId` and `sessionId`. True multi-user support requires frontend-generated stable session IDs.

---

## Part 8 — Future Improvements

| Priority | Improvement | Benefit |
|----------|-------------|---------|
| High | Hybrid BM25 + vector search | Fixes exact-keyword retrieval (assignment name queries) |
| High | Query rewriting via LLM | Better semantic match for vague queries |
| High | Score threshold (0.35) | Eliminates noise chunks from context |
| Medium | MMR diversity re-ranking | Better coverage of document topics |
| Medium | Streaming responses | Better UX for long answers |
| Medium | Re-ingestion deduplication | Prevents chunk multiplication |
| Medium | Per-page PDF indexing (pdfjs-dist) | More accurate page citations |
| Low | Cross-encoder reranker (Cohere, FlashRank) | Higher precision ranking |
| Low | Metadata-aware retrieval (filter by page range, date) | Power user queries |
| Low | Async ingestion with job queue | Non-blocking large file ingestion |
