import React, { createContext, useState, useEffect, useCallback } from "react";
import type { ReactNode } from "react";
import type { Document, UploadingDocument } from "../types/domain";
import { api } from "../services/api";

interface DocumentsContextType {
  documents: Document[];
  uploadQueue: UploadingDocument[];
  isLoading: boolean;
  error: string | null;
  fetchDocuments: () => Promise<void>;
  uploadFiles: (files: FileList) => Promise<void>;
  deleteDocument: (id: string) => Promise<void>;
  clearUploadQueue: () => void;
}

export const DocumentsContext = createContext<DocumentsContextType | undefined>(undefined);

export const DocumentsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [uploadQueue, setUploadQueue] = useState<UploadingDocument[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDocuments = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await api.getDocuments("COMPLETED");
      // Map API document structures to UI document model
      const mapped = response.documents.map((doc) => ({
        id: doc.document_id,
        name: doc.filename,
        sizeBytes: doc.file_size_bytes,
        status: doc.status as Document["status"],
        chunksCount: doc.chunks_count,
        embeddingsStored: doc.embeddings_stored,
        createdAt: doc.created_at,
        updatedAt: doc.updated_at,
      }));
      setDocuments(mapped);
    } catch (err: any) {
      setError(err.message || "Failed to load documents");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const deleteDocument = useCallback(async (id: string) => {
    setError(null);
    try {
      await api.deleteDocument(id);
      setDocuments((prev) => prev.filter((d) => d.id !== id));
    } catch (err: any) {
      setError(err.message || "Failed to delete document");
    }
  }, []);

  const clearUploadQueue = useCallback(() => {
    setUploadQueue([]);
  }, []);

  // Poll status helper for a single uploading document
  const pollDocumentStatus = useCallback((docId: string) => {
    const interval = setInterval(async () => {
      try {
        const statusData = await api.getDocumentStatus(docId);
        
        setUploadQueue((prevQueue) => {
          const fileIndex = prevQueue.findIndex((d) => d.id === docId);
          if (fileIndex === -1) {
            clearInterval(interval);
            return prevQueue;
          }

          const currentFile = prevQueue[fileIndex];
          const nextStatus = statusData.overall_status as Document["status"];
          
          const updatedFile: UploadingDocument = {
            ...currentFile,
            status: nextStatus,
            chunksCount: statusData.chunks_count,
            embeddingsStored: statusData.embeddings_stored,
            progressPercent: statusData.progress.percentage,
          };

          const newQueue = [...prevQueue];
          newQueue[fileIndex] = updatedFile;

          // If finished or failed, remove from queue and refresh completed list
          if (nextStatus === "COMPLETED" || nextStatus === "FAILED") {
            clearInterval(interval);
            fetchDocuments();
            // Automatically remove from queue after a short delay so user sees "Ready ✓"
            setTimeout(() => {
              setUploadQueue((currentQueue) => currentQueue.filter((d) => d.id !== docId));
            }, 3000);
          }

          return newQueue;
        });
      } catch (err: any) {
        clearInterval(interval);
        setUploadQueue((prevQueue) =>
          prevQueue.map((d) =>
            d.id === docId
              ? { ...d, status: "FAILED", error: err.message || "Ingestion tracking error" }
              : d
          )
        );
      }
    }, 1500);

    return interval;
  }, [fetchDocuments]);

  const uploadFiles = useCallback(async (files: FileList) => {
    setError(null);
    const filesToUpload = Array.from(files);

    for (const file of filesToUpload) {
      const tempId = `temp_${Math.random().toString(36).substr(2, 9)}`;
      
      // 1. Add placeholder entry to uploadQueue as QUEUED
      const initialUpload: UploadingDocument = {
        id: tempId,
        name: file.name,
        sizeBytes: file.size,
        status: "QUEUED",
        progressPercent: 0,
        chunksCount: 0,
        embeddingsStored: 0,
      };

      setUploadQueue((prev) => [...prev, initialUpload]);

      try {
        // 2. Call upload API
        const response = await api.uploadDocument(file);
        const actualId = response.document_id;

        // 3. Update the temporary ID to the actual ID in state
        setUploadQueue((prevQueue) =>
          prevQueue.map((d) =>
            d.id === tempId ? { ...d, id: actualId, status: response.status as Document["status"] } : d
          )
        );

        // 4. Start polling for this actual ID
        pollDocumentStatus(actualId);
      } catch (err: any) {
        setUploadQueue((prevQueue) =>
          prevQueue.map((d) =>
            d.id === tempId
              ? { ...d, status: "FAILED", error: err.message || "Failed to initiate upload" }
              : d
          )
        );
      }
    }
  }, [pollDocumentStatus]);

  // Initial load
  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  return (
    <DocumentsContext.Provider
      value={{
        documents,
        uploadQueue,
        isLoading,
        error,
        fetchDocuments,
        uploadFiles,
        deleteDocument,
        clearUploadQueue,
      }}
    >
      {children}
    </DocumentsContext.Provider>
  );
};
