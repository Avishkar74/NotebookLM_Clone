import { useContext } from "react";
import { ExecutionContext } from "../contexts/ExecutionContext";

export const useExecution = () => {
  const context = useContext(ExecutionContext);
  if (context === undefined) {
    throw new Error("useExecution must be used within an ExecutionProvider");
  }
  return context;
};
