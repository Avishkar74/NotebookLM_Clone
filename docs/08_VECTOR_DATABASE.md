# **08\_VECTOR\_DATABASE.md**

# **Vector Database Design**

**Version:** 1.0

---

# **Purpose**

The vector database is responsible for storing document embeddings and performing semantic similarity search for the CRAG pipeline.

It acts as the primary knowledge retrieval layer between the document ingestion pipeline and the Retrieval node.

The system uses **Qdrant Open Source** because it is lightweight, production-ready, easy to self-host, and provides excellent semantic search capabilities with metadata filtering.

---

# **Why Qdrant?**

The project uses **Qdrant Cloud (Free Tier)** as the vector database.

## **Reasons for Choosing Qdrant Cloud**

* Fully managed database instance
* No local Docker setup or administration required
* Excellent Python SDK  
* Native support for metadata filtering  
* High-performance cosine similarity search  
* Suitable for educational as well as production systems

For this project, Qdrant runs on Qdrant Cloud and the backend connects via cloud URL and API key.

---

# **Architecture**

User Upload

↓

PDF / TXT

↓

Chunking

↓

Embedding Generation

↓

Qdrant Collection

↓

Semantic Search

↓

Retriever Node

The backend is the only component that communicates with Qdrant.

The frontend never communicates with the vector database directly.

---

# **Database Structure**

Each uploaded document becomes part of a single Qdrant collection.

Example

Collection

crag\_documents

Every chunk inside every uploaded document is stored as one vector point.

---

# **Collection Configuration**

| Property | Value |
| ----- | ----- |
| Collection Name | crag\_documents |
| Distance Metric | Cosine Similarity |
| Vector Size | Depends on embedding model |
| Payload Storage | Enabled |
| Index Type | HNSW (default) |
| Quantization | Disabled |
| Replication | 1 |
| Shards | Default |

---

# **Collection Schema**

Each vector point consists of

Vector

\+

Payload (Metadata)

Example

{

    "id": "chunk\_001",

    "vector": \[0.182, \-0.338, ...\],

    "payload": {

        "document\_id": "doc\_001",

        "document\_name": "attention-is-all-you-need.pdf",

        "chunk\_id": "chunk\_001",

        "chunk\_index": 0,

        "page\_number": 1,

        "text": "Attention mechanisms allow...",

        "created\_at": "2026-06-25T10:30:00Z"

    }

}

---

# **Document Metadata**

Every stored chunk contains metadata that allows complete traceability.

| Field | Description |
| ----- | ----- |
| document\_id | Internal document identifier |
| document\_name | Original uploaded filename |
| chunk\_id | Unique chunk identifier |
| chunk\_index | Position inside document |
| page\_number | Original PDF page |
| text | Chunk text |
| created\_at | Upload timestamp |

Additional metadata may be added later without changing the vector schema.

---

# **Chunk IDs**

Every chunk receives a globally unique identifier.

Format

chunk\_\<UUID\>

Example

chunk\_7bce9132

Chunk IDs never change.

Even if retrieval order changes,

the chunk identifier remains constant.

This allows

* Execution traces  
* Node outputs  
* Debugging  
* Source references

to consistently refer to the same chunk.

---

# **Document IDs**

Every uploaded document receives

doc\_\<UUID\>

Example

doc\_83af712

All chunks belonging to the document reference this ID.

Example

Document

doc\_83af712

↓

Chunks

chunk\_1

chunk\_2

chunk\_3

chunk\_4

---

# **Embedding Model**

The embedding model is responsible for converting each chunk into a dense vector.

Recommended Model

OpenAI

text-embedding-3-large

Reasons

* Production-grade semantic search quality
* Standard OpenAI API integration  
* 3072-dimensional vector representation for high precision
* Fast inference and high retrieval quality

The vector dimension is determined by the embedding model and stored in the Qdrant collection configuration.

Changing the embedding model requires rebuilding the collection.

---

# **Chunking Strategy**

Before embeddings are generated,

documents are divided into overlapping semantic chunks.

Configuration

| Property | Value |
| ----- | ----- |
| Chunk Size | 900 tokens |
| Chunk Overlap | 150 tokens |
| Split Strategy | Recursive Character Text Splitter |
| Preserve Sentences | Yes |

Example

Document

↓

Chunk 1

↓

Chunk 2

