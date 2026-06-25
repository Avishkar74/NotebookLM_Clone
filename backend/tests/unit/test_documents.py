import os
import io
import pytest
import asyncio
from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock
from app.main import app
from app.services.document_service import DocumentService
from app.config.constants import IngestionStatus

@pytest.fixture(autouse=True)
def cleanup_document_service():
    """Ensure service is fresh before each test."""
    DocumentService().reset()

def test_upload_flow_and_status():
    # Mocking ingestion functions to avoid real file operations and OpenAI API calls
    mock_pages = [{"text": "Parsed page content.", "page_number": 1}]
    mock_chunks = [{"text": "Parsed page content.", "page_number": 1, "token_count": 4}]
    mock_embeddings = [[0.1] * 3072]

    # Create client with context manager to start lifespan background worker
    with TestClient(app) as client:
        with patch("app.ingestion.loader.DocumentLoader.load_file", return_value=mock_pages) as mock_load, \
             patch("app.ingestion.chunker.TokenChunker.chunk_document", return_value=mock_chunks) as mock_chunk, \
             patch("app.ingestion.embedder.OpenAIEmbedder.embed_chunks", return_value=mock_embeddings) as mock_embed:
             
            # Test Upload File
            file_data = {"file": ("test.txt", io.BytesIO(b"Raw text file content"), "text/plain")}
            response = client.post("/api/documents/upload", files=file_data)
            
            assert response.status_code == 202
            data = response.json()
            assert "document_id" in data
            assert data["filename"] == "test.txt"
            assert data["status"] == IngestionStatus.QUEUED.value
            
            doc_id = data["document_id"]
            
            # Let the background worker process (it runs in async loop inside TestClient context)
            # Give it a tiny bit of time to complete
            attempts = 0
            completed = False
            while attempts < 10:
                status_response = client.get(f"/api/documents/{doc_id}/status")
                assert status_response.status_code == 200
                status_data = status_response.json()
                if status_data["overall_status"] == IngestionStatus.COMPLETED.value:
                    completed = True
                    break
                elif status_data["overall_status"] == IngestionStatus.FAILED.value:
                    break
                import time
                time.sleep(0.1)
                attempts += 1
                
            assert completed is True
            mock_load.assert_called_once()
            mock_chunk.assert_called_once()
            mock_embed.assert_called_once()

            # Test Get Document Details
            details_resp = client.get(f"/api/documents/{doc_id}")
            assert details_resp.status_code == 200
            details_data = details_resp.json()
            assert details_data["filename"] == "test.txt"
            assert details_data["chunks_count"] == 1
            assert details_data["embeddings_stored"] == 1

            # Test List Documents
            list_resp = client.get("/api/documents")
            assert list_resp.status_code == 200
            list_data = list_resp.json()
            assert list_data["total_count"] == 1
            assert list_data["documents"][0]["document_id"] == doc_id

            # Test Delete Document
            delete_resp = client.delete(f"/api/documents/{doc_id}")
            assert delete_resp.status_code == 200
            
            # Verify deleted
            get_resp = client.get(f"/api/documents/{doc_id}")
            assert get_resp.status_code == 404

def test_upload_invalid_extension():
    with TestClient(app) as client:
        file_data = {"file": ("test.docx", io.BytesIO(b"Unsupported document"), "application/vnd.openxmlformats-officedocument.wordprocessingml.document")}
        response = client.post("/api/documents/upload", files=file_data)
        assert response.status_code == 400
        assert "Unsupported file format" in response.json()["detail"]

def test_get_nonexistent_document():
    with TestClient(app) as client:
        response = client.get("/api/documents/non-existent-uuid")
        assert response.status_code == 404
