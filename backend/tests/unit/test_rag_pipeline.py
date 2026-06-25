import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock

from app.main import app
from app.services.trace_service import TraceService
from app.schemas.vector import RetrievedChunk

@pytest.fixture(autouse=True)
def cleanup_trace_service():
    service = TraceService()
    service.traces.clear()

def test_rag_pipeline_correct_path():
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
    
    with TestClient(app) as client:
        # Mocking embedder, semantic search, and the Evaluator Node to return CORRECT
        with patch("app.ingestion.embedder.OpenAIEmbedder.embed_chunks", return_value=mock_embedding) as mock_embed, \
             patch("app.services.vector_service.VectorService.semantic_search", return_value=mock_chunks) as mock_search, \
             patch("app.services.rag_nodes.evaluator_node.EvaluatorNode.evaluate", return_value={
                 "decision": "CORRECT",
                 "confidence": 0.95,
                 "reasoning": "High overlap of query terms."
             }) as mock_eval, \
             patch("app.services.rag_nodes.refinement_node.RefinementNode.refine", return_value="Refined: Transformer uses multi-head attention.") as mock_refine:
            
            payload = {
                "query": "Explain multi-head attention",
                "document_ids": ["doc_123"],
                "top_k": 5,
                "options": {
                    "return_retrieved_chunks": True,
                    "use_web_search": True
                }
            }
            response = client.post("/api/query/answer", json=payload)
            
            assert response.status_code == 200
            res_json = response.json()
            assert res_json["status"] == "success"
            
            data = res_json["data"]
            assert "query_id" in data
            assert data["query_text"] == "Explain multi-head attention"
            assert "Verdict decision branch executed: CORRECT" in data["answer"]
            assert "execution_trace_id" in data
            assert len(data["retrieved_chunks"]) == 1
            assert data["retrieved_chunks"][0]["chunk_id"] == "chunk_001"
            
            mock_embed.assert_called_once_with(["Explain multi-head attention"])
            mock_search.assert_called_once_with(
                query_vector=mock_embedding[0],
                top_k=5,
                document_ids=["doc_123"]
            )
            mock_eval.assert_called_once()
            mock_refine.assert_called_once()
            
            # Check Trace is saved
            trace_id = data["execution_trace_id"]
            trace_resp = client.get(f"/api/trace/{trace_id}")
            assert trace_resp.status_code == 200
            trace_json = trace_resp.json()
            trace_data = trace_json["data"]
            assert trace_data["trace_id"] == trace_id
            assert len(trace_data["nodes"]) == 4  # Retriever, Evaluator, Refinement, Generator
            assert trace_data["execution_path"] == ["RETRIEVER", "EVALUATOR", "KNOWLEDGE_REFINEMENT", "GENERATOR"]
            assert trace_data["cost_estimate"]["total"] > 0

