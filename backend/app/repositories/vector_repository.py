import logging
import uuid
from typing import List, Optional
from qdrant_client import QdrantClient
from qdrant_client.http import models as rest_models

from app.config.settings import settings
from app.schemas.vector import VectorChunk, RetrievedChunk

logger = logging.getLogger("app")

class VectorRepository:
    def __init__(self, client: Optional[QdrantClient] = None):
        self.client = client
        self.collection_name = settings.QDRANT_COLLECTION
        
        # Instantiate client if not provided
        if not self.client:
            if settings.QDRANT_URL and settings.QDRANT_API_KEY:
                self.client = QdrantClient(
                    url=settings.QDRANT_URL,
                    api_key=settings.QDRANT_API_KEY
                )
            else:
                logger.warning("Qdrant configuration is missing or incomplete. Using in-memory fallback client.")
                self.client = QdrantClient(":memory:")

    def create_collection_if_not_exists(self, vector_size: int = 3072):
        """Verifies collection presence and dynamically creates it with the specified size and Cosine distance."""
        try:
            exists = self.client.collection_exists(self.collection_name)
            if not exists:
                logger.info(f"Creating collection '{self.collection_name}' with size {vector_size}")
                self.client.create_collection(
                    collection_name=self.collection_name,
                    vectors_config=rest_models.VectorParams(
                        size=vector_size,
                        distance=rest_models.Distance.COSINE
                    )
                )
            else:
                logger.info(f"Collection '{self.collection_name}' already exists. Skipping provisioning.")
        except Exception as e:
            logger.error(f"Error provisioning collection '{self.collection_name}': {str(e)}")
            raise e

    def upsert_chunks(self, chunks: List[VectorChunk]):
        """Upserts a list of VectorChunks into the Qdrant collection."""
        if not chunks:
            return

        points = []
        for chunk in chunks:
            if not chunk.vector:
                logger.warning(f"Skipping chunk {chunk.chunk_id}: No vector embedding provided.")
                continue
            
            # Ensure chunk_id is a valid UUID string
            point_id = chunk.chunk_id
            try:
                # Validate it's a UUID, if not generate UUID5 based on document_id + index
                uuid.UUID(point_id)
            except ValueError:
                point_id = str(uuid.uuid5(uuid.NAMESPACE_DNS, f"{chunk.document_id}_{chunk.chunk_index}"))

            payload = {
                "document_id": chunk.document_id,
                "document_name": chunk.document_name,
                "chunk_id": chunk.chunk_id,
                "chunk_index": chunk.chunk_index,
                "page_number": chunk.page_number,
                "text": chunk.text,
                "created_at": chunk.created_at.isoformat()
            }

            points.append(
                rest_models.PointStruct(
                    id=point_id,
                    vector=chunk.vector,
                    payload=payload
                )
            )

        try:
            if points:
                logger.info(f"Upserting {len(points)} points into Qdrant collection '{self.collection_name}'")
                self.client.upsert(
                    collection_name=self.collection_name,
                    points=points
                )
        except Exception as e:
            logger.error(f"Failed to upsert vectors to Qdrant: {str(e)}")
            raise e

    def search(
        self,
        query_vector: List[float],
        top_k: int = 5,
        document_ids: Optional[List[str]] = None
    ) -> List[RetrievedChunk]:
        """Performs similarity search in the collection and returns results in domain models."""
        try:
            query_filter = None
            if document_ids:
                query_filter = rest_models.Filter(
                    must=[
                        rest_models.FieldCondition(
                            key="document_id",
                            match=rest_models.MatchAny(any=document_ids)
                        )
                    ]
                )

            results = self.client.search(
                collection_name=self.collection_name,
                query_vector=query_vector,
                query_filter=query_filter,
                limit=top_k
            )

            retrieved = []
            for hit in results:
                payload = hit.payload or {}
                retrieved.append(
                    RetrievedChunk(
                        chunk_id=payload.get("chunk_id", str(hit.id)),
                        document_id=payload.get("document_id", ""),
                        filename=payload.get("document_name", ""),
                        page_number=payload.get("page_number", 1),
                        text=payload.get("text", ""),
                        similarity_score=hit.score
                    )
                )
            return retrieved
        except Exception as e:
            logger.error(f"Qdrant similarity search hit an error: {str(e)}")
            raise e

    def delete_document(self, document_id: str):
        """Deletes all points belonging to a specific document_id."""
        try:
            logger.info(f"Deleting all vectors matching document_id '{document_id}'")
            self.client.delete(
                collection_name=self.collection_name,
                points_selector=rest_models.FilterSelector(
                    filter=rest_models.Filter(
                        must=[
                            rest_models.FieldCondition(
                                key="document_id",
                                match=rest_models.MatchValue(value=document_id)
                            )
                        ]
                    )
                )
            )
        except Exception as e:
            logger.error(f"Failed to delete document vectors from Qdrant: {str(e)}")
            raise e
