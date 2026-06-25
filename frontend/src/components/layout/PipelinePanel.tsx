import React from "react";
import { ExecutionGraph } from "../pipeline/ExecutionGraph";
import { useExecution } from "../../hooks/useExecution";

export const PipelinePanel: React.FC = () => {
  const { trace } = useExecution();

  return (
    <section className="w-[480px] border-l border-neutral-800 bg-neutral-950/20 flex flex-col shrink-0">
      <div className="p-4 border-b border-neutral-800 shrink-0 flex items-center justify-between">
        <h2 className="text-sm font-semibold tracking-wide uppercase text-neutral-400">
          CRAG Pipeline Graph
        </h2>
        {trace && (
          <div className="text-[10px] text-neutral-500 font-semibold bg-neutral-950 border border-neutral-850 px-2 py-0.5 rounded">
            Path: <span className="text-primary font-bold">{trace.decision_path}</span>
          </div>
        )}
      </div>
      
      {/* React Flow Interactive Graph Canvas */}
      <ExecutionGraph />
    </section>
  );
};
