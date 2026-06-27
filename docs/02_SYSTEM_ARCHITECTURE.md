# 02_SYSTEM_ARCHITECTURE.md

## Corrective RAG - Complete System Architecture

---

## 1. HIGH-LEVEL ARCHITECTURE OVERVIEW

The CRAG system consists of three major layers:

1. **Frontend Layer**: React/Vite SPA served on Netlify
2. **Backend Layer**: FastAPI services on Render
3. **External Services**: OpenAI API, Qdrant vector DB, web search API

All communication is asynchronous with structured JSON payloads.

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT LAYER                             │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │            React 18 + TypeScript + Vite                  │  │
│  │  ┌──────────────┬──────────────┬──────────────┐           │  │
│  │  │  Left Panel  │ Center Panel │ Right Panel  │           │  │
│  │  │  (Documents) │   (Chat)     │  (Graph)     │           │  │
│  │  └──────────────┴──────────────┴──────────────┘           │  │
│  │  └──────────────────────────────┘                         │  │
│  │         Bottom Panel (Node Inspector)                      │  │
│  └──────────────────────────────────────────────────────────┘  │
│                    Served on Netlify                            │
└─────────────────────────────────────────────────────────────────┘
                          ↕ HTTPS ↕
┌─────────────────────────────────────────────────────────────────┐
│                      API GATEWAY / CORS                         │
└─────────────────────────────────────────────────────────────────┘
                          ↕ HTTP ↕
┌─────────────────────────────────────────────────────────────────┐
│                    BACKEND API LAYER                            │
│                    (FastAPI on Render)                          │
│  ┌────────────────────────────────────────────────────────┐   │
│  │                REST Endpoints                          │   │
│  │  /api/documents/upload       POST                      │   │
│  │  /api/documents/status       GET                       │   │
│  │  /api/documents               GET                       │   │
│  │  /api/query/answer           POST                      │   │
│  │  /api/trace/execution        GET                       │   │
│  └────────────────────────────────────────────────────────┘   │
│  ┌────────────────────────────────────────────────────────┐   │
│  │           Core Application Services                    │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐ │   │
│  │  │  Ingestion   │  │  Retrieval   │  │ Generation  │ │   │
│  │  │  Pipeline    │  │  Pipeline    │  │  Pipeline   │ │   │
│  │  └──────────────┘  └──────────────┘  └─────────────┘ │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐ │   │
│  │  │  Evaluator   │  │  Refiner     │  │  Web Search │ │   │
│  │  │  Service     │  │  Service     │  │  Service    │ │   │
│  │  └──────────────┘  └──────────────┘  └─────────────┘ │   │
│  └────────────────────────────────────────────────────────┘   │
│  ┌────────────────────────────────────────────────────────┐   │
│  │         Execution Trace Manager                        │   │
│  │  Captures all node events and metadata                │   │
│  └────────────────────────────────────────────────────────┘   │
│  ┌────────────────────────────────────────────────────────┐   │
│  │              Storage & Caching Layer                   │   │
│  │  ┌────────────────────────────────────────────────────┐│   │
│  │  │ Session-scoped in-memory upload queue              ││   │
│  │  │ In-memory trace cache (session-scoped)            ││   │
│  │  └────────────────────────────────────────────────────┘│   │
│  └────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
  ↕          ↕          ↕          ↕          ↕
┌─────────────────────────────────────────────────────────────────┐
│                  EXTERNAL SERVICES LAYER                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │   OpenAI     │  │ Qdrant Cloud │  │ Web Search   │          │
│  │   API        │  │ (Free Tier)  │  │   API        │          │
│  │              │  │              │  │ (Tavily)     │          │
│  │ gpt-4.1-mini │  │ • Cloud      │  │              │          │
│  │ Embeddings   │  │   Storage    │  │ • Keyword    │          │
│  │ (3-large)    │  │ • Similarity │  │   Search     │          │
│  │              │  │   Search     │  │ • URL Fetch  │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. COMPONENT DIAGRAM (DETAILED)

