import { FileText, AlertCircle, ArrowDown } from "lucide-react";
import { useDocuments } from "../../hooks/useDocuments";
import type { UploadingDocument } from "../../types/domain";

export const ProcessingQueue: React.FC = () => {
  const { uploadQueue } = useDocuments();

  if (uploadQueue.length === 0) {
    return null;
  }

  const renderStages = (doc: UploadingDocument) => {
    const { status, chunksCount } = doc;
    const stagesList: string[] = [];

    // Map the status value to sequential lists of steps
    if (status === "QUEUED") {
      stagesList.push("Waiting in Queue...");
    } else if (status === "PARSING") {
      stagesList.push("Parsing PDF...");
    } else if (status === "CHUNKING") {
      stagesList.push("Text Extracted");
      stagesList.push("Creating Chunks...");
    } else if (status === "EMBEDDING") {
      stagesList.push("Text Extracted");
      stagesList.push(`${chunksCount || "---"} Chunks Created`);
      stagesList.push("Embedding Started");
    } else if (status === "STORING") {
      stagesList.push("Text Extracted");
      stagesList.push(`${chunksCount || "---"} Chunks Created`);
      stagesList.push(`${chunksCount || "---"} Embeddings Created`);
      stagesList.push("Storing inside Qdrant...");
    } else if (status === "COMPLETED") {
      stagesList.push("Text Extracted");
      stagesList.push(`${chunksCount || "---"} Chunks Created`);
      stagesList.push(`${chunksCount || "---"} Embeddings Created`);
      stagesList.push("Stored inside Qdrant");
      stagesList.push("Ready");
    } else if (status === "FAILED") {
      stagesList.push("Text Extracted");
      stagesList.push("Processing Failed");
    }

    return (
      <div className="mt-3 space-y-1.5 pl-7 border-l-2 border-neutral-800 ml-4.5 py-1">
        {stagesList.map((stage, idx) => {
          const isLast = idx === stagesList.length - 1;
          const isActive = isLast && status !== "COMPLETED" && status !== "FAILED";
          
          return (
            <div key={idx} className="flex flex-col items-start">
              <div className="flex items-center space-x-2">
                <span 
                  className={`h-1.5 w-1.5 rounded-full ${
                    isActive 
                      ? "bg-amber-500 animate-pulse scale-125" 
                      : stage.includes("Failed") 
                        ? "bg-red-500" 
                        : "bg-emerald-500"
                  }`}
                />
                <span 
                  className={`text-[10px] tracking-wide font-medium ${
                    isActive 
                      ? "text-amber-400 font-semibold" 
                      : stage.includes("Failed") 
                        ? "text-red-400" 
                        : "text-neutral-400"
                  }`}
                >
                  {stage}
                </span>
              </div>
              {!isLast && (
                <ArrowDown className="h-2.5 w-2.5 text-neutral-800 my-0.5 ml-0.75" />
              )}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="p-4 border-b border-neutral-800 shrink-0">
      <span className="text-[10px] uppercase tracking-wider font-bold text-neutral-500">Processing Queue ({uploadQueue.length})</span>
      <div className="mt-3 space-y-3">
        {uploadQueue.map((doc) => (
          <div 
            key={doc.id} 
            className="p-3.5 rounded-xl bg-neutral-900 border border-neutral-800/80 shadow-md shadow-neutral-950/20"
          >
            <div className="flex items-center space-x-3">
              <FileText className={`h-4 w-4 ${doc.status === 'FAILED' ? 'text-red-400' : 'text-amber-400'} shrink-0`} />
              <div className="truncate flex-1">
                <span className="block text-xs font-semibold text-neutral-200 truncate">{doc.name}</span>
                <span className="text-[9px] text-neutral-500">
                  {doc.sizeBytes ? `${(doc.sizeBytes / 1024).toFixed(0)} KB` : ""}
                </span>
              </div>
              {doc.status === "FAILED" && (
                <AlertCircle className="h-4 w-4 text-red-500 shrink-0 ml-2" />
              )}
            </div>
            
            {renderStages(doc)}

            {doc.error && (
              <p className="text-[9px] text-red-400 mt-2 pl-7 font-mono font-medium leading-relaxed">
                Error: {doc.error}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
