# 04_BACKEND_ARCHITECTURE.md

## Overview

The backend is a **modular, service-oriented system** built with FastAPI. It is NOT a monolithic application.

Every component has a single responsibility. Components communicate through well-defined interfaces.

The architecture prioritizes:
- **Testability** through dependency injection
- **Observability** through structured logging and execution traces
- **Maintainability** through clear separation of concerns
- **Scalability** through service decoupling
- **Production-readiness** through error handling and validation

---

## Design Principles

### 1. Layered Architecture

```
┌─────────────────────────────────────────────┐
│           API Routes Layer                  │
│    (FastAPI endpoints, request parsing)     │
├─────────────────────────────────────────────┤
│           Service Layer                     │
│   (Business logic, orchestration)           │
├─────────────────────────────────────────────┤
│           Domain Layer                      │
│  (Data structures, core algorithms)         │
├─────────────────────────────────────────────┤
│        Infrastructure Layer                 │
│  (Database, LLM, vector store access)       │
├─────────────────────────────────────────────┤
│       Cross-Cutting Concerns                │
│ (Config, logging, error handling)           │
└─────────────────────────────────────────────┘
```

### 2. Separation of Concerns

Each module handles ONE responsibility:

- **Ingestion Pipeline** → Document ingestion only
- **RAG Pipeline** → Question-answering workflow only
- **LLM Service** → All LLM interactions
- **Vector Store** → Embedding and retrieval only
- **Execution Tracer** → Trace generation only

### 3. Dependency Injection

All external dependencies are injected.

This allows:
- Easy testing with mock dependencies
- Configuration-driven behavior
- Runtime swapping of implementations

### 4. Event-Driven Tracing

The system does NOT collect logs and convert to traces.

Instead:
- Every component **emits structured events**
- Events are collected in **real-time**
- Traces are **built incrementally**
- Frontend receives the complete trace

---

## Folder Structure

```
backend/
├── app/
│   ├── __init__.py
│   ├── main.py                          # FastAPI application factory
│   │
│   ├── api/
│   │   ├── __init__.py
│   │   ├── routes/
│   │   │   ├── __init__.py
│   │   │   ├── documents.py             # Upload, list, delete
│   │   │   ├── questions.py             # Ask questions, get traces
│   │   │   └── health.py                # Health checks
│   │   │
│   │   └── schemas/
│   │       ├── __init__.py
│   │       ├── requests.py              # Request DTOs
│   │       ├── responses.py             # Response DTOs
│   │       ├── trace.py                 # Execution trace schema
│   │       └── validation.py            # Pydantic validators
│   │
│   ├── services/
│   │   ├── __init__.py
│   │   ├── document_service.py          # Ingestion orchestration
│   │   ├── rag_service.py               # QA orchestration
│   │   ├── llm_service.py               # LLM interactions
│   │   └── trace_service.py             # Trace building
│   │
│   ├── pipeline/
│   │   ├── __init__.py
│   │   ├── ingestion/
│   │   │   ├── __init__.py
│   │   │   ├── loader.py                # Document loading
│   │   │   ├── splitter.py              # Text chunking
│   │   │   ├── embedder.py              # Embedding generation
│   │   │   └── ingestion_pipeline.py    # Orchestration
│   │   │
│   │   └── crag/
│   │       ├── __init__.py
│   │       ├── retriever.py             # Vector search
│   │       ├── evaluator.py             # Retrieval evaluation
│   │       ├── refiner.py               # Knowledge refinement
│   │       ├── searcher.py              # External knowledge search
│   │       ├── rewriter.py              # Query rewriting
│   │       ├── generator.py             # Answer generation
│   │       └── crag_pipeline.py         # Workflow orchestration
│   │
│   ├── domain/
│   │   ├── __init__.py
│   │   ├── models.py                    # Data classes, types
│   │   ├── events.py                    # Event types
│   │   └── constants.py                 # Enums, constants
│   │
│   ├── infrastructure/
│   │   ├── __init__.py
│   │   ├── vector_store.py              # Qdrant Cloud client
│   │   ├── llm_client.py                # OpenAI API wrapper
│   │   ├── embeddings.py                # Embedding model (text-embedding-3-large)
│   │   └── database.py                  # Future: persistence layer
│   │
│   ├── core/
│   │   ├── __init__.py
│   │   ├── config.py                    # Configuration management
│   │   ├── logger.py                    # Logging setup
│   │   ├── exceptions.py                # Custom exceptions
│   │   ├── trace.py                     # Trace data structures
│   │   └── dependencies.py              # Dependency injection
│   │
│   └── middleware/
│       ├── __init__.py
│       ├── error_handler.py             # Exception handling
│       ├── request_logger.py            # Request logging
│       └── cors.py                      # CORS configuration
│
├── tests/
│   ├── __init__.py
│   ├── unit/
│   │   ├── pipeline/
│   │   ├── services/
│   │   └── infrastructure/
│   ├── integration/
│   │   ├── test_ingestion_pipeline.py
│   │   ├── test_crag_pipeline.py
│   │   └── test_vector_store.py
│   └── e2e/
│       ├── test_upload_and_query.py
│       └── test_full_workflow.py
│
├── requirements.txt
├── .env.example
├── docker-compose.yml
├── pytest.ini
└── README.md
```

