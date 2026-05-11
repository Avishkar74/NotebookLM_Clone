# NotebookLM — RAG Application

A NotebookLM-style RAG (Retrieval-Augmented Generation) application. Users upload sources (PDFs, text, web pages, audio), select which ones to query, and get LLM answers grounded in those sources.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                         FRONTEND (React)                         │
│                                                                  │
│  Source Panel          Chat Panel           Studio Panel         │
│  ─────────────         ─────────────        ─────────────────    │
│  ☑ Source A            [User query]         Summary / Study      │
│  ☐ Source B            [AI response]        Guide / FAQ          │
│  ☐ Source C             [Citations]                              │
│                                                                  │
│  On query:                                                       │
│  POST /api/query {                                               │
│    query,                                                        │
│    sessionId,   ← unique per browser tab (UUID from localStorage)│
│    sourceFiles: ["text::Copied Text::sess-id", ...]  ← stable IDs│
│  }                                                               │
└──────────────────────────────────┬───────────────────────────────┘
                                   │ HTTP
┌──────────────────────────────────▼───────────────────────────────┐
│                      Express API Server                          │
│                                                                  │
│  POST /api/query                                                 │
│  ├── Extract sourceFiles[] (undefined = all, [] = none)          │
│  ├── BYOK: parse Authorization header for user API key           │
│  └── → RagPipeline.answer()                                      │
│                                                                  │
│  POST /api/ingest/file|text|url|audio                            │
│  └── → IngestionService.*                                        │
│      Returns: { id: "file::name::sessionId", name: "display" }   │
│                    ↑ canonical source_id stored in Milvus         │
└──────────────────────────────────┬───────────────────────────────┘
                                   │
┌──────────────────────────────────▼───────────────────────────────┐
│                          RagPipeline                             │
│                                                                  │
│  1. tryRetrieve(query, sessionId, topK, sourceFiles)             │
│     ├── [] → return [] immediately (no sources selected)         │
│     └── [ids] → embed query → VectorStore.search(filter)         │
│                                                                  │
│  2. Score threshold filter (>= 0.30)                             │
│                                                                  │
│  3. MMR diversity re-ranking                                     │
│                                                                  │
│  4. formatContext() → citation-annotated context string          │
│                                                                  │
│  5. getContext(sessionId, activeSourceFiles) → memory            │
│     └── Filters history turns to same source selection only      │
│                                                                  │
│  6. Build prompt with HARD source boundary enforcement           │
│     ├── [CONVERSATION HISTORY] — tone reference only             │
│     └── [SOURCE CONTEXT] — ONLY factual reference               │
│                                                                  │
│  7. LLM.generate(prompt) → response                             │
│                                                                  │
│  8. saveTurn(turn + activeSourceFiles)                           │
└──────────────────────────────────┬───────────────────────────────┘
                                   │
              ┌────────────────────┴────────────────────┐
              │                                         │
┌─────────────▼───────────┐           ┌─────────────────▼──────────┐
│    MilvusVectorStore     │           │    HybridMemoryStore        │
│                          │           │                             │
│  search() filters:       │           │  In-memory turns (last 4)  │
│  session_id == "X"       │           │  filtered by source overlap │
│  && source_id in [A,B]   │           │                             │
│          ↑               │           │  Optional: Zep Cloud        │
│   stable canonical ID    │           │  (capped to 1500 chars)     │
│   set at ingest time     │           │                             │
└──────────────────────────┘           └─────────────────────────────┘
```

---

## Ingestion Pipeline

```
User uploads file / pastes text / adds URL
          │
          ▼
IngestionService.ingest*()
  ├── Generate stable sourceId:
  │     text  → "text::{title}::{sessionId}"
  │     file  → "file::{displayName}::{sessionId}"
  │     url   → "url::{url}::{sessionId}"
  │
  ├── DocumentLoader/WebLoader/AudioTranscriber
  │   → raw text
  │
  ├── TextChunker (600 chars, 150 overlap)
  │   → DocumentChunk[]
  │
  ├── Stamp each chunk with { sourceId } in metadata
  │
  ├── ResilientEmbedder (3-Stage Fallback)
  │   ├── Stage 1: Native OpenAI text-embedding-3-small (384 dim)
  │   ├── Stage 2: Proxy OpenAI (ChatAnywhere) text-embedding-3-small
  │   └── Stage 3: LocalHashEmbedder (384 dim, char-frequency)
  │
  ├── MilvusVectorStore.upsert()
  │   Stored fields: id, vector, session_id, source_id, source_file,
  │                  source_type, page_number, chunk_index, content, metadata
  │
  └── Returns IngestSummary { id: sourceId, name: displayName, chunkCount }
                                   ↑
                             frontend stores this as the source's identifier
