# 03_CRAG_PIPELINE.md

## Complete CRAG Pipeline Specification

This document describes every node in the CRAG (Corrective Retrieval Augmented Generation) pipeline with precise specifications for implementation.

---

## PIPELINE OVERVIEW

```
Query Input
    ↓
[1. Retriever] → Get top-K chunks
    ↓
[2. Evaluator] → Score each chunk's relevance
    ↓
[3. Router] → Decide action (CORRECT/AMBIGUOUS/INCORRECT)
    ├─→ CORRECT
    │   ↓
    │ [4A. Refiner] → Clean internal docs
    │   ↓
    │ [5. Generator] → Generate answer
    │
    ├─→ AMBIGUOUS
    │   ↓
    │ [4A. Refiner] → Clean internal docs
    │ [4B. Web Search] → Find external docs
    │   ↓
    │ [5. Generator] → Generate answer with both
    │
    └─→ INCORRECT
        ↓
      [4B. Web Search] → Find external docs
        ↓
      [5. Generator] → Generate answer
    ↓
Answer Output
```

---

## NODE SPECIFICATIONS

### NODE 1: RETRIEVER

#### Purpose
Fetch semantically similar chunks from the vector database for a given query.

#### Inputs
```python
{
    "query": str,           # User question
    "k": int = 4,           # Number of chunks to retrieve
    "threshold": float = 0.0 # Minimum similarity score
}
```

#### Outputs
```python
{
    "retrieved_documents": [
        {
            "id": str,              # Chunk ID (unique)
            "content": str,         # Text content
            "metadata": {
                "source_document_id": str,
                "chunk_index": int,
                "page_number": int,
                "source_filename": str
            },
            "similarity_score": float  # [0.0, 1.0]
        }
    ],
    "retrieval_time_ms": int
}
```

#### Responsibilities
1. Convert query to embedding using OpenAI text-embedding-3-large
2. Query Qdrant vector database with cosine similarity
3. Return top-K results sorted by similarity
4. Attach metadata for traceability
5. Handle empty results gracefully

#### Processing Logic

```python
def retrieve(query: str, k: int = 4) -> RetrievalOutput:
    # 1. Get embedding for query
    query_embedding = embed(query)  # 3072-dim vector
    
    # 2. Search Qdrant
    results = qdrant_client.query_points(
        collection_name=current_collection,
        query=query_embedding,
        limit=k,
        score_threshold=0.0
    ).points
    
    # 3. Format output with metadata
    documents = []
    for result in results:
        documents.append({
            "id": result.id,
            "content": result.payload["text"],
            "metadata": result.payload,
            "similarity_score": result.score
        })
    
    return {
        "retrieved_documents": documents,
        "retrieval_time_ms": elapsed_time
    }
```

#### Possible Errors
- **No vector database**: Return empty list with error in trace
- **Query embedding fails**: Retry up to 3x, then return empty
- **Network timeout**: Render 5-second timeout error
- **Empty query**: Treat as error, request valid input

#### Execution Trace Generated
```python
{
    "node_id": "node_retriever",
    "node_name": "Retriever",
    "status": "SUCCESS",
    "input": {"query": "...", "k": 4},
    "output": {
        "retrieved_documents": [... ],
        "document_count": 4
    },
    "metadata": {
        "retrieval_time_ms": 234,
        "embedding_model": "text-embedding-3-large",
        "similarity_scores": [0.87, 0.75, 0.63, 0.51],
        "collection_name": "doc_abc123"
    }
}
```

#### State Transitions
- PENDING → (start) → RUNNING
- RUNNING → (embedding complete) → still RUNNING
- RUNNING → (search complete) → SUCCESS
- RUNNING → (any error) → FAILED

#### Configuration
```python
RETRIEVER_CONFIG = {
    "k": 4,                           # Top-K documents
    "similarity_threshold": 0.0,      # Include all
    "embedding_model": "text-embedding-3-large",
    "embedding_cache": True,          # Cache query embeddings
    "timeout_seconds": 5
}
```

---

### NODE 2: EVALUATOR

#### Purpose
Assess the relevance of each retrieved document to the original query using an LLM.

#### Inputs
```python
{
    "query": str,
    "documents": List[{
        "id": str,
        "content": str,
        "similarity_score": float
    }]
}
```

