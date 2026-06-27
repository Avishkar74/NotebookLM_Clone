import uuid
import logging
import asyncio
import time
from datetime import datetime, UTC
from typing import Dict, List, Any, Optional

from app.config.constants import IngestionStatus
from app.schemas.document import (
    DocumentResponse, DocumentStatusResponse, DocumentListResponse,
    ProgressInfo, StageStatus
)
from app.ingestion.loader import DocumentLoader
from app.ingestion.chunker import TokenChunker
from app.ingestion.embedder import OpenAIEmbedder
from app.config.settings import settings
from app.services.vector_service import VectorService

logger = logging.getLogger("app")

class DocumentService:
    _instance = None

    def __new__(cls, *args, **kwargs):
        if not cls._instance:
            cls._instance = super(DocumentService, cls).__new__(cls)
            cls._instance._initialized = False
        return cls._instance

    def __init__(self):
        if self._initialized:
            return

        # In-memory document storage
        self.documents: Dict[str, Dict[str, Any]] = {}
        self.session_last_activity: Dict[str, datetime] = {}
        
        # Async Queue for sequential ingestion
        self.queue = asyncio.Queue()
        self.worker_task = None
        
        self.chunker = TokenChunker()
        self.embedder = OpenAIEmbedder()
        self.vector_service = VectorService()
        
        self._initialized = True

    def reset(self):
        """Resets service documents and recreates the asyncio Queue for the current loop."""
        self.documents.clear()
        self.session_last_activity.clear()
        self.queue = asyncio.Queue()
        self.worker_task = None

    def start_worker(self):
        """Starts the sequential processing background worker loop if not already running."""
        if self.worker_task is None or self.worker_task.done():
            self.worker_task = asyncio.create_task(self._worker_loop())
            logger.info("Sequential ingestion worker started.")

    async def stop_worker(self):
        """Stops the sequential processing worker."""
        if self.worker_task and not self.worker_task.done():
            self.worker_task.cancel()
            try:
                await self.worker_task
            except asyncio.CancelledError:
                pass
            logger.info("Sequential ingestion worker stopped.")

    async def _worker_loop(self):
        while True:
            document_id = None
            try:
                document_id = await self.queue.get()
                logger.info(f"Worker picked up document {document_id} for ingestion.")
                await self._process_document(document_id)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Unexpected error in ingestion worker loop: {str(e)}")
            finally:
                if document_id is not None:
                    self.queue.task_done()

    async def _process_document(self, document_id: str):
        doc = self.documents.get(document_id)
        if not doc:
            logger.error(f"Document {document_id} not found in state.")
            return

        file_content = doc.get("file_content")
        stages = doc["stages"]
        session_id = doc.get("session_id") or "session_001"

        try:
            self.touch_session(session_id)
            # --- 1. PARSING ---
            stages["PARSING"]["status"] = "IN_PROGRESS"
            doc["overall_status"] = IngestionStatus.PARSING
            doc["updated_at"] = datetime.now(UTC)
            start_time = time.time()
            
            logger.info(f"Parsing document {doc['filename']}")
            pages = await asyncio.to_thread(DocumentLoader.load_bytes, file_content or b"", doc["filename"])
            
            duration = time.time() - start_time
            stages["PARSING"]["status"] = "COMPLETED"
            stages["PARSING"]["duration"] = duration
            stages["PARSING"]["output"] = {
                "pages": len(pages),
                "text_length": sum(len(p.get("text", "")) for p in pages)
            }
            self.touch_session(session_id)
            
            # --- 2. CHUNKING ---
            stages["CHUNKING"]["status"] = "IN_PROGRESS"
            doc["overall_status"] = IngestionStatus.CHUNKING
            doc["updated_at"] = datetime.now(UTC)
            start_time = time.time()
            
            logger.info(f"Chunking document {doc['filename']}")
            chunks = await asyncio.to_thread(self.chunker.chunk_document, pages)
            doc["chunks"] = chunks
            doc["chunks_count"] = len(chunks)
            
            duration = time.time() - start_time
            stages["CHUNKING"]["status"] = "COMPLETED"
            stages["CHUNKING"]["duration"] = duration
            stages["CHUNKING"]["output"] = {
                "chunk_count": len(chunks),
                "chunk_size": self.chunker.chunk_size,
                "overlap": self.chunker.chunk_overlap
            }
            self.touch_session(session_id)

            # --- 3. EMBEDDING ---
            stages["EMBEDDING"]["status"] = "IN_PROGRESS"
            doc["overall_status"] = IngestionStatus.EMBEDDING
            doc["updated_at"] = datetime.now(UTC)
            start_time = time.time()
            
            logger.info(f"Generating embeddings for {len(chunks)} chunks in {doc['filename']}")
            chunk_texts = [c["text"] for c in chunks]
            embeddings = await asyncio.to_thread(self.embedder.embed_chunks, chunk_texts)
            
            # Attach embeddings to chunks
            for chunk, emb in zip(chunks, embeddings):
                chunk["embedding"] = emb

            duration = time.time() - start_time
            stages["EMBEDDING"]["status"] = "COMPLETED"
            stages["EMBEDDING"]["duration"] = duration
            stages["EMBEDDING"]["output"] = {
                "embedding_model": self.embedder.model,
                "embeddings_created": len(embeddings)
            }
            self.touch_session(session_id)

            # --- 4. STORING ---
            stages["STORING"]["status"] = "IN_PROGRESS"
            doc["overall_status"] = IngestionStatus.STORING
            doc["updated_at"] = datetime.now(UTC)
            start_time = time.time()
            
            logger.info(f"Storing {len(chunks)} vectors into Qdrant for document {doc['filename']}")
            await asyncio.to_thread(
                self.vector_service.store_document_chunks,
                document_id=document_id,
                filename=doc["filename"],
                chunks=chunks
            )
            doc["embeddings_stored"] = len(chunks)

            duration = time.time() - start_time
            stages["STORING"]["status"] = "COMPLETED"
            stages["STORING"]["duration"] = duration
            stages["STORING"]["output"] = {
                "vector_database": "Qdrant",
                "collection": settings.QDRANT_COLLECTION,
                "stored_vectors": len(chunks)
            }

            # Complete ingestion
            doc["overall_status"] = IngestionStatus.COMPLETED
            doc["updated_at"] = datetime.now(UTC)
            self.touch_session(session_id)
            logger.info(f"Ingestion completed for document {doc['filename']}. Chunks: {len(chunks)}")

        except Exception as e:
            logger.error(f"Failed to ingest document {doc['filename']}: {str(e)}")
            self._cleanup_failed_ingestion(document_id, doc)
            # Mark current stage as FAILED
            for stage_name, stage_data in stages.items():
                if stage_data["status"] == "IN_PROGRESS":
                    stage_data["status"] = "FAILED"
                    break
            doc["overall_status"] = IngestionStatus.FAILED
            doc["updated_at"] = datetime.now(UTC)
        finally:
            # Never keep the raw upload bytes after ingestion has been attempted.
            doc.pop("file_content", None)

    def _cleanup_failed_ingestion(self, document_id: str, doc: Dict[str, Any]):
        """Removes partially written artifacts while preserving the failed document record."""
        try:
            self.vector_service.delete_document(document_id)
        except Exception as e:
            logger.error(f"Error cleaning up vectors for failed document {document_id}: {str(e)}")

    def touch_session(self, session_id: Optional[str]):
        if not session_id:
            return
        self.session_last_activity[session_id] = datetime.now(UTC)

    def _session_has_active_documents(self, session_id: str) -> bool:
        active_states = {
            IngestionStatus.QUEUED,
            IngestionStatus.PARSING,
            IngestionStatus.CHUNKING,
            IngestionStatus.EMBEDDING,
            IngestionStatus.STORING,
        }
        return any(
            doc.get("session_id") == session_id and doc.get("overall_status") in active_states
            for doc in self.documents.values()
        )

    def cleanup_expired_sessions(self, session_ttl_minutes: int = 30) -> List[str]:
        """Deletes inactive sessions and their derived data."""
        now = datetime.now(UTC)
        expired_sessions: List[str] = []
        for session_id, last_activity in list(self.session_last_activity.items()):
            age_minutes = (now - last_activity).total_seconds() / 60
            if age_minutes < session_ttl_minutes:
                continue
            if self._session_has_active_documents(session_id):
                continue

            expired_sessions.append(session_id)
            session_docs = [doc_id for doc_id, doc in self.documents.items() if doc.get("session_id") == session_id]
            for doc_id in session_docs:
                try:
                    self.vector_service.delete_document(doc_id)
                except Exception as e:
                    logger.error(f"Error cleaning vectors for expired session document {doc_id}: {str(e)}")
                self.documents.pop(doc_id, None)

            self.session_last_activity.pop(session_id, None)
            logger.info(f"Expired inactive session '{session_id}' and removed its derived data.")

        return expired_sessions

    async def queue_document(
        self,
        filename: str,
        content: bytes,
        file_metadata: Optional[Dict[str, Any]] = None,
        session_id: Optional[str] = None
    ) -> DocumentResponse:
        """Stores uploaded bytes in memory, initializes status, and adds it to the ingestion queue."""
        document_id = str(uuid.uuid4())
        file_size = len(content)
        resolved_session_id = session_id or "session_001"
        self.touch_session(resolved_session_id)

        # Initialize tracking state
        doc_state = {
            "document_id": document_id,
            "filename": filename,
            "file_content": content,
            "session_id": resolved_session_id,
            "file_size_bytes": file_size,
            "overall_status": IngestionStatus.QUEUED,
            "chunks_count": 0,
            "embeddings_stored": 0,
            "created_at": datetime.now(UTC),
            "updated_at": datetime.now(UTC),
            "metadata": file_metadata or {},
            "chunks": [],
            "stages": {
                "PARSING": {"status": "PENDING", "duration": 0.0, "output": None},
                "CHUNKING": {"status": "PENDING", "duration": 0.0, "output": None},
                "EMBEDDING": {"status": "PENDING", "duration": 0.0, "output": None},
                "STORING": {"status": "PENDING", "duration": 0.0, "output": None}
            }
        }
        self.documents[document_id] = doc_state

        # Queue the document ID
        await self.queue.put(document_id)
        logger.info(f"Queued document {filename} (ID: {document_id}) for processing.")
        
        return self._map_to_response(doc_state)

    def get_document(self, document_id: str, session_id: Optional[str] = None) -> Optional[DocumentResponse]:
        doc = self.documents.get(document_id)
        if doc and (session_id is None or doc.get("session_id") == session_id):
            self.touch_session(doc.get("session_id"))
            return self._map_to_response(doc)
        return None

    def get_document_status(self, document_id: str, session_id: Optional[str] = None) -> Optional[DocumentStatusResponse]:
        doc = self.documents.get(document_id)
        if not doc or (session_id is not None and doc.get("session_id") != session_id):
            return None
        self.touch_session(doc.get("session_id"))

        # Build stages completed list
        stages_completed = []
        for name, info in doc["stages"].items():
            stages_completed.append(StageStatus(
                name=name,
                status=info["status"],
                duration_seconds=info["duration"],
                output=info.get("output")
            ))

        # Calculate progress percentage dynamically
        stage_percentages = {
            IngestionStatus.QUEUED: 0,
            IngestionStatus.PARSING: 20,
            IngestionStatus.CHUNKING: 40,
            IngestionStatus.EMBEDDING: 80,
            IngestionStatus.STORING: 95,
            IngestionStatus.COMPLETED: 100,
            IngestionStatus.FAILED: 100
        }
        percentage = stage_percentages.get(doc["overall_status"], 0)

        # Estimate remaining time in seconds
        estimated_remaining_seconds = 0
        if doc["overall_status"] == IngestionStatus.QUEUED:
            estimated_remaining_seconds = 30
        elif doc["overall_status"] == IngestionStatus.PARSING:
            estimated_remaining_seconds = 20
        elif doc["overall_status"] == IngestionStatus.CHUNKING:
            estimated_remaining_seconds = 15
        elif doc["overall_status"] == IngestionStatus.EMBEDDING:
            estimated_remaining_seconds = 5
        elif doc["overall_status"] == IngestionStatus.STORING:
            estimated_remaining_seconds = 1

        progress = ProgressInfo(
            current_stage=doc["overall_status"].value,
            percentage=percentage,
            stages_completed=stages_completed,
            estimated_remaining_seconds=estimated_remaining_seconds
        )

        return DocumentStatusResponse(
            document_id=doc["document_id"],
            filename=doc["filename"],
            overall_status=doc["overall_status"],
            progress=progress,
            chunks_count=doc["chunks_count"],
            embeddings_stored=doc["embeddings_stored"],
            created_at=doc["created_at"],
            updated_at=doc["updated_at"]
        )

    def list_documents(
        self,
        status: Optional[IngestionStatus] = None,
        session_id: Optional[str] = None
    ) -> DocumentListResponse:
        docs = self.documents.values()
        if session_id is not None:
            docs = [doc for doc in docs if doc.get("session_id") == session_id]
            self.touch_session(session_id)
        if status is not None:
            docs = [doc for doc in docs if doc["overall_status"] == status]

        docs_list = [self._map_to_response(doc) for doc in docs]
        return DocumentListResponse(
            documents=docs_list,
            total_count=len(docs_list)
        )

    def delete_document(self, document_id: str, session_id: Optional[str] = None) -> bool:
        """Deletes a document from the system and removes its vectors from Qdrant."""
        doc = self.documents.get(document_id)
        if not doc or (session_id is not None and doc.get("session_id") != session_id):
            return False
        self.touch_session(doc.get("session_id"))

        # Delete vectors from Qdrant
        try:
            self.vector_service.delete_document(document_id)
        except Exception as e:
            logger.error(f"Error removing vectors for document {document_id}: {str(e)}")

        del self.documents[document_id]
        logger.info(f"Deleted document {document_id} from memory and vector store.")
        return True

    def _map_to_response(self, doc: Dict[str, Any]) -> DocumentResponse:
        return DocumentResponse(
            document_id=doc["document_id"],
            filename=doc["filename"],
            file_size_bytes=doc["file_size_bytes"],
            status=doc["overall_status"],
            chunks_count=doc["chunks_count"],
            embeddings_stored=doc["embeddings_stored"],
            created_at=doc["created_at"],
            updated_at=doc["updated_at"],
            metadata=doc["metadata"]
        )