```

---

## Source Filtering Flow

```
1. INGEST
   IngestionService stamps chunks with sourceId = "file::Assignment03.pdf::sess-abc"
   Milvus stores: source_id = "file::Assignment03.pdf::sess-abc"
   API returns:   IngestSummary.id = "file::Assignment03.pdf::sess-abc"

2. SELECT SOURCES (Frontend)
   User checks "Assignment 03" checkbox
   Frontend maintains selectedIds = ["file::Assignment03.pdf::sess-abc"]

3. QUERY
   POST /api/query { sourceFiles: ["file::Assignment03.pdf::sess-abc"] }

4. MILVUS FILTER
   filter = `session_id == "sess-abc" && source_id in ["file::Assignment03.pdf::sess-abc"]`
   Only Assignment 03 chunks returned ✓

5. DESELECT
   Frontend sends sourceFiles: []
   tryRetrieve returns [] immediately
   LLM gets no context → "The selected sources do not contain information about this." ✓
```

---

## Debugging Notes

### Symptom: Model answers using data from unselected sources

**Cause 1**: `sourceFiles` not sent from frontend, or sent as `undefined`.  
Check: `request.body.sourceFiles` in POST /api/query.  
Fix: Ensure frontend always sends `sourceFiles: string[]` (empty array when nothing selected).

**Cause 2**: `source_id` mismatch — frontend sends `id` from ingest but it doesn't match `source_id` in Milvus.  
Check: Compare `IngestSummary.id` returned from POST /api/ingest/* with `source_id` field of a Milvus record.  
Fix: Applied in patched `ingestion-service.ts` — `id` now equals `source_id` stored in Milvus.

**Cause 3**: Memory context contamination — previous turns from all-source sessions are injected.  
Check: Look at `memoryContext` in the prompt. Does it contain info from unselected sources?  
Fix: Applied in patched `hybrid-memory-store.ts` — turns are filtered by `activeSourceFiles` overlap.

### Symptom: Direct assignment question fails, indirect succeeds

**Cause**: Semantic embedding mismatch. Query "what is the assignment" embeds to a semantically different vector than "Assignment 03 — Google NotebookLM: Build a RAG pipeline application".  
Fix 1: Hybrid BM25 keyword re-ranking (see improvement roadmap).  
Fix 2: Reduce chunk size to 600 chars so assignment title + description stay together.  
Fix 3: Query rewriting via LLM before embedding.

### Symptom: Embedder status shows "fallback" in response

The `LocalHashEmbedder` is semantically useless. Cosine similarity between hash vectors has no meaning. All searches will return near-random results.  
Fix: Ensure `OPENAI_API_KEY` (or `CHATANYWHERE_API_KEY` / `BASE_URL` for proxy) is set correctly. The `ResilientEmbedder` will attempt native OpenAI first, then proxy, before falling back.

### Symptom: All sources return results despite session filter

Default `sessionId = 'default-session'` means all browser tabs share one session.  
Fix: Frontend must generate a UUID on first load and persist it. Send as `sessionId` in all requests.

---

## Fixes Applied (Audit 2025)

| File | Fix |
|------|-----|
| `models.ts` | `chunkId` now includes `sourceId` in hash — prevents cross-source collision |
| `models.ts` | `toVectorRecord()` now emits `source_id` field |
| `ports.ts` | `MemoryStore.saveTurn` and `getContext` updated for source-aware memory |
| `ports.ts` | `VectorStore.search` filter type corrected to include `sourceFiles` |
| `ingestion-service.ts` | All `IngestSummary.id` values now match `source_id` stored in Milvus |
| `ingestion-service.ts` | `embedAndStore` stamps each chunk with `sourceId` metadata |
| `milvus-vector-store.ts` | `search()` parameter type fixed to include `sourceFiles` |
| `milvus-vector-store.ts` | Collection schema adds `source_id` field; filter uses it |
| `rag-pipeline.ts` | `tryRetrieve` distinguishes `undefined` from `[]` correctly |
| `rag-pipeline.ts` | Prompt isolates memory (tone) from source context (facts) |
| `rag-pipeline.ts` | MMR diversity re-ranking added |
| `rag-pipeline.ts` | Score threshold (0.30) filters noise chunks |
| `rag-pipeline.ts` | `summarize()` now accepts and passes `sourceFiles` |
| `hybrid-memory-store.ts` | `getContext` filters turns by `activeSourceFiles` overlap |
| `hybrid-memory-store.ts` | Zep context capped at 1500 chars |
| `hybrid-memory-store.ts` | `saveTurn` stores `activeSourceFiles` per turn |
| `rag-pipeline.ts` | Refined intent classification regex to prevent metadata false-positives |
| `bootstrap.ts` | Implemented 3-stage embedding fallback (Native -> Proxy -> Hash) |
| `openai-embedder.ts` | Removed unsupported `dimensions` parameter, added manual padding/truncation |
| `milvus-vector-store.ts` | Re-enabled `flush` and `loadCollection` to ensure immediate searchability |
| `app.ts` | Added `/health-check` endpoint for Render keep-alive cron job |

---

## Known Limitations

1. **No re-indexing on source rename**: Changing a source's display name doesn't update `source_id`. Re-ingest required.
2. **`LocalHashEmbedder` as fallback**: Produces non-semantic vectors. Retrieval quality is low in fallback mode.
3. **No streaming**: LLM responses are returned as a single blob. Large summaries may feel slow.
4. **No deduplication**: Ingesting the same file twice doubles all chunks. Add content hash check before ingest.
5. **Single-tenant default**: All sessions share `default-session` unless frontend sends a unique `sessionId`.
6. **Zep graph contamination**: Full response text is stored in Zep knowledge graph and may surface across sessions. Patched to store only metadata.

---

## Future Improvements

| Priority | Feature | Impact |
|----------|---------|--------|
| 🔴 High | Hybrid BM25 + vector search | Fixes exact-keyword retrieval failures |
| 🔴 High | Frontend sends unique `sessionId` per tab | Fixes multi-tenant data mixing |
| 🟠 High | Query rewriting before embedding | Better semantic match for vague queries |
| 🟠 Medium | Cross-encoder reranker (Cohere Rerank) | Higher precision ranking |
| 🟡 Medium | Streaming responses | Better UX |
| 🟡 Medium | Re-ingest deduplication | Prevents chunk duplication |
| 🟡 Medium | Per-page PDF indexing with pdfjs-dist | Accurate page numbers |
| 🔵 Low | Metadata-aware filtering (page range, date) | Power user queries |
| 🔵 Low | Async ingestion job queue | Non-blocking large file processing |

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENAI_API_KEY` | Recommended | Native OpenAI API key for primary embedding/generation |
| `CHATANYWHERE_API_KEY` | Fallback | OpenAI-compatible API key for proxy backup |
| `BASE_URL` | Fallback | OpenAI-compatible base URL for proxy backup |
| `MODEL` | ✅ | LLM model name (e.g. `gpt-4o-mini`) |
| `MILVUS_URI` / `ZILLIZ_URI` | ✅ | Milvus/Zilliz vector DB endpoint |
| `MILVUS_TOKEN` / `ZILLIZ_TOKEN` | ✅ | Milvus/Zilliz API token |
| `FIRECRAWL_API_KEY` | Optional | For web URL ingestion |
| `ASSEMBLYAI_API_KEY` | Optional | For audio transcription |
| `ZEP_API_KEY` | Optional | For persistent conversation memory |
| `DEFAULT_USER_ID` | Optional | Default user ID (default: `notebook-user`) |
| `DEFAULT_SESSION_ID` | Optional | Fallback session ID — **override in frontend with UUID** |