import type { Message } from "../../types/domain";
import { GitBranch } from "lucide-react";

interface ChatMessageProps {
  message: Message;
  activeTraceId: string | null;
  onViewTrace: (traceId: string) => void;
}

export const ChatMessage: React.FC<ChatMessageProps> = ({ 
  message, 
  activeTraceId,
  onViewTrace 
}) => {
  const isUser = message.sender === "user";
  
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} animate-slide-up`}>
      <div className="flex flex-col space-y-1 max-w-xl group">
        <div 
          className={`rounded-2xl p-4 text-sm leading-relaxed border ${
            isUser 
              ? "bg-primary border-primary-dark text-white rounded-br-none shadow-sm" 
              : "bg-neutral-900 border-neutral-800 text-neutral-100 rounded-bl-none shadow-md"
          }`}
        >
          <p className="whitespace-pre-wrap">{message.text}</p>
        </div>
        
        {!isUser && message.traceId && (
          <div className="flex items-center space-x-2 pl-1.5 pt-0.5">
            <button
              onClick={() => onViewTrace(message.traceId!)}
              className={`flex items-center space-x-1.5 text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border transition-all duration-300 ${
                activeTraceId === message.traceId
                  ? "bg-primary/20 border-primary/40 text-primary-light"
                  : "bg-neutral-950 border-neutral-800 text-neutral-500 hover:text-neutral-300 hover:border-neutral-700"
              }`}
            >
              <GitBranch className="h-2.5 w-2.5" />
              <span>
                {activeTraceId === message.traceId ? "Viewing execution trace" : "View execution trace"}
              </span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
