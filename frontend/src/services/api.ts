const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000/api";

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

export class APIError extends Error {
  response: APIErrorResponse;

  constructor(response: APIErrorResponse) {
    super(response.error.message);
    this.name = "APIError";
    this.response = response;
  }
}

async function handleResponse<T>(response: Response): Promise<T> {
  const data = await response.json();
  if (!response.ok) {
    throw new APIError(data as APIErrorResponse);
  }
  return data.data as T;
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

  // Document Management APIs (For future phases)
  uploadDocument: async (file: File): Promise<any> => {
    const formData = new FormData();
    formData.append("file", file);
    const response = await fetch(`${API_BASE}/documents/upload`, {
      method: "POST",
      body: formData,
    });
    return handleResponse(response);
  },

  getDocuments: async (): Promise<any[]> => {
    const response = await fetch(`${API_BASE}/documents`);
    return handleResponse(response);
  },

  deleteDocument: async (docId: string): Promise<void> => {
    const response = await fetch(`${API_BASE}/documents/${docId}`, {
      method: "DELETE",
    });
    return handleResponse(response);
  },

  // Query API (For future phases)
  askQuestion: async (query: string, docIds: string[]): Promise<any> => {
    const response = await fetch(`${API_BASE}/query/answer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, document_ids: docIds }),
    });
    return handleResponse(response);
  },
};
