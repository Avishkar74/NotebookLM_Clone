# 05_FRONTEND_ARCHITECTURE.md

## Overview

The frontend is a **single-page application (SPA)** built with React + Vite + TypeScript + Tailwind CSS v4.

It is NOT a traditional multi-page application. Everything happens within a single dashboard view.

The architecture prioritizes:
- **Real-time synchronization** with backend execution
- **Clean separation of concerns** between state and UI
- **Component reusability** and composability
- **Type safety** through TypeScript
- **Responsive design** with mobile-friendly considerations
- **Accessible interactions** (WCAG compliance)

---

## Design Principles

### 1. Single-Page Dashboard

```
┌──────────────────────────────────────────────────────────────────┐
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                    Dashboard Container                   │   │
│  │                                                          │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │   │
│  │  │  Documents   │  │     Chat     │  │   Pipeline   │   │   │
│  │  │    Panel     │  │   Panel      │  │   Panel      │   │   │
│  │  │              │  │              │  │              │   │   │
│  │  └──────────────┘  └──────────────┘  └──────────────┘   │   │
│  │                                                          │   │
│  │  ┌─────────────────────────────────────────────────┐    │   │
│  │  │        Node Output Inspector Panel              │    │   │
│  │  │        (Bottom, Expandable)                      │    │   │
│  │  └─────────────────────────────────────────────────┘    │   │
│  │                                                          │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

No page navigation. No routing. No multi-step flows.

Everything is in one view.

### 2. Unidirectional Data Flow

```
┌──────────────────────────────────────────┐
│         User Action                      │
│  (Click button, type message, etc)       │
└────────────┬─────────────────────────────┘
             │
             ▼
┌──────────────────────────────────────────┐
│      Action Creator                      │
│  (Dispatch action to update state)       │
└────────────┬─────────────────────────────┘
             │
             ▼
┌──────────────────────────────────────────┐
│      State Management                    │
│  (React Context + useReducer)            │
└────────────┬─────────────────────────────┘
             │
             ▼
┌──────────────────────────────────────────┐
│      Component Re-render                 │
│  (Components consume state)              │
└────────────┬─────────────────────────────┘
             │
             ▼
┌──────────────────────────────────────────┐
│      UI Updates                          │
│  (User sees changes)                     │
└──────────────────────────────────────────┘
```

### 3. Component Composition Over Inheritance

Each component is small and focused.

Components compose to form larger features.

Example:
```
<Dashboard>
  <DocumentsPanel>
    <UploadArea />
    <ProcessingQueue />
    <CompletedDocuments />
  </DocumentsPanel>
  <ChatPanel>
    <MessageList />
    <ChatInput />
  </ChatPanel>
  <PipelinePanel>
    <ExecutionGraph />
  </PipelinePanel>
  <NodeOutputInspector />
