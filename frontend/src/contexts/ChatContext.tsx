import React, { createContext, useState, useCallback } from "react";
import type { ReactNode } from "react";
import type { Message } from "../types/domain";
import { api } from "../services/api";

interface ChatContextType {
  messages: Message[];
  isLoading: boolean;
  processingPhase: "Retrieving..." | "Evaluating..." | "Generating..." | null;
  error: string | null;
  submitQuery: (query: string, documentIds: string[], onLoadTrace: (traceId: string) => Promise<void>) => Promise<void>;
  clearHistory: () => void;
}

export const ChatContext = createContext<ChatContextType | undefined>(undefined);

export const ChatProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [processingPhase, setProcessingPhase] = useState<"Retrieving..." | "Evaluating..." | "Generating..." | null>(null);
  const [error, setError] = useState<string | null>(null);

  const clearHistory = useCallback(() => {
    setMessages([]);
    setError(null);
  }, []);

  const submitQuery = useCallback(async (
    query: string, 
    documentIds: string[], 
    onLoadTrace: (traceId: string) => Promise<void>
  ) => {
    if (!query.trim()) return;

    setIsLoading(true);
    setError(null);
    setProcessingPhase("Retrieving...");

    // Add user message
    const userMessage: Message = {
      id: `msg_${Math.random().toString(36).substr(2, 9)}`,
      sender: "user",
      text: query,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMessage]);

    // Set up phase transitions for educational visualization
    let timer1: number | undefined;
    let timer2: number | undefined;

    timer1 = window.setTimeout(() => {
      setProcessingPhase("Evaluating...");
    }, 1000);

    timer2 = window.setTimeout(() => {
      setProcessingPhase("Generating...");
    }, 2200);

    try {
      // 1. Post query to backend
      const queryResult = await api.askQuestion(query, documentIds);
      
      // Clear phase timers
      clearTimeout(timer1);
      clearTimeout(timer2);
      setProcessingPhase(null);

      // 2. Fetch full execution trace in the background
      let traceId = queryResult.execution_trace_id;
      if (traceId) {
        await onLoadTrace(traceId);
      }

      // 3. Add assistant response message
      const assistantMessage: Message = {
        id: `msg_${Math.random().toString(36).substr(2, 9)}`,
        sender: "assistant",
        text: queryResult.answer,
        timestamp: new Date().toISOString(),
        traceId: traceId,
      };
      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err: any) {
      clearTimeout(timer1);
      clearTimeout(timer2);
      setProcessingPhase(null);
      setError(err.message || "Failed to retrieve response from the pipeline");
      
      const errorMessage: Message = {
        id: `msg_${Math.random().toString(36).substr(2, 9)}`,
        sender: "assistant",
        text: "Unable to generate response. Please try again.",
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  return (
    <ChatContext.Provider
      value={{
        messages,
        isLoading,
        processingPhase,
        error,
        submitQuery,
        clearHistory,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
};