#### Outputs
```python
{
    "document_scores": [
        {
            "document_id": str,
            "relevance_score": float,    # [0.0, 1.0]
            "reasoning": str
        }
    ],
    "verdict": str,                  # CORRECT/INCORRECT/AMBIGUOUS
    "overall_reasoning": str,
    "evaluation_time_ms": int
}
```

#### Responsibilities
1. For each document, call LLM to score relevance
2. Aggregate scores to determine overall verdict
3. Provide reasoning for each decision
4. Handle evaluation failures gracefully

#### Processing Logic

```python
def evaluate(query: str, documents: List[Document]) -> EvaluationOutput:
    scores = []
    
    # 1. Score each document individually
    for doc in documents:
        score, reasoning = score_document(query, doc.content)
        scores.append({
            "document_id": doc.id,
            "relevance_score": score,
            "reasoning": reasoning
        })
    
    # 2. Determine verdict based on thresholds
    if any(s["relevance_score"] > UPPER_THRESHOLD for s in scores):
        verdict = "CORRECT"
        reasoning = f"At least one document scored > {UPPER_THRESHOLD}"
    
    elif all(s["relevance_score"] < LOWER_THRESHOLD for s in scores):
        verdict = "INCORRECT"
        reasoning = f"All documents scored < {LOWER_THRESHOLD}"
    
    else:
        verdict = "AMBIGUOUS"
        reasoning = "Mixed relevance scores"
    
    return {
        "document_scores": scores,
        "verdict": verdict,
        "overall_reasoning": reasoning
    }

def score_document(query: str, document: str) -> Tuple[float, str]:
    # Use LLM (gpt-4.1-mini) to evaluate relevance
    # Return structured output with score and reasoning
    pass
```

#### LLM Prompt

```
System:
You are a strict evaluator of document relevance for RAG systems.
You will be given a question and a document chunk.
Evaluate if this document DIRECTLY answers or helps answer the question.

Return ONLY a JSON object with:
{
    "score": <float between 0.0 and 1.0>,
    "reasoning": "<brief explanation>"
}

Scoring guidelines:
- 1.0: Document alone is completely sufficient to answer
- 0.8: Document provides most of the answer, minor gaps
- 0.6: Document provides some relevant information
- 0.4: Document contains tangentially related information
- 0.2: Document is mostly irrelevant but mentions topic
- 0.0: Document is completely irrelevant

Be conservative with high scores. A score of 0.8+ means the document
strongly answers the question.

---

Question: {query}

Document:
{document}

JSON Response:
```

#### Possible Errors
- **LLM API failure**: Retry up to 3x with exponential backoff
- **Invalid LLM response**: Parse error → assign score 0.0
- **Timeout**: Mark as AMBIGUOUS
- **Rate limit**: Queue and retry later

#### Execution Trace Generated
```python
{
    "node_id": "node_evaluator",
    "node_name": "Evaluator",
    "status": "SUCCESS",
    "input": {
        "query": "...",
        "document_count": 4
    },
    "output": {
        "verdict": "CORRECT",
        "document_scores": [0.85, 0.72, 0.45, 0.31],
        "overall_reasoning": "At least one document scored > 0.7"
    },
    "metadata": {
        "evaluation_time_ms": 3450,
        "llm_model": "gpt-4.1-mini",
        "api_calls_made": 4,
        "upper_threshold": 0.7,
        "lower_threshold": 0.3
    }
}
```

#### Configuration
```python
EVALUATOR_CONFIG = {
    "model": "gpt-4.1-mini",
    "upper_threshold": 0.7,    # Mark as relevant
    "lower_threshold": 0.3,    # Mark as irrelevant
    "timeout_seconds": 10,
    "max_retries": 3
}
```

---

### NODE 3: ROUTER

#### Purpose
Route the pipeline to different knowledge sources based on evaluation verdict.

#### Inputs
```python
{
    "verdict": str,  # CORRECT/INCORRECT/AMBIGUOUS
    "retrieved_documents": List[Document],
    "document_scores": List[float]
}
```

#### Outputs
```python
{
    "action": str,  # Path taken
    "reasoning": str
}
```

#### Responsibilities
1. Read verdict from Evaluator
2. Route to appropriate downstream nodes
3. Log decision for traceability

#### Processing Logic