### Data Flow View

```
USER QUERY
    ↓
[Chat Interface]
    ↓
[API: POST /query/answer]
    ↓
┌─────────────────────────────────────────────┐
│         CRAG Pipeline Orchestrator           │
│     (Manages execution flow & trace)         │
└─────────────────────────────────────────────┘
    ↓
[1. Retrieval Service]
    ↓ retrieves from
[Vector Store: Qdrant]
    ↓
[2. Evaluator Service]
    ↓ scores
[Retrieved Chunks]
    ↓
    ├─→ [CORRECT]
    │       ↓
    │   [3A. Refiner Service]
    │       ↓
    │   [Internal Knowledge]
    │
    ├─→ [AMBIGUOUS]
    │       ↓
    │   [3A. Refiner Service] + [3B. Web Search Service]
    │       ↓
    │   [Internal + External Knowledge]
    │
    └─→ [INCORRECT]
            ↓
        [3B. Web Search Service]
            ↓
        [External Knowledge Only]
    ↓
┌─────────────────────────────────────────────┐
│   [4. Generator Service]                    │
│   Produces final answer                     │
└─────────────────────────────────────────────┘
    ↓
[Execution Trace Manager]
    ↓ enriches with metadata
[Complete Trace Object]
    ↓
[Response: answer + trace]
    ↓
[Visualization Dashboard]
    ↓ renders
[Animated CRAG Graph]
```

---

## 3. BACKEND ARCHITECTURE

### 3.1 API Layer

All endpoints return structured JSON responses with execution traces.

#### Endpoint Summary

| Method | Endpoint | Purpose | Response Time |
|--------|----------|---------|---|
| POST | `/api/documents/upload` | Upload PDF/TXT file | 30s (includes ingestion) |
| GET | `/api/documents` | Get uploaded documents | <1s |
| GET | `/api/documents/{id}/status` | Get ingestion status | <1s |
| POST | `/api/query/answer` | Submit question + get answer | <10s |
| GET | `/api/trace/{trace_id}` | Retrieve execution trace | <1s |
| GET | `/api/health` | Health check | <100ms |

### 3.2 Service Layer

Each service has a single, well-defined responsibility.

```
┌──────────────────────────────────────────────────────────┐
│              Service Layer (Python Classes)              │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  DocumentIngestionService                              │
│  ├─ load_pdf(filepath) → List[Document]               │
│  ├─ load_txt(filepath) → Document                      │
│  ├─ chunk_documents(docs) → List[Document]            │
│  └─ generate_embeddings(chunks) → List[Vector]        │
│                                                          │
│  RetrieverService                                       │
│  ├─ retrieve(query, k=4) → List[Document]             │
│  └─ get_similarity_scores(query, docs) → List[float]  │
│                                                          │
│  EvaluatorService                                       │
│  ├─ evaluate_docs(query, docs) → EvalResult           │
│  ├─ score_relevance(query, doc) → float               │
│  └─ decide_action(scores) → Action (CORRECT/...)      │
│                                                          │
│  RefinerService                                         │
│  ├─ decompose_to_strips(text) → List[str]            │
│  ├─ filter_strips(query, strips) → List[str]         │
│  └─ recompose(strips) → str                           │
│                                                          │
│  WebSearchService                                       │
│  ├─ rewrite_query(query) → str                        │
│  ├─ search(query) → List[Document]                    │
│  └─ extract_content(urls) → List[Document]            │
│                                                          │
│  GeneratorService                                       │
│  ├─ generate_answer(query, context) → str             │
│  └─ validate_response(answer) → bool                  │
│                                                          │
│  VectorStoreService                                     │
│  ├─ add_collection(doc_id) → Collection               │
│  ├─ add_embeddings(collection, embeddings) → void     │
│  ├─ search(collection, vector, k) → List[Result]      │
│  └─ delete_collection(doc_id) → void                  │
│                                                          │
│  ExecutionTraceService                                 │
│  ├─ start_trace(query) → TraceID                      │
│  ├─ log_node_event(trace_id, node, event) → void     │
│  ├─ get_trace(trace_id) → ExecutionTrace              │
│  └─ emit_event(trace_id, event) → void                │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

### 3.3 Data Models

#### Core Data Structures

```python
# Query & Response
QueryRequest = {
    "question": str
    "session_id": str (optional)
}

