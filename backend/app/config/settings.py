import os
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List, Union

class Settings(BaseSettings):
    # App Settings
    ENVIRONMENT: str = "development"
    LOG_LEVEL: str = "INFO"
    PORT: int = 8000
    BACKEND_URL: str = "http://localhost:8000"
    FRONTEND_URL: str = "http://localhost:5173"
    
    # CORS
    ALLOWED_ORIGINS: str = "http://localhost:5173,https://notebooklmcloned.netlify.app"

    # OpenAI Settings
    OPENAI_API_KEY: str

    # Qdrant Settings
    QDRANT_URL: str
    QDRANT_API_KEY: str
    QDRANT_COLLECTION: str = "crag_documents"

    # External APIs
    TAVILY_API_KEY: str = ""

    # Pipeline Defaults
    CHUNK_SIZE: int = 900
    CHUNK_OVERLAP: int = 150
    TOP_K: int = 5
    EMBEDDING_MODEL: str = "text-embedding-3-large"
    LLM_MODEL: str = "gpt-4.1-mini"

    # Pydantic Configuration
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )

    @property
    def cors_origins(self) -> List[str]:
        return [origin.strip() for origin in self.ALLOWED_ORIGINS.split(",") if origin.strip()]

# Global settings instance
settings = Settings(_env_file=os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), ".env"))
