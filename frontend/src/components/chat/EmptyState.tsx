import { MessageSquare } from "lucide-react";

export const EmptyState: React.FC = () => {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-4 select-none">
      <div className="w-16 h-16 rounded-2xl bg-neutral-900 border border-neutral-800 flex items-center justify-center text-primary shadow-lg shadow-neutral-950/20">
        <MessageSquare className="h-8 w-8 text-primary" />
      </div>
      <div className="max-w-xs space-y-2">
        <h3 className="text-sm font-semibold text-neutral-200">
          Ask a question to begin
        </h3>
        <p className="text-xs text-neutral-500 leading-relaxed">
          Ask any question about your uploaded documents. The dashboard will show the step-by-step Corrective Retrieval-Augmented Generation execution trace.
        </p>
      </div>
    </div>
  );
};
