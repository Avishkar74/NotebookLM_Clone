import { useState } from "react";
import { GitBranch } from "lucide-react";
import { DocumentsProvider } from "./contexts/DocumentsContext";
import { ChatProvider } from "./contexts/ChatContext";
import { ExecutionProvider } from "./contexts/ExecutionContext";
import { useExecution } from "./hooks/useExecution";
import { DocumentsPanel } from "./components/layout/DocumentsPanel";
import { ChatPanel } from "./components/layout/ChatPanel";
import { PipelinePanel } from "./components/layout/PipelinePanel";
import { NodeOutputInspector } from "./components/inspector/NodeOutputInspector";

function Dashboard() {
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<string[]>([]);
  const { trace, loadTrace } = useExecution();

  const handleSelectDocument = (id: string) => {
    setSelectedDocumentIds((prev) =>
      prev.includes(id) ? prev.filter((dId) => dId !== id) : [...prev, id]
    );
  };

  const handleViewTrace = async (traceId: string) => {
    await loadTrace(traceId);
  };

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-neutral-900 text-neutral-100 font-sans">
      {/* 1. Global Sleek Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-neutral-800 bg-neutral-950/60 backdrop-blur-md z-10 shrink-0">
        <div className="flex items-center space-x-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-primary to-indigo-500 shadow-lg shadow-primary/20">
            <GitBranch className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold bg-gradient-to-r from-white via-neutral-200 to-neutral-400 bg-clip-text text-transparent m-0 leading-none">
              Corrective RAG (CRAG) Dashboard
            </h1>
            <p className="text-[10px] text-neutral-500 mt-1 uppercase tracking-wider font-semibold">
              Educational Visualization Workspace
            </p>
          </div>
        </div>
        
        <div className="flex items-center space-x-4 select-none">
          <div className="flex items-center space-x-2 text-xs bg-neutral-900 border border-neutral-800/80 px-3.5 py-1.5 rounded-full">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span className="text-neutral-400 font-semibold">Qdrant Connected</span>
          </div>
          <div className="text-xs text-neutral-450 font-semibold bg-primary/10 border border-primary/20 px-3.5 py-1.5 rounded-full">
            Model: <span className="text-primary-light">gpt-4.1-mini</span>
          </div>
        </div>
      </header>

      {/* 2. Main Workspace Layout */}
      <div className="flex flex-1 min-h-0 relative flex-col">
        <div className="flex flex-1 min-h-0 flex-row">
          {/* Left panel: Ingestion and sources */}
          <DocumentsPanel
            selectedDocumentIds={selectedDocumentIds}
            onSelectDocument={handleSelectDocument}
          />

          {/* Center panel: Question answering and chat */}
          <ChatPanel
            selectedDocumentIds={selectedDocumentIds}
            activeTraceId={trace ? trace.trace_id : null}
            onViewTrace={handleViewTrace}
          />

          {/* Right panel: React Flow pipeline visualizer */}
          <PipelinePanel />
        </div>

        {/* Collapsible details inspector */}
        <NodeOutputInspector />
      </div>
    </div>
  );
}

export default function App() {
  return (
    <DocumentsProvider>
      <ExecutionProvider>
        <ChatProvider>
          <Dashboard />
        </ChatProvider>
      </ExecutionProvider>
    </DocumentsProvider>
  );
}
