export interface APIErrorDetail {
  location: string[];
  msg: string;
  type: string;
}

export interface APIErrorResponse {
  status: "error";
  code: number;
  error: {
    type: string;
    message: string;
    field?: string;
    details?: APIErrorDetail[];
  };
  timestamp: string;
  request_id: string;
}

export interface DocumentUploadResponse {
  document_id: string;
  filename: string;
  file_size_bytes: number;
  status: string; // IngestionStatus
  created_at: string;
  metadata?: Record<string, any>;
  estimated_completion_seconds: number;
}

export interface StageStatus {
  name: string;
  status: string; // PENDING, IN_PROGRESS, COMPLETED, FAILED
  duration_seconds?: number;
  output?: Record<string, any>;
}

export interface ProgressInfo {
  current_stage: string;
  percentage: number;
  stages_completed: StageStatus[];
  estimated_remaining_seconds: number;
}

export interface DocumentStatusResponse {
  document_id: string;
  filename: string;
  overall_status: string; // IngestionStatus
  progress: ProgressInfo;
  chunks_count: number;
  embeddings_stored: number;
  created_at: string;
  updated_at: string;
}

export interface DocumentResponse {
  document_id: string;
  filename: string;
  file_size_bytes: number;
  status: string; // IngestionStatus
  chunks_count: number;
  embeddings_stored: number;
  created_at: string;
  updated_at: string;
  metadata?: Record<string, any>;
}

export interface DocumentListResponse {
  documents: DocumentResponse[];
  total_count: number;
}

export interface QueryRequest {
  query: string;
  document_ids: string[];
  top_k?: number;
  options?: {
    use_web_search?: boolean;
    return_retrieved_chunks?: boolean;
  };
  session_id?: string;
}

export interface QueryResponseChunk {
  chunk_id: string;
  document_id: string;
  document_title: string;
  text: string;
  page_number?: number;
  similarity_score: number;
  chunk_size_tokens?: number;
}

export interface QueryConfidence {
  overall: number;
  retrieval: number;
  evaluation: number;
  generation: number;
}

export interface QueryResponseData {
  query_id: string;
  query_text: string;
  answer: string;
  answer_generated_at: string;
  response_time_ms: number;
  confidence: QueryConfidence;
  retrieved_chunks?: QueryResponseChunk[];
  execution_trace_id: string;
  trace_url: string;
}

export interface QueryResponseEnvelope {
  status: string;
  code: number;
  message?: string;
  data: QueryResponseData;
  timestamp: string;
  request_id?: string;
}
