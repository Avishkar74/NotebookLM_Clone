import { env } from './config/env.js';
import { LocalDocumentLoader } from './infrastructure/document/local-document-loader.js';
import { FirecrawlWebLoader } from './infrastructure/web/firecrawl-web-loader.js';
import { AssemblyAiAudioTranscriber } from './infrastructure/audio/assemblyai-audio-transcriber.js';
import { OpenAiEmbedder } from './infrastructure/embeddings/openai-embedder.js';
import { LocalHashEmbedder } from './infrastructure/embeddings/local-hash-embedder.js';
import { ResilientEmbedder } from './infrastructure/embeddings/resilient-embedder.js';
import { OpenAiLlmClient } from './infrastructure/generation/openai-llm-client.js';
import { HybridMemoryStore } from './infrastructure/memory/hybrid-memory-store.js';
import { MilvusVectorStore } from './infrastructure/vector/milvus-vector-store.js';
import { NullVectorStore } from './infrastructure/vector/null-vector-store.js';
import { IngestionService } from './application/ingestion-service.js';
import { RagPipeline } from './application/rag-pipeline.js';
import { TextChunker } from './utils/text-chunker.js';
import { logger } from './utils/logger.js';

export type AppContainer = {
  env: typeof env;
  documentLoader: LocalDocumentLoader;
  webLoader: FirecrawlWebLoader;
  audioTranscriber: AssemblyAiAudioTranscriber;
  embedder: ResilientEmbedder;
  llmClient: OpenAiLlmClient;
  memoryStore: HybridMemoryStore;
  vectorStore: MilvusVectorStore | NullVectorStore;
  ingestionService: IngestionService;
  ragPipeline: RagPipeline;
};

export const createContainer = (): AppContainer => {
  if (!env.openaiApiKey && !env.chatanywhereApiKey) {
    throw new Error('Either OPENAI_API_KEY or CHATANYWHERE_API_KEY is required');
  }

  const documentLoader = new LocalDocumentLoader(1000, 200);
  const webLoader = new FirecrawlWebLoader(env.firecrawlApiKey, 1000, 100);
  const audioTranscriber = new AssemblyAiAudioTranscriber(env.assemblyAiApiKey, 1000, 100);
  const nativeOpenAiEmbedder = new OpenAiEmbedder(env.openaiApiKey, undefined, 'text-embedding-3-small', 384);
  const proxyOpenAiEmbedder = new OpenAiEmbedder(env.chatanywhereApiKey, env.baseUrl, 'text-embedding-3-small', 384);
  const localHashEmbedder = new LocalHashEmbedder(384);

  const embedder = new ResilientEmbedder([
    nativeOpenAiEmbedder,
    proxyOpenAiEmbedder,
    localHashEmbedder,
  ]);

  const llmClient = new OpenAiLlmClient(
    env.openaiApiKey || env.chatanywhereApiKey,
    env.openaiApiKey ? undefined : env.baseUrl,
    env.model
  );
  const memoryStore = new HybridMemoryStore(env.zepApiKey);
  const vectorStore = env.milvusUri && env.milvusToken
    ? new MilvusVectorStore(env.milvusUri, env.milvusToken, 'notebook_lm', 384)
    : new NullVectorStore();

  if (!(env.milvusUri && env.milvusToken)) {
    logger.warn('milvus_not_configured_using_null_vector_store');
  }

  const ingestionService = new IngestionService(documentLoader, webLoader, audioTranscriber, embedder, vectorStore, memoryStore, new TextChunker(1000, 200));
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