---

## Module Responsibilities

### **1. API Routes Layer**

**File:** `app/api/routes/`

**Responsibility:** HTTP request/response handling only.

**Modules:**

- **`documents.py`**
  - `POST /documents/upload` → Upload document
  - `GET /documents` → List processed documents
  - `DELETE /documents/{doc_id}` → Delete document
  - `GET /documents/{doc_id}/status` → Check ingestion status

- **`questions.py`**
  - `POST /questions` → Ask a question
  - `GET /questions/{query_id}` → Get cached answer + trace

- **`health.py`**
  - `GET /health` → System health

**Design Notes:**
- Routes are thin wrappers
- All business logic is in services
- Request/response validation via Pydantic schemas
- No database queries here

---

### **2. Service Layer**

**File:** `app/services/`

**Responsibility:** Business logic orchestration.

**Modules:**

- **`document_service.py`**
  - Orchestrates the ingestion pipeline
  - Manages document metadata
  - Handles sequential queue processing
  - Emits ingestion events

  **Key Methods:**
  ```
  - upload_document(file: UploadFile) → Document
  - get_document_status(doc_id: str) → IngestionStatus
  - list_documents() → List[Document]
  - delete_document(doc_id: str) → None
  ```

- **`rag_service.py`**
  - Orchestrates the CRAG pipeline
  - Routes between different branches (Correct, Ambiguous, Incorrect)
  - Handles trace building
  - **Does NOT implement** individual CRAG steps

  **Key Methods:**
  ```
  - process_question(query: str, trace: ExecutionTrace) → Answer
  ```

- **`llm_service.py`**
  - Wraps all LLM interactions
  - Handles prompt formatting
  - Manages API calls to OpenAI
  - Emits LLM-related events

  **Key Methods:**
  ```
  - evaluate_retrieval(query, chunks) → EvaluationResult
  - refine_knowledge(chunks) → RefinedChunks
  - rewrite_query(query) → RewrittenQuery
  - generate_answer(context, query) → Answer
  ```

- **`trace_service.py`**
  - Builds execution traces incrementally
  - Manages trace state
  - Converts domain events to trace format
  - Provides trace to frontend

  **Key Methods:**
  ```
  - create_trace() → ExecutionTrace
  - add_event(event: DomainEvent) → None
  - get_trace() → ExecutionTrace
  ```

---

### **3. Pipeline Layer**

**File:** `app/pipeline/`

**Responsibility:** Implement the actual algorithms.

#### **Ingestion Pipeline**

**File:** `app/pipeline/ingestion/`

- **`loader.py`**
  - Loads PDF/TXT files
  - Extracts raw text
  - Handles encoding issues
  - Emits `DocumentLoaded` event

