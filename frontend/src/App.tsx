import { useEffect, useState } from "react";
import { GitBranch } from "lucide-react";
import { DocumentsProvider } from "./contexts/DocumentsContext";
import { ChatProvider } from "./contexts/ChatContext";
import { ExecutionProvider } from "./contexts/ExecutionContext";
import { useExecution } from "./hooks/useExecution";
import { DocumentsPanel } from "./components/layout/DocumentsPanel";
import { ChatPanel } from "./components/layout/ChatPanel";
import { PipelinePanel } from "./components/layout/PipelinePanel";
import { NodeOutputInspector } from "./components/inspector/NodeOutputInspector";
import { api } from "./services/api";
import { getOrCreateSessionId } from "./utils/session";

function Dashboard() {
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<string[]>([]);
  const { loadTrace } = useExecution();
  const sessionId = getOrCreateSessionId();

  useEffect(() => {
    let active = true;
    const ping = async () => {
      try {
        await api.pingSession(sessionId);
      } catch {
        // Keepalive should be best-effort only.
      }
    };

    void ping();
    const interval = window.setInterval(() => {
      if (active) {
        void ping();
      }
    }, 10 * 60 * 1000);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [sessionId]);

  const handleSelectDocument = (id: string) => {
    setSelectedDocumentIds((prev) =>
      prev.includes(id) ? prev.filter((dId) => dId !== id) : [...prev, id]
    );
  };

  const handleViewTrace = async (traceId: string) => {
    await loadTrace(traceId);
  };

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-slate-100 text-slate-900 font-sans">
      {/* 1. Global Sleek Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-white/90 backdrop-blur-md z-10 shrink-0 shadow-sm">
        <div className="flex items-center space-x-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-blue-500 to-cyan-400 shadow-lg shadow-blue-200/60">
            <GitBranch className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900 m-0 leading-none">
              Corrective RAG (CRAG) Dashboard
            </h1>
            <p className="text-[10px] text-slate-500 mt-1 uppercase tracking-wider font-semibold">
              Educational Visualization Workspace
            </p>
          </div>
        </div>
        
        <div className="flex items-center space-x-4 select-none">
          <div className="flex items-center space-x-2 text-xs bg-slate-50 border border-slate-200 px-3.5 py-1.5 rounded-full">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span className="text-slate-600 font-semibold">Qdrant Connected</span>
          </div>
          <div className="text-xs text-slate-600 font-semibold bg-blue-50 border border-blue-100 px-3.5 py-1.5 rounded-full">
            Model: <span className="text-blue-700">gpt-4.1-mini</span>
          </div>
        </div>
      </header>

      {/* 2. Main Workspace Layout */}
      <div className="flex flex-1 min-h-0 gap-4 p-4">
        {/* Left panel: Ingestion and sources */}
        <DocumentsPanel
          selectedDocumentIds={selectedDocumentIds}
          onSelectDocument={handleSelectDocument}
        />

        {/* Right workspace: chat + pipeline above, inspector below */}
        <div className="flex flex-1 min-w-0 min-h-0 flex-col gap-4">
          <div className="flex flex-1 min-h-0 min-w-0 gap-4">
            <ChatPanel
              selectedDocumentIds={selectedDocumentIds}
              onViewTrace={handleViewTrace}
            />

            <PipelinePanel />
          </div>

          {/* Collapsible details inspector */}
          <NodeOutputInspector />
        </div>
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
