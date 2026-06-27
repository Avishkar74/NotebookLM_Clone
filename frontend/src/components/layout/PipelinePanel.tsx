import { ExecutionGraph } from "../pipeline/ExecutionGraph";
import { useExecution } from "../../hooks/useExecution";

export const PipelinePanel: React.FC = () => {
  const { trace } = useExecution();

  return (
    <section className="w-[480px] rounded-3xl border border-slate-200 bg-white shadow-lg flex flex-col shrink-0 overflow-hidden min-h-0">
      <div className="p-4 border-b border-slate-200 shrink-0 flex items-center justify-between bg-slate-50/80">
        <h2 className="text-sm font-semibold tracking-wide uppercase text-slate-600">
          CRAG Pipeline Graph
        </h2>
        {trace && (
          <div className="text-[10px] text-slate-500 font-semibold bg-white border border-slate-200 px-2 py-0.5 rounded shadow-sm">
            Path: <span className="text-blue-700 font-bold">{trace.decision_path}</span>
          </div>
        )}
      </div>
      
      {/* React Flow Interactive Graph Canvas */}
      <div className="flex-grow min-h-0 relative">
        <ExecutionGraph />
      </div>
    </section>
  );
};
