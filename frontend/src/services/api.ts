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
  uploadDocument: async (file: File): Promise<DocumentUploadResponse> => {
    const formData = new FormData();
    formData.append("file", file);
    const response = await fetch(`${API_BASE}/documents/upload`, {
      method: "POST",
      body: formData,
    });
    return handleResponse<DocumentUploadResponse>(response);
  },

  getDocuments: async (): Promise<DocumentListResponse> => {
    const response = await fetch(`${API_BASE}/documents`);
    return handleResponse<DocumentListResponse>(response);
  },

  getDocumentStatus: async (documentId: string): Promise<DocumentStatusResponse> => {
    const response = await fetch(`${API_BASE}/documents/${documentId}/status`);
    return handleResponse<DocumentStatusResponse>(response);
  },

  deleteDocument: async (documentId: string): Promise<{ message: string }> => {
    const response = await fetch(`${API_BASE}/documents/${documentId}`, {
      method: "DELETE",
    });
    return handleResponse<{ message: string }>(response);
  },

  // Query APIs
  askQuestion: async (query: string, documentIds: string[], sessionId?: string): Promise<QueryResponseData> => {
    const response = await fetch(`${API_BASE}/query/answer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        query, 
        document_ids: documentIds,
        session_id: sessionId 
      }),
    });
    return handleResponse<QueryResponseData>(response);
  },

  // Execution Trace APIs
  getExecutionTrace: async (traceId: string): Promise<TraceResponseData> => {
    const response = await fetch(`${API_BASE}/trace/${traceId}`);
    return handleResponse<TraceResponseData>(response);
  }
};
