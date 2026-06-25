import logging
import uuid
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from app.config.settings import settings
from app.config.logging import setup_logging
from app.api import health, documents, query, trace
from app.services.document_service import DocumentService
from app.repositories.vector_repository import VectorRepository
import asyncio

# Setup logging configuration
setup_logging()
logger = logging.getLogger("app")

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Provision vector store collection once
    try:
        repo = VectorRepository()
        await asyncio.to_thread(repo.create_collection_if_not_exists, 3072)
    except Exception as e:
        logger.error(f"Failed to initialize vector database collection: {str(e)}")

    # Start sequential ingestion worker
    service = DocumentService()
    service.start_worker()
    yield
    # Shutdown: Stop sequential ingestion worker
    await service.stop_worker()

def create_app() -> FastAPI:
    app = FastAPI(
        title="Corrective RAG (CRAG) API",
        description="Backend API for the Corrective RAG workflow and visualization dashboard.",
        version="1.0.0",
        docs_url="/api/docs",
        redoc_url="/api/redoc",
        openapi_url="/api/openapi.json",
        lifespan=lifespan
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
    app.include_router(documents.router, prefix="/api", tags=["Documents"])
    app.include_router(query.router, prefix="/api", tags=["Query"])
    app.include_router(trace.router, prefix="/api", tags=["Trace"])

    return app

app = create_app()

