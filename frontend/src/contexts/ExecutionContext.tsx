import React, { createContext, useState, useCallback } from "react";
import type { ReactNode } from "react";
import type { TraceResponseData } from "../types/trace";
import { api } from "../services/api";

interface ExecutionContextType {
  trace: TraceResponseData | null;
  selectedNodeId: string | null;
  isLoading: boolean;
  error: string | null;
  loadTrace: (traceId: string) => Promise<void>;
  selectNode: (nodeId: string | null) => void;
  clearTrace: () => void;
}

export const ExecutionContext = createContext<ExecutionContextType | undefined>(undefined);

export const ExecutionProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [trace, setTrace] = useState<TraceResponseData | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectNode = useCallback((nodeId: string | null) => {
    setSelectedNodeId(nodeId);
  }, []);

  const clearTrace = useCallback(() => {
    setTrace(null);
    setSelectedNodeId(null);
    setError(null);
  }, []);

  const loadTrace = useCallback(async (traceId: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const traceData = await api.getExecutionTrace(traceId);
      setTrace(traceData);
      
      // Auto-select the retriever node initially when a new trace loads
      setSelectedNodeId("retriever");
    } catch (err: any) {
      setError(err.message || "Failed to retrieve execution trace");
    } finally {
      setIsLoading(false);
    }
  }, []);

  return (
    <ExecutionContext.Provider
      value={{
        trace,
        selectedNodeId,
        isLoading,
        error,
        loadTrace,
        selectNode,
        clearTrace,
      }}
    >
      {children}
    </ExecutionContext.Provider>
  );
};
