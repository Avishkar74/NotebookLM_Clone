# **13\_FOLDER\_STRUCTURE.md**

# **Repository Structure**

**Version:** 1.0

---

# **Purpose**

This document defines the complete repository structure for the Corrective RAG (CRAG) application.

The project is organized following a modular architecture where every directory has a single responsibility. This separation improves maintainability, scalability, testing, and collaboration.

The repository consists of two independent applications:

* **Backend** (FastAPI)  
* **Frontend** (React \+ Vite)

along with documentation and deployment resources.

---

# **Repository Overview**

crag-system/

├── backend/

├── frontend/

├── docs/

├── assets/

├── scripts/

├── .gitignore

├── README.md

└── docker-compose.yml

---

# **Root Directory**

## **backend/**

Contains the FastAPI application implementing the complete CRAG pipeline.

Responsible for

* Document ingestion  
* Embeddings  
* Vector database interaction  
* Retrieval  
* Retrieval evaluation  
* Knowledge refinement  
* Query rewriting  
* Web search  
* Answer generation  
* Execution traces

---

## **frontend/**

Contains the React \+ Vite application.

Responsible for

* Dashboard UI  
* Chat Interface  
* Pipeline Visualization  
* Node Inspector  
* Document Upload UI

---

## **docs/**

Contains all project documentation.

Example

docs/

01\_PROJECT\_SCOPE.md

02\_SYSTEM\_ARCHITECTURE.md

03\_CRAG\_PIPELINE.md

...

13\_FOLDER\_STRUCTURE.md

14\_IMPLEMENTATION\_PHASES.md

---

## **assets/**

Stores static project assets.

Example

assets/

images/

icons/

logos/

screenshots/

wireframes/

---

## **scripts/**

Utility scripts.

Example

scripts/

setup.sh

setup.ps1

seed\_qdrant.py

reset\_database.py

---

# **Backend Structure**

backend/

├── app/

├── tests/

├── uploads/

├── requirements.txt

├── .env.example

└── README.md

---

# **app/**

Contains the application source code.

app/

├── api/

├── config/

├── core/

├── graph/

├── ingestion/

├── nodes/

├── prompts/

├── schemas/

├── services/

├── vectorstore/

├── execution\_trace/

├── utils/

├── models/

├── dependencies/

├── main.py

└── \_\_init\_\_.py

---

# **api/**

Contains FastAPI route definitions.

api/

documents.py

query.py

trace.py

health.py

Responsibilities

* Request validation  
* Response serialization  
* Route definitions

No business logic should exist here.

---

# **config/**

Stores configuration.

Example

config/

settings.py

constants.py

logging.py

Responsibilities

* Environment variables  
* Model configuration  
* Chunk sizes  
* Top-K  
* Thresholds

---

# **core/**

Contains application-wide utilities.

Example

core/

exceptions.py

middleware.py

security.py

Responsibilities

* Error handling  
* Middleware  
* Shared infrastructure

---

# **graph/**

Implements the CRAG execution graph.

Example

graph/

pipeline.py

router.py

state.py

Responsibilities

* Pipeline orchestration  
* Node execution order  
* Branch routing  
* State transitions

---

# **ingestion/**

Responsible for document ingestion.

ingestion/

loader.py

parser.py

chunker.py

embedder.py

Responsibilities

* PDF loading  
* TXT loading  
* Text extraction  
* Chunk creation  
* Embedding generation

---

# **nodes/**

Contains every CRAG node.

nodes/

retriever.py

evaluator.py

refiner.py

query\_rewriter.py

web\_search.py

generator.py

Each file contains exactly one node.

Responsibilities

* Node execution  
* Input validation  
* Output generation

---

# **prompts/**

Stores all LLM prompt templates.

prompts/

evaluator.py

refiner.py

query\_rewriter.py

generator.py

Responsibilities

* Prompt templates  
* Prompt variables  
* Prompt builders

No API calls should exist here.

---

# **schemas/**

Contains Pydantic models.

schemas/

document.py

query.py

response.py

trace.py

node.py

Responsibilities

* Request models  
* Response models  
* Validation  
* Serialization

---

# **services/**

Contains business logic.

services/

document\_service.py

retrieval\_service.py

generation\_service.py

trace\_service.py

Responsibilities

* Coordinate multiple nodes  
* Execute workflows  
* Manage application logic

---

# **vectorstore/**

Handles all Qdrant interaction.

vectorstore/

client.py

collections.py

search.py

embeddings.py

Responsibilities

* Connect to Qdrant  
* Store embeddings  
* Similarity search  
* Collection management

No retrieval logic belongs here.

---

# **execution\_trace/**

Responsible for execution traces.

execution\_trace/

manager.py

events.py

serializer.py

