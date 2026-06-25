import React from "react";
import { MessageList } from "../chat/MessageList";
import { ProcessingIndicator } from "../chat/ProcessingIndicator";
import { ChatInput } from "../chat/ChatInput";
import { EmptyState } from "../chat/EmptyState";
import { useChat } from "../../hooks/useChat";
import { useDocuments } from "../../hooks/useDocuments";

interface ChatPanelProps {
  selectedDocumentIds: string[];
  activeTraceId: string | null;
  onViewTrace: (traceId: string) => Promise<void>;
}

export const ChatPanel: React.FC<ChatPanelProps> = ({
  selectedDocumentIds,
  activeTraceId,
  onViewTrace,
}) => {
  const { messages, isLoading, processingPhase, submitQuery } = useChat();
  const { documents } = useDocuments();

  const handleQuerySubmit = (query: string) => {
    submitQuery(query, selectedDocumentIds, onViewTrace);
  };

  return (
    <main className="flex-1 flex flex-col min-w-0 bg-neutral-900/30">
      {/* Panel Header */}
      <div className="p-4 border-b border-neutral-800 shrink-0 flex items-center justify-between">
        <h2 className="text-sm font-semibold tracking-wide uppercase text-neutral-400">
          Chat Session
        </h2>
        {selectedDocumentIds.length > 0 && (
          <div className="text-[10px] text-neutral-500 font-semibold bg-neutral-950 border border-neutral-850 px-2.5 py-1 rounded-full">
            Searching: <span className="text-primary-light">{selectedDocumentIds.length} source(s)</span>
          </div>
        )}
      </div>

      {/* Message History / Empty State */}
      {messages.length === 0 ? (
        <EmptyState />
      ) : (
        <MessageList
          messages={messages}
          activeTraceId={activeTraceId}
          onViewTrace={onViewTrace}
        />
      )}

      {/* Temporary Ingestion/Pipeline Processing Indicator */}
      <ProcessingIndicator phase={processingPhase} />

      {/* Chat Input */}
      <ChatInput
        isLoading={isLoading}
        hasDocuments={documents.length > 0}
        selectedDocCount={selectedDocumentIds.length}
        onSubmit={handleQuerySubmit}
      />
    </main>
  );
};
