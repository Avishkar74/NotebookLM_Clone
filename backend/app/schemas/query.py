from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime, UTC

class QueryOptions(BaseModel):
    use_web_search: Optional[bool] = False
    include_confidence: Optional[bool] = True
    return_retrieved_chunks: Optional[bool] = True

class QueryRequest(BaseModel):
    query: str = Field(..., min_length=5, max_length=1000)
    document_ids: Optional[List[str]] = Field(default_factory=list)
    top_k: Optional[int] = Field(5, ge=1, le=20)
    options: Optional[QueryOptions] = Field(default_factory=QueryOptions)

class QueryConfidence(BaseModel):
    overall: float
    retrieval: float
    evaluation: Optional[float] = None
    generation: float

class QueryResponseChunk(BaseModel):
    chunk_id: str
    document_id: str
    document_title: Optional[str] = None
    text: str
    page_number: int
    similarity_score: float
    chunk_size_tokens: Optional[int] = None

class QueryResponseData(BaseModel):
    query_id: str
    query_text: str
    answer: str
    answer_generated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    response_time_ms: float
    confidence: Optional[QueryConfidence] = None
    retrieved_chunks: Optional[List[QueryResponseChunk]] = None
    execution_trace_id: str
    trace_url: str

class QueryResponseEnvelope(BaseModel):
    status: str = "success"
    code: int = 200
    message: str = "Query processed successfully"
    data: QueryResponseData
    timestamp: datetime = Field(default_factory=lambda: datetime.now(UTC))
    request_id: Optional[str] = None