</Dashboard>
```

### 4. Type-First Development

All data structures are defined in TypeScript interfaces.

No `any` types. No loose types.

Types serve as contracts between components.

---

## Folder Structure

```
frontend/
├── src/
│   ├── main.tsx                         # Entry point
│   ├── App.tsx                          # Root component
│   │
│   ├── pages/
│   │   ├── __init__.ts
│   │   └── Dashboard.tsx                # Single page
│   │
│   ├── components/
│   │   ├── __init__.ts
│   │   │
│   │   ├── layout/
│   │   │   ├── __init__.ts
│   │   │   ├── Dashboard.tsx            # Container
│   │   │   ├── DocumentsPanel.tsx       # Left panel
│   │   │   ├── ChatPanel.tsx            # Center panel
│   │   │   ├── PipelinePanel.tsx        # Right panel
│   │   │   └── NodeInspector.tsx        # Bottom panel
│   │   │
│   │   ├── documents/
│   │   │   ├── __init__.ts
│   │   │   ├── UploadArea.tsx           # Drag-drop upload
│   │   │   ├── ProcessingQueue.tsx      # Files being processed
│   │   │   ├── CompletedDocuments.tsx   # Processed files
│   │   │   ├── DocumentCard.tsx         # Single document
│   │   │   └── IngestionProgress.tsx    # Detailed progress
│   │   │
│   │   ├── chat/
│   │   │   ├── __init__.ts
│   │   │   ├── MessageList.tsx          # Conversation
│   │   │   ├── ChatMessage.tsx          # Single message
│   │   │   ├── ChatInput.tsx            # Input box + send
│   │   │   ├── ProcessingIndicator.tsx  # "Retrieving..."
│   │   │   └── EmptyState.tsx           # Initial state
│   │   │
│   │   ├── pipeline/
│   │   │   ├── __init__.ts
│   │   │   ├── ExecutionGraph.tsx       # Main graph view
│   │   │   ├── GraphNode.tsx            # Individual node
│   │   │   ├── GraphEdge.tsx            # Connection
│   │   │   ├── NodeAnimator.tsx         # Animation logic
│   │   │   └── BranchVisualizer.tsx     # Correct/Ambig/Incorrect branches
│   │   │
│   │   ├── inspector/
│   │   │   ├── __init__.ts
│   │   │   ├── NodeOutputInspector.tsx  # Main inspector
│   │   │   ├── OutputViewer.tsx         # Output display
│   │   │   ├── MetadataViewer.tsx       # Metadata tabs
│   │   │   └── NodeTabs.tsx             # Tab switching
│   │   │
│   │   └── common/
│   │       ├── __init__.ts
│   │       ├── Button.tsx
│   │       ├── Card.tsx
│   │       ├── Badge.tsx
│   │       ├── Spinner.tsx
│   │       ├── ErrorBoundary.tsx
│   │       └── Tooltip.tsx
│   │
│   ├── hooks/
│   │   ├── __init__.ts
│   │   ├── useAppState.ts               # State context hook
│   │   ├── useDocuments.ts              # Document operations
│   │   ├── useChat.ts                   # Chat operations
│   │   ├── useExecution.ts              # Trace/execution tracking
│   │   ├── useWebSocket.ts              # Real-time updates
│   │   └── useLocalStorage.ts           # Persistence
│   │
│   ├── contexts/
│   │   ├── __init__.ts
│   │   ├── AppContext.tsx               # Main state context
│   │   ├── DocumentsContext.tsx         # Document state
│   │   ├── ChatContext.tsx              # Chat state
│   │   └── ExecutionContext.tsx         # Execution trace state
│   │
│   ├── reducers/
│   │   ├── __init__.ts
│   │   ├── documentsReducer.ts          # Documents state logic
│   │   ├── chatReducer.ts               # Chat state logic
│   │   └── executionReducer.ts          # Execution state logic
│   │
│   ├── services/
│   │   ├── __init__.ts
│   │   ├── api.ts                       # HTTP client
│   │   ├── documentService.ts           # Upload, list, delete
│   │   ├── questionService.ts           # Ask questions
│   │   ├── websocketService.ts          # WebSocket connection
│   │   └── storageService.ts            # LocalStorage operations
│   │
│   ├── types/
│   │   ├── __init__.ts
│   │   ├── api.ts                       # API request/response types
│   │   ├── domain.ts                    # Domain model types
│   │   ├── trace.ts                     # Execution trace types
│   │   ├── ui.ts                        # UI state types
│   │   └── index.ts                     # Export all types
│   │
│   ├── utils/
│   │   ├── __init__.ts
│   │   ├── formatting.ts                # Format timestamps, sizes
│   │   ├── validation.ts                # Input validation
│   │   ├── trace-utils.ts               # Trace building utilities
│   │   ├── animation.ts                 # Animation helpers
│   │   └── constants.ts                 # App constants
│   │
│   ├── styles/
│   │   ├── globals.css                  # Global styles
│   │   ├── theme.css                    # Design tokens
│   │   ├── layout.css                   # Layout utilities
│   │   └── animations.css               # Animation definitions
│   │
│   └── assets/
│       ├── icons/
│       ├── images/
│       └── fonts/
│
├── tests/
│   ├── unit/
│   │   ├── hooks/
│   │   ├── services/
│   │   └── utils/
│   ├── integration/
│   │   ├── components/
│   │   └── flows/
│   └── e2e/
│       ├── upload.e2e.ts
│       └── question.e2e.ts
│
├── index.html
├── vite.config.ts
├── tsconfig.json
├── package.json
└── .env.example
```

---

## State Management Architecture

### Principle

**Single source of truth for each domain.**

Three separate contexts:
- **DocumentsContext** → Document state
- **ChatContext** → Conversation state
- **ExecutionContext** → Execution trace state

Each has a reducer pattern for predictable state updates.

### State Structure

```typescript
// DocumentsState
{
  documents: Document[]                    // All processed documents
  uploadQueue: UploadingDocument[]         // Files being ingested
  selectedDocument: Document | null        // Currently selected
  error: Error | null                      // Upload errors
}

