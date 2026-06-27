import { MessageSquare } from "lucide-react";

export const EmptyState: React.FC = () => {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-4 select-none bg-slate-50/40">
      <div className="w-16 h-16 rounded-2xl bg-white border border-slate-200 flex items-center justify-center text-blue-600 shadow-lg shadow-slate-200/50">
        <MessageSquare className="h-8 w-8 text-blue-600" />
      </div>
      <div className="max-w-xs space-y-2">
        <h3 className="text-sm font-semibold text-slate-900">
          Ask a question to begin
        </h3>
        <p className="text-xs text-slate-500 leading-relaxed">
          Ask any question about your uploaded documents. The dashboard will show the step-by-step Corrective Retrieval-Augmented Generation execution trace.
        </p>
      </div>
    </div>
  );
};
