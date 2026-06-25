export interface Document {
  id: string;
  name: string;
  sizeBytes: number;
  status: "QUEUED" | "PARSING" | "CHUNKING" | "EMBEDDING" | "STORING" | "COMPLETED" | "FAILED";
  chunksCount: number;
  embeddingsStored: number;
  createdAt: string;
  updatedAt: string;
}

export interface UploadingDocument {
  id: string;
  name: string;
  sizeBytes: number;
  status: "QUEUED" | "PARSING" | "CHUNKING" | "EMBEDDING" | "STORING" | "COMPLETED" | "FAILED";
  progressPercent: number;
  chunksCount: number;
  embeddingsStored: number;
  error?: string;
}

export interface Message {
  id: string;
  sender: "user" | "assistant";
  text: string;
  timestamp: string;
  traceId?: string;
}