// ChatState
{
  messages: Message[]                      // Conversation history
  currentQuery: string                     // Input field value
  isLoading: boolean                       // Waiting for answer
  error: Error | null                      // Query errors
}

// ExecutionState
{
  trace: ExecutionTrace | null             // Current execution
  selectedNode: string | null              // Clicked node
  isExecuting: boolean                     // Processing query
  animations: {                            // Active animations
    [nodeId: string]: "active" | "complete"
  }
}
```

### Actions

**DocumentsActions:**
```typescript
UPLOAD_START(file, uploadId)
UPLOAD_PROGRESS(uploadId, stage, progress)
UPLOAD_COMPLETE(document)
UPLOAD_ERROR(uploadId, error)
DOCUMENTS_LOADED(documents)
DOCUMENT_DELETED(documentId)
SELECT_DOCUMENT(documentId)
```

**ChatActions:**
```typescript
SET_QUERY(text)
SEND_QUERY()
RECEIVE_ANSWER(answer, trace)
SET_LOADING(isLoading)
SET_ERROR(error)
CLEAR_ERROR()
```

**ExecutionActions:**
```typescript
START_EXECUTION(trace)
UPDATE_TRACE(newTrace)
COMPLETE_EXECUTION(trace)
SELECT_NODE(nodeId)
ANIMATE_NODE(nodeId, status)
CLEAR_TRACE()
```

### Data Flow Example: Send Question

```
User types question
    ↓
ChatInput.onChange()
    ↓
Dispatch SET_QUERY(text)
    ↓
User clicks Send
    ↓
ChatInput.onSubmit()
    ↓
Dispatch SEND_QUERY()
    ├─ Create API request
    ├─ Call POST /questions
    │
    └─ Start WebSocket listener for trace updates
        ↓
        Backend processes
        ↓
        WebSocket sends trace events
        ↓
        Dispatch UPDATE_TRACE(trace)
        ↓
        ExecutionContext updates
        ↓
        PipelinePanel re-renders with new node states
        ↓
Backend sends final answer
    ↓
Dispatch RECEIVE_ANSWER(answer, trace)
    ↓
ChatContext updates with new message
    ├─ MessageList re-renders
    ├─ Chat scrolls to bottom
    └─ ProcessingIndicator disappears
```

---

## Component Hierarchy

### Dashboard (Root Container)

```
<Dashboard>
  ├─ <AppProvider>
  │  ├─ <DocumentsProvider>
  │  ├─ <ChatProvider>
  │  ├─ <ExecutionProvider>
  │  │
  │  └─ <MainLayout>
  │     ├─ <DocumentsPanel>
  │     ├─ <ChatPanel>
  │     ├─ <PipelinePanel>
  │     └─ <NodeOutputInspector>
  │
  └─ <ErrorBoundary>
```

### DocumentsPanel

```
<DocumentsPanel>
├─ <UploadArea>
│  ├─ <DragDropZone>
│  └─ <FileInput>
│
├─ <ProcessingQueue>
│  └─ <IngestionProgress> (for each file being processed)
│     ├─ <ProgressStep>
│     │  ├─ <StepIcon>
│     │  ├─ <StepLabel>
│     │  └─ <StepStatus>
│     │
│     └─ (repeat for each stage)
│
└─ <CompletedDocuments>
   └─ <DocumentCard> (for each processed document)
      ├─ <DocumentIcon>
      ├─ <DocumentName>
      ├─ <DocumentMeta>
      └─ <DocumentActions>
```

### ChatPanel

```
<ChatPanel>
├─ <MessageList>
│  └─ <ChatMessage> (for each message)
│     ├─ <MessageAvatar>
│     ├─ <MessageContent>
│     └─ <MessageTimestamp>
│
├─ <ProcessingIndicator>
│  └─ Shows: "Retrieving..." → "Evaluating..." → "Generating..."
│
└─ <ChatInput>
   ├─ <InputField>
   ├─ <SendButton>
   └─ (Optional: character count, suggestions)