- **`splitter.py`**
  - Chunks text into semantic units
  - Uses recursive character splitting with overlap
  - Emits `ChunksCreated` event

  **Design:** 
  - Chunk size: 512 tokens (configurable)
  - Overlap: 50 tokens (configurable)

- **`embedder.py`**
  - Generates embeddings for chunks
  - Uses `text-embedding-3-large`
  - Batches requests for efficiency
  - Emits `EmbeddingsCreated` event

- **`ingestion_pipeline.py`**
  - Orchestrates the workflow
  - Chains: Load → Split → Embed → Store
  - Passes trace through each step
  - Emits `IngestionComplete` event

#### **CRAG Pipeline**

**File:** `app/pipeline/crag/`

- **`retriever.py`**
  - Queries vector store for top-K chunks
  - Calculates similarity scores
  - Emits `RetrievalComplete` event

- **`evaluator.py`**
  - Uses LLM to classify: Correct, Ambiguous, Incorrect
  - Returns confidence scores
  - Emits `EvaluationComplete` event

- **`refiner.py`**
  - Filters and reranks retrieved chunks
  - Decomposes and recomposes knowledge
  - Emits `RefinementComplete` event

- **`searcher.py`**
  - Performs web/knowledge base search
  - Formats search results
  - Emits `SearchComplete` event

- **`rewriter.py`**
  - Rewrites queries for better retrieval
  - Uses LLM to improve clarity
  - Emits `RewriteComplete` event

- **`generator.py`**
  - Generates final answer using LLM
  - Combines retrieved + external knowledge
  - Emits `GenerationComplete` event

- **`crag_pipeline.py`**
  - **THE CORE LOGIC**
  - Implements the three branches:
    - **Correct:** Knowledge Refinement → Generator
    - **Ambiguous:** Knowledge Refinement + Search → Generator
    - **Incorrect:** Rewrite → Search → Generator
  - Passes trace through each step
  - Emits `CRAGComplete` event

---

### **4. Domain Layer**

**File:** `app/domain/`

**Responsibility:** Data structures and domain concepts.

- **`models.py`**
  - `Document`: Document metadata
  - `Chunk`: Text chunk with metadata
  - `Embedding`: Vector + metadata
  - `Query`: User query
  - `Answer`: Generated answer
  - `RetrievalResult`: Retrieved chunks with scores
  - `EvaluationResult`: Evaluation decision + confidence
  - All are dataclasses or Pydantic models

- **`events.py`**
  - `DomainEvent`: Base event class
  - `DocumentLoaded`: File loaded
  - `ChunksCreated`: Text chunked
  - `EmbeddingsCreated`: Embeddings generated
  - `RetrievalComplete`: Documents retrieved
  - `EvaluationComplete`: Evaluation done
  - `RefinementComplete`: Knowledge refined
  - `SearchComplete`: External search done
  - `GenerationComplete`: Answer generated

- **`constants.py`**
  - Embedding model names
  - Chunk size defaults
  - Top-K defaults
  - Status enums

---

### **5. Infrastructure Layer**

**File:** `app/infrastructure/`

**Responsibility:** External system integration.

- **`vector_store.py`**
  - Wraps Qdrant client
  - Provides interface for:
    - Create collection
    - Upsert vectors
    - Search
    - Delete collection
  - Handles connection pooling
  - Emits infrastructure events

- **`llm_client.py`**
  - Wraps OpenAI API
  - Manages API keys
  - Handles retries
  - Tracks token usage
  - Formats requests/responses

- **`embeddings.py`**
  - Wraps embedding model
  - Handles batch embedding
  - Caches embeddings (optional)
  - Returns normalized vectors

- **`database.py`**
  - Reserved for future persistence
  - Currently unused

---

### **6. Core Layer**

**File:** `app/core/`

**Responsibility:** Cross-cutting concerns.

