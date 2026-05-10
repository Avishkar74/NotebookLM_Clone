const API_BASE = import.meta.env.VITE_API_BASE_URL || 'https://notebooklm-clone-flxh.onrender.com/api';

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export type IngestSummary = {
  id: string;
  name: string;
  sourceType: string;
  chunkCount: number;
  vectorIds: string[];
  warnings?: string[];
  // NEW: explicit embedding state
  embeddingFailed: boolean;
  embeddingModel: string;
};

export type SourceStateInfo = {
  sourceId: string;
  embeddingFailed: boolean;
  embeddingModel: string;
  name: string;
};

export type RagAnswer = {
  query: string;
  response: string;
  mode?: 'chat' | 'rag';
  warnings?: string[];
  sourcesUsed: Array<{
    reference: string;
    sourceFile: string;
    sourceType: string;
    pageNumber?: number | null;
    chunkId: string;
    relevanceScore: number;
  }>;
  retrievalCount: number;
  embedderStatus?: 'primary' | 'fallback';
  groundingLevel?: string;
};

async function fetchWithTimeout(input: RequestInfo, init: RequestInit = {}, ms = 30_000): Promise<Response> {
  const controller = new AbortController();
  const id = window.setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new ApiError('Request timed out. Please try again.');
    }
    throw error;
  } finally {
    window.clearTimeout(id);
  }
}

async function parseJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const text = await response.text();
    let payload: { error?: string; code?: string } | null = null;
    try {
      payload = text ? (JSON.parse(text) as { error?: string; code?: string }) : null;
    } catch {
      payload = null;
    }
    const defaultMessage = mapHttpStatusToMessage(response.status);
    const message = payload?.error || defaultMessage;
    throw new ApiError(message, payload?.code);
  }
  return response.json() as Promise<T>;
}

function mapHttpStatusToMessage(status: number): string {
  if (status === 400) return 'The request is invalid. Please check your input.';
  if (status === 404) return 'The requested resource could not be found.';
  if (status >= 500) return 'The server is temporarily unavailable. Please try again.';
  return `Request failed with status ${status}`;
}

export async function ingestFile(file: File, userId: string, sessionId: string): Promise<IngestSummary> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('userId', userId);
  formData.append('sessionId', sessionId);
  return parseJson<IngestSummary>(
    await fetchWithTimeout(`${API_BASE}/ingest/file`, { method: 'POST', body: formData }, 60_000)
  );
}

export async function ingestUrl(url: string, userId: string, sessionId: string): Promise<IngestSummary> {
  return parseJson<IngestSummary>(
    await fetchWithTimeout(`${API_BASE}/ingest/url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, userId, sessionId }),
    }, 60_000),
  );
}

export async function previewUrl(url: string): Promise<Record<string, unknown>> {
  return parseJson<Record<string, unknown>>(
    await fetchWithTimeout(`${API_BASE}/ingest/url/preview?url=${encodeURIComponent(url)}`, {}, 30_000)
  );
}

export async function askQuestion(
  query: string,
  userId = 'notebook-user',
  sessionId = 'default-session',
  userApiKey?: string,
  sourceFiles?: string[],
  sourceStateInfo?: SourceStateInfo[],
): Promise<RagAnswer> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (userApiKey) {
    headers['Authorization'] = `Bearer ${userApiKey}`;
  }
  return parseJson<RagAnswer>(
    await fetchWithTimeout(`${API_BASE}/query`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ query, userId, sessionId, sourceFiles, sourceStateInfo }),
    }, 120_000),
  );
}

export async function ingestText(text: string, title: string, userId: string, sessionId: string): Promise<IngestSummary> {
  return parseJson<IngestSummary>(
    await fetchWithTimeout(`${API_BASE}/ingest/text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, title, userId, sessionId }),
    }, 60_000),
  );
}