```

### PipelinePanel

```
<PipelinePanel>
├─ <ControlBar>
│  ├─ <ResetViewButton>
│  ├─ <ZoomControls>
│  └─ <ViewOptions>
│
└─ <ExecutionGraph>
   ├─ <GraphCanvas> (SVG)
   │  ├─ <GraphNode> (for each node)
   │  │  ├─ <NodeShape> (rectangle)
   │  │  ├─ <NodeLabel>
   │  │  ├─ <NodeStatus> (color, animation)
   │  │  └─ <NodeInteraction> (onClick, tooltip)
   │  │
   │  └─ <GraphEdge> (for each connection)
   │     ├─ <EdgePath> (SVG path)
   │     ├─ <EdgeLabel> (optional)
   │     └─ <EdgeAnimation> (flow animation)
   │
   └─ <BranchVisualizer>
      ├─ Shows Correct / Ambiguous / Incorrect branches
      ├─ Highlights active branch
      └─ Grays out inactive branches
```

### NodeOutputInspector

```
<NodeOutputInspector>
├─ <InspectorHeader>
│  ├─ <SelectedNodeName>
│  ├─ <CloseButton>
│  └─ <ExpandButton>
│
└─ <InspectorContent>
   ├─ <TabBar>
   │  ├─ <Tab>Output</Tab>
   │  ├─ <Tab>Metadata</Tab>
   │  └─ <Tab>Raw</Tab>
   │
   └─ <TabContent>
      ├─ <OutputView>
      │  └─ Varies by node type
      │
      ├─ <MetadataView>
      │  ├─ <MetadataRow> (for each metadata item)
      │  └─ <MetadataValue>
      │
      └─ <RawView>
         └─ JSON pretty-printer
```

---

## Component APIs

### UploadArea

```typescript
interface UploadAreaProps {
  onUpload: (files: File[]) => Promise<void>
  isLoading?: boolean
  error?: Error | null
}

// Events:
// - onUpload: File selected
// - onDrop: Files dropped
// - onError: Upload failed
```

### MessageList

```typescript
interface MessageListProps {
  messages: Message[]
  isLoading?: boolean
  processingStatus?: string  // "Retrieving..." | "Evaluating..." | etc
}

// Auto-scrolls to bottom when new messages arrive
// Shows processing indicator between last message and input
```

### ExecutionGraph

```typescript
interface ExecutionGraphProps {
  trace: ExecutionTrace | null
  selectedNode: string | null
  onNodeClick: (nodeId: string) => void
  isAnimating?: boolean
}

// Renders pipeline as interactive graph
// Animates active node
// Highlights selected node
// Shows active branch only
```

### NodeOutputInspector

```typescript
interface NodeOutputInspectorProps {
  node: TraceNode | null
  isExpanded?: boolean
  onToggleExpand?: () => void
}

// Shows node output, metadata, and raw data
// Only shows data from selected node
// Tabs for different views
```

---

## Real-Time Execution Updates

### Strategy

The backend sends execution updates via **WebSocket** or **polling**.

**Recommended: WebSocket** for real-time updates.

```
Frontend connects to WebSocket
    ↓
User asks question
    ↓
Frontend sends HTTP POST /questions
    ↓
Backend returns query_id + initial_trace
    ↓
Frontend subscribes to trace updates
    ↓
Backend processes CRAG pipeline
    ├─ Retriever node completes
    ├─ Backend sends: { event: "node_complete", node_id: "retriever", output: {...} }
    ├─ Frontend receives, updates trace
    ├─ PipelinePanel re-renders
    │
    ├─ Evaluator node completes
    ├─ Backend sends: { event: "node_complete", node_id: "evaluator", output: {...} }
    ├─ Frontend receives
    ├─ Starts next branch
    │
    └─ (repeat for all nodes)
    │
Backend sends final answer
    ├─ { event: "execution_complete", answer: "...", trace: {...} }
    │
Frontend updates ChatContext
    ├─ Shows answer in chat
    ├─ Shows complete trace
    └─ Allows node inspection
