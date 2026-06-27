import React from "react";
import { UploadArea } from "../documents/UploadArea";
import { ProcessingQueue } from "../documents/ProcessingQueue";
import { CompletedDocuments } from "../documents/CompletedDocuments";

interface DocumentsPanelProps {
  selectedDocumentIds: string[];
  onSelectDocument: (id: string) => void;
}

export const DocumentsPanel: React.FC<DocumentsPanelProps> = ({
  selectedDocumentIds,
  onSelectDocument,
}) => {
  return (
    <aside className="w-80 rounded-3xl border border-slate-200 bg-white shadow-lg flex flex-col shrink-0 overflow-hidden min-h-0">
      <div className="p-4 border-b border-slate-200 shrink-0 bg-slate-50/80">
        <h2 className="text-sm font-semibold tracking-wide uppercase text-slate-600">
          Source Documents
        </h2>
      </div>
      
      {/* 1. Ingestion File Upload Zone */}
      <UploadArea />

      {/* 2. Ingestion Progress & States Queue */}
      <ProcessingQueue />

      {/* 3. Completed Document Ingestion List */}
      <CompletedDocuments 
        selectedDocumentIds={selectedDocumentIds}
        onSelectDocument={onSelectDocument}
      />
    </aside>
  );
};
