import { Play, Pause, RotateCcw } from "lucide-react";
import { ExecutionGraph } from "../pipeline/ExecutionGraph";
import { useExecution } from "../../hooks/useExecution";

export const PipelinePanel: React.FC = () => {
  const { trace, replayState, playReplay, pauseReplay, resetReplay } = useExecution();

  const getReplayStatusText = () => {
    switch (replayState) {
      case "PLAYING": return "Replaying Trace...";
      case "PAUSED": return "Replay Paused";
      case "COMPLETED": return "Replay Completed";
      default: return "Ready to Replay";
    }
  };

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
      <div className="flex-grow min-h-0 relative">
        <ExecutionGraph />
      </div>

      {/* Replay Controls Toolbar (visible when a trace is loaded) */}
      {trace && (
        <div className="p-3.5 border-t border-neutral-850 bg-neutral-950 shrink-0 flex items-center justify-between select-none">
          <div className="flex items-center space-x-2">
            <span className={`h-1.5 w-1.5 rounded-full ${
              replayState === "PLAYING" 
                ? "bg-primary animate-pulse" 
                : replayState === "PAUSED" 
                  ? "bg-amber-500" 
                  : replayState === "COMPLETED" 
                    ? "bg-emerald-500" 
                    : "bg-neutral-600"
            }`} />
            <span className="text-[10px] uppercase font-bold tracking-wider text-neutral-500">
              {getReplayStatusText()}
            </span>
          </div>

          <div className="flex items-center space-x-2">
            {/* Play / Pause Toggle Button */}
            {replayState === "PLAYING" ? (
              <button
                onClick={pauseReplay}
                className="p-2 rounded-xl bg-neutral-900 border border-neutral-800 hover:border-neutral-750 text-neutral-300 hover:text-white transition duration-200 active:scale-95 shadow-sm"
                title="Pause Replay"
              >
                <Pause className="h-3.5 w-3.5" />
              </button>
            ) : (
              <button
                onClick={playReplay}
                className="p-2 rounded-xl bg-primary hover:bg-primary-dark text-white transition duration-200 active:scale-95 shadow-md shadow-primary/10"
                title="Play Replay"
              >
                <Play className="h-3.5 w-3.5 fill-current" />
              </button>
            )}

            {/* Reset Button */}
            <button
              onClick={resetReplay}
              className="p-2 rounded-xl bg-neutral-900 border border-neutral-800 hover:border-neutral-750 text-neutral-400 hover:text-neutral-200 transition duration-200 active:scale-95 shadow-sm"
              title="Reset Replay"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </section>
  );
};