- **`config.py`**
  - Loads environment variables
  - Validates configuration
  - Provides defaults
  - Example:
    ```python
    class Settings(BaseSettings):
        OPENAI_API_KEY: str
        QDRANT_URL: str
        QDRANT_API_KEY: str
        CHUNK_SIZE: int = 512
        OVERLAP: int = 50
        TOP_K: int = 5
        EMBEDDING_MODEL: str = "text-embedding-3-large"
        LOG_LEVEL: str = "INFO"
    ```

- **`logger.py`**
  - Configures structured logging
  - JSON output for production
  - Includes request IDs
  - Integrates with execution traces

- **`exceptions.py`**
  - `CRAGException`: Base exception
  - `DocumentIngestionError`: Ingestion failure
  - `EmbeddingError`: Embedding generation failure
  - `VectorStoreError`: Database error
  - `LLMError`: API error
  - `RetrievalError`: Search failure
  - Each includes:
    - HTTP status code
    - Error code
    - User-friendly message
    - Internal details

- **`trace.py`**
  - `ExecutionTrace`: Root trace object
  - `TraceNode`: Individual node in trace
  - Schema validation
  - Serialization to JSON

- **`dependencies.py`**
  - Dependency injection container
  - Provides singleton instances
  - Example:
    ```python
    async def get_vector_store() -> VectorStore:
        return VectorStore(settings.QDRANT_URL)
    
    async def get_llm_service(
        vector_store: VectorStore = Depends(get_vector_store)
    ) -> LLMService:
        return LLMService(llm_client, vector_store)
    ```

---

### **7. Middleware**

**File:** `app/middleware/`

**Responsibility:** Cross-request concerns.

- **`error_handler.py`**
  - Catches all exceptions
  - Converts to HTTP responses
  - Returns consistent error format
  - Example:
    ```json
    {
      "error": {
        "code": "EMBEDDING_ERROR",
        "message": "Failed to generate embeddings",
        "details": {...}
      }
    }
    ```

- **`request_logger.py`**
  - Logs all requests/responses
  - Includes request ID
  - Measures execution time
  - Tracks errors

- **`cors.py`**
  - Configures CORS for frontend
  - Allows requests from Netlify domain
  - Credentials handling

---

## Dependency Flow

```
┌──────────────────────────────────────────────────────────────────┐
│                     FastAPI Routes                               │
│                 (documents.py, questions.py)                     │
└────────────────────────┬─────────────────────────────────────────┘
                         │ depends on
         ┌───────────────┴───────────────┐
         ▼                               ▼
    ┌─────────────┐            ┌──────────────────┐
    │ Document    │            │ RAG              │
    │ Service     │            │ Service          │
    └────┬────────┘            └────┬─────────────┘
         │                          │
         ├─depends on──┐     ┌──────┼──────────────┐
         │             │     │      │              │
         ▼             ▼     ▼      ▼              ▼
    ┌─────────────┐  ┌─────────┐  ┌──────────┐  ┌──────────┐
    │ Ingestion   │  │ LLM     │  │ CRAG     │  │ Trace    │
    │ Pipeline    │  │ Service │  │ Pipeline │  │ Service  │
    └────┬────────┘  └────┬────┘  └────┬─────┘  └────┬─────┘
         │                │            │             │
         ├─uses───┐       │            │             │
         │        │       │            │             │
         ▼        ▼       ▼            ▼             ▼
    ┌─────────────────────────────────────────────────────┐
    │      Infrastructure Layer                           │
    │  (Vector Store, LLM Client, Embeddings)             │
    └─────────────────────────────────────────────────────┘
         │        │       │
         ▼        ▼       ▼
    ┌────────┐ ┌────────┐
    │ Qdrant │ │ OpenAI │
    │ Cloud  │ │  API   │
    └────────┘ └────────┘
```

---

## Error Handling

### Strategy

**No silent failures.**

Every error is:
1. Caught at the appropriate layer
2. Logged with context
3. Converted to a domain exception
4. Returned to frontend with recovery information

### Error Layers

