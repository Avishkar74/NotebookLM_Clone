import logging
from openai import OpenAI
from app.config.settings import settings

logger = logging.getLogger("app")

class RewriteNode:
    def __init__(self, openai_client: OpenAI):
        self.openai_client = openai_client
        self.model = settings.LLM_MODEL

    def rewrite(self, question: str) -> str:
        """Optimizes user question into a web search query."""
        system_prompt = (
            "You are a search query optimization assistant.\n"
            "Rewrite the user's question into a concise web search query.\n"
            "Rules\n"
            "- Preserve meaning.\n"
            "- Remove unnecessary words.\n"
            "- Focus on important keywords.\n"
            "- Do not answer the question."
        )

        user_prompt = (
            f"Question\n{question}\n\n"
            "Return ONLY the rewritten query."
        )

        if not settings.OPENAI_API_KEY or settings.OPENAI_API_KEY == "mock-openai-key":
            logger.warning("Mocking RewriteNode due to missing or mock API key.")
            return f"Transformer {question} explanation keywords"

        try:
            response = self.openai_client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                temperature=0.2
            )
            return (response.choices[0].message.content or "").strip()
        except Exception as e:
            logger.error(f"Failed to execute RewriteNode chat completion: {str(e)}")
            return question
