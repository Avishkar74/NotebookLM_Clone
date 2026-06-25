# 06_API_CONTRACT.md

## REST API Contract for CRAG System

**Base URL**: `https://api.render.app/api` (Production) | `http://localhost:8000/api` (Development)

**Version**: 1.0  
**Authentication**: None (Single-user educational system)  
**Content-Type**: `application/json`

---

## Table of Contents

1. [API Overview](#api-overview)
2. [Common Response Structure](#common-response-structure)
3. [Document Upload Pipeline](#document-upload-pipeline)
4. [Document Management](#document-management)
5. [Query & Answer Pipeline](#query--answer-pipeline)
6. [Execution Trace Retrieval](#execution-trace-retrieval)
7. [Health Check](#health-check)
8. [Error Handling](#error-handling)
9. [Rate Limiting](#rate-limiting)
10. [CORS Configuration](#cors-configuration)

---

## API Overview

The API is organized into three main resource groups:

| Endpoint Group | Purpose | Operations |
|---|---|---|
| `/documents` | Document lifecycle management | Upload, list, status, delete |
| `/query` | Question answering | Submit query, retrieve answer |
| `/trace` | Execution trace retrieval | Get trace, export trace |
| `/health` | System health | Health check, readiness probe |

**Response Time SLA**:
- Document upload: 30-60s (includes ingestion pipeline)
- Query submission: 10-15s (depends on external APIs)
- List operations: <1s
- Trace retrieval: <1s

---

## Common Response Structure

### Success Response (2xx)

```json
{
  "status": "success",
  "code": 200,
  "message": "Operation completed successfully",
  "data": {
    // Response-specific data
  },
  "timestamp": "2024-06-25T10:30:00Z",
  "request_id": "req_12345abcde"
}
```

### Error Response (4xx, 5xx)

```json
{
  "status": "error",
  "code": 400,
  "error": {
    "type": "ValidationError",
    "message": "File must be PDF or TXT",
    "field": "file",
    "details": [
      {
        "location": ["body", "file"],
        "msg": "Unsupported file type: .doc"
      }
    ]
  },
  "timestamp": "2024-06-25T10:30:00Z",
  "request_id": "req_12345abcde"
}
```

### Common Fields

| Field | Type | Description |
|-------|------|---|
| `status` | string | "success" or "error" |
| `code` | integer | HTTP status code |
| `message` | string | Human-readable message (optional in errors) |
| `data` | object | Response payload (only in success) |
| `error` | object | Error details (only in errors) |
| `timestamp` | ISO 8601 | UTC timestamp of response |
| `request_id` | string | Unique request identifier for tracing |

---

## Document Upload Pipeline

### Endpoint: Upload Document

```
POST /documents/upload
```

**Purpose**: Upload a PDF or TXT file for ingestion.

**Multipart Form Data**:

| Field | Type | Required | Constraint | Description |
|-------|------|----------|-----------|---|
| `file` | File | Yes | Max 50MB | PDF or TXT file |
| `metadata` | JSON | No | - | Optional metadata |

**Metadata Schema** (optional):

```json
{
  "title": "My Document",
  "author": "John Doe",
  "source": "Wikipedia",
  "tags": ["machine-learning", "nlp"],
  "retention_days": 30
}
```

**Request Example**:

```bash
curl -X POST http://localhost:8000/api/documents/upload \
  -F "file=@document.pdf" \
  -F 'metadata={"title":"Attention Is All You Need","author":"Vaswani et al."}'
```

**Success Response (202 Accepted)**:

```json
{
  "status": "success",
  "code": 202,
  "message": "Document uploaded and ingestion started",
  "data": {
    "document_id": "doc_67890xyz",
    "filename": "document.pdf",
    "file_size_bytes": 2048576,
    "status": "PROCESSING",
    "progress": {
      "stage": "PARSING_PDF",
      "percentage": 5
    },
    "created_at": "2024-06-25T10:30:00Z",
    "metadata": {
      "title": "Attention Is All You Need",
      "author": "Vaswani et al.",
      "source": "arxiv"
    },
    "estimated_completion_seconds": 45
  },
  "timestamp": "2024-06-25T10:30:00Z",
  "request_id": "req_12345abcde"
}
```

**Status Codes**:

| Code | Scenario | Response |
|------|----------|----------|
| 202 | File uploaded, processing started | See above |
| 400 | Invalid file format or metadata | Error details in `error.details` |
| 413 | File exceeds 50MB limit | "Payload too large" |
| 500 | Unexpected server error | Error type and message |

**Validation Rules**:

```python
# File validation
- file.content_type in ["application/pdf", "text/plain"]
- file.filename.endswith((".pdf", ".txt"))
- file.size <= 52428800  # 50MB
- file.size > 0

# Metadata validation (if provided)
- metadata.title: max 200 chars
- metadata.author: max 100 chars
- metadata.tags: max 10 items, each max 50 chars
- metadata.retention_days: 1-365 (default: 30)
```

**Response Headers**:

```
Content-Type: application/json
X-Request-ID: req_12345abcde
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 99
X-RateLimit-Reset: 1624670400
```

---

### Endpoint: Get Ingestion Status

```
GET /documents/{document_id}/status
```

**Purpose**: Poll the ingestion status of an uploaded document.

**Path Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|---|
| `document_id` | string | Yes | Document ID (returned from upload) |

**Query Parameters**: None

**Request Example**:

```bash
curl -X GET http://localhost:8000/api/documents/doc_67890xyz/status
```

**Success Response (200 OK)**:

```json
{
  "status": "success",
  "code": 200,
  "data": {
    "document_id": "doc_67890xyz",
    "filename": "document.pdf",
    "overall_status": "PROCESSING",
    "progress": {
      "current_stage": "EMBEDDING_GENERATION",
      "percentage": 75,
      "stages_completed": [
        {
          "name": "PDF_PARSING",
          "status": "COMPLETED",
          "duration_seconds": 5
        },
        {
          "name": "TEXT_EXTRACTION",
          "status": "COMPLETED",
          "duration_seconds": 2
        },
        {
          "name": "CHUNKING",
          "status": "COMPLETED",
          "duration_seconds": 1
        },
        {
          "name": "EMBEDDING_GENERATION",
          "status": "IN_PROGRESS",
          "duration_seconds": 15
        }
      ],
      "estimated_remaining_seconds": 10
    },
    "chunks_count": 156,
    "embeddings_stored": 156,
    "created_at": "2024-06-25T10:30:00Z",
    "updated_at": "2024-06-25T10:31:15Z"
  },
  "timestamp": "2024-06-25T10:31:15Z",
  "request_id": "req_12345abcde"
}
```

**Status Codes**:

| Code | Scenario | Response |
|------|----------|----------|
| 200 | Status retrieved successfully | See above |
| 404 | Document not found | "Document not found" |
| 500 | Server error | Error details |

**Overall Status Values**:

```
QUEUED          - Waiting to be processed
PARSING         - Extracting text from PDF
CHUNKING        - Splitting into chunks
EMBEDDING       - Generating embeddings
STORING         - Saving to vector DB
COMPLETED       - Ready for querying
FAILED          - Error occurred during processing
```

---

## Document Management

### Endpoint: List Documents

```
GET /documents
```

**Purpose**: Retrieve all uploaded documents.

**Query Parameters**:

| Parameter | Type | Default | Description |
|-----------|------|---------|---|
| `status` | string | (all) | Filter by status: COMPLETED, PROCESSING, FAILED |
| `limit` | integer | 20 | Max results (1-100) |
| `offset` | integer | 0 | Pagination offset |
| `sort_by` | string | created_at | Sort field: created_at, filename |
| `sort_order` | string | desc | Sort direction: asc, desc |

**Request Example**:

```bash
curl -X GET "http://localhost:8000/api/documents?status=COMPLETED&limit=10&sort_by=created_at"
```

**Success Response (200 OK)**:

```json
{
  "status": "success",
  "code": 200,
  "data": {
    "documents": [
      {
        "document_id": "doc_67890xyz",
        "filename": "document.pdf",
        "file_size_bytes": 2048576,
        "status": "COMPLETED",
        "chunks_count": 156,
        "embeddings_stored": 156,
        "created_at": "2024-06-25T10:30:00Z",
        "updated_at": "2024-06-25T10:35:00Z",
        "metadata": {
          "title": "Attention Is All You Need",
          "author": "Vaswani et al.",
          "source": "arxiv",
          "tags": ["nlp", "transformer"]
        }
      }
    ],
    "pagination": {
      "total_count": 1,
      "limit": 10,
      "offset": 0,
      "has_more": false
    }
  },
  "timestamp": "2024-06-25T10:35:00Z",
  "request_id": "req_12345abcde"
}
```

**Status Codes**:

| Code | Scenario |
|------|----------|
| 200 | Success |
| 400 | Invalid query parameters |

---

### Endpoint: Delete Document

```
DELETE /documents/{document_id}
```

**Purpose**: Delete a document and its embeddings from the vector database.

**Path Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|---|
| `document_id` | string | Yes | Document ID to delete |

**Query Parameters**:

| Parameter | Type | Default | Description |
|-----------|------|---------|---|
| `cascade` | boolean | true | Also delete associated traces and conversation history |

**Request Example**:

```bash
curl -X DELETE http://localhost:8000/api/documents/doc_67890xyz?cascade=true
```

**Success Response (200 OK)**:

```json
{
  "status": "success",
  "code": 200,
  "message": "Document deleted successfully",
  "data": {
    "document_id": "doc_67890xyz",
    "filename": "document.pdf",
    "embeddings_removed": 156,
    "traces_removed": 5,
    "deleted_at": "2024-06-25T10:40:00Z"
  },
  "timestamp": "2024-06-25T10:40:00Z",
  "request_id": "req_12345abcde"
}
```

**Status Codes**:

| Code | Scenario |
|------|----------|
| 200 | Deleted successfully |
| 404 | Document not found |
| 500 | Server error |

---

## Query & Answer Pipeline

### Endpoint: Submit Query

```
POST /query/answer
```

**Purpose**: Submit a question about uploaded documents.

**Request Body**:

```json
{
  "query": "What is the role of multi-head attention in transformers?",
  "document_ids": ["doc_67890xyz"],
  "top_k": 5,
  "options": {
    "use_web_search": true,
    "include_confidence": true,
    "return_retrieved_chunks": true
  }
}
```

**Request Schema**:

| Field | Type | Required | Constraint | Description |
|-------|------|----------|-----------|---|
| `query` | string | Yes | Max 1000 chars, min 5 chars | The question |
| `document_ids` | array | No | List of doc IDs or empty for all | Filter by documents |
| `top_k` | integer | No | 1-20, default 5 | Number of chunks to retrieve |
| `options.use_web_search` | boolean | No | Default: false | Allow external web search |
| `options.include_confidence` | boolean | No | Default: true | Include confidence scores |
| `options.return_retrieved_chunks` | boolean | No | Default: true | Include source chunks in response |

**Validation Rules**:

```python
# Query validation
- query.length >= 5 and <= 1000
- query.strip() != ""
- len(document_ids) >= 0

# Top-K validation
- 1 <= top_k <= 20

# Document IDs validation
- all(doc_id in database for doc_id in document_ids)
```

**Request Example**:

```bash
curl -X POST http://localhost:8000/api/query/answer \
  -H "Content-Type: application/json" \
  -d '{
    "query": "What is multi-head attention?",
    "document_ids": ["doc_67890xyz"],
    "top_k": 5,
    "options": {
      "include_confidence": true,
      "return_retrieved_chunks": true
    }
  }'
```

**Success Response (200 OK)**:

```json
{
  "status": "success",
  "code": 200,
  "message": "Query processed successfully",
  "data": {
    "query_id": "query_99999zzz",
    "query_text": "What is multi-head attention?",
    "answer": "Multi-head attention is a mechanism in the Transformer architecture that allows the model to jointly attend to information from different representation subspaces at different positions. Instead of using a single attention head, the model uses multiple attention heads in parallel, each learning different representations of the input. This allows the model to capture different types of relationships and patterns in the data simultaneously.",
    "answer_generated_at": "2024-06-25T10:45:00Z",
    "response_time_ms": 8500,
    "confidence": {
      "overall": 0.92,
      "retrieval": 0.95,
      "evaluation": 0.88,
      "generation": 0.90
    },
    "retrieved_chunks": [
      {
        "chunk_id": "chunk_001",
        "document_id": "doc_67890xyz",
        "document_title": "Attention Is All You Need",
        "text": "Multi-head attention allows the model to jointly attend to information from different representation subspaces...",
        "page_number": 5,
        "similarity_score": 0.94,
        "chunk_size_tokens": 150
      },
      {
        "chunk_id": "chunk_002",
        "document_id": "doc_67890xyz",
        "text": "The attention mechanism computes a weighted average of values based on the similarity of queries to keys...",
        "page_number": 4,
        "similarity_score": 0.89,
        "chunk_size_tokens": 128
      }
    ],
    "execution_trace_id": "trace_88888yyy",
    "trace_url": "/api/trace/trace_88888yyy"
  },
  "timestamp": "2024-06-25T10:45:00Z",
  "request_id": "req_12345abcde"
}
```

**Status Codes**:

| Code | Scenario | Response |
|------|----------|----------|
| 200 | Query answered successfully | Complete answer + trace |
| 400 | Invalid query format | Validation error details |
| 404 | Document not found | Document ID not found error |
| 503 | External service unavailable | Service unavailability message |
| 504 | Query timeout (>30s) | Timeout error |

---

## Execution Trace Retrieval

### Endpoint: Get Execution Trace

```
GET /trace/{trace_id}
```

**Purpose**: Retrieve the complete execution trace for a query.

**Path Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|---|
| `trace_id` | string | Yes | Trace ID from query response |

**Query Parameters**:

| Parameter | Type | Default | Description |
|-----------|------|---------|---|
| `format` | string | json | Response format: json, csv, yaml |
| `include_raw` | boolean | false | Include raw LLM outputs |
| `expand_all` | boolean | false | Recursively expand all nested data |

**Request Example**:

```bash
curl -X GET "http://localhost:8000/api/trace/trace_88888yyy?format=json&expand_all=true"
```

**Success Response (200 OK)**:

```json
{
  "status": "success",
  "code": 200,
  "data": {
    "trace_id": "trace_88888yyy",
    "query_id": "query_99999zzz",
    "query_text": "What is multi-head attention?",
    "started_at": "2024-06-25T10:45:00Z",
    "completed_at": "2024-06-25T10:45:08Z",
    "total_duration_ms": 8500,
    "nodes": [
      {
        "node_id": "node_retrieval_001",
        "node_type": "RETRIEVER",
        "node_name": "Semantic Search",
        "status": "COMPLETED",
        "started_at": "2024-06-25T10:45:00Z",
        "ended_at": "2024-06-25T10:45:02Z",
        "duration_ms": 2000,
        "input": {
          "query": "What is multi-head attention?",
          "top_k": 5,
          "vector_db": "qdrant"
        },
        "output": {
          "chunks": [
            {
              "chunk_id": "chunk_001",
              "text": "Multi-head attention allows...",
              "similarity_score": 0.94
            }
          ],
          "total_chunks_returned": 5
        },
        "metadata": {
          "embedding_model": "text-embedding-3-large",
          "retrieval_method": "cosine_similarity",
          "vector_db_query_time_ms": 150
        }
      },
      {
        "node_id": "node_evaluator_001",
        "node_type": "EVALUATOR",
        "node_name": "Retrieval Evaluator",
        "status": "COMPLETED",
        "started_at": "2024-06-25T10:45:02Z",
        "ended_at": "2024-06-25T10:45:04Z",
        "duration_ms": 2000,
        "input": {
          "query": "What is multi-head attention?",
          "retrieved_chunks_count": 5,
          "top_chunk_score": 0.94
        },
        "output": {
          "verdict": "CORRECT",
          "confidence": 0.88,
          "reasoning": "Retrieved chunks directly address the query with high relevance"
        },
        "metadata": {
          "evaluator_model": "gpt-4.1-mini",
          "evaluation_strategy": "similarity_based",
          "llm_tokens_used": 150
        }
      },
      {
        "node_id": "node_refinement_001",
        "node_type": "KNOWLEDGE_REFINEMENT",
        "node_name": "Internal Knowledge Refinement",
        "status": "COMPLETED",
        "started_at": "2024-06-25T10:45:04Z",
        "ended_at": "2024-06-25T10:45:06Z",
        "duration_ms": 2000,
        "input": {
          "chunks": [
            {
              "chunk_id": "chunk_001",
              "text": "Multi-head attention allows..."
            }
          ]
        },
        "output": {
          "refined_context": "Multi-head attention allows the model to jointly attend to information from different representation subspaces at different positions...",
          "decomposed_strips": ["Multi-head attention is a mechanism", "It allows joint attention", "Different representation subspaces..."],
          "filtered_strips": ["Multi-head attention is a mechanism", "It allows joint attention"],
          "recomposed_knowledge": "Multi-head attention is a mechanism that allows joint attention from different representation subspaces..."
        },
        "metadata": {
          "strips_created": 12,
          "strips_filtered": 10,
          "filtering_llm_tokens": 200
        }
      },
      {
        "node_id": "node_generator_001",
        "node_type": "GENERATOR",
        "node_name": "Answer Generator",
        "status": "COMPLETED",
        "started_at": "2024-06-25T10:45:06Z",
        "ended_at": "2024-06-25T10:45:08Z",
        "duration_ms": 2000,
        "input": {
          "query": "What is multi-head attention?",
          "context_chunks": 2,
          "context_tokens": 450
        },
        "output": {
          "answer": "Multi-head attention is a mechanism in the Transformer architecture...",
          "answer_length_tokens": 180
        },
        "metadata": {
          "generator_model": "gpt-4.1-mini",
          "generation_strategy": "context_augmented",
          "temperature": 0.7,
          "total_tokens_used": 500
        }
      }
    ],
    "execution_path": ["RETRIEVER", "EVALUATOR", "KNOWLEDGE_REFINEMENT", "GENERATOR"],
    "cost_estimate": {
      "currency": "USD",
      "embedding_api": 0.00002,
      "evaluator_api": 0.15,
      "generator_api": 0.25,
      "total": 0.40002
    }
  },
  "timestamp": "2024-06-25T10:45:08Z",
  "request_id": "req_12345abcde"
}
```

**Node Type Definitions**:

```
RETRIEVER              - Vector similarity search
EVALUATOR             - Assess retrieval quality (CORRECT/AMBIGUOUS/INCORRECT)
KNOWLEDGE_REFINEMENT  - Internal knowledge processing (decompose/filter/recompose)
KNOWLEDGE_SEARCH      - External web search
QUERY_REWRITE         - Rewrite query for better retrieval
GENERATOR             - LLM-based answer generation
```

**Status Codes**:

| Code | Scenario |
|------|----------|
| 200 | Trace retrieved successfully |
| 404 | Trace not found |

---

### Endpoint: Export Trace

```
GET /trace/{trace_id}/export
```

**Purpose**: Export trace in alternative formats.

**Query Parameters**:

| Parameter | Type | Options | Description |
|-----------|------|---------|---|
| `format` | string | json, csv, yaml, mermaid | Export format |

**Request Example**:

```bash
curl -X GET "http://localhost:8000/api/trace/trace_88888yyy/export?format=mermaid" \
  -H "Accept: text/plain"
```

**Mermaid Format Response (200 OK)**:

```
graph TD
    A["Retriever<br/>2000ms<br/>Top-5 Chunks"] -->|0.94| B["Evaluator<br/>2000ms<br/>CORRECT"]
    B -->|0.88 confidence| C["Knowledge Refinement<br/>2000ms<br/>Decompose/Filter"]
    C --> D["Generator<br/>2000ms<br/>gpt-4.1-mini"]
    D --> E["Answer Generated"]
    
    style A fill:#e1f5ff
    style B fill:#c8e6c9
    style C fill:#fff9c4
    style D fill:#ffe0b2
    style E fill:#f0f4c3
```

---

## Health Check

### Endpoint: Health Check

```
GET /health
```

**Purpose**: Basic health check for monitoring.

**Request Example**:

```bash
curl -X GET http://localhost:8000/api/health
```

**Success Response (200 OK)**:

```json
{
  "status": "healthy",
  "timestamp": "2024-06-25T10:50:00Z",
  "version": "1.0.0",
  "services": {
    "openai_api": "healthy",
    "qdrant_db": "healthy",
    "web_search": "healthy"
  }
}
```

### Endpoint: Readiness Check

```
GET /health/ready
```

**Purpose**: Detailed readiness check for Kubernetes/container orchestration.

**Success Response (200 OK)**:

```json
{
  "ready": true,
  "services": {
    "openai_api": {
      "ready": true,
      "response_time_ms": 150
    },
    "qdrant_db": {
      "ready": true,
      "response_time_ms": 50
    },
    "web_search": {
      "ready": true,
      "response_time_ms": 200
    }
  }
}
```

---

## Error Handling

### Error Response Structure

All errors return a consistent structure with an HTTP error code:

```json
{
  "status": "error",
  "code": 400,
  "error": {
    "type": "ValidationError",
    "message": "File must be PDF or TXT",
    "field": "file",
    "details": [
      {
        "location": ["body", "file"],
        "msg": "Unsupported file type: .doc",
        "type": "value_error"
      }
    ]
  },
  "timestamp": "2024-06-25T10:30:00Z",
  "request_id": "req_12345abcde"
}
```

### HTTP Status Codes

| Code | Meaning | Scenario |
|------|---------|----------|
| 200 | OK | Successful query/retrieval |
| 202 | Accepted | Document uploaded, processing started |
| 400 | Bad Request | Invalid input format or validation failure |
| 404 | Not Found | Document/trace not found |
| 413 | Payload Too Large | File exceeds size limit |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Internal Server Error | Unexpected server error |
| 503 | Service Unavailable | External service down (Qdrant, OpenAI) |
| 504 | Gateway Timeout | Query processing timeout (>30s) |

### Common Error Types

#### ValidationError (400)

```json
{
  "status": "error",
  "code": 400,
  "error": {
    "type": "ValidationError",
    "message": "Invalid request",
    "details": [
      {
        "location": ["body", "query"],
        "msg": "String should have at least 5 characters",
        "type": "string_too_short"
      }
    ]
  }
}
```

#### FileFormatError (400)

```json
{
  "status": "error",
  "code": 400,
  "error": {
    "type": "FileFormatError",
    "message": "Unsupported file format",
    "field": "file",
    "details": {
      "received_type": "application/msword",
      "supported_types": ["application/pdf", "text/plain"]
    }
  }
}
```

#### NotFoundError (404)

```json
{
  "status": "error",
  "code": 404,
  "error": {
    "type": "NotFoundError",
    "message": "Document not found",
    "resource": "document",
    "resource_id": "doc_67890xyz"
  }
}
```

#### ServiceUnavailableError (503)

```json
{
  "status": "error",
  "code": 503,
  "error": {
    "type": "ServiceUnavailableError",
    "message": "Vector database is temporarily unavailable",
    "service": "qdrant",
    "retry_after_seconds": 60
  }
}
```

#### TimeoutError (504)

```json
{
  "status": "error",
  "code": 504,
  "error": {
    "type": "TimeoutError",
    "message": "Query processing exceeded 30-second timeout",
    "timeout_seconds": 30,
    "operation": "query_answer"
  }
}
```

---

## Rate Limiting

### Rate Limit Strategy

- **Document Upload**: 10 uploads per minute per IP
- **Queries**: 30 queries per minute per IP
- **Trace Retrieval**: 100 requests per minute per IP
- **Health Checks**: Unlimited

### Rate Limit Headers

All responses include rate limit headers:

```
X-RateLimit-Limit: 30
X-RateLimit-Remaining: 27
X-RateLimit-Reset: 1624670400
X-RateLimit-RetryAfter: 5
```

### Rate Limit Response (429)

```json
{
  "status": "error",
  "code": 429,
  "error": {
    "type": "RateLimitError",
    "message": "Rate limit exceeded",
    "limit": 30,
    "window_seconds": 60,
    "retry_after_seconds": 45
  },
  "timestamp": "2024-06-25T10:30:00Z",
  "request_id": "req_12345abcde"
}
```

---

## CORS Configuration

### Allowed Origins

**Production**:
```
https://crag-app.netlify.app
```

**Development**:
```
http://localhost:5173
```

### CORS Headers

```
Access-Control-Allow-Origin: https://crag-app.netlify.app
Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS
Access-Control-Allow-Headers: Content-Type, X-Request-ID
Access-Control-Allow-Credentials: false
Access-Control-Max-Age: 86400
```

### Preflight Request

All non-GET requests require a preflight OPTIONS request.

```bash
curl -X OPTIONS http://localhost:8000/api/documents/upload \
  -H "Origin: http://localhost:5173" \
  -H "Access-Control-Request-Method: POST"
```

---

## Request/Response Examples

### Complete Upload Flow

**1. Upload Request**:
```bash
curl -X POST http://localhost:8000/api/documents/upload \
  -F "file=@paper.pdf" \
  -F 'metadata={"title":"Transformer Paper"}'
```

**2. Polling Status**:
```bash
curl -X GET http://localhost:8000/api/documents/doc_67890xyz/status
```

**3. Submit Query**:
```bash
curl -X POST http://localhost:8000/api/query/answer \
  -H "Content-Type: application/json" \
  -d '{
    "query": "What is attention?",
    "document_ids": ["doc_67890xyz"],
    "top_k": 5
  }'
```

**4. Get Trace**:
```bash
curl -X GET http://localhost:8000/api/trace/trace_88888yyy
```

---

## Implementation Notes

### Request ID Propagation

Every response includes a unique `request_id` for tracing:

```python
import uuid
request_id = str(uuid.uuid4())
# Include in all logs and trace events
```

### Async Processing

Document ingestion is async:
- Client receives 202 Accepted immediately
- Client polls status endpoint
- When `overall_status == COMPLETED`, document is ready

### Error Recovery

- Transient errors (5xx) should be retried with exponential backoff
- Client-side errors (4xx) should not be retried
- Maximum retry attempts: 3

---

**Document Version**: 1.0  
**Last Updated**: June 2026  
**Status**: Ready for Implementation