```
Infrastructure Layer
    ↓
    Catches: API timeouts, network errors, database errors
    ↓
    Converts to: InfrastructureException
    ↓
Service Layer
    ↓
    Catches: Invalid state, business rule violations
    ↓
    Converts to: ServiceException
    ↓
Route Layer
    ↓
    Catches: All exceptions
    ↓
    Converts to: HTTP response (400, 500, etc.)
```

### Error Response Format

```json
{
  "error": {
    "code": "EMBEDDING_ERROR",
    "message": "Failed to generate embeddings for document",
    "http_status": 500,
    "timestamp": "2024-01-15T10:30:00Z",
    "trace_id": "req-12345",
    "details": {
      "chunk_count": 156,
      "failed_at": "chunk 42",
      "reason": "API rate limit exceeded"
    },
    "recovery": {
      "action": "retry",
      "after_seconds": 60,
      "manual_action": "Contact support if issue persists"
    }
  }
}
```

---

## Logging Strategy

### Principle

**Structured logging. No unstructured text logs in production.**

All logs are JSON. Every log includes:
- Timestamp
- Log level
- Logger name
- Request ID
- Message
- Context (structured data)

### Log Levels

- **DEBUG**: Low-level details (token counts, vector dimensions)
- **INFO**: Normal flow (document uploaded, query processed)
- **WARNING**: Recoverable issues (degraded quality, retries)
- **ERROR**: Failure (API down, ingestion failed)
- **CRITICAL**: System failure (database unavailable)

### Example

```python
logger.info(
    "document_uploaded",
    extra={
        "document_id": doc_id,
        "file_size_mb": 2.5,
        "chunk_count": 156,
        "duration_seconds": 12.3,
        "request_id": request_id
    }
)
```

### Integration with Traces

Logs from the execution are NOT added to traces.

Traces are built from **domain events**, not logs.

Logs are for operational monitoring. Traces are for user understanding.

---

## Configuration Management

### Configuration Sources

**Priority (highest to lowest):**

1. Environment variables
2. `.env` file
3. Hardcoded defaults

### Required Environment Variables

```
# OpenAI
OPENAI_API_KEY=sk-...

# Vector Store (Qdrant Cloud)
QDRANT_URL=https://<your-cluster-id>.cloud.qdrant.io
QDRANT_API_KEY=...

# Embeddings
EMBEDDING_MODEL=text-embedding-3-large

# Application
LOG_LEVEL=INFO
ENVIRONMENT=development|production
BACKEND_URL=http://localhost:8000
FRONTEND_URL=http://localhost:5173

# CORS
ALLOWED_ORIGINS=http://localhost:5173,https://app.example.com

# Pipeline
CHUNK_SIZE=512
CHUNK_OVERLAP=50
TOP_K=5
```

### Configuration Class

```python
class Settings(BaseSettings):
    # OpenAI (LLM and Embeddings)
    openai_api_key: str
    
    # Vector Store (Qdrant Cloud)
    qdrant_url: str
    qdrant_api_key: str
    
    # Embeddings
    embedding_model: str = "text-embedding-3-large"
    
    # Application
    log_level: str = "INFO"
    environment: str = "development"
    backend_url: str
    frontend_url: str
    
    # CORS
    allowed_origins: list[str]
    
    # Pipeline
    chunk_size: int = 512
    chunk_overlap: int = 50
    top_k: int = 5
    
    class Config:
        env_file = ".env"
        case_sensitive = False
```

---

## Data Flow Example: Upload and Query

### Scenario: User uploads document

```
HTTP POST /documents/upload
    ↓
Route: documents.py
    ├─ Validates file
    ├─ Creates upload ID
    ├─ Calls document_service.upload_document()
    │
    └─→ DocumentService.upload_document()
        ├─ Creates Document record
        ├─ Calls ingestion_pipeline.process()
        │
        └─→ IngestionPipeline.process()
            ├─ loader.load_document()
            │   └─ Emits DocumentLoaded event
            │
            ├─ splitter.split()
            │   └─ Emits ChunksCreated event
            │
            ├─ embedder.embed()
            │   └─ Emits EmbeddingsCreated event
            │
            └─ vector_store.upsert()
                └─ Emits VectorStoreUpdated event

All events → TraceService → Execution Trace

HTTP Response
{
  "document_id": "doc-123",
  "status": "processing",
  "trace": {...}
}
```

