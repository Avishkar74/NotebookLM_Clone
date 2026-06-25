import logging
from typing import List, Dict, Any, Optional
from datetime import datetime, UTC

from app.repositories.vector_repository import VectorRepository
from app.schemas.vector import VectorChunk, RetrievedChunk

logger = logging.getLogger("app")

class VectorService:
    def __init__(self, repository: Optional[VectorRepository] = None):
        self.repository = repository or VectorRepository()

    def store_document_chunks(self, document_id: str, filename: str, chunks: List[Dict[str, Any]]):
        """Converts raw chunk dicts to VectorChunk domain models and upserts them via VectorRepository."""
        if not chunks:
            logger.info(f"No chunks to store for document '{filename}'")
            return

        vector_chunks = []
        for i, chunk in enumerate(chunks):
            vector_chunks.append(
                VectorChunk(
                    chunk_id=chunk.get("chunk_id", f"{document_id}_{i}"),
                    document_id=document_id,
                    document_name=filename,
                    chunk_index=i,
                    page_number=chunk.get("page_number", 1),
                    text=chunk.get("text", ""),
                    created_at=datetime.now(UTC),
                    vector=chunk.get("embedding")
                )
            )

        logger.info(f"Storing {len(vector_chunks)} vector chunks for document '{filename}' (ID: {document_id})")
        self.repository.upsert_chunks(vector_chunks)

    def semantic_search(self, query_vector: List[float], top_k: int = 5) -> List[RetrievedChunk]:
        """Queries the repository and returns matching domain chunks."""
        return self.repository.search(query_vector, top_k=top_k)

    def delete_document(self, document_id: str):
        """Requests deletion of all vectors mapped to document_id from the vector store."""
        logger.info(f"Requesting vector deletion for document '{document_id}'")
        self.repository.delete_document(document_id)