AnswerResponse = {
    "answer": str
    "confidence": float
    "execution_trace_id": str
    "processing_time_ms": int
}

# Execution Trace
ExecutionTrace = {
    "trace_id": str (UUID)
    "query": str
    "timestamp_start": ISO8601
    "timestamp_end": ISO8601
    "total_duration_ms": int
    "nodes": List[TraceNode]
    "decision_path": str (CORRECT/INCORRECT/AMBIGUOUS)
}

TraceNode = {
    "node_id": str
    "node_name": str (Retriever/Evaluator/Refiner/...)
    "status": str (PENDING/RUNNING/SUCCESS/FAILED)
    "timestamp_start": ISO8601
    "timestamp_end": ISO8601
    "duration_ms": int
    "input": object
    "output": object
    "metadata": {
        "confidence": float (if applicable)
        "score": float (if applicable)
        "count": int (if applicable)
        "reasoning": str (if applicable)
    }
    "error": str (if status == FAILED)
}

# Document Ingestion
DocumentUpload = {
    "file": FileType (PDF or TXT)
    "filename": str
    "file_size_bytes": int
}

DocumentStatus = {
    "document_id": str
    "filename": str
    "status": str (QUEUED/PROCESSING/SUCCESS/FAILED)
    "progress_percent": int (0-100)
    "chunks_created": int
    "embeddings_count": int
    "error_message": str (if status == FAILED)
    "created_at": ISO8601
    "completed_at": ISO8601 (if status == SUCCESS)
}

# Evaluation Result
EvaluationResult = {
    "verdict": str (CORRECT/INCORRECT/AMBIGUOUS)
    "reasoning": str
    "scores": List[float] (one per retrieved doc)
    "confidence": float
}

# Refiner Output
RefinedContext = {
    "original_context": str
    "decomposed_strips": List[str]
    "kept_strips": List[str]
    "refined_context": str
    "relevance_count": int
}
```

### 3.4 LangGraph Integration

The CRAG pipeline is implemented as a LangGraph state machine:

```python
# LangGraph State Definition
class CRAGState(TypedDict):
    # Input
    question: str
    
    # Retrieval stage
    retrieved_docs: List[Document]
    
    # Evaluation stage
    eval_verdict: str  # CORRECT/INCORRECT/AMBIGUOUS
    eval_scores: List[float]
    eval_reasoning: str
    
    # Refinement stage (both internal & external)
    internal_knowledge: str  # After refiner
    external_knowledge: str  # After web search
    
    # Generation stage
    final_answer: str
    
    # Metadata for tracing
    trace_events: List[TraceEvent]
```

#### LangGraph Nodes

```
Graph Structure:
START
  ↓
[Retriever Node]
  ↓
[Evaluator Node]
  ↓
[Router Node] → branches based on verdict
  ├─→ CORRECT: [Refiner Node] → [Generator Node]
  ├─→ AMBIGUOUS: [Refiner Node] + [Web Search Node] → [Generator Node]
  └─→ INCORRECT: [Web Search Node] → [Generator Node]
  ↓
[Generator Node]
  ↓
END
```

---

## 4. FRONTEND ARCHITECTURE

### 4.1 React Component Hierarchy

```
App
├── Layout (Main Grid)
│   ├── LeftSidebar
│   │   ├── DocumentUploadZone
│   │   ├── ProcessingQueueList
│   │   └── CompletedDocumentsList
│   ├── CenterPanel
│   │   ├── ChatHistory
│   │   ├── ChatMessages
│   │   │   ├── UserMessage
│   │   │   ├── AssistantMessage
│   │   │   └── ProcessingIndicator (streaming status)
│   │   └── ChatInput
│   ├── RightPanel
│   │   └── ExecutionGraphVisualizer
│   │       ├── DAGRenderer (animated)
│   │       ├── NodeElement (clickable)
│   │       └── EdgeElement
│   └── BottomPanel
│       └── NodeInspector
│           ├── NodeDetails
│           ├── NodeInput
│           ├── NodeOutput
│           └── NodeMetadata