```python
def route(verdict: str, scores: List[float]) -> str:
    if verdict == "CORRECT":
        return "refine_internal"  # Go to Refiner
    elif verdict == "INCORRECT":
        return "web_search"       # Go to Web Search
    else:  # AMBIGUOUS
        return "refine_and_search"  # Go to both
```

#### State Transitions
- Determines which next node(s) execute
- This is NOT a traditional node, but a conditional branching point

---

### NODE 4A: REFINER (Knowledge Refinement - Internal)

#### Purpose
Clean and extract relevant sentences from retrieved documents to remove noise.

#### Inputs
```python
{
    "documents": List[Document],
    "query": str
}
```

#### Outputs
```python
{
    "refined_context": str,
    "strips_processed": int,
    "strips_kept": int,
    "refinement_time_ms": int
}
```

#### Responsibilities
1. Decompose documents into sentence-level strips
2. Filter each strip for relevance
3. Recompose relevant strips into clean context
4. Maintain source traceability

#### Processing Logic

```python
def refine(documents: List[Document], query: str) -> RefinementOutput:
    # Phase 1: Decompose
    all_text = "\n\n".join(d.content for d in documents)
    strips = decompose_to_strips(all_text)
    
    # Phase 2: Filter
    kept_strips = []
    for strip in strips:
        is_relevant = filter_strip(query, strip)
        if is_relevant:
            kept_strips.append(strip)
    
    # Phase 3: Recompose
    refined_context = "\n".join(kept_strips)
    
    return {
        "refined_context": refined_context,
        "strips_processed": len(strips),
        "strips_kept": len(kept_strips),
        "refinement_time_ms": elapsed_time
    }

def decompose_to_strips(text: str) -> List[str]:
    # Split by sentence boundaries using regex
    # Minimum length: 20 characters
    # Result: List of sentences
    sentences = re.split(r'(?<=[.!?])\s+', text)
    return [s.strip() for s in sentences if len(s.strip()) >= 20]

def filter_strip(query: str, strip: str) -> bool:
    # Use LLM to determine if sentence is relevant
    # Return: True/False
    pass
```

#### LLM Prompt (Filter)

```
System:
You are a relevance filter for RAG context refinement.
Given a question and a sentence, determine if the sentence
helps answer the question.

Return ONLY a JSON object:
{
    "keep": true/false,
    "reason": "<brief explanation>"
}

Keep the sentence only if it DIRECTLY helps answer the question.
Remove filler, background, and tangentially related content.

---

Question: {query}

Sentence: {strip}

JSON Response:
```

#### Possible Errors
- **Decomposition fails**: Return all text as single strip
- **Filter LLM fails**: Keep all strips
- **Empty result**: Return original document text

#### Execution Trace Generated
```python
{
    "node_id": "node_refiner",
    "node_name": "Refiner (Internal)",
    "status": "SUCCESS",
    "input": {
        "query": "...",
        "document_count": 2,
        "total_text_length": 1842
    },
    "output": {
        "refined_context": "...",
        "strips_processed": 12,
        "strips_kept": 7,
        "compression_ratio": 0.58
    },
    "metadata": {
        "refinement_time_ms": 2100,
        "llm_model": "gpt-4.1-mini",
        "api_calls_made": 12,
        "filter_threshold": 0.5
    }
}
```

---

### NODE 4B: WEB SEARCH

#### Purpose
Search the web for information when internal documents are insufficient or absent.

#### Inputs
```python
{
    "query": str,
    "verdict": str  # INCORRECT or AMBIGUOUS
}
```

#### Outputs
```python
{
    "external_knowledge": str,
    "sources": List[{
        "title": str,
        "url": str,
        "snippet": str
    }],
    "search_time_ms": int
}
```

#### Responsibilities
1. Rewrite query for web search (extract keywords)
2. Execute web search
3. Fetch and extract content from top results
4. Apply knowledge refinement to web content
5. Return cleaned external knowledge

#### Processing Logic

