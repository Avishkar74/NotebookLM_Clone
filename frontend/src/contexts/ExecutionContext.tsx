import React, { createContext, useState, useCallback, useRef, useEffect } from "react";
import type { ReactNode } from "react";
import type { TraceResponseData } from "../types/trace";
import { api } from "../services/api";

export type ReplayState = "IDLE" | "PLAYING" | "PAUSED" | "COMPLETED";

interface ExecutionContextType {
  trace: TraceResponseData | null;
  selectedNodeId: string | null;
  isLoading: boolean;
  error: string | null;
  replayState: ReplayState;
  activeNodeId: string | null;
  nodeStatuses: Record<string, "PENDING" | "RUNNING" | "SUCCESS" | "FAILED" | "SKIPPED">;
  loadTrace: (traceId: string, autoplay?: boolean) => Promise<void>;
  selectNode: (nodeId: string | null) => void;
  clearTrace: () => void;
  playReplay: () => void;
  pauseReplay: () => void;
  resetReplay: () => void;
}

export const ExecutionContext = createContext<ExecutionContextType | undefined>(undefined);

export const ExecutionProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [trace, setTrace] = useState<TraceResponseData | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Replay State Machine
  const [replayState, setReplayState] = useState<ReplayState>("IDLE");
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
  const [nodeStatuses, setNodeStatuses] = useState<
    Record<string, "PENDING" | "RUNNING" | "SUCCESS" | "FAILED" | "SKIPPED">
  >({});

  const currentIndexRef = useRef<number>(0);
  const timerRef = useRef<number | null>(null);
  const traceRef = useRef<TraceResponseData | null>(null);

  const selectNode = useCallback((nodeId: string | null) => {
    setSelectedNodeId(nodeId);
  }, []);

  const clearTrace = useCallback(() => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
    }
    setTrace(null);
    traceRef.current = null;
    setSelectedNodeId(null);
    setError(null);
    setReplayState("IDLE");
    setActiveNodeId(null);
    setNodeStatuses({});
    currentIndexRef.current = 0;
  }, []);

  const resetReplay = useCallback(() => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
    }
    setReplayState("IDLE");
    setActiveNodeId(null);
    currentIndexRef.current = 0;

    // Initialize all standard pipeline nodes to PENDING
    const initial: Record<string, any> = {};
    const standardIds = [
      "retriever",
      "evaluator",
      "router",
      "knowledge_refinement",
      "knowledge_search",
      "query_rewrite",
      "generator"
    ];
    standardIds.forEach((id) => {
      initial[id] = "PENDING";
    });
    setNodeStatuses(initial);
  }, []);

  const playNext = useCallback((index: number) => {
    const traceData = traceRef.current;
    if (!traceData) return;

    // Replay completed
    if (index >= traceData.nodes.length) {
      setReplayState("COMPLETED");
      setActiveNodeId(null);
      return;
    }

    currentIndexRef.current = index;
    const currentNode = traceData.nodes[index];

    // If node was skipped in the backend trace, mark it skipped immediately and proceed
    if (currentNode.status === "SKIPPED") {
      setNodeStatuses((prev) => ({
        ...prev,
        [currentNode.node_id]: "SKIPPED",
      }));
      playNext(index + 1);
      return;
    }

    // Node is executed: transition status to RUNNING
    setActiveNodeId(currentNode.node_id);
    setSelectedNodeId(currentNode.node_id); // Auto-select node for the inspector during replay
    setNodeStatuses((prev) => ({
      ...prev,
      [currentNode.node_id]: "RUNNING",
    }));

    // Timing fallback: use trace event duration, but ensure a min duration (e.g. 800ms) for visual legibility
    const delay = Math.max(currentNode.duration_ms || 0, 800);

    timerRef.current = window.setTimeout(() => {
      // Transition node status to final outcome (SUCCESS or FAILED)
      setNodeStatuses((prev) => ({
        ...prev,
        [currentNode.node_id]: currentNode.status as any,
      }));

      if (currentNode.status === "FAILED") {
        setReplayState("COMPLETED");
        setActiveNodeId(null);
        return;
      }

      // Succeeded, proceed to the next node in the pipeline
      playNext(index + 1);
    }, delay);
  }, []);

  const playReplay = useCallback(() => {
    const traceData = traceRef.current;
    if (!traceData) return;

    setReplayState("PLAYING");
    
    // If starting fresh or from completed, reset and play
    if (replayState === "COMPLETED" || replayState === "IDLE") {
      resetReplay();
      // Need to re-retrieve trace data because reset cleans statuses
      setTimeout(() => {
        playNext(0);
      }, 50);
    } else {
      // Resuming from PAUSED
      playNext(currentIndexRef.current);
    }
  }, [replayState, resetReplay, playNext]);

  const pauseReplay = useCallback(() => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setReplayState("PAUSED");
  }, []);

  const loadTrace = useCallback(async (traceId: string, autoplay = true) => {
    setIsLoading(true);
    setError(null);
    try {
      const traceData = await api.getExecutionTrace(traceId);
      setTrace(traceData);
      traceRef.current = traceData;
      
      resetReplay();
      
      // Auto-start replay if requested
      if (autoplay) {
        // Short timeout to ensure the react states clear properly first
        setTimeout(() => {
          setReplayState("PLAYING");
          playNext(0);
        }, 100);
      }
    } catch (err: any) {
      setError(err.message || "Failed to retrieve execution trace");
    } finally {
      setIsLoading(false);
    }
  }, [resetReplay, playNext]);

  // Clean up timers on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, []);

  return (
    <ExecutionContext.Provider
      value={{
        trace,
        selectedNodeId,
        isLoading,
        error,
        replayState,
        activeNodeId,
        nodeStatuses,
        loadTrace,
        selectNode,
        clearTrace,
        playReplay,
        pauseReplay,
        resetReplay,
      }}
    >
      {children}
    </ExecutionContext.Provider>
  );
};
