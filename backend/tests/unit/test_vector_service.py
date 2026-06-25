import pytest
from unittest.mock import MagicMock
from app.services.vector_service import VectorService
from app.schemas.vector import VectorChunk

def test_store_document_chunks_conversion():
    mock_repo = MagicMock()
    service = VectorService(repository=mock_repo)
    
    raw_chunks = [
        {
            "chunk_id": "chunk_1",
            "page_number": 2,
            "text": "sample text",
            "embedding": [0.1] * 3072
        }
    ]
    
    service.store_document_chunks(
        document_id="doc_id_123",
        filename="doc.pdf",
        chunks=raw_chunks
    )
    
    mock_repo.upsert_chunks.assert_called_once()
    args, kwargs = mock_repo.upsert_chunks.call_args
    chunks_list = args[0]
    
    assert len(chunks_list) == 1
    chunk = chunks_list[0]
    assert isinstance(chunk, VectorChunk)
    assert chunk.chunk_id == "chunk_1"
    assert chunk.document_id == "doc_id_123"
    assert chunk.document_name == "doc.pdf"
    assert chunk.chunk_index == 0
    assert chunk.page_number == 2
    assert chunk.text == "sample text"
    assert chunk.vector == [0.1] * 3072

def test_store_document_chunks_empty():
    mock_repo = MagicMock()
    service = VectorService(repository=mock_repo)
    
    service.store_document_chunks("doc_id", "doc.pdf", [])
    mock_repo.upsert_chunks.assert_not_called()

def test_semantic_search():
    mock_repo = MagicMock()
    mock_repo.search.return_value = []
    
    service = VectorService(repository=mock_repo)
    results = service.semantic_search(query_vector=[0.1]*3072, top_k=3)
    
    mock_repo.search.assert_called_once_with(
        [0.1]*3072,
        top_k=3,
        document_ids=None
    )
    assert results == []

def test_delete_document():
    mock_repo = MagicMock()
    service = VectorService(repository=mock_repo)
    
    service.delete_document("doc_xyz")
    mock_repo.delete_document.assert_called_once_with("doc_xyz")
