export interface NodeEvent {
  node_id: string;
  node_name: string;
  display_name: string;
  type: string; // retrieval, evaluation, search, generation, refinement, query_rewrite, routing
  status: "PENDING" | "RUNNING" | "SUCCESS" | "FAILED" | "SKIPPED";
  started_at: string;
  completed_at: string;
  duration_ms: number;
  input: Record<string, any>;
  output: Record<string, any>;
  metadata: Record<string, any>;
  error?: Record<string, any>;
}

export interface CostEstimate {
  currency: string;
  embedding_api: number;
  evaluator_api: number;
  generator_api: number;
  total: number;
}

export interface TraceResponseData {
  trace_id: string;
  session_id?: string;
  query_id: string;
  question: string;
  status: string; // CREATED, RUNNING, COMPLETED, FAILED, CANCELLED
  started_at: string;
  completed_at: string;
  duration_ms: number;
  decision_path: "CORRECT" | "AMBIGUOUS" | "INCORRECT";
  active_branch: string[];
  nodes: NodeEvent[];
  final_answer: string;
  metadata: Record<string, any>;
}
