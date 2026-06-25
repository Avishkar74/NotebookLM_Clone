# 11_DEPLOYMENT.md

## Deployment & Local Setup Guide

This document defines the deployment architecture and configuration details for both local development and production environments of the Corrective RAG (CRAG) system.

---

## 1. PRODUCTION DEPLOYMENT ARCHITECTURE

The production environment consists of the following components:

* **Frontend**: Hosted on **Netlify** (static SPA bundle).
* **Backend**: Hosted on **Render** (FastAPI web server).
* **LLM Provider**: **OpenAI Chat API** (Model: `gpt-4.1-mini`).
* **Embedding Model**: **OpenAI Embeddings API** (Model: `text-embedding-3-large`).
* **Vector Database**: **Qdrant Cloud (Free Tier)**.
* **Web Search**: **Tavily API**.

---

## 2. VECTOR DATABASE CONFIGURATION (QDRANT CLOUD)

We use **Qdrant Cloud** instead of self-hosting or using a local Docker instance. This ensures database availability, simplifies setup, and guarantees persistence across sessions.

### Step-by-Step Qdrant Cloud Setup:
1. Navigate to [Qdrant Cloud Console](https://cloud.qdrant.io) and register for a free account.
2. Create a new Free Tier Cluster.
3. Once the cluster is active, retrieve the **Cluster URL** (e.g., `https://<your-cluster-id>.cloud.qdrant.io`).
4. Generate a new **API Key** for authentication.
5. Store these credentials safely and configure them in your environment variables.

---

## 3. ENVIRONMENT VARIABLES CONFIGURATION

Both the backend and frontend are configured dynamically via environment variables.

### 3.1 Backend Environment Variables (`backend/.env`)

Create a `.env` file in the `backend/` directory based on the following template:

```env
# App Configuration
ENVIRONMENT=development
LOG_LEVEL=INFO
PORT=8000

# OpenAI Configuration
OPENAI_API_KEY=sk-...

# Qdrant Cloud Configuration
QDRANT_URL=https://<your-cluster-id>.cloud.qdrant.io
QDRANT_API_KEY=<your-qdrant-api-key>
QDRANT_COLLECTION=crag_documents

# External Web Search
TAVILY_API_KEY=tvly-...

# CORS Configuration
ALLOWED_ORIGINS=http://localhost:5173,https://crag-app.netlify.app
```

### 3.2 Frontend Environment Variables (`frontend/.env`)

Create a `.env` file in the `frontend/` directory based on the following template:

```env
VITE_API_URL=http://localhost:8000/api
```

For production deployment, set `VITE_API_URL` to your Render backend API URL.

---

## 4. LOCAL DEVELOPMENT SETUP

To run the application locally, follow these instructions:

### Prerequisites:
- Python 3.10+ installed
- Node.js 18+ installed
- Active Qdrant Cloud free-tier cluster
- OpenAI API Key
- Tavily API Key

### Backend Setup:
1. Navigate to the `backend/` directory.
2. Create a virtual environment:
   ```bash
   python -m venv .venv
   ```
3. Activate the virtual environment:
   - On Windows (PowerShell): `.venv\Scripts\Activate.ps1`
   - On Mac/Linux: `source .venv/bin/activate`
4. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
5. Configure the `backend/.env` file.
6. Start the FastAPI development server:
   ```bash
   uvicorn app.main:main --reload
   ```

### Frontend Setup:
1. Navigate to the `frontend/` directory.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Configure the `frontend/.env` file.
4. Start the Vite dev server:
   ```bash
   npm run dev
   ```
5. Open your browser and navigate to `http://localhost:5173`.
