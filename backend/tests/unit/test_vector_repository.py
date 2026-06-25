import pytest
from datetime import datetime, UTC
from unittest.mock import MagicMock, patch
from qdrant_client.http import models as rest_models
from app.repositories.vector_repository import VectorRepository
from app.schemas.vector import VectorChunk, RetrievedChunk

def test_collection_auto_creation_not_exists():
    mock_client = MagicMock()
    mock_client.collection_exists.return_value = False
    
    repo = VectorRepository(client=mock_client)
    repo.create_collection_if_not_exists(vector_size=3072)
    
    mock_client.collection_exists.assert_called_once_with(repo.collection_name)
    mock_client.create_collection.assert_called_once()
    # Verify Cosine is used
    args, kwargs = mock_client.create_collection.call_args
    assert kwargs["collection_name"] == repo.collection_name
    assert kwargs["vectors_config"].size == 3072
    assert kwargs["vectors_config"].distance == rest_models.Distance.COSINE

def test_collection_already_exists():
    mock_client = MagicMock()
    mock_client.collection_exists.return_value = True
    
    repo = VectorRepository(client=mock_client)
    repo.create_collection_if_not_exists(vector_size=3072)
    
    mock_client.collection_exists.assert_called_once_with(repo.collection_name)
    mock_client.create_collection.assert_not_called()

def test_upsert_idempotency_and_mapping():
    mock_client = MagicMock()
    repo = VectorRepository(client=mock_client)
    
    chunks = [
        VectorChunk(
            chunk_id="chunk-00000000-0000-0000-0000-000000000001",
            document_id="doc_123",
            document_name="sample.pdf",
            chunk_index=0,
            page_number=1,
            text="chunk text content",
            created_at=datetime.now(UTC),
            vector=[0.1] * 3072
        )
    ]
    
    # First upsert
    repo.upsert_chunks(chunks)
    assert mock_client.upsert.call_count == 1
    
    # Second upsert (idempotency check)
    repo.upsert_chunks(chunks)
    assert mock_client.upsert.call_count == 2
    
    # Check payload mapping structure
    args, kwargs = mock_client.upsert.call_args
    points = kwargs["points"]
    assert len(points) == 1
    assert points[0].id == "chunk-00000000-0000-0000-0000-000000000001"
    assert points[0].vector == [0.1] * 3072
    assert points[0].payload["document_id"] == "doc_123"
    assert points[0].payload["document_name"] == "sample.pdf"
    assert points[0].payload["page_number"] == 1
    assert points[0].payload["text"] == "chunk text content"

def test_search_returns_domain_models():
    mock_client = MagicMock()
    
    mock_hit = MagicMock()
    mock_hit.id = "some-uuid"
    mock_hit.score = 0.89
    mock_hit.payload = {
        "chunk_id": "chunk_abc",
        "document_id": "doc_456",
        "document_name": "attention.pdf",
        "page_number": 4,
        "text": "Multi-head attention allows..."
    }
    mock_client.search.return_value = [mock_hit]
    
    repo = VectorRepository(client=mock_client)
    results = repo.search(query_vector=[0.2] * 3072, top_k=5)
    
    mock_client.search.assert_called_once_with(
        collection_name=repo.collection_name,
        query_vector=[0.2] * 3072,
        limit=5
    )
    assert len(results) == 1
    assert isinstance(results[0], RetrievedChunk)
    assert results[0].chunk_id == "chunk_abc"
    assert results[0].document_id == "doc_456"
    assert results[0].filename == "attention.pdf"
    assert results[0].page_number == 4
    assert results[0].text == "Multi-head attention allows..."
    assert results[0].similarity_score == 0.89

def test_delete_by_document_id():
    mock_client = MagicMock()
    repo = VectorRepository(client=mock_client)
    
    repo.delete_document("doc_xyz")
    
    mock_client.delete.assert_called_once()
    args, kwargs = mock_client.delete.call_args
    assert kwargs["collection_name"] == repo.collection_name
    
    # Check selector filter keys
    selector = kwargs["points_selector"]
    assert isinstance(selector, rest_models.FilterSelector)
    must_conditions = selector.filter.must
    assert len(must_conditions) == 1
    condition = must_conditions[0]
    assert condition.key == "document_id"
    assert condition.match.value == "doc_xyz"

def test_invalid_embedding_dimension_handling():
    mock_client = MagicMock()
    mock_client.create_collection.side_effect = ValueError("Invalid dimensions configuration")
    
    repo = VectorRepository(client=mock_client)
    with pytest.raises(ValueError, match="Invalid dimensions configuration"):
        repo.create_collection_if_not_exists(vector_size=-1)

def test_connection_failure_handling():
    mock_client = MagicMock()
    mock_client.collection_exists.side_effect = Exception("Host unreachable")
    
    repo = VectorRepository(client=mock_client)
    with pytest.raises(Exception, match="Host unreachable"):
        repo.create_collection_if_not_exists()
