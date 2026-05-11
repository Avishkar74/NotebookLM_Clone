import dotenv from 'dotenv';
import path from 'node:path';

dotenv.config({ path: path.resolve(process.cwd(), '..', '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

export const env = {
  port: Number(process.env.PORT ?? '4000'),
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
  geminiApiKey: process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY ?? '',
  geminiEmbeddingModel: process.env.GEMINI_EMBEDDING_MODEL ?? 'gemini-embedding-001',
  geminiLlmModel: process.env.GEMINI_LLM_MODEL ?? 'gemini-2.5-flash',
  chatanywhereApiKey: process.env.CHATANYWHERE_API_KEY ?? '',
  openaiApiKey: process.env.OPENAI_API_KEY ?? '',
  baseUrl: (process.env.BASE_URL ?? '').includes('://') 
    ? (process.env.BASE_URL ?? '') 
    : (process.env.BASE_URL ? `https://${process.env.BASE_URL}` : ''),
  model: process.env.MODEL ?? 'gpt-4o-mini',
  milvusUri: process.env.MILVUS_URI ?? process.env.ZILLIZ_URI ?? '',
  milvusToken: process.env.MILVUS_TOKEN ?? process.env.ZILLIZ_TOKEN ?? '',
  assemblyAiApiKey: process.env.ASSEMBLYAI_API_KEY ?? '',
  firecrawlApiKey: process.env.FIRECRAWL_API_KEY ?? '',
  zepApiKey: process.env.ZEP_API_KEY ?? '',
  defaultUserId: process.env.DEFAULT_USER_ID ?? 'notebook-user',
  defaultSessionId: process.env.DEFAULT_SESSION_ID ?? 'default-session',
  defaultUserName: process.env.DEFAULT_USER_NAME ?? 'NotebookLM User',
};
