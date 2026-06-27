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
    <div className="p-4 border-t border-slate-200 shrink-0 bg-white">
      <form
        onSubmit={handleFormSubmit}
        className={`relative flex items-center bg-white border rounded-2xl transition-all duration-300 ${
          isInputDisabled
            ? "border-slate-200 opacity-60 cursor-not-allowed"
            : "border-slate-200 focus-within:border-blue-300 focus-within:ring-1 focus-within:ring-blue-200 focus-within:shadow-lg focus-within:shadow-blue-100/50"
        }`}
      >
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={getPlaceholder()}
          disabled={isInputDisabled}
          className="flex-1 bg-transparent px-4 py-4 text-sm text-slate-900 focus:outline-none placeholder-slate-400 disabled:cursor-not-allowed"
        />
        <button
          type="submit"
          disabled={isInputDisabled || !value.trim()}
          className={`p-2.5 mr-2.5 rounded-xl transition duration-300 ${
            !value.trim() || isInputDisabled
              ? "bg-slate-100 text-slate-400 cursor-not-allowed"
              : "bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-200/40 active:scale-95"
          }`}
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
      {!hasDocuments && (
        <div className="flex items-center space-x-1.5 mt-2.5 text-[10px] text-amber-600 font-semibold px-1">
          <AlertCircle className="h-3 w-3" />
          <span>No documents found. Please upload a PDF or TXT document to activate search.</span>
        </div>
      )}
      {hasDocuments && selectedDocCount === 0 && (
        <div className="flex items-center space-x-1.5 mt-2.5 text-[10px] text-amber-600 font-semibold px-1">
          <AlertCircle className="h-3 w-3" />
          <span>No sources selected. Check at least one completed document to ask questions.</span>
        </div>
      )}
    </div>
  );
};
