import os
import pytest

# Force environment variables for testing before settings are loaded
os.environ["ENVIRONMENT"] = "testing"
os.environ["QDRANT_URL"] = ""
os.environ["QDRANT_API_KEY"] = ""
os.environ["OPENAI_API_KEY"] = "mock-openai-key"
os.environ["TAVILY_API_KEY"] = "mock-tavily-key"

from app.config.settings import settings

# Force setting attributes to ensure mock state
settings.OPENAI_API_KEY = "mock-openai-key"
settings.TAVILY_API_KEY = "mock-tavily-key"
settings.QDRANT_URL = ""
settings.QDRANT_API_KEY = ""

from app.services.document_service import DocumentService

@pytest.fixture(autouse=True)
def clean_document_service():
    """Reset DocumentService singleton before/after each test to prevent asyncio cross-loop hangs."""
    DocumentService().reset()
    yield
    DocumentService().reset()
