# 01_PROJECT_SCOPE.md

## Corrective Retrieval Augmented Generation (CRAG) - Complete System Specification

---

## 1. PROJECT OBJECTIVES

The CRAG application is a full-stack system designed to improve the robustness and accuracy of retrieval-augmented generation (RAG) by introducing intelligent retrieval evaluation and corrective strategies.

### Primary Objectives

1. **Implement Corrective RAG Workflow** - Build a system that evaluates retrieved documents and applies different knowledge retrieval strategies based on relevance.

2. **Create Production-Grade Architecture** - Design a clean, modular, maintainable system that separates concerns and follows software engineering best practices.

3. **Visualization as First-Class Feature** - Build a complete execution trace system that shows users exactly what the system is doing at each step, similar to LangGraph Studio or LangSmith.

4. **Demonstrate Learning** - The application must teach users how Corrective RAG works through the UI, not just provide answers.

### Success Criteria

- Complete CRAG pipeline functional with all three decision paths (Correct, Incorrect, Ambiguous)
- Structured execution traces returned for every query
- Frontend visualization showing real-time pipeline execution with expandable nodes
- Support for document ingestion (PDF, TXT)
- Full question-answering capability with web search fallback
- All nodes emit structured, queryable events
- No single point of failure in architectural design

---

## 2. FEATURES (IN SCOPE)

### 2.1 Document Management

- **Upload**: Users can upload PDF and TXT files
- **Sequential Ingestion**: Documents are processed one at a time (not parallel)
- **Pipeline Visualization**: Every ingestion stage is visualized in real-time
  - PDF Parsing
  - Text Extraction
  - Chunking
  - Embedding Generation
  - Vector Database Storage
- **Multiple Documents**: Support for multiple document queues with status tracking
- **Metadata Tracking**: Document name, size, chunk count, status

### 2.2 Question Answering System

- **Query Input**: Simple text input for user questions
- **Retrieval**: Fetch top-K relevant chunks from vector database
- **Evaluation**: Assess if retrieved documents are relevant
- **Three Decision Paths**:
  - **Correct** - Retrieved docs are relevant → Apply knowledge refinement only
  - **Incorrect** - Retrieved docs are irrelevant → Discard and use web search
  - **Ambiguous** - Unclear relevance → Use both refined internal + web search
- **Web Search**: Fallback to Google/Bing search for additional knowledge
- **Generation**: LLM produces final answer using selected knowledge
- **Confidence Scoring**: System provides confidence metrics at each stage

### 2.3 Knowledge Refinement

- **Decomposition**: Break documents into sentence-level strips
- **Filtering**: Remove irrelevant sentences using LLM evaluation
- **Recomposition**: Reconstruct cleaned context from relevant strips

### 2.4 Execution Visualization

- **Interactive Graph**: Display CRAG pipeline as an animated execution graph
- **Node Details**: Expandable nodes showing:
  - Status (Running, Complete, Failed)
  - Input data
  - Output data
  - Metadata (confidence, timing, etc.)
- **Real-time Animation**: Active nodes glow/animate during execution
- **Node Inspector**: Click any node to view detailed output in bottom panel
- **Execution History**: Trace of all decisions made during query processing

### 2.5 User Interface

- **Four-Panel Dashboard**:
  - Left: Document upload and management
  - Center: Chat interface
  - Right: CRAG execution graph
  - Bottom: Node output inspector
- **No Navigation**: Everything exists in a single dashboard
- **Clean Design**: Minimal clutter, educational aesthetic
- **Responsive**: Optimized for desktop, responsive for mobile

---

## 3. NON-FEATURES (OUT OF SCOPE)

### 3.1 Authentication

- No login/signup system
- No user accounts
- No session persistence
- No multi-user support
- This is a demonstration system, not a production SaaS product

### 3.2 Advanced Features (v2+)

- Conversation history/memory across sessions
- Prompt engineering UI
- Fine-tuning interface for the retrieval evaluator
- Custom embedding model selection
- Advanced filtering/search operators
- Batch processing
- Export/report generation
- Analytics dashboards
- Rate limiting/quotas
- Admin panels

### 3.3 Document Management (Advanced)

- Document versioning
- Document deletion/archiving
- Document metadata editing
- Access control
- Sharing
- Comments/annotations

### 3.4 Advanced RAG Features

- Multi-hop retrieval
- Iterative refinement
- Query expansion
- Query rewriting beyond the simple keyword extraction
- Custom distance metrics
- Semantic caching
- Document re-ranking

