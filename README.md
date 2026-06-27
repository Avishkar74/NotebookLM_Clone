# Corrective RAG (CRAG) Dashboard

[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-8-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)
[![FastAPI](https://img.shields.io/badge/FastAPI-Backend-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![Qdrant](https://img.shields.io/badge/Qdrant-Vector%20DB-FF6F61?logo=qdrant&logoColor=white)](https://qdrant.tech/)
[![OpenAI](https://img.shields.io/badge/OpenAI-API-000000?logo=openai&logoColor=white)](https://platform.openai.com/)
[![Render](https://img.shields.io/badge/Backend-Render-46E3B7?logo=render&logoColor=white)](https://render.com/)
[![Netlify](https://img.shields.io/badge/Frontend-Netlify-00C7B7?logo=netlify&logoColor=white)](https://www.netlify.com/)

An educational, production-deployed **Corrective Retrieval-Augmented Generation (CRAG)** dashboard inspired by NotebookLM-style workflows. The app shows how a question moves through retrieval, evaluation, routing, refinement, web search fallback, and final generation while exposing the execution trace in a visual pipeline.

## Highlights

- Interactive CRAG pipeline visualization with live node state
- Session-scoped document ingestion and querying
- In-memory upload handling, with no raw file persistence on disk
- Qdrant-backed vector retrieval with derived chunk storage
- Correct / Ambiguous / Incorrect routing with traceable decisions
- FastAPI backend and React + Vite frontend
- Production deployment on Render + Netlify

## Architecture

```mermaid
flowchart LR
  U[User] --> F[Frontend on Netlify]
  F -->|Upload PDF/TXT| B[FastAPI Backend on Render]
  F -->|Ask Question| B
  B --> Q[Qdrant Vector DB]
  B --> O[OpenAI API]
  B --> T[Tavily Web Search]
  B --> V[Execution Trace Store]
  B --> S[Session-scoped In-memory State]
```

## How It Works

### Ingestion Flow

```mermaid
sequenceDiagram
  participant User
  participant UI as Frontend
  participant API as FastAPI
  participant Mem as In-memory Session Queue
  participant Loader as PDF/TXT Parser
  participant Qdrant as Qdrant

  User->>UI: Upload document
  UI->>API: POST /api/documents/upload (file + session_id)
  API->>Mem: Queue upload bytes for current session
  Mem->>Loader: Parse bytes from memory
  Loader->>API: Extract text + chunks
  API->>Qdrant: Store embeddings + derived chunk metadata
  API->>UI: Status updates until COMPLETED or FAILED
```

### Query Flow

```mermaid
flowchart TD
  Q[User question] --> R[Retrieve top-K chunks from Qdrant]
  R --> E[Evaluate chunk relevance]
  E -->|CORRECT| K[Knowledge Refinement]
  E -->|AMBIGUOUS| K2[Knowledge Refinement + Web Search]
  E -->|INCORRECT| W[Web Search / Rewrite]
  K --> G[Final Answer Generation]
  K2 --> G
  W --> G
  G --> X[Answer + Execution Trace]
```

## Decision Paths

- **Correct**: internal knowledge is sufficient, so the pipeline refines the retrieved context and generates an answer.
- **Ambiguous**: internal knowledge is partially useful, so the pipeline combines refined internal context with external search.
- **Incorrect**: internal retrieval is not trustworthy, so the pipeline falls back to web search / rewrite.

## Project Structure

```text
backend/   FastAPI app, ingestion, retrieval, evaluation, traces
frontend/  React dashboard, chat UI, document queue, graph visualizer
docs/      Architecture, pipeline, deployment, and implementation notes
```

## Tech Stack

- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS, React Flow
- **Backend**: FastAPI, Python, Pydantic
- **Vector DB**: Qdrant Cloud
- **LLM / Embeddings**: OpenAI API
- **Web Search**: Tavily API
- **Deployment**: Netlify for frontend, Render for backend

## Privacy and Session Model

- The browser keeps only a **session id** in `sessionStorage`
- Raw uploads are processed **in memory**
- Raw files are not written to disk
- Qdrant stores only embeddings and derived chunk payloads
- Session cleanup removes expired session data after the TTL window

## Local Setup

### Backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

## Environment Variables

### Backend

```env
OPENAI_API_KEY=sk-...
QDRANT_URL=https://your-cluster.cloud.qdrant.io
QDRANT_API_KEY=...
QDRANT_COLLECTION=crag_documents
TAVILY_API_KEY=...
ALLOWED_ORIGINS=https://your-netlify-site.netlify.app
FRONTEND_URL=https://your-netlify-site.netlify.app
BACKEND_URL=https://your-render-service.onrender.com
```

### Frontend

```env
VITE_API_URL=https://your-render-service.onrender.com/api
```

## Deployment

- **Frontend**: deploy `frontend/` on Netlify
  - Build command: `npm run build`
  - Publish directory: `dist`
- **Backend**: deploy `backend/` on Render
  - Start command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`

## Documentation

- [Project Scope](docs/01_PROJECT_SCOPE.md)
- [System Architecture](docs/02_SYSTEM_ARCHITECTURE.md)
- [CRAG Pipeline](docs/03_CRAG_PIPELINE.md)
- [Frontend Architecture](docs/05_FRONTEND_ARCHITECTURE.md)
- [API Contract](docs/06_API_CONTRACT.md)
- [Execution Trace](docs/07_EXECUTION_TRACE.md)
- [Vector Database](docs/08_VECTOR_DATABASE.md)
- [Prompts](docs/09_PROMPTS.md)
- [UI Design](docs/10_UI_DESIGN.md)
- [Deployment Guide](docs/11_DEPLOYMENT.md)

## Notes

- The app is designed as a single-dashboard educational experience.
- The graph view is driven by real execution trace data, not a hardcoded animation.
- The ingestion queue and query flow are session-scoped, which keeps the workspace isolated per browser session.
