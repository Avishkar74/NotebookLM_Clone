import { useEffect, useRef } from "react";
import type { Message } from "../../types/domain";
import { ChatMessage } from "./ChatMessage";

interface MessageListProps {
  messages: Message[];
  activeTraceId: string | null;
  onViewTrace: (traceId: string) => void;
}

export const MessageList: React.FC<MessageListProps> = ({
  messages,
  activeTraceId,
  onViewTrace,
}) => {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-4">
      {messages.map((msg) => (
        <ChatMessage
          key={msg.id}
          message={msg}
          activeTraceId={activeTraceId}
          onViewTrace={onViewTrace}
        />
      ))}
      <div ref={bottomRef} />
    </div>
  );
};
