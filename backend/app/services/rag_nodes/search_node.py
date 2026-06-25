import logging
import httpx
from typing import Dict, Any
from app.config.settings import settings

logger = logging.getLogger("app")

class SearchNode:
    def __init__(self):
        self.api_key = settings.TAVILY_API_KEY
        self.search_url = "https://api.tavily.com/search"

    async def search(self, rewritten_query: str) -> Dict[str, Any]:
        """Queries the Tavily API for external knowledge using rewritten search keywords."""
        if not self.api_key or self.api_key == "mock-tavily-key" or "mock-key" in self.api_key:
            logger.warning("Mocking SearchNode due to missing or mock Tavily API key.")
            return {
                "external_context": f"Mocked search results for: '{rewritten_query}'. Standard multi-head attention splits keys/values into linear subspaces.",
                "results_found": 3,
                "selected_results": 2
            }

        try:
            logger.info(f"Querying Tavily Web Search API for: '{rewritten_query}'")
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    self.search_url,
                    json={
                        "api_key": self.api_key,
                        "query": rewritten_query,
                        "search_depth": "basic",
                        "max_results": 3
                    },
                    timeout=5.0
                )
                
                if response.status_code == 200:
                    data = response.json()
                    results = data.get("results", [])
                    results_found = len(results)
                    
                    # Combine context text from results
                    contexts = []
                    for i, r in enumerate(results):
                        title = r.get("title", f"Result {i+1}")
                        url = r.get("url", "")
                        content = r.get("content", "")
                        contexts.append(f"Source: {title} ({url})\n{content}")
                        
                    external_context = "\n\n".join(contexts)
                    return {
                        "external_context": external_context,
                        "results_found": results_found,
                        "selected_results": min(results_found, 3)
                    }
                else:
                    logger.error(f"Tavily Search API returned status {response.status_code}: {response.text}")
                    raise Exception(f"Tavily search returned status {response.status_code}")
        except Exception as e:
            logger.error(f"Failed to query Tavily API: {str(e)}")
            # Fallback to empty context
            return {
                "external_context": "",
                "results_found": 0,
                "selected_results": 0
            }
