import time
from datetime import datetime, UTC
from fastapi import APIRouter
from typing import Dict, Any
from app.config.settings import settings
import httpx
from qdrant_client import QdrantClient

router = APIRouter()

async def check_openai() -> Dict[str, Any]:
    start_time = time.time()
    try:
        # Simple headers check or API call test
        if not settings.OPENAI_API_KEY:
            return {"ready": False, "status": "unhealthy", "error": "API Key missing"}
        
        # Test client connection asynchronously
        async with httpx.AsyncClient() as client:
            response = await client.get(
                "https://api.openai.com/v1/models",
                headers={"Authorization": f"Bearer {settings.OPENAI_API_KEY}"},
                timeout=2.0
            )
            if response.status_code == 200:
                duration = int((time.time() - start_time) * 1000)
                return {"ready": True, "status": "healthy", "response_time_ms": duration}
            else:
                return {"ready": False, "status": "unhealthy", "error": f"API returned status {response.status_code}"}
    except Exception as e:
        return {"ready": False, "status": "unhealthy", "error": str(e)}

async def check_qdrant() -> Dict[str, Any]:
    start_time = time.time()
    try:
        if not settings.QDRANT_URL or not settings.QDRANT_API_KEY:
            return {"ready": False, "status": "unhealthy", "error": "Qdrant URL or API Key missing"}
        
        # Initialize client and check connection
        client = QdrantClient(url=settings.QDRANT_URL, api_key=settings.QDRANT_API_KEY)
        client.get_collections() # Simple check that queries collections list
        duration = int((time.time() - start_time) * 1000)
        return {"ready": True, "status": "healthy", "response_time_ms": duration}
    except Exception as e:
        return {"ready": False, "status": "unhealthy", "error": str(e)}

async def check_tavily() -> Dict[str, Any]:
    start_time = time.time()
    try:
        if not settings.TAVILY_API_KEY:
            return {"ready": False, "status": "unhealthy", "error": "Tavily API Key missing"}
        
        async with httpx.AsyncClient() as client:
            # Tavily simple endpoint check
            response = await client.post(
                "https://api.tavily.com/search",
                json={"api_key": settings.TAVILY_API_KEY, "query": "test query", "max_results": 1},
                timeout=2.0
            )
            if response.status_code == 200:
                duration = int((time.time() - start_time) * 1000)
                return {"ready": True, "status": "healthy", "response_time_ms": duration}
            else:
                return {"ready": False, "status": "unhealthy", "error": f"API returned status {response.status_code}"}
    except Exception as e:
        return {"ready": False, "status": "unhealthy", "error": str(e)}

@router.get("/health")
async def health_check():
    openai_res = await check_openai()
    qdrant_res = await check_qdrant()
    tavily_res = await check_tavily()
    
    is_healthy = openai_res["ready"] and qdrant_res["ready"]
    
    return {
        "status": "healthy" if is_healthy else "unhealthy",
        "timestamp": datetime.now(UTC).replace(tzinfo=None).isoformat() + "Z",
        "version": "1.0.0",
        "services": {
            "openai_api": openai_res["status"],
            "qdrant_db": qdrant_res["status"],
            "web_search": tavily_res["status"]
        }
    }

@router.get("/health/ready")
async def readiness_check():
    openai_res = await check_openai()
    qdrant_res = await check_qdrant()
    tavily_res = await check_tavily()
    
    ready = openai_res["ready"] and qdrant_res["ready"]
    
    return {
        "ready": ready,
        "services": {
            "openai_api": {
                "ready": openai_res["ready"],
                "response_time_ms": openai_res.get("response_time_ms", 0)
            },
            "qdrant_db": {
                "ready": qdrant_res["ready"],
                "response_time_ms": qdrant_res.get("response_time_ms", 0)
            },
            "web_search": {
                "ready": tavily_res["ready"],
                "response_time_ms": tavily_res.get("response_time_ms", 0)
            }
        }
    }