Responsibilities

* Trace creation  
* Node events  
* Event ordering  
* Serialization

---

# **utils/**

General helper utilities.

utils/

file\_utils.py

timer.py

text.py

logger.py

Responsibilities

* Shared helper functions

No business logic.

---

# **models/**

Contains AI model wrappers.

models/

openai\_client.py

embedding\_client.py

tavily\_client.py

Responsibilities

* API communication  
* Retry logic  
* Rate limiting  
* Response parsing

---

# **dependencies/**

Dependency injection.

dependencies/

database.py

services.py

Responsibilities

* Dependency management  
* Singleton creation

---

# **uploads/**

Temporary upload directory.

uploads/

temp/

Responsibilities

* Temporary storage only

Files are removed after ingestion.

---

# **tests/**

Backend tests.

tests/

unit/

integration/

fixtures/

test\_data/

---

## **unit/**

Unit tests.

Example

unit/

test\_retriever.py

test\_refiner.py

test\_generator.py

---

## **integration/**

Integration tests.

Example

integration/

test\_pipeline.py

test\_upload.py

test\_query.py

---

## **fixtures/**

Reusable test fixtures.

---

## **test\_data/**

Sample documents.

test\_data/

sample.pdf

sample.txt

---

# **Frontend Structure**

frontend/

├── public/

├── src/

├── package.json

├── vite.config.ts

├── tsconfig.json

└── .env.example

---

# **src/**

Main frontend source.

src/

├── assets/

├── components/

├── hooks/

├── layouts/

├── pages/

├── services/

├── store/

├── types/

├── utils/

├── App.tsx

└── main.tsx

---

# **assets/**

Static frontend assets.

assets/

icons/

images/

fonts/

---

# **components/**

Reusable UI components.

components/

documents/

chat/

pipeline/

inspector/

common/

---

## **documents/**

UploadCard.tsx

ProcessingQueue.tsx

CompletedDocuments.tsx

---

## **chat/**

ChatWindow.tsx

Message.tsx

ProcessingIndicator.tsx

ChatInput.tsx

---

## **pipeline/**

PipelineGraph.tsx

PipelineNode.tsx

PipelineEdge.tsx

---

## **inspector/**

NodeInspector.tsx

MetadataPanel.tsx

OutputPanel.tsx

---

## **common/**

Shared UI.

Button.tsx

Card.tsx

Modal.tsx

Spinner.tsx

---

# **hooks/**

Custom React hooks.

hooks/

useUpload.ts

useQuery.ts

useExecutionTrace.ts

---

# **layouts/**

Dashboard layout.

layouts/

DashboardLayout.tsx

---

# **pages/**

Contains pages.

Since the application is a single-page dashboard,

only one page exists.

pages/

Dashboard.tsx

---

# **services/**

API communication.

services/

api.ts

documentService.ts

queryService.ts

traceService.ts

Responsibilities

* REST API calls  
* Request handling  
* Error handling

---

# **store/**

Global state.

store/

chatStore.ts

documentStore.ts

pipelineStore.ts

uiStore.ts

Responsibilities

* Application state  
* Selected node  
* Execution trace  
* Upload queue

---

# **types/**

TypeScript interfaces.

types/

document.ts

trace.ts

query.ts

---

# **utils/**

Frontend helpers.

utils/

format.ts

colors.ts

animations.ts

---

# **Configuration Files**

## **Backend**

requirements.txt

.env.example

README.md

---

## **Frontend**

package.json

vite.config.ts

tsconfig.json

.env.example

---

# **Responsibility Summary**

| Folder | Responsibility |
| ----- | ----- |
| backend/app/api | FastAPI routes |
| backend/app/graph | CRAG orchestration |
| backend/app/ingestion | Document processing |
| backend/app/nodes | Individual CRAG nodes |
| backend/app/prompts | Prompt templates |
| backend/app/services | Business logic |
| backend/app/vectorstore | Qdrant integration |
| backend/app/execution\_trace | Execution events |
| backend/app/models | External AI clients |
| frontend/components | UI Components |
| frontend/services | Backend communication |
| frontend/store | Global application state |
| frontend/pages | Dashboard |
| docs | Documentation |
| assets | Images and resources |
| scripts | Utility scripts |

---

# **Architectural Principles**

The repository follows these principles:

* Single Responsibility Principle  
* Clear separation between frontend and backend  
* Modular CRAG node implementation  
* Business logic isolated from API routes  
* Prompt templates separated from model execution  
* Execution trace treated as a first-class component  
* Independent deployment of frontend and backend  
* Easily extensible structure for future CRAG features

Every folder has a clearly defined responsibility, ensuring that new functionality can be added without introducing unnecessary coupling or affecting unrelated parts of the system.

