import React, { useState } from "react";
import { Send, AlertCircle } from "lucide-react";

interface ChatInputProps {
  isLoading: boolean;
  hasDocuments: boolean;
  selectedDocCount: number;
  onSubmit: (query: string) => void;
}

export const ChatInput: React.FC<ChatInputProps> = ({
  isLoading,
  hasDocuments,
  selectedDocCount,
  onSubmit,
}) => {
  const [value, setValue] = useState("");

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!value.trim() || isLoading) return;
    onSubmit(value);
    setValue("");
  };

  const getPlaceholder = () => {
    if (!hasDocuments) return "Please upload at least one document to begin...";
    if (selectedDocCount === 0) return "Select documents in the left panel to search them...";
    return `Ask anything about the ${selectedDocCount} selected document(s)...`;
  };

  const isInputDisabled = isLoading || !hasDocuments || selectedDocCount === 0;

  return (
    <div className="p-4 border-t border-neutral-800 shrink-0 bg-neutral-950/20">
      <form
        onSubmit={handleFormSubmit}
        className={`relative flex items-center bg-neutral-900 border rounded-2xl transition-all duration-300 ${
          isInputDisabled
            ? "border-neutral-850 opacity-60 cursor-not-allowed"
            : "border-neutral-800 focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/20 focus-within:shadow-lg focus-within:shadow-primary/5"
        }`}
      >
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={getPlaceholder()}
          disabled={isInputDisabled}
          className="flex-1 bg-transparent px-4 py-4 text-sm text-neutral-100 focus:outline-none placeholder-neutral-500 disabled:cursor-not-allowed"
        />
        <button
          type="submit"
          disabled={isInputDisabled || !value.trim()}
          className={`p-2.5 mr-2.5 rounded-xl transition duration-300 ${
            !value.trim() || isInputDisabled
              ? "bg-neutral-800 text-neutral-600 cursor-not-allowed"
              : "bg-primary hover:bg-primary-dark text-white shadow-md shadow-primary/10 active:scale-95"
          }`}
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
      {!hasDocuments && (
        <div className="flex items-center space-x-1.5 mt-2.5 text-[10px] text-amber-500 font-semibold px-1">
          <AlertCircle className="h-3 w-3" />
          <span>No documents found. Please upload a PDF or TXT document to activate search.</span>
        </div>
      )}
      {hasDocuments && selectedDocCount === 0 && (
        <div className="flex items-center space-x-1.5 mt-2.5 text-[10px] text-amber-500 font-semibold px-1">
          <AlertCircle className="h-3 w-3" />
          <span>No sources selected. Check at least one completed document to ask questions.</span>
        </div>
      )}
    </div>
  );
};
