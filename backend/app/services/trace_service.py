import logging
from typing import Dict, Optional
from app.schemas.trace import TraceResponseData

logger = logging.getLogger("app")

class TraceService:
    _instance = None

    def __new__(cls, *args, **kwargs):
        if not cls._instance:
            cls._instance = super(TraceService, cls).__new__(cls)
            cls._instance.traces = {}
        return cls._instance

    def save_trace(self, trace_id: str, trace_data: TraceResponseData):
        self.traces[trace_id] = trace_data
        logger.info(f"Trace stored for trace_id '{trace_id}'")

    def get_trace(self, trace_id: str) -> Optional[TraceResponseData]:
        return self.traces.get(trace_id)
