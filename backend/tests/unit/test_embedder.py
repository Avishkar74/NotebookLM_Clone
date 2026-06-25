import pytest
from unittest.mock import MagicMock, patch
from app.ingestion.embedder import OpenAIEmbedder

def test_embedder_mock_key():
    # If the API key is empty or mock, it should return mock embeddings of length 3072
    embedder = OpenAIEmbedder(api_key="mock-openai-key")
    texts = ["Hello", "World"]
    embeddings = embedder.embed_chunks(texts)
    
    assert len(embeddings) == 2
    assert len(embeddings[0]) == 3072
    assert len(embeddings[1]) == 3072
    assert all(val == 0.0 for val in embeddings[0])

def test_embedder_real_api_call():
    mock_client = MagicMock()
    mock_response = MagicMock()
    
    mock_data1 = MagicMock()
    mock_data1.embedding = [0.1] * 3072
    mock_data2 = MagicMock()
    mock_data2.embedding = [0.2] * 3072
    
    mock_response.data = [mock_data1, mock_data2]
    mock_client.embeddings.create.return_value = mock_response
    
    with patch("app.ingestion.embedder.OpenAI", return_value=mock_client):
        embedder = OpenAIEmbedder(api_key="real-key", model="text-embedding-3-large")
        texts = ["Text A", "Text B"]
        
        # Override client since __init__ creates client
        embedder.client = mock_client
        embeddings = embedder.embed_chunks(texts, batch_size=2)
        
        mock_client.embeddings.create.assert_called_once_with(
            input=texts,
            model="text-embedding-3-large"
        )
        assert len(embeddings) == 2
        assert embeddings[0] == [0.1] * 3072
        assert embeddings[1] == [0.2] * 3072
