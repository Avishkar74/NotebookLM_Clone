import io
import pytest
from datetime import datetime, UTC
from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock

from app.main import app
from app.services.trace_service import TraceService
from app.schemas.vector import RetrievedChunk
from app.schemas.trace import TraceResponseData

@pytest.fixture(autouse=True)
def cleanup_trace_service():
    service = TraceService()
    service.traces.clear()

def test_rag_pipeline_success():
    mock_chunks = [
        RetrievedChunk(
            chunk_id="chunk_001",
            document_id="doc_123",
            filename="test.pdf",
            page_number=3,
            text="Transformer uses multi-head attention.",
            similarity_score=0.92
        )
    ]
    mock_embedding = [[0.1] * 3072]
    
    mock_completion = MagicMock()
    mock_choice = MagicMock()
    mock_choice.message.content = "Multi-head attention splits queries and keys."
    mock_completion.choices = [mock_choice]
    
    with TestClient(app) as client:
        with patch("app.ingestion.embedder.OpenAIEmbedder.embed_chunks", return_value=mock_embedding) as mock_embed, \
             patch("app.services.vector_service.VectorService.semantic_search", return_value=mock_chunks) as mock_search, \
             patch("openai.resources.chat.completions.Completions.create", return_value=mock_completion) as mock_chat:
            
            payload = {
                "query": "Explain multi-head attention",
                "document_ids": ["doc_123"],
                "top_k": 5,
                "options": {
                    "return_retrieved_chunks": True
                }
            }
            response = client.post("/api/query/answer", json=payload)
            
            assert response.status_code == 200
            res_json = response.json()
            assert res_json["status"] == "success"
            
            data = res_json["data"]
            assert "query_id" in data
            assert data["query_text"] == "Explain multi-head attention"
            assert data["answer"] == "Multi-head attention splits queries and keys."
            assert "execution_trace_id" in data
            assert len(data["retrieved_chunks"]) == 1
            assert data["retrieved_chunks"][0]["chunk_id"] == "chunk_001"
            
            mock_embed.assert_called_once_with(["Explain multi-head attention"])
            mock_search.assert_called_once_with(
                query_vector=mock_embedding[0],
                top_k=5,
                document_ids=["doc_123"]
            )
            mock_chat.assert_called_once()
            
            # Check prompt format passed to mock chat
            args, kwargs = mock_chat.call_args
            messages = kwargs["messages"]
            assert messages[0]["role"] == "system"
            assert "only the provided context" in messages[0]["content"]
            assert messages[1]["role"] == "user"
            assert "Transformer uses multi-head attention." in messages[1]["content"]
            
            # Check Trace is saved
            trace_id = data["execution_trace_id"]
            trace_resp = client.get(f"/api/trace/{trace_id}")
            assert trace_resp.status_code == 200
            trace_json = trace_resp.json()
            trace_data = trace_json["data"]
            assert trace_data["trace_id"] == trace_id
            assert len(trace_data["nodes"]) == 2
            assert trace_data["execution_path"] == ["RETRIEVER", "GENERATOR"]
            assert trace_data["cost_estimate"]["total"] > 0

def test_rag_pipeline_empty_retrieval():
    mock_chunks = []
    mock_embedding = [[0.1] * 3072]
    
    mock_completion = MagicMock()
    mock_choice = MagicMock()
    mock_choice.message.content = "Information unavailable."
    mock_completion.choices = [mock_choice]
    
    with TestClient(app) as client:
        with patch("app.ingestion.embedder.OpenAIEmbedder.embed_chunks", return_value=mock_embedding), \
             patch("app.services.vector_service.VectorService.semantic_search", return_value=mock_chunks) as mock_search, \
             patch("openai.resources.chat.completions.Completions.create", return_value=mock_completion) as mock_chat:
            
            payload = {
                "query": "Explain multi-head attention",
                "document_ids": [],
                "top_k": 3
            }
            response = client.post("/api/query/answer", json=payload)
            
            assert response.status_code == 200
            res_json = response.json()
            data = res_json["data"]
            assert data["answer"] == "Information unavailable."
            
            # Check prompt format passed to mock chat
            args, kwargs = mock_chat.call_args
            messages = kwargs["messages"]
            assert "No relevant context found." in messages[1]["content"]

def test_get_trace_not_found():
    with TestClient(app) as client:
        response = client.get("/api/trace/trace_nonexistent")
        assert response.status_code == 404
