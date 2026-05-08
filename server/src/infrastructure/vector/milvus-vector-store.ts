import { MilvusClient, DataType } from '@zilliz/milvus2-sdk-node';
import type { EmbeddedChunk, RetrievedChunk } from '../../domain/models.js';
import type { VectorStore } from '../../domain/ports.js';

export class MilvusVectorStore implements VectorStore {
  private readonly client: any;
  private collectionReady = false;

  constructor(
    private readonly uri: string,
    private readonly token: string,
    private readonly collectionName = 'notebook_lm',
    private readonly embeddingDim = 384,
  ) {
    this.client = new MilvusClient({ address: uri, token });
  }

  public async ensureCollection(): Promise<void> {
    if (this.collectionReady) {
      return;
    }

    const exists = await this.client.hasCollection({ collection_name: this.collectionName });
    if (!exists.value) {
      await this.client.createCollection({
        collection_name: this.collectionName,
        enable_dynamic_field: true,
        fields: [
          { name: 'id', data_type: DataType.VarChar, is_primary_key: true, autoID: false, max_length: 128 },
          { name: 'vector', data_type: DataType.FloatVector, dim: this.embeddingDim },
          { name: 'content', data_type: DataType.VarChar, max_length: 8192 },
          { name: 'source_file', data_type: DataType.VarChar, max_length: 512 },
          { name: 'source_type', data_type: DataType.VarChar, max_length: 32 },
          { name: 'page_number', data_type: DataType.Int32 },
          { name: 'chunk_index', data_type: DataType.Int32 },
          { name: 'start_char', data_type: DataType.Int32 },
          { name: 'end_char', data_type: DataType.Int32 },
          { name: 'metadata', data_type: DataType.JSON },
          { name: 'embedding_model', data_type: DataType.VarChar, max_length: 128 },
        ],
      });
    }

    try {
      await this.client.createIndex({
        collection_name: this.collectionName,
        field_name: 'vector',
        index_type: 'AUTOINDEX',
        metric_type: 'COSINE',
        params: {},
      });
    } catch {
      // The collection may already have an index from a previous boot.
    }

    await this.client.loadCollection({ collection_name: this.collectionName });

    this.collectionReady = true;
  }

  public async upsert(chunks: EmbeddedChunk[]): Promise<string[]> {
    if (!chunks.length) {
      return [];
    }

    await this.ensureCollection();
    const data = chunks.map((chunk) => chunk.toVectorRecord());
    await this.client.insert({ collection_name: this.collectionName, data: data as any[] });
    await this.client.flush({ collection_names: [this.collectionName] });
    await this.client.loadCollection({ collection_name: this.collectionName });
    return data.map((item) => String(item.id));
  }

  public async search(queryVector: number[], limit: number): Promise<RetrievedChunk[]> {
    await this.ensureCollection();
    const response: any = await this.client.search({
      collection_name: this.collectionName,
      data: [queryVector],
      anns_field: 'vector',
      limit,
      output_fields: ['id', 'content', 'source_file', 'source_type', 'page_number', 'chunk_index', 'start_char', 'end_char', 'metadata', 'embedding_model'],
      params: { nprobe: 16 },
    });

    const rows = response?.results ?? [];
    return rows.map((row: any) => {
      const entity = row?.entity ?? row?.fields ?? row ?? {};
      const sourceType = String(entity.source_type ?? row?.source_type ?? 'txt') as RetrievedChunk['citation']['sourceType'];

      return {
        id: String(row?.id ?? entity.id ?? ''),
        score: Number(row?.distance ?? row?.score ?? 0),
        content: String(entity.content ?? row?.content ?? ''),
        citation: {
          sourceFile: String(entity.source_file ?? row?.source_file ?? 'Unknown'),
          sourceType,
          pageNumber: Number(entity.page_number ?? row?.page_number ?? -1) === -1 ? null : Number(entity.page_number ?? row?.page_number),
          chunkIndex: Number(entity.chunk_index ?? row?.chunk_index ?? 0),
          startChar: Number(entity.start_char ?? row?.start_char ?? -1) === -1 ? null : Number(entity.start_char ?? row?.start_char),
          endChar: Number(entity.end_char ?? row?.end_char ?? -1) === -1 ? null : Number(entity.end_char ?? row?.end_char),
        },
        metadata: typeof (entity.metadata ?? row?.metadata) === 'object' && (entity.metadata ?? row?.metadata)
          ? ((entity.metadata ?? row?.metadata) as Record<string, unknown>)
          : {},
        embeddingModel: String(entity.embedding_model ?? row?.embedding_model ?? ''),
      } satisfies RetrievedChunk;
    });
  }

  public async getById(id: string): Promise<Record<string, unknown> | null> {
    await this.ensureCollection();
    const rows: any = await this.client.query({
      collection_name: this.collectionName,
      filter: `id == \"${id}\"`,
      output_fields: ['id', 'content', 'metadata', 'source_file', 'source_type', 'page_number', 'chunk_index'],
    });

    return rows?.data?.[0] ?? rows?.[0] ?? null;
  }

  public async clear(): Promise<void> {
    const exists = await this.client.hasCollection({ collection_name: this.collectionName });
    if (exists.value) {
      await this.client.dropCollection({ collection_name: this.collectionName });
    }
    this.collectionReady = false;
  }
}