```python
def web_search(query: str) -> WebSearchOutput:
    # Phase 1: Rewrite query
    search_query = rewrite_for_search(query)
    
    # Phase 2: Execute search
    results = search_api.search(search_query, num_results=3)
    
    # Phase 3: Extract content
    web_docs = []
    for result in results:
        try:
            content = fetch_url_content(result["url"])
            web_docs.append(Document(content=content, metadata=result))
        except:
            continue  # Skip if fetch fails
    
    # Phase 4: Refine web content
    external_knowledge = refine(web_docs, query)
    
    return {
        "external_knowledge": external_knowledge,
        "sources": [{"title": r["title"], "url": r["url"]} for r in results],
        "search_time_ms": elapsed_time
    }

def rewrite_for_search(query: str) -> str:
    # Use LLM to convert question to search keywords
    # Example: "What is photosynthesis?" → "photosynthesis process plants"
    pass
```

#### LLM Prompt (Query Rewriter)

```
System:
Convert the following question into search keywords for a search engine.
Extract 2-4 key concepts from the question.

Return ONLY a JSON object:
{
    "search_query": "<keywords separated by spaces>"
}

Example:
Question: "How does photosynthesis work in plants?"
Response: {"search_query": "photosynthesis plants process"}

---

Question: {query}

JSON Response:
```

#### Web Search API Selection

**Recommended: Tavily Search API**
```python
from langchain_community.tools.tavily_search import TavilySearchResults

search = TavilySearchResults(
    max_results=3,
    include_answer=True,
    search_depth="basic"
)

results = search.invoke({"query": search_query})
# Returns: List of {"url": str, "content": str, "title": str}
```

#### Possible Errors
- **Web search API fails**: Return empty knowledge string
- **URL fetch fails**: Skip that result, use others
- **No results found**: Return "No external sources found"
- **Network timeout**: Graceful degradation

#### Execution Trace Generated
```python
{
    "node_id": "node_web_search",
    "node_name": "Web Search",
    "status": "SUCCESS",
    "input": {
        "query": "...",
        "verdict": "INCORRECT"
    },
    "output": {
        "external_knowledge": "...",
        "source_count": 3,
        "sources": [
            {"title": "...", "url": "..."},
            ...
        ]
    },
    "metadata": {
        "search_time_ms": 1200,
        "search_query": "...",
        "urls_fetched": 3,
        "content_length": 2345,
        "refiner_time_ms": 800
    }
}
```

---

### NODE 5: GENERATOR

#### Purpose
Generate the final answer using refined knowledge and the original query.

#### Inputs
```python
{
    "query": str,
    "context": str,           # Refined knowledge from Refiner or Web Search
    "verdict": str,          # CORRECT/INCORRECT/AMBIGUOUS
    "confidence": float      # From Evaluator
}
```

#### Outputs
```python
{
    "answer": str,
    "generation_time_ms": int
}
```

#### Responsibilities
1. Construct prompt with context and query
2. Call LLM to generate answer
3. Validate answer quality
4. Return answer with metadata

#### Processing Logic

```python
def generate(query: str, context: str, verdict: str) -> GeneratorOutput:
    # Build prompt
    prompt = build_answer_prompt(query, context, verdict)
    
    # Generate answer
    answer = llm.generate(
        model="gpt-4.1-mini",
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": prompt}
        ],
        temperature=0,  # Deterministic
        max_tokens=500
    )
    
    return {
        "answer": answer,
        "generation_time_ms": elapsed_time
    }

def build_answer_prompt(query: str, context: str, verdict: str) -> str:
    confidence_note = {
        "CORRECT": "You have high confidence in these sources.",
        "AMBIGUOUS": "You have moderate confidence. Consider both sources.",
        "INCORRECT": "Use web search results. These are external sources."
    }.get(verdict)
    
    return f"""
Based on the following context, answer the question.
{confidence_note}

Context:
{context}

Question:
{query}

Answer:
"""
```

#### System Prompt

```
You are a helpful assistant answering questions based on provided context.

Guidelines:
1. Answer ONLY based on the provided context
2. If context doesn't answer the question, say "I cannot find this information in the provided context"
3. Cite sources when possible
4. Be concise but thorough
5. Do not make up information
6. If uncertain, acknowledge uncertainty
```

#### Possible Errors
- **LLM API failure**: Retry up to 3x
- **Empty context**: Generate answer saying "Insufficient context"
- **Timeout**: Return partial generation if available
- **Invalid output**: Retry with different temperature