---

## 4. FUNCTIONAL REQUIREMENTS

### 4.1 Document Ingestion Pipeline

#### FR-DI-001: PDF Upload
- **Requirement**: System must accept PDF files up to 50MB
- **Processing**: Extract all text, maintain page structure
- **Error Handling**: Handle corrupted/encrypted PDFs gracefully
- **Output**: Stream of Document objects with metadata

#### FR-DI-002: TXT Upload
- **Requirement**: System must accept plain text files up to 10MB
- **Processing**: Preserve line breaks and structure
- **Encoding**: Handle UTF-8, Latin-1, and other common encodings
- **Output**: Single Document object

#### FR-DI-003: Text Extraction
- **Requirement**: Extract clean text from parsed documents
- **Processing**: Remove headers, footers, page numbers where possible
- **Output**: Cleaned text content

#### FR-DI-004: Chunking Strategy
- **Requirement**: Split text into semantic chunks
- **Constraints**: 
  - Chunk size: 900 tokens (with 150 token overlap)
  - Preserve sentence boundaries where possible
  - Maintain context by overlapping chunks
- **Output**: List of Document chunks with source metadata

#### FR-DI-005: Embedding Generation
- **Model**: OpenAI's text-embedding-3-large
- **Batch Processing**: Process chunks efficiently
- **Dimension**: 3072-dimensional vectors
- **Caching**: Cache embeddings to avoid re-computation
- **Output**: Embeddings stored in vector database

#### FR-DI-006: Vector Storage
- **Database**: Qdrant (open-source)
- **Collection**: Dynamic creation per document upload
- **Metadata**: Store document ID, chunk ID, source, page number
- **Indexing**: Support similarity search with configurable K
- **Output**: Ready for retrieval

### 4.2 Question Answering Pipeline

#### FR-QA-001: Retrieval
- **Requirement**: Fetch top-K similar chunks for a query
- **K Value**: Configurable (default: 4)
- **Similarity Metric**: Cosine similarity on embeddings
- **Output**: List of Document chunks with similarity scores

#### FR-QA-002: Retrieval Evaluation
- **Model**: Use OpenAI gpt-4.1-mini for evaluation
- **Evaluation Method**: Score each retrieved document for relevance
- **Output**: Confidence score [0.0, 1.0] and reasoning
- **Thresholds**:
  - Upper threshold: 0.7 (marks as relevant)
  - Lower threshold: 0.3 (marks as irrelevant)

#### FR-QA-003: Decision Logic
- **Correct**: If ANY document scores > 0.7 → Use internal knowledge refinement
- **Incorrect**: If ALL documents score < 0.3 → Discard and use web search
- **Ambiguous**: If mixed scores → Use both internal + external knowledge
- **Output**: Decision verdict + reasoning

#### FR-QA-004: Knowledge Refinement
- **Process**:
  1. Decompose documents into sentences (minimum 20 characters)
  2. Score each sentence for relevance using LLM
  3. Filter sentences scoring > 0.5
  4. Recompose into cleaned context
- **Output**: Refined, focused knowledge string

#### FR-QA-005: Web Search Fallback
- **Trigger**: When verdict is INCORRECT or AMBIGUOUS
- **Process**:
  1. Rewrite query into search keywords using LLM
  2. Execute web search (Google Custom Search or Tavily)
  3. Fetch top-K results (K=3)
  4. Extract and refine content
  5. Apply same knowledge refinement process
- **Output**: External knowledge string

#### FR-QA-006: Generation
- **Model**: OpenAI gpt-4.1-mini
- **Input**: Original question + refined knowledge context
- **Output**: Coherent, factual answer
- **Constraints**: Answer must cite knowledge sources

---

## 5. NON-FUNCTIONAL REQUIREMENTS

### 5.1 Performance

#### NFR-PERF-001: Latency
- Document ingestion (10 pages): < 30 seconds
- Single query processing: < 10 seconds (end-to-end)
- Retrieval alone: < 2 seconds
- Web search (if triggered): < 5 seconds
- Response streaming: Supported for generation

#### NFR-PERF-002: Throughput
- Support simultaneous document uploads (queued sequentially)
- Support concurrent queries (min 5 simultaneous)
- Vector search on 10K+ chunks: < 1 second

#### NFR-PERF-003: Scalability
- Support vector databases up to 100K chunks
- Configurable batch sizes for embeddings
- Horizontal scaling ready (stateless backend design)

