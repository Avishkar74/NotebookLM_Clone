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
from app.schemas.query import QueryRequest, QueryResponseData, QueryResponseEnvelope, QueryResponseChunk, QueryConfidence
from app.schemas.trace import TraceResponseData, NodeEvent, CostEstimate

logger = logging.getLogger("app")

class RAGService:
    def __init__(self, vector_service: Optional[VectorService] = None, trace_service: Optional[TraceService] = None):
        self.vector_service = vector_service or VectorService()
        self.trace_service = trace_service or TraceService()
        self.embedder = OpenAIEmbedder()
        self.openai_client = OpenAI(api_key=settings.OPENAI_API_KEY)
        try:
            self.encoding = tiktoken.encoding_for_model(settings.LLM_MODEL)
        except KeyError:
            self.encoding = tiktoken.get_encoding("cl100k_base")

    def _count_tokens(self, text: str) -> int:
        return len(self.encoding.encode(text))

    async def execute_basic_rag(self, request: QueryRequest) -> QueryResponseData:
        """Executes the Basic RAG Pipeline: Retrieve -> Generate.
        
        Saves the execution trace and returns the generated answer with sources.
        """
        query_text = request.query
        document_ids = request.document_ids
        top_k = request.top_k or 5
        
        # Start Trace
        query_id = str(uuid.uuid4())
        trace_id = f"trace_{uuid.uuid4().hex[:8]}"
        pipeline_start_time = time.time()
        pipeline_started_at = datetime.now(UTC)
        
        nodes: List[NodeEvent] = []
        execution_path = ["RETRIEVER", "GENERATOR"]
        
        # --- 1. RETRIEVER NODE ---
        retriever_start_time = time.time()
        retriever_started_at = datetime.now(UTC)
        
        # Count query tokens
        query_tokens = self._count_tokens(query_text)
        
        # Embed query
        query_vector = self.embedder.embed_chunks([query_text])[0]
        
        # Semantic search
        retrieved_chunks = self.vector_service.semantic_search(
            query_vector=query_vector,
            top_k=top_k,
            document_ids=document_ids
        )
        
        retriever_completed_at = datetime.now(UTC)
        retriever_duration_ms = (time.time() - retriever_start_time) * 1000
        
        retriever_node = NodeEvent(
            node_id="node_retrieval_001",
            node_name="Semantic Search",
            display_name="Retrieving",
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
                "embedding_model": settings.EMBEDDING_MODEL,
                "retrieval_method": "cosine_similarity"
            }
        )
        nodes.append(retriever_node)
        
        # --- 2. GENERATOR NODE ---
        generator_start_time = time.time()
        generator_started_at = datetime.now(UTC)
        
        # Build context
        if retrieved_chunks:
            combined_context = "\n\n".join([f"[Source: {c.filename}, Page: {c.page_number}] {c.text}" for c in retrieved_chunks])
        else:
            combined_context = "No relevant context found."
            
        # Render system and user prompts
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
        
        prompt_tokens = self._count_tokens(system_prompt + user_prompt)
        
        # LLM Invocation (OpenAI Chat API with gpt-4.1-mini)
        answer = ""
        completion_tokens = 0
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
                completion_tokens = self._count_tokens(answer)
            except Exception as e:
                logger.error(f"Error calling OpenAI Chat Completion: {str(e)}")
                answer = "Error generating answer due to API issues."
        else:
            # Fallback mock answer for development/testing
            logger.warning("Using mock response from Generator due to missing or mock API key.")
            answer = f"Mocked answer for query '{query_text}' based on {len(retrieved_chunks)} source chunks."
            completion_tokens = self._count_tokens(answer)

        generator_completed_at = datetime.now(UTC)
        generator_duration_ms = (time.time() - generator_start_time) * 1000
        
        generator_node = NodeEvent(
            node_id="node_generator_001",
            node_name="Answer Generator",
            display_name="Generating",
            type="generation",
            status="SUCCESS",
            started_at=generator_started_at,
            completed_at=generator_completed_at,
            duration_ms=generator_duration_ms,
            input={
                "query": query_text,
                "context_chunks_count": len(retrieved_chunks),
                "context_tokens_estimate": prompt_tokens
            },
            output={
                "answer": answer,
                "answer_length_tokens": completion_tokens
            },
            metadata={
                "generator_model": settings.LLM_MODEL,
                "temperature": 0.3,
                "total_tokens_used": prompt_tokens + completion_tokens
            }
        )
        nodes.append(generator_node)
        
        # --- 3. POST-PROCESSING & COST ESTIMATION ---
        pipeline_completed_at = datetime.now(UTC)
        pipeline_duration_ms = (time.time() - pipeline_start_time) * 1000
        
        # Estimating Cost based on pricing for text-embedding-3-large and gpt-4.1-mini (approximate/mock rates)
        # text-embedding-3-large: $0.13 / 1M tokens
        # gpt-4.1-mini (input): $0.15 / 1M tokens
        # gpt-4.1-mini (output): $0.60 / 1M tokens
        cost_embedding = query_tokens * (0.13 / 1_000_000)
        cost_generator_input = prompt_tokens * (0.15 / 1_000_000)
        cost_generator_output = completion_tokens * (0.60 / 1_000_000)
        
        cost_estimate = CostEstimate(
            currency="USD",
            embedding_api=round(cost_embedding, 6),
            evaluator_api=0.0,
            generator_api=round(cost_generator_input + cost_generator_output, 6),
            total=round(cost_embedding + cost_generator_input + cost_generator_output, 6)
        )
        
        # Form Trace
        trace_data = TraceResponseData(
            trace_id=trace_id,
            query_id=query_id,
            query_text=query_text,
            started_at=pipeline_started_at,
            completed_at=pipeline_completed_at,
            total_duration_ms=pipeline_duration_ms,
            nodes=nodes,
            execution_path=execution_path,
            cost_estimate=cost_estimate
        )
        
        # Save trace
        self.trace_service.save_trace(trace_id, trace_data)
        
        # Form retrieved chunks list
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
        
        # Build confidence scores
        # Basic RAG simple heuristic for scores
        retrieval_confidence = retrieved_chunks[0].similarity_score if retrieved_chunks else 0.0
        confidence = QueryConfidence(
            overall=round(retrieval_confidence * 0.9, 2),
            retrieval=round(retrieval_confidence, 2),
            evaluation=None,
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
