import logging
import uuid
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from app.config.settings import settings
from app.config.logging import setup_logging
from app.api import health

# Setup logging configuration
setup_logging()
logger = logging.getLogger("app")

def create_app() -> FastAPI:
    app = FastAPI(
        title="Corrective RAG (CRAG) API",
        description="Backend API for the Corrective RAG workflow and visualization dashboard.",
        version="1.0.0",
        docs_url="/api/docs",
        redoc_url="/api/redoc",
        openapi_url="/api/openapi.json"
    )

    # Configure CORS
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Middleware to log requests and inject request_id
    @app.middleware("http")
    async def request_logger_middleware(request: Request, call_next):
        request_id = request.headers.get("X-Request-ID", str(uuid.uuid4()))
        request.state.request_id = request_id
        
        # Log incoming request
        logger.info(
            f"Incoming request: {request.method} {request.url.path}",
            extra={"request_id": request_id}
        )

        response: Response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        
        # Log response status
        logger.info(
            f"Outgoing response: {response.status_code} for {request.method} {request.url.path}",
            extra={"request_id": request_id}
        )
        return response

    # Register routers
    app.include_router(health.router, prefix="/api", tags=["Health"])

    return app

app = create_app()
