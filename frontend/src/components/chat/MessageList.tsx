import { useEffect, useRef } from "react";
import type { Message } from "../../types/domain";
import { ChatMessage } from "./ChatMessage";

interface MessageListProps {
  messages: Message[];
}

export const MessageList: React.FC<MessageListProps> = ({
  messages,
}) => {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-3 app-scrollbar bg-slate-50/40">
      {messages.map((msg) => (
        <ChatMessage
          key={msg.id}
          message={msg}
        />
      ))}
      <div ref={bottomRef} />
    </div>
  );
};
