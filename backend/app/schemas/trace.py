from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional
from datetime import datetime, UTC

class NodeEvent(BaseModel):
    node_id: str
    node_name: str
    display_name: str
    type: str  # retrieval, evaluation, search, generation, refinement, query_rewrite
    status: str  # PENDING, RUNNING, SUCCESS, FAILED, SKIPPED
    started_at: datetime
    completed_at: datetime
    duration_ms: float
    input: Dict[str, Any]
    output: Dict[str, Any]
    metadata: Dict[str, Any]
    error: Optional[Dict[str, Any]] = None

class CostEstimate(BaseModel):
    currency: str = "USD"
    embedding_api: float = 0.0
    evaluator_api: float = 0.0
    generator_api: float = 0.0
    total: float = 0.0

class TraceResponseData(BaseModel):
    trace_id: str
    query_id: str
    query_text: str
    started_at: datetime
    completed_at: datetime
    total_duration_ms: float
    nodes: List[NodeEvent]
    execution_path: List[str]
    cost_estimate: CostEstimate

class TraceResponseEnvelope(BaseModel):
    status: str = "success"
    code: int = 200
    data: TraceResponseData
    timestamp: datetime = Field(default_factory=lambda: datetime.now(UTC))
    request_id: Optional[str] = None
