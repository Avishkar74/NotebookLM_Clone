import { useState } from "react";
import { Terminal, X, Maximize2, Minimize2, Clock, HelpCircle, AlertCircle } from "lucide-react";
import { useExecution } from "../../hooks/useExecution";
import type { InspectorTab } from "../../types/ui";

export const NodeOutputInspector = () => {
  const { trace, selectedNodeId, selectNode } = useExecution();
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<InspectorTab>("output");

  if (!trace || !selectedNodeId) {
    return (
      <div className="h-48 border-t border-neutral-800 bg-neutral-950 flex flex-col items-center justify-center text-center p-6 text-neutral-500 shrink-0">
        <Terminal className="h-6 w-6 text-neutral-700 mb-2" />
        <p className="text-xs italic">Select a node from the execution graph to inspect its parameters and outputs.</p>
      </div>
    );
  }

  // Find selected node in trace
  const node = trace.nodes.find((n) => n.node_id === selectedNodeId);

  if (!node) {
    return (
      <div className="h-48 border-t border-neutral-800 bg-neutral-950 flex flex-col items-center justify-center text-center p-6 text-red-500 shrink-0">
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
          <div className="space-y-4 font-sans text-xs">
            <div className="flex items-center justify-between text-neutral-400 font-mono text-[10px] border-b border-neutral-900 pb-2">
              <span>Total chunks retrieved: {output.total_chunks_returned || 0}</span>
              <span>Metric: Cosine Similarity</span>
            </div>
            
            <div className="space-y-3 mt-2 max-h-[220px] overflow-y-auto pr-2">
              {output.retrieved_chunks && output.retrieved_chunks.length > 0 ? (
                output.retrieved_chunks.map((c: any, i: number) => {
                  const rawText = node.output?.chunks?.[i]?.text || "Text content unavailable.";
                  return (
                    <div key={i} className="border border-neutral-850 bg-neutral-900/40 p-3.5 rounded-xl space-y-2">
                      <div className="flex items-center justify-between text-[10px] text-neutral-500 font-mono">
                        <span className="bg-neutral-950 border border-neutral-800 px-1.5 py-0.5 rounded text-neutral-400">
                          {c.document || `Chunk #${c.chunk_id}`}
                        </span>
                        <span className="text-primary font-bold">Score: {(c.score || 0).toFixed(4)}</span>
                      </div>
                      <p className="text-neutral-300 leading-relaxed font-sans">{rawText}</p>
                      {c.page !== undefined && (
                        <div className="text-[9px] text-neutral-500 text-right">Page {c.page}</div>
                      )}
                    </div>
                  );
                })
              ) : (
                <div className="text-neutral-500 italic">No chunks retrieved.</div>
              )}
            </div>
          </div>
        );

      case "evaluator":
        return (
          <div className="space-y-3 font-sans text-xs">
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-neutral-900/40 border border-neutral-850 p-3.5 rounded-xl flex flex-col justify-center">
                <span className="text-[10px] uppercase font-bold text-neutral-500 mb-1">Relevance Verdict</span>
                <span className={`text-base font-bold ${
                  output.decision === "CORRECT" 
                    ? "text-emerald-400" 
                    : output.decision === "AMBIGUOUS" 
                      ? "text-amber-400" 
                      : "text-red-400"
                }`}>
                  {output.decision || "PENDING"}
                </span>
              </div>
              <div className="bg-neutral-900/40 border border-neutral-850 p-3.5 rounded-xl flex flex-col justify-center">
                <span className="text-[10px] uppercase font-bold text-neutral-500 mb-1">Confidence Score</span>
                <span className="text-base font-bold text-primary-light">
                  {output.confidence !== undefined ? `${(output.confidence * 100).toFixed(0)}%` : "---"}
                </span>
              </div>
            </div>
            
            <div className="bg-neutral-900/20 border border-neutral-850 p-3.5 rounded-xl mt-2">
              <span className="text-[10px] uppercase font-bold text-neutral-500 block mb-1">LLM Evaluation Reasoning</span>
              <p className="text-neutral-300 leading-relaxed whitespace-pre-line">{output.reasoning || "No explanation provided."}</p>
            </div>
          </div>
        );

      case "router":
        return (
          <div className="space-y-3 font-sans text-xs">
            <div className="bg-neutral-900/40 border border-neutral-850 p-4 rounded-xl flex flex-col">
              <span className="text-[10px] uppercase font-bold text-neutral-500 mb-1">Dynamic Selected Pipeline Branch</span>
              <span className="text-lg font-bold text-primary-light">{output.selected_branch || "---"}</span>
            </div>
            <p className="text-[10px] text-neutral-500 leading-relaxed px-1">
              The router routes flow dynamically. Correct directs to refinement; Incorrect triggers rewriting + search; Ambiguous merges both refinement and external search context.
            </p>
          </div>
        );

      case "query_rewrite":
        return (
          <div className="space-y-3 font-sans text-xs">
            <div className="bg-neutral-900/40 border border-neutral-850 p-3.5 rounded-xl space-y-1">
              <span className="text-[10px] uppercase font-bold text-neutral-500 block">Original Question</span>
              <span className="text-neutral-300 block italic">"{output.original_query || node.input?.original_query || "---"}"</span>
            </div>
            <div className="bg-neutral-900/40 border border-neutral-850 p-3.5 rounded-xl space-y-1 mt-2">
              <span className="text-[10px] uppercase font-bold text-primary block">Rewritten Web Search Terms</span>
              <span className="text-neutral-100 font-bold block text-sm font-mono">"{output.rewritten_query || "---"}"</span>
            </div>
          </div>
        );

      case "knowledge_search":
        return (
          <div className="space-y-3 font-sans text-xs">
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-neutral-900/40 border border-neutral-850 p-3 rounded-xl">
                <span className="text-[10px] uppercase font-bold text-neutral-500 block mb-1">Results Found</span>
                <span className="text-sm font-bold text-neutral-200">{output.results_found || 0}</span>
              </div>
              <div className="bg-neutral-900/40 border border-neutral-850 p-3 rounded-xl">
                <span className="text-[10px] uppercase font-bold text-neutral-500 block mb-1">Results Selected</span>
                <span className="text-sm font-bold text-neutral-200">{output.selected_results || 0}</span>
              </div>
            </div>

            <div className="bg-neutral-900/20 border border-neutral-850 p-3.5 rounded-xl mt-2">
              <span className="text-[10px] uppercase font-bold text-neutral-500 block mb-1">External Retrieved Web Context</span>
              <div className="text-neutral-350 max-h-[140px] overflow-y-auto pr-1 font-mono text-[10px] leading-relaxed whitespace-pre-wrap">
                {output.external_context || "No external web results returned."}
              </div>
            </div>
          </div>
        );

      case "knowledge_refinement":
        return (
          <div className="space-y-3 font-sans text-xs">
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-neutral-900/40 border border-neutral-850 p-3 rounded-xl text-center">
                <span className="text-[9px] uppercase font-bold text-neutral-500 block mb-0.5">Input Chunks</span>
                <span className="text-sm font-bold text-neutral-200">{output.input_chunks || 0}</span>
              </div>
              <div className="bg-neutral-900/40 border border-neutral-850 p-3 rounded-xl text-center">
                <span className="text-[9px] uppercase font-bold text-neutral-500 block mb-0.5">Strips Kept</span>
                <span className="text-sm font-bold text-emerald-400">{output.output_chunks || 0}</span>
              </div>
              <div className="bg-neutral-900/40 border border-neutral-850 p-3 rounded-xl text-center">
                <span className="text-[9px] uppercase font-bold text-neutral-500 block mb-0.5">Strips Removed</span>
                <span className="text-sm font-bold text-red-400">{output.removed_chunks || 0}</span>
              </div>
            </div>

            <div className="bg-neutral-900/20 border border-neutral-850 p-3.5 rounded-xl mt-2">
              <span className="text-[10px] uppercase font-bold text-neutral-500 block mb-1">Refined Context Output</span>
              <div className="text-neutral-350 max-h-[140px] overflow-y-auto pr-1 leading-relaxed whitespace-pre-wrap">
                {output.refined_context || "No refined context returned."}
              </div>
            </div>
          </div>
        );

      case "generator":
        return (
          <div className="space-y-3 font-sans text-xs">
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-neutral-900/40 border border-neutral-850 p-3 rounded-xl text-center">
                <span className="text-[9px] uppercase font-bold text-neutral-500 block mb-0.5">Input Tokens</span>
                <span className="text-xs font-bold text-neutral-200">{output.tokens_prompt || "---"}</span>
              </div>
              <div className="bg-neutral-900/40 border border-neutral-850 p-3 rounded-xl text-center">
                <span className="text-[9px] uppercase font-bold text-neutral-500 block mb-0.5">Output Tokens</span>
                <span className="text-xs font-bold text-neutral-200">{output.tokens_completion || "---"}</span>
              </div>
              <div className="bg-neutral-900/40 border border-neutral-850 p-3 rounded-xl text-center">
                <span className="text-[9px] uppercase font-bold text-neutral-500 block mb-0.5">Synthesis Model</span>
                <span className="text-[10px] font-bold text-primary-light truncate block">{output.model || "gpt-4.1-mini"}</span>
              </div>
            </div>

            <div className="bg-neutral-900/20 border border-neutral-850 p-3.5 rounded-xl mt-2">
              <span className="text-[10px] uppercase font-bold text-neutral-500 block mb-1">Final Generated Response</span>
              <div className="text-neutral-350 max-h-[140px] overflow-y-auto pr-1 leading-relaxed whitespace-pre-wrap">
                {output.answer || "No response generated."}
              </div>
            </div>
          </div>
        );

      default:
        return <div className="text-neutral-400">Node type not supported.</div>;
    }
  };

  return (
    <div 
      className={`border-t border-neutral-800 bg-neutral-950 flex flex-col z-20 shrink-0 transition-all duration-300 ${
        isExpanded ? "h-[420px]" : "h-[240px]"
      }`}
    >
      {/* 1. Header Toolbar */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-neutral-800 bg-neutral-950 shrink-0">
        <div className="flex items-center space-x-3 select-none">
          <Terminal className="h-4 w-4 text-primary" />
          <span className="text-xs font-bold uppercase tracking-wider text-neutral-500">Node Output Inspector</span>
          <span className="text-neutral-700">|</span>
          <span className="text-xs font-bold text-neutral-200">{node.display_name}</span>
          <span className={`text-[8.5px] font-extrabold px-2 py-0.5 rounded border uppercase tracking-wider font-mono ${
            node.status === "SUCCESS"
              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
              : node.status === "FAILED"
                ? "bg-red-500/10 border-red-500/30 text-red-450"
                : node.status === "SKIPPED"
                  ? "bg-neutral-800/10 border-neutral-850 text-neutral-500"
                  : "bg-amber-500/10 border-amber-500/30 text-amber-450"
          }`}>
            {node.status}
          </span>
        </div>
        
        <div className="flex items-center space-x-3">
          {/* Latency timing if executed */}
          {node.status !== "SKIPPED" && (
            <div className="flex items-center space-x-1 text-[10px] text-neutral-500 font-mono">
              <Clock className="h-3 w-3 text-neutral-600" />
              <span>{node.duration_ms.toFixed(0)} ms</span>
            </div>
          )}
          <button 
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1 rounded text-neutral-500 hover:text-neutral-300 hover:bg-neutral-900 transition"
            title={isExpanded ? "Collapse panel" : "Expand panel"}
          >
            {isExpanded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </button>
          <button 
            onClick={() => selectNode(null)}
            className="p-1 rounded text-neutral-500 hover:text-neutral-300 hover:bg-neutral-900 transition"
            title="Close Inspector"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* 2. Inspector Body with Sidebar Tabs */}
      <div className="flex flex-1 min-h-0">
        {/* Sidebar tabs */}
        <div className="w-40 border-r border-neutral-800 bg-neutral-950 shrink-0 p-3 space-y-1 select-none">
          {(["output", "metadata", "raw"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`w-full text-left px-3.5 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-wider transition ${
                activeTab === tab 
                  ? "bg-primary text-white shadow-md shadow-primary/10" 
                  : "text-neutral-500 hover:text-neutral-300 hover:bg-neutral-900"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Tab content panel */}
        <div className="flex-1 overflow-y-auto p-5 bg-neutral-950/45 font-mono text-xs">
          {activeTab === "output" && renderOutputTabContent()}

          {activeTab === "metadata" && (
            <div className="space-y-1.5 font-sans max-h-full overflow-y-auto pr-1">
              <div className="flex justify-between border-b border-neutral-900 py-2.5 text-xs">
                <span className="text-neutral-500 font-medium">Node ID</span>
                <span className="text-neutral-300 font-semibold font-mono">{node.node_id}</span>
              </div>
              <div className="flex justify-between border-b border-neutral-900 py-2.5 text-xs">
                <span className="text-neutral-500 font-medium">Execution Type</span>
                <span className="text-neutral-300 font-semibold uppercase font-mono">{node.type}</span>
              </div>
              <div className="flex justify-between border-b border-neutral-900 py-2.5 text-xs">
                <span className="text-neutral-500 font-medium">Started At</span>
                <span className="text-neutral-300 font-semibold font-mono">{formatTime(node.started_at)}</span>
              </div>
              <div className="flex justify-between border-b border-neutral-900 py-2.5 text-xs">
                <span className="text-neutral-500 font-medium">Completed At</span>
                <span className="text-neutral-300 font-semibold font-mono">{formatTime(node.completed_at)}</span>
              </div>
              
              {/* Additional node metadata key values */}
              {Object.entries(node.metadata || {}).map(([key, value]) => (
                <div key={key} className="flex justify-between border-b border-neutral-900 py-2.5 text-xs">
                  <span className="text-neutral-500 font-medium uppercase tracking-wide">
                    {key.replace(/_/g, " ")}
                  </span>
                  <span className="text-neutral-300 font-semibold">
                    {typeof value === "object" ? JSON.stringify(value) : String(value)}
                  </span>
                </div>
              ))}
            </div>
          )}

          {activeTab === "raw" && (
            <pre className="text-[11px] text-emerald-450 bg-neutral-950 p-4.5 rounded-xl border border-neutral-850 overflow-x-auto max-h-[300px] leading-relaxed">
              {JSON.stringify(node, null, 2)}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
};
