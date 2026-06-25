from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime
from app.config.constants import IngestionStatus

class DocumentMetadata(BaseModel):
    title: Optional[str] = None
    author: Optional[str] = None
    source: Optional[str] = None
    tags: Optional[List[str]] = Field(default_factory=list)
    retention_days: Optional[int] = 30

class DocumentUploadResponse(BaseModel):
    document_id: str
    filename: str
    file_size_bytes: int
    status: IngestionStatus
    created_at: datetime
    metadata: Optional[Dict[str, Any]] = None
    estimated_completion_seconds: int = 30

class StageStatus(BaseModel):
    name: str
    status: str  # PENDING, IN_PROGRESS, COMPLETED, FAILED
    duration_seconds: Optional[float] = 0.0
    output: Optional[Dict[str, Any]] = None

class ProgressInfo(BaseModel):
    current_stage: str
    percentage: int
    stages_completed: List[StageStatus]
    estimated_remaining_seconds: int

class DocumentStatusResponse(BaseModel):
    document_id: str
    filename: str
    overall_status: IngestionStatus
    progress: ProgressInfo
    chunks_count: int
    embeddings_stored: int
    created_at: datetime
    updated_at: datetime

class DocumentResponse(BaseModel):
    document_id: str
    filename: str
    file_size_bytes: int
    status: IngestionStatus
    chunks_count: int
    embeddings_stored: int
    created_at: datetime
    updated_at: datetime
    metadata: Optional[Dict[str, Any]] = None

class DocumentListResponse(BaseModel):
    documents: List[DocumentResponse]
    total_count: int
