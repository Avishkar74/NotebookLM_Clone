import { useState } from "react";
import { Terminal, X, Maximize2, Minimize2, Clock, HelpCircle, AlertCircle } from "lucide-react";
import { useExecution } from "../../hooks/useExecution";
import type { InspectorTab } from "../../types/ui";

export const NodeOutputInspector = () => {
  const { trace, selectedNodeId, selectNode, nodeStatuses } = useExecution();
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<InspectorTab>("output");

  if (!trace || !selectedNodeId) {
    return (
      <div className="h-48 border border-slate-200 bg-white rounded-3xl shadow-lg flex flex-col items-center justify-center text-center p-6 text-slate-500 shrink-0">
        <Terminal className="h-6 w-6 text-slate-300 mb-2" />
        <p className="text-xs italic">Select a node from the execution graph to inspect its parameters and outputs.</p>
      </div>
    );
  }

  // Find selected node in trace
  const node = trace.nodes.find((n) => n.node_id === selectedNodeId);

  if (!node) {
    return (
      <div className="h-48 border border-slate-200 bg-white rounded-3xl shadow-lg flex flex-col items-center justify-center text-center p-6 text-red-500 shrink-0">
        <AlertCircle className="h-6 w-6 mb-2" />
        <p className="text-xs">Node details not found in current trace.</p>
      </div>
    );
  }

  const formatTime = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return d.toLocaleTimeString([], { hour12: false, fractionSecondDigits: 3 } as any);
    } catch {
      return "---";
    }
  };

  const syntaxHighlightJson = (json: string) => {
    const escaped = json
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

    return escaped.replace(
      /("(?:\\u[a-fA-F0-9]{4}|\\[^u]|[^"\\])*"(?=\s*:))|("(?:\\u[a-fA-F0-9]{4}|\\[^u]|[^"\\])*")|\b(true|false|null)\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|([{}\[\],:])/g,
      (_match, key, str, boolNull, num, punct) => {
        if (key) return `<span class="text-sky-300">${key}</span>`;
        if (str) return `<span class="text-emerald-300">${str}</span>`;
        if (boolNull) return `<span class="text-amber-300">${boolNull}</span>`;
        if (num) return `<span class="text-fuchsia-300">${num}</span>`;
        if (punct) return `<span class="text-slate-400">${punct}</span>`;
        return _match;
      }
    );
  };

  const renderOutputTabContent = () => {
    if (node.status === "SKIPPED") {
      return (
        <div className="text-neutral-500 text-center py-6 italic flex flex-col items-center">
          <HelpCircle className="h-5 w-5 text-neutral-600 mb-1.5" />
          This node was SKIPPED during execution because it was not on the routing path.
        </div>
      );
    }

    const output = node.output || {};

    switch (node.node_id) {
      case "retriever":
        return (
          <div className="space-y-3 font-sans text-[11px]">
            <div className="flex items-center justify-between text-slate-500 font-mono text-[10px] border-b border-slate-200 pb-2">
              <span>Total chunks retrieved: {output.total_chunks_returned || 0}</span>
              <span>Metric: Cosine Similarity</span>
            </div>
            
            <div className={`space-y-2 mt-1 ${detailHeightClass} overflow-y-auto pr-1 app-scrollbar`}>
              {output.retrieved_chunks && output.retrieved_chunks.length > 0 ? (
                output.retrieved_chunks.map((c: any, i: number) => {
                  const rawText = node.output?.chunks?.[i]?.text || "Text content unavailable.";
                  return (
                    <div key={i} className="border border-slate-200 bg-slate-50 p-2.5 rounded-xl space-y-1.5">
                      <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono">
                        <span className="bg-white border border-slate-200 px-1.5 py-0.5 rounded text-slate-600">
                          {c.document || `Chunk #${c.chunk_id}`}
                        </span>
                        <span className="text-blue-700 font-bold">Score: {(c.score || 0).toFixed(4)}</span>
                      </div>
                      <p className="text-slate-700 leading-relaxed font-sans max-h-24 overflow-hidden">{rawText}</p>
                      {c.page !== undefined && (
                        <div className="text-[9px] text-slate-500 text-right">Page {c.page}</div>
                      )}
                    </div>
                  );
                })
              ) : (
                <div className="text-slate-500 italic">No chunks retrieved.</div>
              )}
            </div>
          </div>
        );

      case "evaluator":
        return (
          <div className="space-y-3 font-sans text-[11px]">
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl flex flex-col justify-center">
                <span className="text-[10px] uppercase font-bold text-slate-500 mb-1">Relevance Verdict</span>
                <span className={`text-base font-bold ${
                  output.decision === "CORRECT" 
                    ? "text-emerald-600" 
                    : output.decision === "AMBIGUOUS" 
                      ? "text-amber-600" 
                      : "text-red-500"
                }`}>
                  {output.decision || "PENDING"}
                </span>
              </div>
              <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl flex flex-col justify-center">
                <span className="text-[10px] uppercase font-bold text-slate-500 mb-1">Confidence Score</span>
                <span className="text-base font-bold text-blue-700">
                  {output.confidence !== undefined ? `${(output.confidence * 100).toFixed(0)}%` : "---"}
                </span>
              </div>
            </div>
            
            <div className="bg-white border border-slate-200 p-3 rounded-xl mt-1">
              <span className="text-[10px] uppercase font-bold text-slate-500 block mb-1">LLM Evaluation Reasoning</span>
              <p className="text-slate-700 leading-relaxed whitespace-pre-line">{output.reasoning || "No explanation provided."}</p>
            </div>
          </div>
        );

      case "router":
        return (
          <div className="space-y-3 font-sans text-[11px]">
            <div className="bg-slate-50 border border-slate-200 p-3.5 rounded-xl flex flex-col">
              <span className="text-[10px] uppercase font-bold text-slate-500 mb-1">Dynamic Selected Pipeline Branch</span>
              <span className="text-lg font-bold text-blue-700">{output.selected_branch || "---"}</span>
            </div>
            <p className="text-[10px] text-slate-500 leading-relaxed px-1">
              The router routes flow dynamically. Correct directs to refinement; Incorrect triggers rewriting + search; Ambiguous merges both refinement and external search context.
            </p>
          </div>
        );

      case "query_rewrite":
        return (
          <div className="space-y-3 font-sans text-[11px]">
            <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl space-y-1">
              <span className="text-[10px] uppercase font-bold text-slate-500 block">Original Question</span>
              <span className="text-slate-700 block italic">"{output.original_query || node.input?.original_query || "---"}"</span>
            </div>
            <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl space-y-1 mt-1">
              <span className="text-[10px] uppercase font-bold text-blue-700 block">Rewritten Web Search Terms</span>
              <span className="text-slate-900 font-bold block text-sm font-mono">"{output.rewritten_query || "---"}"</span>
            </div>
          </div>
        );

      case "knowledge_search":
        return (
          <div className="space-y-3 font-sans text-[11px]">
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl">
                <span className="text-[10px] uppercase font-bold text-slate-500 block mb-1">Results Found</span>
                <span className="text-sm font-bold text-slate-900">{output.results_found || 0}</span>
              </div>
              <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl">
                <span className="text-[10px] uppercase font-bold text-slate-500 block mb-1">Results Selected</span>
                <span className="text-sm font-bold text-slate-900">{output.selected_results || 0}</span>
              </div>
            </div>

            <div className="bg-white border border-slate-200 p-3 rounded-xl mt-1">
              <span className="text-[10px] uppercase font-bold text-slate-500 block mb-1">External Retrieved Web Context</span>
              <div className={`text-slate-700 ${detailHeightClass} overflow-y-auto pr-1 font-mono text-[10px] leading-relaxed whitespace-pre-wrap app-scrollbar`}>
                {output.external_context || "No external web results returned."}
              </div>
            </div>
          </div>
        );

      case "knowledge_refinement":
        return (
          <div className="space-y-3 font-sans text-[11px]">
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl text-center">
                <span className="text-[9px] uppercase font-bold text-slate-500 block mb-0.5">Input Chunks</span>
                <span className="text-sm font-bold text-slate-900">{output.input_chunks || 0}</span>
              </div>
              <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl text-center">
                <span className="text-[9px] uppercase font-bold text-slate-500 block mb-0.5">Strips Kept</span>
                <span className="text-sm font-bold text-emerald-600">{output.output_chunks || 0}</span>
              </div>
              <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl text-center">
                <span className="text-[9px] uppercase font-bold text-slate-500 block mb-0.5">Strips Removed</span>
                <span className="text-sm font-bold text-red-500">{output.removed_chunks || 0}</span>
              </div>
            </div>

            <div className="bg-white border border-slate-200 p-3 rounded-xl mt-1">
              <span className="text-[10px] uppercase font-bold text-slate-500 block mb-1">Refined Context Output</span>
              <div className={`text-slate-700 ${detailHeightClass} overflow-y-auto pr-1 leading-relaxed whitespace-pre-wrap app-scrollbar`}>
                {output.refined_context || "No refined context returned."}
              </div>
            </div>
          </div>
        );

      case "generator":
        return (
          <div className="space-y-3 font-sans text-[11px]">
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl text-center">
                <span className="text-[9px] uppercase font-bold text-slate-500 block mb-0.5">Input Tokens</span>
                <span className="text-xs font-bold text-slate-900">{output.tokens_prompt || "---"}</span>
              </div>
              <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl text-center">
                <span className="text-[9px] uppercase font-bold text-slate-500 block mb-0.5">Output Tokens</span>
                <span className="text-xs font-bold text-slate-900">{output.tokens_completion || "---"}</span>
              </div>
              <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl text-center">
                <span className="text-[9px] uppercase font-bold text-slate-500 block mb-0.5">Synthesis Model</span>
                <span className="text-[10px] font-bold text-blue-700 truncate block">{output.model || "gpt-4.1-mini"}</span>
              </div>
            </div>

            <div className="bg-white border border-slate-200 p-3 rounded-xl mt-1">
              <span className="text-[10px] uppercase font-bold text-slate-500 block mb-1">Final Generated Response</span>
              <div className={`text-slate-700 ${detailHeightClass} overflow-y-auto pr-1 leading-relaxed whitespace-pre-wrap app-scrollbar`}>
                {output.answer || "No response generated."}
              </div>
            </div>
          </div>
        );

      default:
        return <div className="text-neutral-400">Node type not supported.</div>;
    }
  };

  const currentStatus = nodeStatuses[node.node_id] || "PENDING";
  const detailHeightClass = isExpanded ? "max-h-[290px]" : "max-h-[170px]";
  const panelHeightClass = isExpanded ? "h-[520px]" : "h-[280px]";

  return (
    <div 
      className={`border border-slate-200 bg-white rounded-3xl shadow-lg flex flex-col z-20 shrink-0 transition-all duration-300 mt-4 overflow-hidden ${
        panelHeightClass
      }`}
    >
      {/* 1. Header Toolbar */}
      <div className="flex items-center justify-between px-5 py-2.5 border-b border-slate-200 bg-slate-50/80 shrink-0">
        <div className="flex items-center space-x-3 select-none">
          <Terminal className="h-4 w-4 text-blue-600" />
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Node Output Inspector</span>
          <span className="text-slate-300">|</span>
          <span className="text-xs font-bold text-slate-900">{node.display_name}</span>
          <span className={`text-[8.5px] font-extrabold px-2 py-0.5 rounded border uppercase tracking-wider font-mono ${
            currentStatus === "SUCCESS"
              ? "bg-emerald-50 border-emerald-200 text-emerald-700"
              : currentStatus === "FAILED"
                ? "bg-red-50 border-red-200 text-red-700"
              : currentStatus === "SKIPPED"
                  ? "bg-slate-50 border-slate-200 text-slate-500"
                  : currentStatus === "RUNNING"
                    ? "bg-amber-50 border-amber-200 text-amber-700 animate-pulse"
                    : "bg-slate-50 border-slate-200 text-slate-500"
          }`}>
            {currentStatus}
          </span>
        </div>
        
        <div className="flex items-center space-x-3">
          {/* Latency timing if executed */}
          {(currentStatus === "SUCCESS" || currentStatus === "FAILED") && node.status !== "SKIPPED" && (
            <div className="flex items-center space-x-1 text-[10px] text-slate-500 font-mono">
              <Clock className="h-3 w-3 text-slate-400" />
              <span>{node.duration_ms.toFixed(0)} ms</span>
            </div>
          )}
          <button 
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1 rounded text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition"
            title={isExpanded ? "Collapse panel" : "Expand panel"}
          >
            {isExpanded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </button>
          <button 
            onClick={() => selectNode(null)}
            className="p-1 rounded text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition"
            title="Close Inspector"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* 2. Inspector Body with Sidebar Tabs */}
      <div className="flex flex-1 min-h-0">
        {/* Sidebar tabs */}
        <div className="w-36 border-r border-slate-200 bg-slate-50 shrink-0 p-2.5 space-y-1 select-none">
          {(["output", "metadata", "raw"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`w-full text-left px-3.5 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-wider transition ${
                activeTab === tab 
                  ? "bg-blue-600 text-white shadow-md shadow-blue-200/40" 
                  : "text-slate-500 hover:text-slate-900 hover:bg-slate-100"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Tab content panel */}
        <div className="flex-grow overflow-y-auto p-5 bg-white font-mono text-xs app-scrollbar">
          {currentStatus === "PENDING" ? (
            <div className="flex flex-col items-center justify-center text-center py-10 text-slate-500 font-sans">
              <Clock className="h-6 w-6 text-slate-300 mb-2" />
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Awaiting Pipeline Execution</p>
              <p className="text-[10px] text-slate-500 mt-1 max-w-xs leading-relaxed">
                This node is pending. Real-time parameters and metrics will display once it starts replaying.
              </p>
            </div>
          ) : currentStatus === "RUNNING" ? (
            <div className="flex flex-col items-center justify-center text-center py-10 text-amber-600 font-sans">
              <div className="h-6 w-6 rounded-full border-2 border-t-amber-500 border-slate-200 animate-spin mb-2"></div>
              <p className="text-xs font-bold uppercase tracking-wide">Executing Node...</p>
              <p className="text-[10px] text-slate-500 mt-1 max-w-xs leading-relaxed">
                The pipeline is running this stage. Real-time node outputs will be outputted in a moment.
              </p>
            </div>
          ) : (
            <>
              {activeTab === "output" && renderOutputTabContent()}

          {activeTab === "metadata" && (
            <div className={`grid gap-2 font-sans ${detailHeightClass} overflow-y-auto pr-1 app-scrollbar`}>
              {(() => {
                const metadataRows: Array<[string, string]> = [
                ["Node ID", node.node_id],
                ["Execution Type", node.type.toUpperCase()],
                ["Started At", formatTime(node.started_at)],
                ["Completed At", formatTime(node.completed_at)],
                ...Object.entries(node.metadata || {}).map(([key, value]) => [
                  key.replace(/_/g, " "),
                  typeof value === "object" ? JSON.stringify(value) : String(value),
                ] as [string, string]),
              ];

                return metadataRows.map(([label, value]) => (
                <div key={String(label)} className="grid grid-cols-[150px_1fr] items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                  <span className="text-[10px] uppercase tracking-wider font-bold text-slate-500">{label}</span>
                  <span className="text-[11px] font-medium text-slate-800 font-mono break-words">{value}</span>
                </div>
                ));
              })()}
            </div>
          )}

          {activeTab === "raw" && (
            <div className={`rounded-xl border border-slate-200 bg-slate-950 text-slate-100 ${detailHeightClass} overflow-auto app-scrollbar`}>
              <pre
                className="p-3 text-[11px] leading-relaxed font-mono whitespace-pre min-w-full"
                dangerouslySetInnerHTML={{ __html: syntaxHighlightJson(JSON.stringify(node, null, 2)) }}
              />
            </div>
          )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