def test_rag_pipeline_ambiguous_path():
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
    
    with TestClient(app) as client:
        # Mocking embedder, semantic search, Evaluator Node (returns AMBIGUOUS), Refinement, and Web Search
        with patch("app.ingestion.embedder.OpenAIEmbedder.embed_chunks", return_value=mock_embedding) as mock_embed, \
             patch("app.services.vector_service.VectorService.semantic_search", return_value=mock_chunks) as mock_search, \
             patch("app.services.rag_nodes.evaluator_node.EvaluatorNode.evaluate", return_value={
                 "decision": "AMBIGUOUS",
                 "confidence": 0.60,
                 "reasoning": "Context is partially relevant, needs web reinforcement."
             }) as mock_eval, \
             patch("app.services.rag_nodes.refinement_node.RefinementNode.refine", return_value="Refined: attention details.") as mock_refine, \
             patch("app.services.rag_nodes.search_node.SearchNode.search", return_value={
                 "external_context": "Web content about attention models.",
                 "results_found": 1,
                 "selected_results": 1
             }) as mock_search_node:
            
            payload = {
                "query": "Explain multi-head attention",
                "document_ids": ["doc_123"],
                "top_k": 5,
                "options": {
                    "return_retrieved_chunks": True,
                    "use_web_search": True
                }
            }
            response = client.post("/api/query/answer", json=payload)
            
            assert response.status_code == 200
            res_json = response.json()
            assert res_json["status"] == "success"
            
            data = res_json["data"]
            assert "Verdict decision branch executed: AMBIGUOUS" in data["answer"]
            
            # Check Trace is saved
            trace_id = data["execution_trace_id"]
            trace_resp = client.get(f"/api/trace/{trace_id}")
            assert trace_resp.status_code == 200
            trace_json = trace_resp.json()
            trace_data = trace_json["data"]
            assert len(trace_data["nodes"]) == 5  # Retriever, Evaluator, Refinement, Search, Generator
            assert trace_data["execution_path"] == ["RETRIEVER", "EVALUATOR", "KNOWLEDGE_REFINEMENT", "KNOWLEDGE_SEARCH", "GENERATOR"]
            mock_eval.assert_called_once()
            mock_refine.assert_called_once()
            mock_search_node.assert_called_once()

def test_rag_pipeline_incorrect_path():
    mock_chunks = [
        RetrievedChunk(
            chunk_id="chunk_001",
            document_id="doc_123",
            filename="test.pdf",
            page_number=3,
            text="Unrelated text.",
            similarity_score=0.30
        )
    ]
    mock_embedding = [[0.1] * 3072]
    
    with TestClient(app) as client:
        # Mocking embedder, semantic search, Evaluator Node (returns INCORRECT), Query Rewrite, and Web Search
        with patch("app.ingestion.embedder.OpenAIEmbedder.embed_chunks", return_value=mock_embedding) as mock_embed, \
             patch("app.services.vector_service.VectorService.semantic_search", return_value=mock_chunks) as mock_search, \
             patch("app.services.rag_nodes.evaluator_node.EvaluatorNode.evaluate", return_value={
                 "decision": "INCORRECT",
                 "confidence": 0.90,
                 "reasoning": "Context is completely irrelevant."
             }) as mock_eval, \
             patch("app.services.rag_nodes.rewrite_node.RewriteNode.rewrite", return_value="transformer multi-head attention query") as mock_rewrite, \
             patch("app.services.rag_nodes.search_node.SearchNode.search", return_value={
                 "external_context": "Web search details for attention mechanism.",
                 "results_found": 2,
                 "selected_results": 2
             }) as mock_search_node:
            
            payload = {
                "query": "Explain multi-head attention",
                "document_ids": ["doc_123"],
                "top_k": 5,
                "options": {
                    "return_retrieved_chunks": True,
                    "use_web_search": True
                }
            }
            response = client.post("/api/query/answer", json=payload)
            
            assert response.status_code == 200
            res_json = response.json()
            assert res_json["status"] == "success"
            
            data = res_json["data"]
            assert "Verdict decision branch executed: INCORRECT" in data["answer"]
            
            # Check Trace is saved
            trace_id = data["execution_trace_id"]
            trace_resp = client.get(f"/api/trace/{trace_id}")
            assert trace_resp.status_code == 200
            trace_json = trace_resp.json()
            trace_data = trace_json["data"]
            assert len(trace_data["nodes"]) == 5  # Retriever, Evaluator, Rewrite, Search, Generator
            assert trace_data["execution_path"] == ["RETRIEVER", "EVALUATOR", "QUERY_REWRITE", "KNOWLEDGE_SEARCH", "GENERATOR"]
            mock_eval.assert_called_once()
            mock_rewrite.assert_called_once()
            mock_search_node.assert_called_once()

def test_get_trace_not_found():
    with TestClient(app) as client:
        response = client.get("/api/trace/trace_nonexistent")
        assert response.status_code == 404
