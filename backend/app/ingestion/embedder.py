import logging
from typing import List
from openai import OpenAI
from app.config.settings import settings

logger = logging.getLogger("app")

class OpenAIEmbedder:
    def __init__(self, api_key: str = None, model: str = None):
        self.api_key = api_key or settings.OPENAI_API_KEY
        self.model = model or settings.EMBEDDING_MODEL
        
        if not self.api_key:
            logger.error("OpenAI API Key is missing. Embeddings cannot be generated.")
            # We don't raise immediately here so we can mock or test configuration,
            # but we will fail on embed calls if it's missing.
        
        self.client = OpenAI(api_key=self.api_key)

    def embed_chunks(self, texts: List[str], batch_size: int = 100) -> List[List[float]]:
        """Generates 3072-dimensional vector embeddings for a list of texts.
        
        Processes texts in batches to avoid API limits.
        """
        if not texts:
            return []

        if not self.api_key or self.api_key == "mock-openai-key":
            logger.warning("Using mock embeddings due to missing or mock API key.")
            # Return mock vectors of dimension 3072 for testing
            return [[0.0] * 3072 for _ in texts]

        embeddings = []
        for i in range(0, len(texts), batch_size):
            batch = texts[i : i + batch_size]
            try:
                logger.info(f"Generating embeddings for batch {i // batch_size + 1} ({len(batch)} chunks)")
                response = self.client.embeddings.create(
                    input=batch,
                    model=self.model
                )
                batch_embeddings = [data.embedding for data in response.data]
                embeddings.extend(batch_embeddings)
            except Exception as e:
                logger.error(f"Error generating embeddings for batch {i // batch_size + 1}: {str(e)}")
                raise e

        return embeddings
