import os
from fastapi.testclient import TestClient

# Set mock API keys for testing environment loading
os.environ["OPENAI_API_KEY"] = "mock-openai-key"
os.environ["QDRANT_URL"] = "https://mock-cluster.cloud.qdrant.io"
os.environ["QDRANT_API_KEY"] = "mock-qdrant-key"

from app.main import app

client = TestClient(app)

def test_health_endpoint():
    response = client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] in ["healthy", "unhealthy"]
    assert "timestamp" in data
    assert "version" in data
    assert "services" in data
    assert "openai_api" in data["services"]
    assert "qdrant_db" in data["services"]
    assert "web_search" in data["services"]

def test_readiness_endpoint():
    response = client.get("/api/health/ready")
    assert response.status_code == 200
    data = response.json()
    assert "ready" in data
    assert "services" in data
    assert "openai_api" in data["services"]
    assert "qdrant_db" in data["services"]
    assert "web_search" in data["services"]