State Management (Context + Hooks):
├── DocumentContext
│   ├── uploadedDocuments: List
│   ├── processingQueue: List
│   └── uploadProgress: %
├── ChatContext
│   ├── messages: List
│   ├── isLoading: bool
│   └── currentSessionId: str
├── ExecutionContext
│   ├── currentTrace: ExecutionTrace
│   ├── selectedNode: NodeId
│   ├── nodeDetails: NodeDetail
│   └── activeNodeId: NodeId (for animation)
└── UIContext
    ├── theme: light/dark
    └── layout: panelSizes
```

### 4.2 Data Flow in Frontend

```
User Types Question
    ↓
ChatInput component captures text
    ↓
POST /api/query/answer
    ↓
Backend starts processing
    ↓
Frontend receives trace_id
    ↓
Frontend polls GET /api/trace/{trace_id}
    ↓
As trace updates, frontend rerenders:
    - ExecutionGraphVisualizer animates active node
    - ProcessingIndicator shows current stage
    - ChatHistory shows answer when ready
    ↓
User clicks on graph node
    ↓
SelectedNode state updates
    ↓
NodeInspector queries trace details
    ↓
Details displayed in bottom panel
```

### 4.3 Key Frontend Features

#### Real-time Trace Polling

```typescript
useEffect(() => {
  if (!traceId) return;
  
  const interval = setInterval(async () => {
    const trace = await fetch(`/api/trace/${traceId}`).then(r => r.json());
    setCurrentTrace(trace);
    
    // If complete, stop polling
    if (trace.nodes.every(n => n.status !== 'RUNNING')) {
      clearInterval(interval);
    }
  }, 500); // Poll every 500ms
  
  return () => clearInterval(interval);
}, [traceId]);
```

#### Node Animation

```
Active Node (node.status === 'RUNNING'):
├─ Glow effect (radial gradient)
├─ Pulsing animation (opacity 0.5 → 1)
├─ Scale animation (1.0 → 1.15)
└─ Color: primary blue

Completed Node (node.status === 'SUCCESS'):
├─ No animation
├─ Solid green checkmark
├─ Color: green-500
└─ Opacity: 1

Pending Node (node.status === 'PENDING'):
├─ No animation
├─ Dimmed appearance
├─ Color: gray-300
└─ Opacity: 0.6

Failed Node (node.status === 'FAILED'):
├─ Shake animation
├─ Red border
├─ Color: red-500
└─ Error icon
```

---

## 5. EXTERNAL SERVICES INTEGRATION

### 5.1 OpenAI API Usage

| Component | Model | Purpose | Cost |
|-----------|-------|---------|------|
| Retrieval Evaluator | gpt-4.1-mini | Score relevance (per doc) | ~$0.001/doc |
| Document Refiner | gpt-4.1-mini | Filter strips (per strip) | ~$0.0001/strip |
| Query Rewriter | gpt-4.1-mini | Rewrite for web search | ~$0.001/query |
| Generator | gpt-4.1-mini | Generate final answer | ~$0.01/query |
| Embeddings | text-embedding-3-large | Chunk embeddings | ~$0.001/1K tokens |

**Estimated cost per query**: $0.02 - $0.05 (depending on document length)

### 5.2 Qdrant Vector Database

#### Connection

```python
# Qdrant configuration
QDRANT_URL = env["QDRANT_URL"]
QDRANT_API_KEY = env["QDRANT_API_KEY"]

