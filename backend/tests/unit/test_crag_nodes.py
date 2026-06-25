import pytest
from unittest.mock import MagicMock, patch
from app.services.rag_nodes.evaluator_node import EvaluatorNode
from app.services.rag_nodes.refinement_node import RefinementNode
from app.services.rag_nodes.rewrite_node import RewriteNode
from app.services.rag_nodes.search_node import SearchNode
from app.services.rag_nodes.router_node import RouterNode
from app.schemas.vector import RetrievedChunk

def test_router_node():
    router = RouterNode()
    
    # CORRECT
    routing = router.get_execution_path("CORRECT")
    assert routing["decision_path"] == "CORRECT"
    assert routing["execution_path"] == ["RETRIEVER", "EVALUATOR", "KNOWLEDGE_REFINEMENT", "GENERATOR"]
    assert routing["run_refiner"] is True
    assert routing["run_search"] is False
    assert routing["run_rewrite"] is False
    
    # INCORRECT
    routing = router.get_execution_path("INCORRECT")
    assert routing["decision_path"] == "INCORRECT"
    assert routing["execution_path"] == ["RETRIEVER", "EVALUATOR", "QUERY_REWRITE", "KNOWLEDGE_SEARCH", "GENERATOR"]
    assert routing["run_refiner"] is False
    assert routing["run_search"] is True
    assert routing["run_rewrite"] is True
    
    # AMBIGUOUS
    routing = router.get_execution_path("AMBIGUOUS")
    assert routing["decision_path"] == "AMBIGUOUS"
    assert routing["execution_path"] == ["RETRIEVER", "EVALUATOR", "KNOWLEDGE_REFINEMENT", "KNOWLEDGE_SEARCH", "GENERATOR"]
    assert routing["run_refiner"] is True
    assert routing["run_search"] is True
    assert routing["run_rewrite"] is False

def test_evaluator_node_mock():
    mock_client = MagicMock()
    evaluator = EvaluatorNode(mock_client)
    
    # Empty chunks
    result = evaluator.evaluate("What is multi-head attention?", [])
    assert result["decision"] == "INCORRECT"
    assert result["confidence"] == 1.0
    
    # Check default correct/ambiguous response when using mock key
    result = evaluator.evaluate("Explain attention", [MagicMock(text="Chunk text")])
    assert result["decision"] == "CORRECT"
    assert result["confidence"] == 0.95

def test_evaluator_node_real_call():
    mock_client = MagicMock()
    mock_response = MagicMock()
    mock_response.choices = [MagicMock()]
    mock_response.choices[0].message.content = '{"decision": "AMBIGUOUS", "confidence": 0.75, "reasoning": "Context missing details"}'
    mock_client.chat.completions.create.return_value = mock_response
    
    # Force settings key check
    with patch("app.services.rag_nodes.evaluator_node.settings") as mock_settings:
        mock_settings.OPENAI_API_KEY = "real-api-key"
        mock_settings.LLM_MODEL = "gpt-4.1-mini"
        
        evaluator = EvaluatorNode(mock_client)
        chunks = [
            RetrievedChunk(
                chunk_id="c_1",
                document_id="d_1",
                filename="a.pdf",
                page_number=1,
                text="Chunk text",
                similarity_score=0.9
            )
        ]
        result = evaluator.evaluate("What is multi-head attention?", chunks)
        
        assert result["decision"] == "AMBIGUOUS"
        assert result["confidence"] == 0.75
        assert result["reasoning"] == "Context missing details"
        mock_client.chat.completions.create.assert_called_once()

def test_refinement_node_mock():
    mock_client = MagicMock()
    refiner = RefinementNode(mock_client)
    chunks = [
        RetrievedChunk(
            chunk_id="c_1",
            document_id="d_1",
            filename="a.pdf",
            page_number=1,
            text="Primary text content.",
            similarity_score=0.9
        )
    ]
    # Under mock settings, returns concatenated chunks
    result = refiner.refine("What is attention?", chunks)
    assert result == "Primary text content."

def test_rewrite_node_mock():
    mock_client = MagicMock()
    rewriter = RewriteNode(mock_client)
    result = rewriter.rewrite("What is multi-head attention?")
    assert "keywords" in result

@pytest.mark.anyio
async def test_search_node_mock():
    node = SearchNode()
    result = await node.search("Transformer query terms")
    assert result["results_found"] == 3
    assert "Mocked search results" in result["external_context"]
