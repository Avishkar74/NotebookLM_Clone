import logging
from fastapi import APIRouter, Request, status, HTTPException
from datetime import datetime, UTC

from app.schemas.query import QueryRequest, QueryResponseEnvelope
from app.services.rag_service import RAGService

logger = logging.getLogger("app")
router = APIRouter(prefix="/query", tags=["Query"])
rag_service = RAGService()

@router.post(
    "/answer",
    response_model=QueryResponseEnvelope,
    status_code=status.HTTP_200_OK,
    summary="Submit query to RAG pipeline",
    description="Processes user questions by retrieving relevant vector documents and using OpenAI LLM to answer."
)
async def submit_query(request: QueryRequest, http_req: Request):
    try:
        # Extract request_id from state if present
        request_id = getattr(http_req.state, "request_id", None)
        
        # Execute query answering
        response_data = await rag_service.execute_basic_rag(request)
        
        return QueryResponseEnvelope(
            status="success",
            code=200,
            message="Query processed successfully",
            data=response_data,
            timestamp=datetime.now(UTC),
            request_id=request_id
        )
    except Exception as e:
        logger.error(f"Failed to process query: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Query execution hit a failure: {str(e)}"
        )