```

### WebSocket Message Format

```typescript
interface TraceUpdateMessage {
  event: "node_start" | "node_complete" | "execution_complete" | "error"
  query_id: string
  timestamp: string
  data: {
    node_id?: string
    node_name?: string
    status?: "active" | "complete"
    output?: Record<string, unknown>
    metadata?: Record<string, unknown>
    error?: {
      code: string
      message: string
    }
  }
}
```

### useWebSocket Hook

```typescript
function useWebSocket(queryId: string) {
  useEffect(() => {
    const ws = new WebSocket(`ws://localhost:8000/ws/trace/${queryId}`)
    
    ws.onmessage = (event) => {
      const message = JSON.parse(event.data)
      
      if (message.event === "node_complete") {
        dispatch(UPDATE_TRACE(message.data))
        dispatch(ANIMATE_NODE(message.data.node_id, "complete"))
      }
      
      if (message.event === "execution_complete") {
        dispatch(COMPLETE_EXECUTION(message.data.trace))
      }
    }
    
    return () => ws.close()
  }, [queryId])
}
```

---

## Styling Architecture

### Design Tokens

```css
/* colors */
--primary: #2563eb              /* Blue */
--primary-light: #dbeafe
--primary-dark: #1e40af

--success: #10b981             /* Green */
--warning: #f59e0b             /* Orange */
--error: #ef4444               /* Red */

--neutral-50: #fafafa
--neutral-100: #f3f4f6
--neutral-900: #111827

/* spacing */
--spacing-xs: 0.25rem
--spacing-sm: 0.5rem
--spacing-md: 1rem
--spacing-lg: 1.5rem
--spacing-xl: 2rem
--spacing-2xl: 3rem

/* typography */
--font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif
--font-mono: "Fira Code", monospace

--text-xs: 0.75rem
--text-sm: 0.875rem
--text-base: 1rem
--text-lg: 1.125rem
--text-xl: 1.25rem

/* shadows */
--shadow-sm: 0 1px 2px rgba(0,0,0,0.05)
--shadow-md: 0 4px 6px rgba(0,0,0,0.1)
--shadow-lg: 0 10px 15px rgba(0,0,0,0.1)

/* radius */
--radius-sm: 0.375rem
--radius-md: 0.5rem
--radius-lg: 0.75rem
--radius-xl: 1rem
```

### Utility Classes (Tailwind)

```
layout.css - Grid, Flex utilities
animations.css - Custom animations
components.css - Component-specific styles
```

### Component Styling

Each component has its own CSS module or inline Tailwind classes.

No global component styles.

Example:

```typescript
// ChatMessage.tsx
export function ChatMessage({ message }: Props) {
  return (
    <div className="flex gap-3 mb-4">
      <div className="flex-shrink-0">
        <Avatar src={message.avatar} />
      </div>
      <div className="flex-1">
        <p className="text-sm font-medium text-neutral-900">
          {message.author}
        </p>
        <p className="text-sm text-neutral-700 mt-1">
          {message.content}
        </p>
      </div>
    </div>
  )
}
```

---

## Animation Specifications

### Node Animations

**State:** Pending → Active → Complete

```css
/* Active node */
@keyframes pulse-glow {
  0% { box-shadow: 0 0 0 0 rgba(37, 99, 235, 0.7); }
  70% { box-shadow: 0 0 0 10px rgba(37, 99, 235, 0); }
  100% { box-shadow: 0 0 0 0 rgba(37, 99, 235, 0); }
}

.node.active {
  animation: pulse-glow 2s infinite;
  background: var(--primary);
  color: white;
}

/* Complete node */
.node.complete {
  background: var(--success);
  color: white;
}

/* Pending node */
.node.pending {
  background: var(--neutral-100);
  color: var(--neutral-600);
  border: 1px solid var(--neutral-300);
}
```

### Edge Flow Animation

```css
@keyframes flow {
  0% { stroke-dashoffset: 10; }
  100% { stroke-dashoffset: 0; }
}