### Scenario: User asks question

```
HTTP POST /questions
{
  "query": "What is transformer architecture?",
  "document_ids": ["doc-123"]
}
    ↓
Route: questions.py
    ├─ Validates query
    ├─ Calls rag_service.process_question()
    │
    └─→ RAGService.process_question()
        ├─ Creates ExecutionTrace
        ├─ Calls crag_pipeline.run()
        │
        └─→ CRAGPipeline.run()
            ├─ retriever.retrieve(query)
            │   └─ Emits RetrievalComplete event
            │
            ├─ evaluator.evaluate(query, chunks)
            │   └─ Emits EvaluationComplete event
            │
            ├─ IF Correct:
            │   ├─ refiner.refine(chunks)
            │   │   └─ Emits RefinementComplete
            │   │
            │   └─ generator.generate(context, query)
            │       └─ Emits GenerationComplete
            │
            ├─ ELIF Ambiguous:
            │   ├─ refiner.refine(chunks)
            │   ├─ searcher.search(query)
            │   │   └─ Emits SearchComplete
            │   │
            │   └─ generator.generate(context + search_results, query)
            │       └─ Emits GenerationComplete
            │
            └─ ELIF Incorrect:
                ├─ rewriter.rewrite(query)
                │   └─ Emits RewriteComplete
                │
                ├─ searcher.search(rewritten_query)
                │   └─ Emits SearchComplete
                │
                └─ generator.generate(search_results, query)
                    └─ Emits GenerationComplete

All events → TraceService → Execution Trace

HTTP Response
{
  "answer": "Transformers are neural network architectures...",
  "trace": {
    "nodes": [...],
    "edges": [...],
    "execution_path": [...]
  }
}
```

---

## Testing Strategy (Overview)

### Unit Tests

- Test individual functions
- Mock external dependencies
- Located in `tests/unit/`
- Example:
  - Test `splitter.split()` with various inputs
  - Test `evaluator.evaluate()` with mock LLM
  - Test error handling in `embedder.embed()`

### Integration Tests

- Test service interactions
- Use real (test) Qdrant instance
- Located in `tests/integration/`
- Example:
  - Upload document → retrieve → verify chunks are in store
  - Ask question → verify trace structure

### End-to-End Tests

- Full workflow testing
- Located in `tests/e2e/`
- Example:
  - Upload PDF → Ask question → Verify answer contains relevant info

---

## Key Design Decisions

### 1. Why Layered Architecture?

- **Testability**: Each layer can be tested independently
- **Maintainability**: Clear boundaries make changes easier
- **Scalability**: Services can be moved to separate deployments

### 2. Why Event-Based Tracing?

- Traces are built incrementally, not reconstructed
- Frontend gets real-time updates
- No log parsing required
- Extensible (add new event types easily)

### 3. Why Dependency Injection?

- Easy to mock dependencies in tests
- Runtime configuration of behavior
- Decouples components

### 4. Why Service Layer?

- Separates HTTP concerns from business logic
- Services can be called from other contexts (batch jobs, etc.)
- Easier to test
- Easier to refactor

### 5. Why Split Ingestion and CRAG Pipelines?

- Different concerns (loading vs. reasoning)
- Different error recovery strategies
- Ingestion is synchronous, CRAG is request-driven
- Easier to reason about each

---

## Summary

The backend is modular, testable, and maintainable.

Every component has ONE responsibility.

Error handling is explicit. Logging is structured. Configuration is centralized.

The execution trace is built from domain events, not logs.

This architecture allows the frontend to provide a rich visualization of the CRAG pipeline without the backend needing to understand visualization concerns.
