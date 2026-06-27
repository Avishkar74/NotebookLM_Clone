import React from "react";
import { MessageList } from "../chat/MessageList";
import { ProcessingIndicator } from "../chat/ProcessingIndicator";
import { ChatInput } from "../chat/ChatInput";
import { EmptyState } from "../chat/EmptyState";
import { useChat } from "../../hooks/useChat";
import { useDocuments } from "../../hooks/useDocuments";
import { useExecution } from "../../hooks/useExecution";

interface ChatPanelProps {
  selectedDocumentIds: string[];
  onViewTrace: (traceId: string) => Promise<void>;
}

export const ChatPanel: React.FC<ChatPanelProps> = ({
  selectedDocumentIds,
  onViewTrace,
}) => {
  const { messages, isLoading, processingPhase, submitQuery } = useChat();
  const { documents } = useDocuments();
  const { replayState, activeNodeId, trace } = useExecution();

  const handleQuerySubmit = (query: string) => {
    submitQuery(query, selectedDocumentIds, onViewTrace);
  };

  const progressLabel =
    processingPhase === "Retrieving..."
      ? "Retrieving documents..."
      : processingPhase === "Evaluating..."
        ? "Evaluating retrieved context..."
        : processingPhase === "Generating..."
          ? "Generating answer..."
          : null;

  const headerStatusLabel = progressLabel ?? (selectedDocumentIds.length > 0 ? `${selectedDocumentIds.length} source(s) selected` : null);

  // Filter out the assistant's answer from display until replay completes
  const displayedMessages = messages.filter((msg) => {
    if (msg.sender === "assistant" && msg.traceId && trace && msg.traceId === trace.trace_id) {
      return replayState === "COMPLETED";
    }
    return true;
  });

  // Determine active indicator phase from the replay state machine or direct loading
  const getActivePhaseText = (): "Retrieving..." | "Evaluating..." | "Generating..." | null => {
    if (isLoading && !trace) {
      return processingPhase;
    }
    
    if (trace && (replayState === "PLAYING" || replayState === "PAUSED")) {
      switch (activeNodeId) {
        case "retriever": 
          return "Retrieving...";
        case "evaluator": 
          return "Evaluating...";
        case "generator": 
          return "Generating...";
        // For other internal steps, map to evaluation/retrieval categories for user-facing elegance
        case "router":
        case "knowledge_refinement":
        case "query_rewrite":
          return "Evaluating...";
        case "knowledge_search":
          return "Retrieving...";
        default: 
          return "Generating...";
      }
    }
    
    return null;
  };

  const activePhaseText = getActivePhaseText();

  return (
    <main className="flex-1 flex flex-col min-w-0 rounded-3xl border border-slate-200 bg-white shadow-lg overflow-hidden min-h-0">
      {/* Panel Header */}
      <div className="p-4 border-b border-slate-200 shrink-0 flex items-center justify-between bg-slate-50/80">
        <h2 className="text-sm font-semibold tracking-wide uppercase text-slate-600">
          Chat Session
        </h2>
        {headerStatusLabel && (
          <div className="text-[10px] text-slate-500 font-semibold bg-white border border-slate-200 px-2.5 py-1 rounded-full shadow-sm">
            <span className="text-blue-700">{headerStatusLabel}</span>
          </div>
        )}
      </div>

      {/* Message History / Empty State */}
      <div className="flex-1 min-h-0 overflow-hidden">
      {displayedMessages.length === 0 ? (
        <EmptyState />
      ) : (
        <MessageList
          messages={displayedMessages}
        />
      )}

      {/* Temporary Ingestion/Pipeline Processing Indicator */}
      <ProcessingIndicator phase={activePhaseText} />

      {/* Chat Input */}
      <ChatInput
        isLoading={isLoading || replayState === "PLAYING"}
        hasDocuments={documents.length > 0}
        selectedDocCount={selectedDocumentIds.length}
        onSubmit={handleQuerySubmit}
      />
      </div>
    </main>
  );
};
