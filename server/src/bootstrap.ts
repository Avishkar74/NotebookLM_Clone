import { env } from './config/env.js';
import { LocalDocumentLoader } from './infrastructure/document/local-document-loader.js';
import { FirecrawlWebLoader } from './infrastructure/web/firecrawl-web-loader.js';
import { AssemblyAiAudioTranscriber } from './infrastructure/audio/assemblyai-audio-transcriber.js';
import { GeminiEmbedder } from './infrastructure/embeddings/gemini-embedder.js';
import { LocalHashEmbedder } from './infrastructure/embeddings/local-hash-embedder.js';
import { ResilientEmbedder } from './infrastructure/embeddings/resilient-embedder.js';
import { GeminiLlmClient } from './infrastructure/generation/gemini-llm-client.js';
import { HybridMemoryStore } from './infrastructure/memory/hybrid-memory-store.js';
import { MilvusVectorStore } from './infrastructure/vector/milvus-vector-store.js';
import { NullVectorStore } from './infrastructure/vector/null-vector-store.js';
import { IngestionService } from './application/ingestion-service.js';
import { RagPipeline } from './application/rag-pipeline.js';
import { logger } from './utils/logger.js';

export type AppContainer = {
  env: typeof env;
  documentLoader: LocalDocumentLoader;
  webLoader: FirecrawlWebLoader;
  audioTranscriber: AssemblyAiAudioTranscriber;
  embedder: ResilientEmbedder;
  llmClient: GeminiLlmClient;
  memoryStore: HybridMemoryStore;
  vectorStore: MilvusVectorStore | NullVectorStore;
  ingestionService: IngestionService;
  ragPipeline: RagPipeline;
};

export const createContainer = (): AppContainer => {
  if (!env.geminiApiKey) {
    throw new Error('GEMINI_API_KEY is required');
  }

  const documentLoader = new LocalDocumentLoader(1000, 200);
  const webLoader = new FirecrawlWebLoader(env.firecrawlApiKey, 1000, 100);
  const audioTranscriber = new AssemblyAiAudioTranscriber(env.assemblyAiApiKey, 1000, 100);
  const embedder = new ResilientEmbedder(
    new GeminiEmbedder(env.geminiApiKey, env.geminiEmbeddingModel),
    new LocalHashEmbedder(384),
  );
  const llmClient = new GeminiLlmClient(env.geminiApiKey, env.geminiLlmModel);
  const memoryStore = new HybridMemoryStore(env.zepApiKey);
  const vectorStore = env.milvusUri && env.milvusToken
    ? new MilvusVectorStore(env.milvusUri, env.milvusToken, 'notebook_lm', 384)
    : new NullVectorStore();

  if (!(env.milvusUri && env.milvusToken)) {
    logger.warn('milvus_not_configured_using_null_vector_store');
  }

  const ingestionService = new IngestionService(documentLoader, webLoader, audioTranscriber, embedder, vectorStore, memoryStore);
  const ragPipeline = new RagPipeline(embedder, vectorStore, llmClient, memoryStore);

  return {
    env,
    documentLoader,
    webLoader,
    audioTranscriber,
    embedder,
    llmClient,
    memoryStore,
    vectorStore,
    ingestionService,
    ragPipeline,
  };
};