### 5.2 Reliability

#### NFR-REL-001: Error Handling
- All failures must be recoverable or gracefully degraded
- Specific error messages returned to frontend
- Logging of all errors for debugging

#### NFR-REL-002: Data Integrity
- Vector embeddings never corrupted during storage
- Chunks maintain referential integrity to source documents
- No data loss during network interruptions

#### NFR-REL-003: Availability
- Backend uptime: 99%+ during deployment window
- Graceful handling of API rate limits (OpenAI, web search)
- Fallback behavior when services unavailable

### 5.3 Security

#### NFR-SEC-001: API Keys
- All API keys (OpenAI, web search) stored in environment variables
- Never logged or exposed in traces
- Rotated regularly

#### NFR-SEC-002: Input Validation
- All user inputs (questions, files) validated and sanitized
- File upload size limits enforced
- Prompt injection prevention

#### NFR-SEC-003: Data Privacy
- User queries not persisted long-term
- Uploaded documents stored only during session
- No telemetry to third parties beyond API calls

### 5.4 Maintainability

#### NFR-MAINT-001: Code Organization
- Clear separation of concerns
- Modules responsible for single tasks
- No circular dependencies
- Testability from ground up

#### NFR-MAINT-002: Documentation
- Architecture documented (these documents)
- All prompts documented with rationale
- API contracts documented
- Deployment procedures documented

#### NFR-MAINT-003: Debugging
- Structured logging with severity levels
- Execution traces exportable for inspection
- Clear error messages for troubleshooting

---

## 6. ASSUMPTIONS

### 6.1 Technology Stack

- **Backend Runtime**: Python 3.10+
- **API Framework**: FastAPI
- **Frontend Framework**: React 18+ with TypeScript
- **Build Tool**: Vite
- **LLM Provider**: OpenAI API (not local/self-hosted)
- **Embeddings**: OpenAI embeddings model
- **Vector Database**: Qdrant Cloud (Free Tier)
- **Web Search**: Tavily Search API or Google Custom Search
- **Hosting**: 
  - Backend: Render.com
  - Frontend: Netlify
- **Package Managers**: pip (Python), npm (Node.js)

### 6.2 User Behavior

- **Single User**: System assumes single-user (no concurrent sessions)
- **Session Duration**: Average session < 1 hour
- **Document Size**: Average document < 50 pages
- **Query Complexity**: Average questions 5-50 words
- **Internet Connectivity**: Assumes stable internet for API calls

### 6.3 Data Assumptions

- **PDF Structure**: Standard PDFs without complex layouts
- **Text Encoding**: UTF-8 or standard encodings
- **Language**: English-only (though design allows multilingual)
- **Knowledge Source**: General knowledge (not proprietary/sensitive)

### 6.4 API Assumptions

- OpenAI API available and functional
- Web search API available and functional
- Rate limits not exceeded during normal usage
- Network latency < 5 seconds to all external services

---

## 7. CONSTRAINTS

### 7.1 Technical Constraints

#### TC-001: Vector Database
- **Constraint**: Must use Qdrant as specified
- **Implication**: Design must accommodate Qdrant's data model
- **Workaround**: None (hard requirement)

#### TC-002: LLM Provider
- **Constraint**: Must use OpenAI API for all LLM tasks
- **Implication**: Dependent on OpenAI service availability
- **Cost Implication**: API calls incur costs

#### TC-003: Embedding Consistency
- **Constraint**: All embeddings must use text-embedding-3-large
- **Implication**: Changing model requires re-embedding entire database
- **Design Impact**: Embedding model must be versioned in metadata

#### TC-004: No Local LLMs
- **Constraint**: Cannot use local/self-hosted LLMs
- **Implication**: Always requires internet access
- **Performance Impact**: Network latency affects response time

### 7.2 Deployment Constraints

#### DC-001: Render Backend Deployment
- **Memory Limit**: 512MB free tier / scalable paid
- **Timeout**: 30-second request timeout on free tier
- **Implication**: Long-running operations must be async or stream results

#### DC-002: Netlify Frontend Deployment
- **Bundle Size**: <500KB recommended
- **Build Time**: <15 minutes
- **Implication**: Optimize dependencies, lazy-load components

#### DC-003: Qdrant Deployment
- **Deployment**: Qdrant Cloud (Free Tier) for both development and production
- **Data Persistence**: Managed by Qdrant Cloud

