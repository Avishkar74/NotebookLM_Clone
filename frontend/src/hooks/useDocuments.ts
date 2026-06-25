import { useContext } from "react";
import { DocumentsContext } from "../contexts/DocumentsContext";

export const useDocuments = () => {
  const context = useContext(DocumentsContext);
  if (context === undefined) {
    throw new Error("useDocuments must be used within a DocumentsProvider");
  }
  return context;
};
