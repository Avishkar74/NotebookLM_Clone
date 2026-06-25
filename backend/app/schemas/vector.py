from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime, UTC

class VectorChunk(BaseModel):
    chunk_id: str
    document_id: str
    document_name: str
    chunk_index: int
    page_number: int
    text: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    vector: Optional[List[float]] = None

class RetrievedChunk(BaseModel):
    chunk_id: str
    document_id: str
    filename: str
    page_number: int
    text: str
    similarity_score: float