### 7.3 Time Constraints

#### TimC-001: Project Completion
- **Constraint**: This is a university assignment with deadline
- **Implication**: Must prioritize Phase 1 (core CRAG) before Phase 2 (UI polish)
- **MVP Focus**: Core functionality over edge cases

#### TimC-002: Development Window
- **Constraint**: Limited development time
- **Implication**: Use existing libraries heavily (LangChain, LangGraph)
- **No Custom Implementations**: Unless absolutely necessary

---

## 8. FUTURE IMPROVEMENTS (POST-ASSIGNMENT)

### 8.1 Advanced Features

1. **Conversation Memory**: Maintain multi-turn conversation context
2. **Query Expansion**: Automatically expand queries to find more relevant documents
3. **Document Re-ranking**: Advanced re-ranking strategies beyond simple scoring
4. **Semantic Caching**: Cache similar queries to avoid re-computation
5. **Custom Evaluator Training**: Fine-tune retrieval evaluator on user data
6. **Multi-Hop Retrieval**: Support complex reasoning across multiple documents

### 8.2 Performance Optimizations

1. **Embedding Caching**: Cache embedding results to reduce OpenAI API calls
2. **Result Caching**: Cache identical queries for 24 hours
3. **Batch Processing**: Process multiple documents in parallel
4. **Streaming Generation**: Stream LLM output token-by-token
5. **Incremental Indexing**: Index new documents without re-indexing all

### 8.3 UI/UX Improvements

1. **Dark Mode**: Add dark theme option
2. **Export Traces**: Allow users to download execution traces as JSON
3. **Prompt Templates**: Save and reuse custom system prompts
4. **Settings Panel**: Configure thresholds, model selection, etc.
5. **Collaborative Features**: Share sessions and documents with others

### 8.4 Monitoring & Analytics

1. **Usage Analytics**: Track queries, document types, decision distribution
2. **Performance Monitoring**: Track latency, error rates, costs
3. **Cost Tracking**: Monitor OpenAI API spending
4. **Quality Metrics**: Track answer quality through user feedback
5. **Alert System**: Alert on high error rates or API failures

### 8.5 Research & Evaluation

1. **A/B Testing**: Compare different threshold values
2. **Ablation Studies**: Measure impact of each component
3. **Dataset Benchmarking**: Test against standard RAG benchmarks
4. **User Studies**: Gather user feedback on visualization
5. **Publication**: Submit findings to research venues

---

## 9. GRADING RUBRIC ALIGNMENT

### Expected Rubric Categories

1. **Functionality** (25%)
   - CRAG workflow complete
   - All three decision paths working
   - Web search fallback operational
   - Generation working end-to-end

2. **Code Quality** (20%)
   - Clean architecture
   - Modular design
   - Proper error handling
   - Comprehensive logging

3. **Documentation** (20%)
   - Architecture documents
   - API documentation
   - Inline code comments
   - Deployment guide

4. **Visualization & UI** (20%)
   - Execution trace visualization
   - Expandable node details
   - Real-time animation
   - Professional design

5. **Testing** (15%)
   - Unit tests
   - Integration tests
   - End-to-end tests
   - Test coverage > 70%

---

## 10. SUCCESS METRICS

### Functional Success
- ✅ CRAG pipeline executes all three decision paths
- ✅ Execution traces contain all required information
- ✅ Web search successfully supplements retrieval
- ✅ Generation produces coherent answers
- ✅ Document ingestion pipeline works end-to-end

### Quality Success
- ✅ Code follows clean architecture principles
- ✅ 70%+ test coverage
- ✅ Average response time < 10 seconds
- ✅ Zero critical bugs in core pipeline
- ✅ All API endpoints documented

### UX Success
- ✅ Visualization shows real-time execution
- ✅ Users understand what system is doing
- ✅ Error messages are clear and actionable
- ✅ No confusing or redundant UI elements
- ✅ Mobile-responsive design

---

## Summary

This CRAG system is a **production-quality educational application** that demonstrates the complete Corrective RAG workflow. It combines a robust backend pipeline with a beautiful, intuitive frontend visualization that teaches users about RAG correctness and error correction strategies.

The architecture prioritizes **clarity, modularity, and learning** over complex optimizations, making it ideal for an academic assignment while maintaining design principles suitable for real-world deployment.

---

**Document Version**: 1.0  
**Last Updated**: June 2026  
**Status**: Approved for Implementation
