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
    session_id: Optional[str] = None
    query_id: str
    question: str
    status: str  # CREATED, RUNNING, COMPLETED, FAILED, CANCELLED
    started_at: datetime
    completed_at: datetime
    duration_ms: float
    decision_path: str  # CORRECT, AMBIGUOUS, INCORRECT
    active_branch: List[str]
    nodes: List[NodeEvent]
    final_answer: str
    metadata: Dict[str, Any] = Field(default_factory=dict)
    
    # Backward compatibility fields
    query_text: Optional[str] = None
    total_duration_ms: Optional[float] = None
    execution_path: Optional[List[str]] = None
    cost_estimate: Optional[CostEstimate] = None

class TraceResponseEnvelope(BaseModel):
    status: str = "success"
    code: int = 200
    data: TraceResponseData
    timestamp: datetime = Field(default_factory=lambda: datetime.now(UTC))
    request_id: Optional[str] = None
