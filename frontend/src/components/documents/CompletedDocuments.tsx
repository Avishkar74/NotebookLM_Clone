import React from "react";
import { FileText, CheckCircle, Trash2 } from "lucide-react";
import { useDocuments } from "../../hooks/useDocuments";

interface CompletedDocumentsProps {
  selectedDocumentIds: string[];
  onSelectDocument: (id: string) => void;
}

export const CompletedDocuments: React.FC<CompletedDocumentsProps> = ({
  selectedDocumentIds,
  onSelectDocument,
}) => {
  const { documents, deleteDocument, isLoading } = useDocuments();
  const completedDocuments = documents.filter((doc) => doc.status === "COMPLETED");

  if (completedDocuments.length === 0) {
    return (
      <div className="flex-1 overflow-y-auto px-4 py-8 text-center text-xs text-slate-500 italic app-scrollbar">
        No documents uploaded.
        <br />
        Upload a PDF or TXT file to begin.
      </div>
    );
  }

  const formatSize = (bytes: number) => {
    if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
    return `${(bytes / 1024).toFixed(0)} KB`;
  };

  return (
    <div className="flex-1 min-h-0 overflow-y-auto px-4 py-2 space-y-3 pb-6 app-scrollbar">
      <div className="flex items-center justify-between mt-2 shrink-0">
        <span className="text-[10px] uppercase tracking-wider font-bold text-slate-500">
          Completed Documents ({completedDocuments.length})
        </span>
      </div>

      <div className="space-y-2 mt-2">
        {completedDocuments.map((doc) => {
          const isSelected = selectedDocumentIds.includes(doc.id);
          
          return (
            <div
              key={doc.id}
              onClick={() => onSelectDocument(doc.id)}
              className={`flex items-center justify-between p-3.5 rounded-xl border transition-all cursor-pointer ${
                isSelected
                  ? "bg-blue-50 border-blue-200 shadow-sm"
                  : "bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50"
              }`}
            >
              <div className="flex items-center space-x-3 truncate flex-1">
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => {}} // Swallowed by parent onClick
                  className="rounded border-slate-300 bg-white text-blue-600 focus:ring-blue-300 h-3.5 w-3.5"
                />
                
                <FileText className="h-4 w-4 text-blue-600 shrink-0" />
                <div className="truncate flex-1">
                  <span className="block text-xs font-semibold text-slate-800 truncate" title={doc.name}>
                    {doc.name}
                  </span>
                  <div className="flex items-center space-x-2 text-[9px] text-slate-500 font-medium mt-0.5">
                    <span>{formatSize(doc.sizeBytes)}</span>
                    <span>•</span>
                    <span>{doc.chunksCount} chunks</span>
                  </div>
                </div>
              </div>
              
              <div className="flex items-center space-x-2 ml-2">
                <CheckCircle className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteDocument(doc.id);
                  }}
                  disabled={isLoading}
                  className="p-1 rounded text-slate-400 hover:text-red-500 hover:bg-slate-100 transition"
                  title="Delete Document"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
