import type { 
  DocumentListResponse, 
  DocumentStatusResponse, 
  DocumentUploadResponse, 
  QueryResponseData,
  TraceResponseData
} from "../types";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000/api";

export class APIError extends Error {
  response: any;

  constructor(response: any) {
    super(response?.error?.message || response?.detail || "An API error occurred");
    this.name = "APIError";
    this.response = response;
  }
}

async function handleResponse<T>(response: Response): Promise<T> {
  const data = await response.json();
  if (!response.ok) {
    throw new APIError(data);
  }
  
  // If the response follows the enveloped structure: { status: "success", code: 200, data: T }
  if (data && typeof data === "object" && "data" in data && "status" in data && "code" in data) {
    return data.data as T;
  }
  
  // Otherwise, return the raw data
  return data as T;
}

export const api = {
  // Health APIs
  checkHealth: async (): Promise<{ status: string; services: Record<string, string> }> => {
    const response = await fetch(`${API_BASE}/health`);
    return handleResponse(response);
  },

  checkReadiness: async (): Promise<{ ready: boolean; services: Record<string, any> }> => {
    const response = await fetch(`${API_BASE}/health/ready`);
    return handleResponse(response);
  },

  // Document Management APIs
  uploadDocument: async (file: File, sessionId?: string): Promise<DocumentUploadResponse> => {
    const formData = new FormData();
    formData.append("file", file);
    if (sessionId) {
      formData.append("session_id", sessionId);
    }
    const response = await fetch(`${API_BASE}/documents/upload`, {
      method: "POST",
      body: formData,
    });
    return handleResponse<DocumentUploadResponse>(response);
  },

  getDocuments: async (sessionId?: string, status?: string): Promise<DocumentListResponse> => {
    const url = new URL(`${API_BASE}/documents`);
    if (sessionId) {
      url.searchParams.set("session_id", sessionId);
    }
    if (status) {
      url.searchParams.set("status", status);
    }
    const response = await fetch(url.toString());
    return handleResponse<DocumentListResponse>(response);
  },

  getDocumentStatus: async (documentId: string, sessionId?: string): Promise<DocumentStatusResponse> => {
    const url = new URL(`${API_BASE}/documents/${documentId}/status`);
    if (sessionId) {
      url.searchParams.set("session_id", sessionId);
    }
    const response = await fetch(url.toString());
    return handleResponse<DocumentStatusResponse>(response);
  },

  deleteDocument: async (documentId: string, sessionId?: string): Promise<{ message: string }> => {
    const url = new URL(`${API_BASE}/documents/${documentId}`);
    if (sessionId) {
      url.searchParams.set("session_id", sessionId);
    }
    const response = await fetch(url.toString(), {
      method: "DELETE",
    });
    return handleResponse<{ message: string }>(response);
  },

  // Query APIs
  askQuestion: async (
    query: string,
    documentIds: string[],
    sessionId?: string,
    options?: { use_web_search?: boolean; return_retrieved_chunks?: boolean }
  ): Promise<QueryResponseData> => {
    const response = await fetch(`${API_BASE}/query/answer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        query, 
        document_ids: documentIds,
        session_id: sessionId,
        options: {
          use_web_search: options?.use_web_search ?? true,
          return_retrieved_chunks: options?.return_retrieved_chunks ?? true
        }
      }),
    });
    return handleResponse<QueryResponseData>(response);
  },

  // Execution Trace APIs
  getExecutionTrace: async (traceId: string): Promise<TraceResponseData> => {
    const response = await fetch(`${API_BASE}/trace/${traceId}`);
    return handleResponse<TraceResponseData>(response);
  },

  pingSession: async (sessionId: string): Promise<{ status: string; session_id: string; timestamp: string }> => {
    const url = new URL(`${API_BASE}/health/ping`);
    url.searchParams.set("session_id", sessionId);
    const response = await fetch(url.toString());
    return handleResponse<{ status: string; session_id: string; timestamp: string }>(response);
  }
};
