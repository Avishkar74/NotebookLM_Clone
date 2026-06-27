import json
import logging
from typing import Optional, Dict, Any
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, status, Query
from app.schemas.document import (
    DocumentUploadResponse, DocumentStatusResponse, DocumentListResponse, DocumentResponse
)
from app.services.document_service import DocumentService
from app.config.constants import IngestionStatus

logger = logging.getLogger("app")
router = APIRouter(prefix="/documents", tags=["Documents"])
document_service = DocumentService()

@router.post(
    "/upload",
    response_model=DocumentUploadResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Upload PDF or TXT document",
    description="Uploads a PDF or TXT document, initializes tracking, and adds it to the sequential processing queue."
)
async def upload_document(
    file: UploadFile = File(...),
    metadata: Optional[str] = Form(None),
    session_id: Optional[str] = Form(None)
):
    # Validate extension
    filename = file.filename or ""
    if not (filename.lower().endswith(".pdf") or filename.lower().endswith(".txt")):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unsupported file format. Only .pdf and .txt files are allowed."
        )

    # Parse metadata if provided
    parsed_metadata = {}
    if metadata:
        try:
            parsed_metadata = json.loads(metadata)
        except json.JSONDecodeError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid JSON format for metadata form field."
            )

    try:
        content = await file.read()
        if not content:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Uploaded file is empty."
            )

        # Queue the document
        doc_resp = await document_service.queue_document(
            filename=filename,
            content=content,
            file_metadata=parsed_metadata,
            session_id=session_id
        )

        return DocumentUploadResponse(
            document_id=doc_resp.document_id,
            filename=doc_resp.filename,
            file_size_bytes=doc_resp.file_size_bytes,
            status=doc_resp.status,
            created_at=doc_resp.created_at,
            metadata=doc_resp.metadata,
            estimated_completion_seconds=30
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error during document upload for {filename}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Ingestion queue failed: {str(e)}"
        )

@router.get(
    "",
    response_model=DocumentListResponse,
    summary="List all documents",
    description="Retrieves a list of all documents currently tracked in the workspace."
)
async def list_documents(
    status: Optional[IngestionStatus] = Query(None),
    session_id: Optional[str] = Query(None)
):
    return document_service.list_documents(status=status, session_id=session_id)

@router.get(
    "/{document_id}/status",
    response_model=DocumentStatusResponse,
    summary="Get ingestion status",
    description="Retrieves the step-by-step progress and status of a document ingestion pipeline."
)
async def get_document_status(document_id: str, session_id: Optional[str] = Query(None)):
    status_resp = document_service.get_document_status(document_id, session_id=session_id)
    if not status_resp:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Document {document_id} not found."
        )
    return status_resp

@router.get(
    "/{document_id}",
    response_model=DocumentResponse,
    summary="Get document details",
    description="Retrieves primary details of a specific document."
)
async def get_document_details(document_id: str, session_id: Optional[str] = Query(None)):
    doc_resp = document_service.get_document(document_id, session_id=session_id)
    if not doc_resp:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Document {document_id} not found."
        )
    return doc_resp

@router.delete(
    "/{document_id}",
    summary="Delete a document",
    description="Deletes document from workspace tracking and removes its local file from disk."
)
async def delete_document(document_id: str, session_id: Optional[str] = Query(None)):
    success = document_service.delete_document(document_id, session_id=session_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Document {document_id} not found."
        )
    return {"message": f"Document {document_id} deleted successfully."}
