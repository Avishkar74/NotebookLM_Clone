import uuid
import time
import logging
from datetime import datetime, UTC
from typing import List, Dict, Any, Optional
from openai import OpenAI
import tiktoken

from app.config.settings import settings
from app.ingestion.embedder import OpenAIEmbedder
from app.services.vector_service import VectorService
from app.services.trace_service import TraceService
from app.services.document_service import DocumentService
from app.services.rag_nodes.evaluator_node import EvaluatorNode
from app.services.rag_nodes.refinement_node import RefinementNode
from app.services.rag_nodes.rewrite_node import RewriteNode
from app.services.rag_nodes.search_node import SearchNode
from app.services.rag_nodes.router_node import RouterNode

from app.schemas.query import QueryRequest, QueryResponseData, QueryResponseChunk, QueryConfidence
from app.schemas.trace import TraceResponseData, NodeEvent, CostEstimate

logger = logging.getLogger("app")

class RAGService:
    def __init__(self, vector_service: Optional[VectorService] = None, trace_service: Optional[TraceService] = None):
        self.vector_service = vector_service or VectorService()
        self.trace_service = trace_service or TraceService()
        self.embedder = OpenAIEmbedder()
        self.openai_client = OpenAI(api_key=settings.OPENAI_API_KEY)
        
        # Initialize modular nodes
        self.evaluator_node = EvaluatorNode(self.openai_client)
        self.refinement_node = RefinementNode(self.openai_client)
        self.rewrite_node = RewriteNode(self.openai_client)
        self.search_node = SearchNode()
        self.router_node = RouterNode()

        try:
            self.encoding = tiktoken.encoding_for_model(settings.LLM_MODEL)
        except KeyError:
            self.encoding = tiktoken.get_encoding("cl100k_base")

    def _count_tokens(self, text: str) -> int:
        return len(self.encoding.encode(text))

    async def execute_basic_rag(self, request: QueryRequest) -> QueryResponseData:
        """Executes the Corrective RAG (CRAG) Pipeline.
        
        Saves the dynamic execution trace and returns the generated answer.
        """
        query_text = request.query
        document_ids = request.document_ids
        top_k = request.top_k or 5
        use_web_search = request.options.use_web_search if request.options and request.options.use_web_search is not None else True
        session_id = request.session_id if hasattr(request, "session_id") else None
        if not session_id:
            session_id = "session_001"
        DocumentService().touch_session(session_id)
        
        # Start Trace tracking
        query_id = str(uuid.uuid4())
        trace_id = f"trace_{uuid.uuid4().hex[:8]}"
        pipeline_start_time = time.time()
        pipeline_started_at = datetime.now(UTC)
        
        # Total tokens trackers for cost estimation
        total_prompt_tokens = 0
        total_completion_tokens = 0
        total_embedding_tokens = self._count_tokens(query_text)
        
        # --- 1. RETRIEVER NODE ---
        retriever_start_time = time.time()
        retriever_started_at = datetime.now(UTC)
        
        query_vector = self.embedder.embed_chunks([query_text])[0]
        retrieved_chunks = self.vector_service.semantic_search(
            query_vector=query_vector,
            top_k=top_k,
            document_ids=document_ids
        )
        
        retriever_completed_at = datetime.now(UTC)
        retriever_duration_ms = (time.time() - retriever_start_time) * 1000
        
        retriever_node = NodeEvent(
            node_id="retriever",
            node_name="Retriever",
            display_name="Retrieving Documents",
            type="retrieval",
            status="SUCCESS",
            started_at=retriever_started_at,
            completed_at=retriever_completed_at,
            duration_ms=retriever_duration_ms,
            input={
                "query": query_text,
                "top_k": top_k,
                "document_ids": document_ids
            },
            output={
                "retrieved_chunks": [
                    {
                        "chunk_id": chunk.chunk_id,
                        "score": chunk.similarity_score,
                        "page": chunk.page_number,
                        "document": chunk.filename
                    } for chunk in retrieved_chunks
                ],
                # Backward compatibility
                "chunks": [
                    {
                        "chunk_id": chunk.chunk_id,
                        "text": chunk.text,
                        "similarity_score": chunk.similarity_score,
                        "document_id": chunk.document_id,
                        "page_number": chunk.page_number
                    } for chunk in retrieved_chunks
                ],
                "total_chunks_returned": len(retrieved_chunks)
            },
            metadata={
                "top_k": top_k,
                "similarity_metric": "cosine",
                "embedding_model": settings.EMBEDDING_MODEL,
                "vector_database": "Qdrant Cloud" if settings.QDRANT_URL else "Qdrant In-Memory"
            }
        )
        
        # --- 2. EVALUATOR NODE ---
        evaluator_start_time = time.time()
        evaluator_started_at = datetime.now(UTC)
        
        eval_result = self.evaluator_node.evaluate(query_text, retrieved_chunks)
        verdict = eval_result["decision"]
        confidence_val = eval_result["confidence"]
        reasoning = eval_result["reasoning"]
        
        # Estimate evaluator tokens (since we mock or run LLM)
        eval_input_str = query_text + "".join([c.text for c in retrieved_chunks])
        eval_prompt_tokens = self._count_tokens(eval_input_str)
        eval_completion_tokens = self._count_tokens(reasoning) + 20 # buffer
        total_prompt_tokens += eval_prompt_tokens
        total_completion_tokens += eval_completion_tokens
        
        evaluator_completed_at = datetime.now(UTC)
        evaluator_duration_ms = (time.time() - evaluator_start_time) * 1000
        
        evaluator_node = NodeEvent(
            node_id="evaluator",
            node_name="Retrieval Evaluator",
            display_name="Evaluating Context",
            type="evaluation",
            status="SUCCESS",
            started_at=evaluator_started_at,
            completed_at=evaluator_completed_at,
            duration_ms=evaluator_duration_ms,
            input={
                "query": query_text,
                "chunks_evaluated": len(retrieved_chunks)
            },
            output={
                "decision": verdict,
                "confidence": confidence_val,
                "reasoning": reasoning
            },
            metadata={
                "model": settings.LLM_MODEL,
                "temperature": 0.0,
                "tokens": eval_prompt_tokens + eval_completion_tokens
            }
        )
        
        # --- 3. ROUTER NODE ---
        router_start_time = time.time()
        router_started_at = datetime.now(UTC)
        
        routing = self.router_node.get_execution_path(verdict)
        decision_path = routing["decision_path"]
        execution_path = routing["execution_path"]
        run_refiner = routing["run_refiner"]
        run_search = routing["run_search"]
        run_rewrite = routing["run_rewrite"]
        
        # Bypass search if options explicitly disable web search
        if not use_web_search:
            logger.info("Web search is disabled in query options. Skipping external search branch.")
            run_search = False
            run_rewrite = False
            if decision_path != "CORRECT":
                run_refiner = True
                execution_path = ["RETRIEVER", "EVALUATOR", "KNOWLEDGE_REFINEMENT", "GENERATOR"]
        
        router_completed_at = datetime.now(UTC)
        router_duration_ms = (time.time() - router_start_time) * 1000
        
        router_node = NodeEvent(
            node_id="router",
            node_name="Router",
            display_name="Routing Pipeline",
            type="routing",
            status="SUCCESS",
            started_at=router_started_at,
            completed_at=router_completed_at,
            duration_ms=router_duration_ms,
            input={
                "verdict": verdict,
                "confidence": confidence_val
            },
            output={
                "selected_branch": decision_path
            },
            metadata={}
        )
        
        # --- 4. REWRITE NODE (INCORRECT branch) ---
        rewritten_query = query_text
        rewrite_node = None
        if run_rewrite:
            rewrite_start_time = time.time()
            rewrite_started_at = datetime.now(UTC)
            
            rewritten_query = self.rewrite_node.rewrite(query_text)
            
            rewrite_prompt_tokens = self._count_tokens(query_text)
            rewrite_completion_tokens = self._count_tokens(rewritten_query)
            total_prompt_tokens += rewrite_prompt_tokens
            total_completion_tokens += rewrite_completion_tokens
            
            rewrite_completed_at = datetime.now(UTC)
            rewrite_duration_ms = (time.time() - rewrite_start_time) * 1000
            
            rewrite_node = NodeEvent(
                node_id="query_rewrite",
                node_name="Query Rewrite",
                display_name="Rewriting Query",
                type="query_rewrite",
                status="SUCCESS",
                started_at=rewrite_started_at,
                completed_at=rewrite_completed_at,
                duration_ms=rewrite_duration_ms,
                input={"original_query": query_text},
                output={
                    "original_query": query_text,
                    "rewritten_query": rewritten_query
                },
                metadata={
                    "model": settings.LLM_MODEL,
                    "temperature": 0.2
                }
            )
            
        # --- 5. WEB SEARCH NODE (AMBIGUOUS / INCORRECT branch) ---
        external_context = ""
        results_found = 0
        selected_results = 0
        search_node = None
        if run_search:
            search_start_time = time.time()
            search_started_at = datetime.now(UTC)
            
            search_res = await self.search_node.search(rewritten_query)
            external_context = search_res["external_context"]
            results_found = search_res["results_found"]
            selected_results = search_res["selected_results"]
            
            search_completed_at = datetime.now(UTC)
            search_duration_ms = (time.time() - search_start_time) * 1000
            
            search_node = NodeEvent(
                node_id="knowledge_search",
                node_name="Knowledge Search",
                display_name="Web Searching",
                type="search",
                status="SUCCESS",
                started_at=search_started_at,
                completed_at=search_completed_at,
                duration_ms=search_duration_ms,
                input={"query": rewritten_query},
                output={
                    "rewritten_query": rewritten_query,
                    "results_found": results_found,
                    "selected_results": selected_results,
                    "external_context": external_context
                },
                metadata={"search_engine": "Tavily API"}
            )
            
        # --- 6. REFINEMENT NODE (CORRECT / AMBIGUOUS branch) ---
        refined_context = ""
        refine_node = None
        if run_refiner:
            refine_start_time = time.time()
            refine_started_at = datetime.now(UTC)
            
            refined_context = self.refinement_node.refine(query_text, retrieved_chunks)
            
            refine_prompt_tokens = self._count_tokens(query_text + "".join([c.text for c in retrieved_chunks]))
            refine_completion_tokens = self._count_tokens(refined_context)
            total_prompt_tokens += refine_prompt_tokens
            total_completion_tokens += refine_completion_tokens
            
            refine_completed_at = datetime.now(UTC)
            refine_duration_ms = (time.time() - refine_start_time) * 1000
            
            refine_node = NodeEvent(
                node_id="knowledge_refinement",
                node_name="Knowledge Refinement",
                display_name="Refining Context",
                type="refinement",
                status="SUCCESS",
                started_at=refine_started_at,
                completed_at=refine_completed_at,
                duration_ms=refine_duration_ms,
                input={
                    "query": query_text,
                    "input_chunks": len(retrieved_chunks)
                },
                output={
                    "input_chunks": len(retrieved_chunks),
                    "output_chunks": len(retrieved_chunks) if refined_context else 0,
                    "removed_chunks": 0,
                    "refined_context": refined_context
                },
                metadata={
                    "model": settings.LLM_MODEL,
                    "temperature": 0.0
                }
            )
            
        # --- 7. GENERATOR NODE ---
        generator_start_time = time.time()
        generator_started_at = datetime.now(UTC)
        
        # Combine contexts
        if decision_path == "CORRECT":
            combined_context = refined_context
        elif decision_path == "INCORRECT":
            combined_context = external_context
        else: # AMBIGUOUS
            combined_context = f"Refined internal context:\n{refined_context}\n\nExternal web context:\n{external_context}"
            
        if not combined_context.strip():
            combined_context = "No relevant context found."
            
        system_prompt = "You are an AI assistant answering questions using only the provided context."
        user_prompt_template = (
            "Instructions\n\n"
            "- Use only the supplied context.\n"
            "- Do not invent facts.\n"
            "- If the answer cannot be found, explicitly state that the information is unavailable.\n"
            "- Produce a clear and concise answer.\n\n"
            "Question\n\n"
            "{question}\n\n"
            "Context\n\n"
            "{combined_context}\n\n"
            "Generate the final answer."
        )
        user_prompt = user_prompt_template.format(question=query_text, combined_context=combined_context)
        
        gen_prompt_tokens = self._count_tokens(system_prompt + user_prompt)
        total_prompt_tokens += gen_prompt_tokens
        
        answer = ""
        gen_completion_tokens = 0
        if settings.OPENAI_API_KEY and settings.OPENAI_API_KEY != "mock-openai-key":
            try:
                chat_completion = self.openai_client.chat.completions.create(
                    model=settings.LLM_MODEL,
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt}
                    ],
                    temperature=0.3
                )
                answer = chat_completion.choices[0].message.content or ""
                gen_completion_tokens = self._count_tokens(answer)
                total_completion_tokens += gen_completion_tokens
            except Exception as e:
                logger.error(f"Error calling OpenAI Generator in RAGService: {str(e)}")
                answer = "Error generating answer due to API issues."
        else:
            # Fallback mock answer
            logger.warning("Using mock response from Generator due to missing API Key.")
            answer = f"Mocked response for '{query_text}'. Verdict decision branch executed: {decision_path}."
            gen_completion_tokens = self._count_tokens(answer)
            total_completion_tokens += gen_completion_tokens
 
        generator_completed_at = datetime.now(UTC)
        generator_duration_ms = (time.time() - generator_start_time) * 1000
        
        generator_node = NodeEvent(
            node_id="generator",
            node_name="Generator",
            display_name="Generating Answer",
            type="generation",
            status="SUCCESS",
            started_at=generator_started_at,
            completed_at=generator_completed_at,
            duration_ms=generator_duration_ms,
            input={
                "query": query_text,
                "context_length_tokens": gen_prompt_tokens
            },
            output={
                "model": settings.LLM_MODEL,
                "tokens_prompt": gen_prompt_tokens,
                "tokens_completion": gen_completion_tokens,
                "answer": answer
            },
            metadata={
                "model": settings.LLM_MODEL,
                "temperature": 0.3,
                "tokens_prompt": gen_prompt_tokens,
                "tokens_completion": gen_completion_tokens
            }
        )
        
        # --- 8. POST-PROCESSING & COST ESTIMATING ---
        pipeline_completed_at = datetime.now(UTC)
        pipeline_duration_ms = (time.time() - pipeline_start_time) * 1000
        
        cost_embedding = total_embedding_tokens * (0.13 / 1_000_000)
        cost_generator_input = total_prompt_tokens * (0.15 / 1_000_000)
        cost_generator_output = total_completion_tokens * (0.60 / 1_000_000)
        
        cost_estimate = CostEstimate(
            currency="USD",
            embedding_api=round(cost_embedding, 6),
            evaluator_api=0.0,
            generator_api=round(cost_generator_input + cost_generator_output, 6),
            total=round(cost_embedding + cost_generator_input + cost_generator_output, 6)
        )
        
        # Assemble dynamic active branch display names matching 07_EXECUTION_TRACE.md spec
        active_branch = ["Retriever", "Evaluator", "Router"]
        if run_rewrite:
            active_branch.append("Query Rewrite")
        if run_refiner:
            active_branch.append("Knowledge Refinement")
        if run_search:
            active_branch.append("Knowledge Search")
        active_branch.append("Generator")

        # Compile standardized nodes list in logical pipeline flow order, marking non-executed nodes as SKIPPED
        final_nodes = []
        
        # 1. Retriever
        final_nodes.append(retriever_node)
        # 2. Evaluator
        final_nodes.append(evaluator_node)
        # 3. Router
        final_nodes.append(router_node)
        
        # 4. Query Rewrite
        if run_rewrite and rewrite_node:
            final_nodes.append(rewrite_node)
        else:
            final_nodes.append(NodeEvent(
                node_id="query_rewrite",
                node_name="Query Rewrite",
                display_name="Rewriting Query",
                type="query_rewrite",
                status="SKIPPED",
                started_at=pipeline_started_at,
                completed_at=pipeline_started_at,
                duration_ms=0.0,
                input={},
                output={},
                metadata={}
            ))
            
        # 5. Knowledge Refinement
        if run_refiner and refine_node:
            final_nodes.append(refine_node)
        else:
            final_nodes.append(NodeEvent(
                node_id="knowledge_refinement",
                node_name="Knowledge Refinement",
                display_name="Refining Context",
                type="refinement",
                status="SKIPPED",
                started_at=pipeline_started_at,
                completed_at=pipeline_started_at,
                duration_ms=0.0,
                input={},
                output={},
                metadata={}
            ))
            
        # 6. Knowledge Search
        if run_search and search_node:
            final_nodes.append(search_node)
        else:
            final_nodes.append(NodeEvent(
                node_id="knowledge_search",
                node_name="Knowledge Search",
                display_name="Web Searching",
                type="search",
                status="SKIPPED",
                started_at=pipeline_started_at,
                completed_at=pipeline_started_at,
                duration_ms=0.0,
                input={},
                output={},
                metadata={}
            ))
            
        # 7. Generator
        final_nodes.append(generator_node)

        # Form trace response structure
        trace_data = TraceResponseData(
            trace_id=trace_id,
            session_id=session_id,
            query_id=query_id,
            question=query_text,
            status="COMPLETED",
            started_at=pipeline_started_at,
            completed_at=pipeline_completed_at,
            duration_ms=pipeline_duration_ms,
            decision_path=decision_path,
            active_branch=active_branch,
            nodes=final_nodes,
            final_answer=answer,
            metadata={
                "cost_estimate": {
                    "currency": cost_estimate.currency,
                    "embedding_api": cost_estimate.embedding_api,
                    "evaluator_api": cost_estimate.evaluator_api,
                    "generator_api": cost_estimate.generator_api,
                    "total": cost_estimate.total
                }
            },
            # Backward compatibility fields
            query_text=query_text,
            total_duration_ms=pipeline_duration_ms,
            execution_path=execution_path,
            cost_estimate=cost_estimate
        )
        
        # Save trace
        self.trace_service.save_trace(trace_id, trace_data)
        
        # Form retrieved chunks
        response_chunks = [
            QueryResponseChunk(
                chunk_id=c.chunk_id,
                document_id=c.document_id,
                document_title=c.filename,
                text=c.text,
                page_number=c.page_number,
                similarity_score=c.similarity_score,
                chunk_size_tokens=self._count_tokens(c.text)
            ) for c in retrieved_chunks
        ]
        
        # Formulate confidence values
        confidence = QueryConfidence(
            overall=round(confidence_val * 0.9, 2),
            retrieval=round(retriever_node.output.get("chunks", [{}])[0].get("similarity_score", 0.0) if retrieved_chunks else 0.0, 2),
            evaluation=round(confidence_val, 2),
            generation=0.90
        )
        
        return QueryResponseData(
            query_id=query_id,
            query_text=query_text,
            answer=answer,
            answer_generated_at=pipeline_completed_at,
            response_time_ms=pipeline_duration_ms,
            confidence=confidence,
            retrieved_chunks=response_chunks if request.options.return_retrieved_chunks else None,
            execution_trace_id=trace_id,
            trace_url=f"/api/trace/{trace_id}"
        )
