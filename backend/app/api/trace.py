import logging
from fastapi import APIRouter, HTTPException, status, Request
from datetime import datetime, UTC

from app.schemas.trace import TraceResponseEnvelope
from app.services.trace_service import TraceService

logger = logging.getLogger("app")
router = APIRouter(prefix="/trace", tags=["Trace"])
trace_service = TraceService()

@router.get(
    "/{trace_id}",
    response_model=TraceResponseEnvelope,
    status_code=status.HTTP_200_OK,
    summary="Get execution trace",
    description="Retrieves the detailed execution trace for a past RAG query run."
)
async def get_execution_trace(trace_id: str, http_req: Request):
    trace_data = trace_service.get_trace(trace_id)
    if not trace_data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Execution trace with ID '{trace_id}' not found."
        )
        
    request_id = getattr(http_req.state, "request_id", None)
    
    return TraceResponseEnvelope(
        status="success",
        code=200,
        data=trace_data,
        timestamp=datetime.now(UTC),
        request_id=request_id
    )