client = QdrantClient(
    url=QDRANT_URL,
    api_key=QDRANT_API_KEY
)
```

#### Collection Schema

```python
collection_config = {
    "name": f"doc_{document_id}",
    "vectors": {
        "size": 3072,  # text-embedding-3-large dimension
        "distance": "Cosine"
    },
    "payload": {
        "document_id": {"type": "keyword"},
        "source_page": {"type": "integer"},
        "chunk_index": {"type": "integer"},
        "text_length": {"type": "integer"},
    }
}
```

### 5.3 Web Search API (Tavily)

```python
# Tavily Search API usage
from langchain_community.tools.tavily_search import TavilySearchResults

search = TavilySearchResults(
    max_results=3,
    include_answer=True,
    search_depth="basic"
)

results = search.invoke({"query": rewritten_query})
# Returns: [{"url": str, "content": str, "title": str}, ...]
```

---

## 6. DATA FLOW SEQUENCES

### 6.1 Document Ingestion Sequence

```
Frontend                Backend              Qdrant          OpenAI
   |                       |                   |               |
   |--POST /upload-------->|                   |               |
   |                       |                   |               |
   |<--{doc_id, status}---|                   |               |
   |                       |                   |               |
   |                    [Load PDF/TXT]        |               |
   |                       |                   |               |
   |                    [Chunk Text]          |               |
   |                       |                   |               |
   |                    [Get Embeddings]------|----request--->|
   |                       |                   |               |
   |                       |<--embeddings-----|               |
   |                       |                   |               |
   |                    [Create Collection]   |               |
   |                       |-----add_points--->|               |
   |                       |<---OK------------|               |
   |                       |                   |               |
   |--GET /status-------->|                   |               |
   |<--{status: SUCCESS}--|                   |               |
   |                       |                   |               |
```

### 6.2 Question Answering Sequence (Ambiguous Case)

```
Frontend              Backend                Qdrant          OpenAI      Web Search
   |                    |                     |              |               |
   |--POST /query------>|                     |              |               |
   |                    |                     |              |               |
   |<--{trace_id}-------|                     |              |               |
   |                    |                     |              |               |
   | [Poll /trace]   [Retrieve]              |              |               |
   |                    |-----search--------->|              |               |
   |                    |<--docs-------------|              |               |
   |                    |                     |              |               |
   | [Animate]       [Evaluate]              |              |               |
   |                    |-----score_docs------|-----request->|               |
   |                    |                     |<--scores-----|               |
   |                    |  Verdict = AMBIGUOUS               |               |
   |                    |                     |              |               |
   | [Poll /trace]   [Refine Internal]       |              |               |
   |                    |-----filter_strips---|-----request->|               |
   |                    |                     |<--keep_bool--|               |
   |                    |                     |              |               |
   |                 [Search Web]            |              |               |
   |                    |-----rewrite----------|-----request->|               |
   |                    |                     |<--query-----|               |
   |                    |-----search query------|-----request->|
   |                    |                     |              |<--fetch URLs--|
   |                    |                     |              |--content----->|
   |                    |                     |              |               |
   | [Animate]       [Refine External]       |              |               |
   |                    |-----filter_strips---|-----request->|               |
   |                    |                     |<--keep_bool--|               |
   |                    |                     |              |               |
   | [Animate]       [Generate]              |              |               |
   |                    |-----generate answer--|-----request->|               |
   |                    |                     |<--answer-----|               |
   |                    |                     |              |               |
   |<--{answer, trace}--|                     |              |               |
   |                    |                     |              |               |
   | [Render Answer]                        |              |               |
   | [Render Graph]                         |              |               |
   |                    |                     |              |               |
```

---

## 7. ERROR HANDLING & RESILIENCE

### 7.1 Error Scenarios

| Scenario | Backend Response | Frontend Behavior |
|----------|-----------------|------------------|
| OpenAI API timeout | 504 Gateway Timeout | Show error in chat |
| Vector DB down | 503 Service Unavailable | Show error in chat |
| File upload corrupt | 400 Bad Request | Show error to user |
| Query empty/invalid | 400 Bad Request | Disable send button |
| Web search fails | Graceful fallback | Use internal docs only |
| Generation fails | Retry up to 3x | Show error after retries |

### 7.2 Fallback Strategies

```python
# Pseudo-code fallback chain
try:
    answer = generate_with_context(query, refined_context)
