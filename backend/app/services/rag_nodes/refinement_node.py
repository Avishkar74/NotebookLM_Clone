import logging
from typing import List
from openai import OpenAI
from app.config.settings import settings
from app.schemas.vector import RetrievedChunk

logger = logging.getLogger("app")

class RefinementNode:
    def __init__(self, openai_client: OpenAI):
        self.openai_client = openai_client
        self.model = settings.LLM_MODEL

    def refine(self, question: str, retrieved_chunks: List[RetrievedChunk]) -> str:
        """Extracts only the information that directly helps answer the user's question."""
        if not retrieved_chunks:
            return ""

        system_prompt = (
            "You are a context refinement assistant.\n"
            "Your task is to extract only the information that directly helps answer the user's question.\n"
            "Remove:\n"
            "- Repeated sentences\n"
            "- Irrelevant details\n"
            "- Examples unrelated to the question\n"
            "- Background information that does not contribute to the answer\n"
        )

        formatted_chunks = "\n\n".join([
            f"[Source: {c.filename}, Page: {c.page_number}] {c.text}" for c in retrieved_chunks
        ])

        user_prompt = (
            f"Question:\n{question}\n\n"
            f"Retrieved Chunks:\n{formatted_chunks}\n\n"
            "Return only the refined context.\n"
            "Do not answer the user's question."
        )

        if not settings.OPENAI_API_KEY or settings.OPENAI_API_KEY == "mock-openai-key":
            logger.warning("Mocking RefinementNode due to missing or mock API key.")
            # Join and return raw text as mock refinement
            return " ".join([c.text for c in retrieved_chunks])

        try:
            response = self.openai_client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                temperature=0.0
            )
            return response.choices[0].message.content or ""
        except Exception as e:
            logger.error(f"Failed to execute RefinementNode chat completion: {str(e)}")
            # Fallback to simple concatenation
            return " ".join([c.text for c in retrieved_chunks])
