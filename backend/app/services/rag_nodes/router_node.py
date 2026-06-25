import logging
from typing import List, Dict, Any
from app.config.constants import Verdict

logger = logging.getLogger("app")

class RouterNode:
    def get_execution_path(self, verdict: str) -> Dict[str, Any]:
        """Maps Evaluator verdict to dynamic branch execution paths and node lists."""
        normalized_verdict = str(verdict).upper().strip()
        
        if normalized_verdict == Verdict.CORRECT.value:
            return {
                "decision_path": "CORRECT",
                "execution_path": ["RETRIEVER", "EVALUATOR", "KNOWLEDGE_REFINEMENT", "GENERATOR"],
                "run_refiner": True,
                "run_search": False,
                "run_rewrite": False
            }
        elif normalized_verdict == Verdict.INCORRECT.value:
            return {
                "decision_path": "INCORRECT",
                "execution_path": ["RETRIEVER", "EVALUATOR", "QUERY_REWRITE", "KNOWLEDGE_SEARCH", "GENERATOR"],
                "run_refiner": False,
                "run_search": True,
                "run_rewrite": True
            }
        else: # AMBIGUOUS or fallback
            return {
                "decision_path": "AMBIGUOUS",
                "execution_path": ["RETRIEVER", "EVALUATOR", "KNOWLEDGE_REFINEMENT", "KNOWLEDGE_SEARCH", "GENERATOR"],
                "run_refiner": True,
                "run_search": True,
                "run_rewrite": False
            }