↓

Chunk 3

↓

Chunk 4

Every chunk produces exactly one embedding.

---

# **Ingestion Workflow**

Upload PDF

↓

Parse PDF

↓

Extract Text

↓

Chunk Document

↓

Generate Embeddings

↓

Store in Qdrant

↓

Ready

Only after the final step does the document become available for querying.

---

# **Retrieval Workflow**

When the user submits a query

Question

↓

Generate Query Embedding

↓

Search Qdrant

↓

Top-K Chunks

↓

Retriever Output

The Retriever returns

* Chunk IDs  
* Similarity scores  
* Metadata  
* Chunk text

These are forwarded to the Evaluator node.

---

# **Similarity Search**

Search Metric

Cosine Similarity

The Retriever requests

Top K \= 5

(Default)

Returned Example

| Rank | Chunk | Similarity |
| ----- | ----- | ----- |
| 1 | Chunk 12 | 0.92 |
| 2 | Chunk 7 | 0.89 |
| 3 | Chunk 3 | 0.86 |
| 4 | Chunk 15 | 0.79 |
| 5 | Chunk 8 | 0.76 |

These values are passed directly into the Execution Trace.

---

# **Metadata Filtering**

Although this project searches across all uploaded documents, the schema supports filtering.

Possible filters include

* document\_id  
* filename  
* page\_number

Example

Search only inside

attention-is-all-you-need.pdf

or

Search only page 12

This keeps the design extensible without complicating the current implementation.

---

# **Document Lifecycle**

Each uploaded document follows the same lifecycle.

Uploaded

↓

Parsing

↓

Chunking

↓

Embedding

↓

Stored

↓

Queryable

↓

Deleted

Only documents in the **Queryable** state participate in retrieval.

---

# **Deletion**

When a document is deleted

the backend performs

Delete Document Metadata

↓

Delete All Chunks

↓

Delete All Embeddings

↓

Remove from Qdrant

↓

Update UI

The deletion is performed using the document\_id filter.

After deletion

the document is no longer searchable.

---

# **Re-indexing**

Re-indexing is required when

* Chunk size changes  
* Chunk overlap changes  
* Embedding model changes  
* Document content changes

Re-indexing process

Delete Existing Chunks

↓

Recreate Chunks

↓

Generate New Embeddings

↓

Store New Vectors

↓

Document Ready

Old embeddings are never mixed with new embeddings.

---

# **Collection Maintenance**

During application startup

the backend verifies

Collection Exists?

↓

Yes

↓

Continue

\---------------

No

↓

Create Collection

The backend automatically creates the collection if it does not exist.

---

# **Performance Considerations**

| Property | Value |
| ----- | ----- |
| Search Metric | Cosine Similarity |
| Default Top-K | 5 |
| Payload Storage | Enabled |
| Batch Embedding Upload | Enabled |
| Metadata Filtering | Supported |
| Approximate Search | HNSW |

These defaults provide a good balance between retrieval accuracy and latency for an educational CRAG system.

---

# **Error Handling**

Possible vector database failures include

* Collection not found  
* Connection timeout  
* Invalid vector dimension  
* Corrupted payload  
* Failed insertion  
* Failed deletion

The backend catches these exceptions and emits structured error events into the Execution Trace.

The frontend displays these errors through the Pipeline Visualization and Node Output Inspector.

---

# **Future Improvements**

The schema has been designed so future enhancements can be added without changing the frontend.

Possible extensions include

* Hybrid Search (BM25 \+ Vector Search)  
* Sparse \+ Dense Retrieval  
* Multi-collection Support  
* Document Versioning  
* Semantic Caching  
* Quantization for Large Collections  
* Distributed Qdrant Cluster  
* Metadata-based Ranking  
* Reranking Models  
* Namespace Support

---

# **Design Philosophy**

Qdrant is treated as a dedicated semantic retrieval layer rather than a general-purpose database.

Each uploaded document is transformed into semantically meaningful chunks, embedded into dense vectors, enriched with metadata, and stored inside a single searchable collection.

The backend is solely responsible for all interactions with Qdrant—including collection management, vector insertion, retrieval, deletion, and re-indexing—while the frontend remains completely unaware of the underlying storage implementation. This separation ensures a clean architecture, simplifies maintenance, and allows the retrieval layer to evolve independently without affecting the user interface.