#### Execution Trace Generated
```python
{
    "node_id": "node_generator",
    "node_name": "Generator",
    "status": "SUCCESS",
    "input": {
        "query": "...",
        "context_length": 456,
        "verdict": "CORRECT"
    },
    "output": {
        "answer": "..."
    },
    "metadata": {
        "generation_time_ms": 1500,
        "llm_model": "gpt-4.1-mini",
        "tokens_used": 125,
        "completion_reason": "stop"
    }
}
```

#### Configuration
```python
GENERATOR_CONFIG = {
    "model": "gpt-4.1-mini",
    "temperature": 0.0,        # Deterministic
    "max_tokens": 500,
    "timeout_seconds": 15,
    "max_retries": 3
}
```

---

## EXECUTION TRACE SCHEMA

Every pipeline execution produces a complete trace:

```python
ExecutionTrace = {
    "trace_id": str,              # UUID
    "query": str,
    "timestamp_start": datetime,
    "timestamp_end": datetime,
    "total_duration_ms": int,
    
    "decision_path": str,         # CORRECT/INCORRECT/AMBIGUOUS
    "final_answer": str,
    
    "nodes": [
        {
            "node_id": str,
            "node_name": str,
            "status": str,            # PENDING/RUNNING/SUCCESS/FAILED
            "timestamp_start": datetime,
            "timestamp_end": datetime,
            "duration_ms": int,
            
            "input": object,          # Node-specific
            "output": object,         # Node-specific
            
            "metadata": {
                "confidence": float,
                "reasoning": str,
                "error": str,         # If FAILED
                ...                   # Node-specific metadata
            }
        }
    ]
}
```

---

## PIPELINE EXECUTION ORDER

### Happy Path (CORRECT)
1. Retriever
2. Evaluator
3. Router (decision: CORRECT)
4. Refiner
5. Generator

### Fallback Path (INCORRECT)
1. Retriever
2. Evaluator
3. Router (decision: INCORRECT)
4. Web Search
5. Generator

### Hybrid Path (AMBIGUOUS)
1. Retriever
2. Evaluator
3. Router (decision: AMBIGUOUS)
4. Refiner (parallel/sequential with Web Search)
5. Web Search
6. Generator

---

## LATENCY TARGETS

| Node | Target Latency | Acceptable Range |
|------|---|---|
| Retriever | 2s | 1-5s |
| Evaluator | 3.5s | 2-8s |
| Refiner | 2s | 1-5s |
| Web Search | 3s | 2-7s |
| Generator | 2s | 1-5s |
| **Total (CORRECT)** | **10.5s** | **<20s** |
| **Total (AMBIGUOUS)** | **12.5s** | **<25s** |

---

## ERROR RECOVERY

### Retriever Failures
```
Failure → Attempt up to 3 times with exponential backoff
If all fail → Return empty documents → Evaluator assigns INCORRECT
```

### Evaluator Failures
```
Score retrieval fails → Assign score 0.0 (irrelevant)
If all fail → Return AMBIGUOUS (mixed confidence)
```

### Refiner Failures
```
Decomposition fails → Use full document
Filtering fails → Keep all strips
If all fail → Return original context
```

### Web Search Failures
```
Query rewrite fails → Use original query
Search API fails → Skip web search
URL fetch fails → Use search snippets instead
If all fail → Return empty external knowledge
```

### Generator Failures
```
LLM call fails → Retry up to 3 times
If all fail → Return "Unable to generate answer. Context: {context}"
```

---

## PERFORMANCE OPTIMIZATION

### Caching Strategies
1. **Query Embeddings**: Cache for 1 hour
2. **Web Search Results**: Cache identical queries for 24 hours
3. **Evaluator Scores**: Don't cache (query-specific)
4. **Document Embeddings**: Permanent (in Qdrant)

### Parallel Execution
- Refiner and Web Search can run in parallel when verdict is AMBIGUOUS
- All node LLM calls are independent and parallelizable

### Batch Processing
- Evaluator scores documents in parallel (if API allows)
- Filter strips can batch-call LLM (up to 10 strips per request)

---

## Summary

The CRAG pipeline is a **deterministic, traceable workflow** where each node has clear input/output contracts. The execution trace captures every decision, allowing the frontend to visualize exactly what the system did and why.

This modular design makes each node independently testable and replaceable. The pipeline is robust with comprehensive error handling and graceful degradation.

---

**Document Version**: 1.0  
**Last Updated**: June 2026  
**Status**: Approved for Implementation