except OpenAIAPIError:
    # Fallback 1: Try with gpt-4.1-mini
    answer = generate_with_context(query, refined_context, model="gpt-4.1-mini")
    
    if fails:
        # Fallback 2: Return summarized context instead
        answer = f"Based on the documents: {refined_context[:500]}..."
        confidence = 0.3  # Low confidence

except VectorDBError:
    # If vector DB down, return error message
    return {"error": "Vector database unavailable. Please try again later."}
```

---

## 8. DEPLOYMENT ARCHITECTURE

### 8.1 Development Environment

```
Local Machine
├── Backend (FastAPI)
│   ├── Port: 8000
│   ├── Hot reload enabled
│   └── .env file with Qdrant Cloud URL/API Key
├── Frontend (Vite dev server)
│   ├── Port: 5173
│   ├── Hot reload enabled
│   └── CORS proxy to backend
└── Qdrant Cloud (Free Tier)
    └── Accessed via cloud URL and API key
```

### 8.2 Production Environment

```
┌─────────────────────────────────────┐
│      Netlify (Frontend)             │
├─────────────────────────────────────┤
│ • SPA React bundle                  │
│ • Environment: VITE_API_URL=/api    │
│ • Build: npm run build              │
│ • Deploy: git push → auto deploy    │
└─────────────────────────────────────┘
        ↓ HTTPS
┌─────────────────────────────────────┐
│      Render (Backend)               │
├─────────────────────────────────────┤
│ • FastAPI application               │
│ • Environment variables:            │
│   - OPENAI_API_KEY                  │
│   - QDRANT_URL                      │
│   - TAVILY_API_KEY                  │
│ • Build: pip install -r req.txt     │
│ • Start: uvicorn main:app           │
└─────────────────────────────────────┘
        ↓
┌─────────────────────────────────────┐
│   Qdrant Cloud (Vector DB)          │
├─────────────────────────────────────┤
│ • Managed service                   │
│ • Automatic backups                 │
│ • API key authenticated             │
└─────────────────────────────────────┘
        ↓
┌─────────────────────────────────────┐
│   OpenAI API (External Service)     │
├─────────────────────────────────────┤
│ • Pay-per-call model                │
│ • API key authenticated             │
│ • Rate limits: 3500 RPM             │
└─────────────────────────────────────┘
```

---

## 9. SYSTEM CHARACTERISTICS

### 9.1 Scalability Considerations

- **Horizontal**: Backend is stateless → can run multiple instances behind load balancer
- **Vertical**: Each service can be optimized independently
- **Vector DB**: Qdrant supports sharding for large datasets
- **Frontend**: Static SPA → scales infinitely on CDN

### 9.2 Security Model

- **API Authentication**: No auth required (single-user system)
- **API Keys**: Stored server-side in environment variables
- **HTTPS**: All communication encrypted in production
- **CORS**: Restricted to Netlify domain in production
- **Input Validation**: All user inputs sanitized before processing

### 9.3 Monitoring & Observability

- **Logging**: All services log to stdout (captured by Render/Netlify)
- **Traces**: Execution traces stored in memory during session
- **Metrics**: Response times tracked in trace metadata
- **Debugging**: Export traces as JSON for post-mortem analysis

---

## Summary

This architecture is **modular, scalable, and educational**. Each component has clear boundaries and responsibilities. The system prioritizes **clarity of execution** through structured traces and real-time visualization, making it ideal for demonstrating how CRAG works.

The use of existing tools (LangChain, LangGraph, FastAPI, React) minimizes custom code and accelerates development, while the clean separation of concerns ensures maintainability and extensibility.

---

**Document Version**: 1.0  
**Last Updated**: June 2026  
**Status**: Approved for Implementation
