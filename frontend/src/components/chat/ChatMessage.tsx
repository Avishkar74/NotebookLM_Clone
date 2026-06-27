import type { Message } from "../../types/domain";

interface ChatMessageProps {
  message: Message;
}

export const ChatMessage: React.FC<ChatMessageProps> = ({ 
  message
}) => {
  const isUser = message.sender === "user";
  
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} animate-slide-up`}>
      <div className="flex flex-col space-y-1 max-w-2xl group">
        <div 
          className={`rounded-2xl p-4 text-sm leading-relaxed border ${
            isUser 
              ? "bg-blue-600 border-blue-700 text-white rounded-br-none shadow-sm" 
              : "bg-white border-slate-200 text-slate-800 rounded-bl-none shadow-md"
          }`}
        >
          <p className="whitespace-pre-wrap">{message.text}</p>
        </div>
        
      </div>
    </div>
  );
};