.edge.active {
  stroke: var(--primary);
  stroke-width: 2;
  stroke-dasharray: 10;
  animation: flow 1s linear infinite;
}
```

### Message Entrance

```css
@keyframes slide-up {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.message {
  animation: slide-up 0.3s ease-out;
}
```

### Processing Indicator

```css
@keyframes dot-pulse {
  0%, 100% { opacity: 0.3; }
  50% { opacity: 1; }
}

.processing-dot {
  animation: dot-pulse 1.4s ease-in-out infinite;
}
```

---

## API Integration

### API Service

```typescript
// services/api.ts

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000"

const api = {
  // Document APIs
  uploadDocument: async (file: File): Promise<UploadResponse> => {
    const formData = new FormData()
    formData.append("file", file)
    return fetch(`${API_BASE}/documents/upload`, {
      method: "POST",
      body: formData
    }).then(r => r.json())
  },

  getDocuments: async (): Promise<Document[]> => {
    return fetch(`${API_BASE}/documents`).then(r => r.json())
  },

  deleteDocument: async (docId: string): Promise<void> => {
    return fetch(`${API_BASE}/documents/${docId}`, {
      method: "DELETE"
    })
  },

  // Question APIs
  askQuestion: async (query: string, docIds: string[]): Promise<QuestionResponse> => {
    return fetch(`${API_BASE}/questions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, document_ids: docIds })
    }).then(r => r.json())
  }
}
```

### Error Handling

```typescript
// All API errors follow this format
interface APIError {
  error: {
    code: string
    message: string
    http_status: number
    details: Record<string, unknown>
    recovery: {
      action: string
      after_seconds?: number
    }
  }
}

// Services convert API errors to user-friendly messages
async function uploadDocument(file: File) {
  try {
    const response = await api.uploadDocument(file)
    return response
  } catch (error) {
    if (error.error?.code === "FILE_TOO_LARGE") {
      return { error: "File is too large. Maximum 50MB." }
    }
    if (error.error?.code === "UNSUPPORTED_FORMAT") {
      return { error: "Only PDF and TXT files are supported." }
    }
    return { error: "Upload failed. Please try again." }
  }
}
```

---

## Interaction Patterns

### Upload Document

```
1. User drags file over upload zone
   → UploadArea shows active state (highlight)

2. User drops file
   → UploadArea.onUpload() called
   → Dispatch UPLOAD_START()

3. Frontend sends POST /documents/upload
   → Shows progress indicator in left panel

4. Backend returns IngestionStatus
   → Dispatch UPLOAD_PROGRESS()
   → Show: "Parse PDF..." → "Text Extracted..." → etc

5. Backend completes
   → Dispatch UPLOAD_COMPLETE()
   → Document moves from "Processing Queue" to "Completed Documents"
   → Upload area resets

6. User can now ask questions about the document
```

### Ask Question

```
1. User types in chat input
   → Dispatch SET_QUERY(text)

2. User clicks send
   → Dispatch SEND_QUERY()
   → Shows "Retrieving..." (processing indicator)
   → Message appears in chat with timestamp

3. Backend starts processing
   → WebSocket sends trace updates
   → PipelinePanel animates nodes

4. Retriever completes
   → Node glows blue
   → Status shows "active"
   → ProcessingIndicator updates to "Evaluating..."

5. Evaluator completes
   → Branches (Correct/Ambiguous/Incorrect)
   → Active branch highlights

6. Pipeline continues based on branch
   → Nodes animate through workflow

7. Generator completes
   → Final node turns green
   → Answer arrives in HTTP response
   → ProcessingIndicator disappears
   → Answer appears in chat

8. User can click nodes in pipeline
   → NodeOutputInspector updates
   → Shows that node's data
```

### Inspect Node

```
1. Pipeline is showing an execution trace
2. User clicks on a node in the pipeline graph
3. Dispatch SELECT_NODE(nodeId)
4. NodeOutputInspector updates to show that node's output
5. Tabs available: Output, Metadata, Raw
6. User clicks different tabs to see different data
7. User clicks another node → inspector updates
8. User closes inspector → node deselects
```

---

## Responsive Design

### Desktop (Primary)

```
┌──────────────────────────────────────────────────┐
│ Documents │ Chat          │ Pipeline             │
│ (240px)   │ (flexible)    │ (360px)              │
│           │               │                      │
│           │               │                      │
├──────────────────────────────────────────────────┤
│ Node Output Inspector (flexible height)          │
└──────────────────────────────────────────────────┘
```

### Tablet (Secondary)

```
Stack layout:
┌─────────────────────────────┐
│ Chat (primary)              │
│                             │
├─────────────────────────────┤
│ Documents | Pipeline (side) │
├─────────────────────────────┤
│ Node Inspector (collapsible) │
└─────────────────────────────┘
```

### Mobile (Tertiary - Graceful Degradation)

```
Tab-based:
┌─────────────────────────────┐
│ [Chat] [Docs] [Pipeline]    │ ← Tab bar
├─────────────────────────────┤
│ (Content changes per tab)   │
│                             │
└─────────────────────────────┘
```

---

## Loading States

### Initial Load

```
┌─────────────────────────────────┐
│  Documents Panel                │
│  ┌────────────────────────────┐ │
│  │ Upload Document            │ │
│  │ [Skeleton: Processing Q]   │ │
│  │ [Skeleton: Completed D]    │ │
│  └────────────────────────────┘ │
└─────────────────────────────────┘
│ [Skeleton: Chat history]        │
│ [Skeleton: Chat input]          │
└─────────────────────────────────┘
```

Shows skeleton screens while loading documents and chat history.

### Upload Progress

```
attenton-is-all-you-need.pdf

✓ Parse PDF (completed)
✓ Text Extracted (completed)
◆ Creating Chunks... (active - animated)
  Creating Embeddings (pending)
  Storing in Qdrant (pending)
```

Progress bar shows step-by-step ingestion.

### Query Processing

```
User Message (10:30 AM)

"Retrieving..." (processing indicator - animated)
```

Single temporary message between user message and final answer.

### Error States

```
Upload Error:
┌────────────────────────────────┐
│ ⚠️ Upload Failed               │
│ File is too large (>50MB)      │
│ [Retry] [Choose Different File]│
└────────────────────────────────┘

Query Error:
┌────────────────────────────────┐
│ ⚠️ Something went wrong        │
│ Failed to retrieve documents   │
│ [Retry] [Contact Support]      │
└────────────────────────────────┘
```

---

## Empty States

### No Documents

```
Documents Panel (Empty)

┌────────────────────────────────┐
│ Upload Document                │
│ Upload PDF/TXT files           │
│ Drag & drop or click to browse │
│                                │
│ Processing Queue               │
│ (no documents)                 │
│                                │
│ Completed Documents            │
│ (no documents yet)             │
└────────────────────────────────┘
```

### No Conversation

```
Chat Panel (Empty)

┌────────────────────────────────┐
│                                │
│  Welcome to CRAG               │
│                                │
│  Upload a document on the left │
│  Then ask a question below     │
│                                │
│ [Ask a question about your...] │
│                                │
└────────────────────────────────┘
```

### No Trace Selected

```
Node Output Inspector (Empty)

┌────────────────────────────────┐
│ Select a node to inspect       │
│                                │
│ Click on any node in the       │
│ pipeline to see its output     │
└────────────────────────────────┘
```

---

## TypeScript Type Definitions

### Core Types

```typescript
// Domain types (from backend)
interface Document {
  id: string
  name: string
  size: number
  chunkCount: number
  status: "processing" | "ready" | "error"
  createdAt: string
  error?: string
}

interface Message {
  id: string
  author: "user" | "assistant"
  content: string
  timestamp: string
  traces?: ExecutionTrace[]
}

interface ExecutionTrace {
  queryId: string
  nodes: TraceNode[]
  edges: TraceEdge[]
  executionPath: string[]
  totalDuration: number
  startedAt: string
  completedAt: string
}

interface TraceNode {
  id: string
  name: string
  type: NodeType
  status: "pending" | "active" | "complete" | "error"
  input: Record<string, unknown>
  output: Record<string, unknown>
  metadata: Record<string, unknown>
  duration: number
  error?: {
    code: string
    message: string
  }
}

interface TraceEdge {
  from: string
  to: string
  label?: string
}

// UI types
interface UploadingDocument {
  uploadId: string
  name: string
  progress: number
  currentStage: IngestionStage
  stages: IngestionStageStatus[]
}

type IngestionStage = 
  | "parsing"
  | "text_extraction"
  | "chunking"
  | "embedding"
  | "storage"

interface IngestionStageStatus {
  stage: IngestionStage
  label: string
  status: "pending" | "active" | "complete" | "error"
  error?: string
}
```

---

## Summary

The frontend is a **single-page dashboard** with four synchronized panels.

State is managed through **React Context + useReducer** for predictable updates.

**Real-time WebSocket** connections keep the execution trace synchronized with backend.

**Type-safe** components communicate through well-defined props.

**Responsive design** gracefully adapts to different screen sizes.

Every panel has **one responsibility**: documents, chat, visualization, or inspection.

This architecture allows the frontend to provide rich visualization of the CRAG pipeline without adding complexity to the backend.
