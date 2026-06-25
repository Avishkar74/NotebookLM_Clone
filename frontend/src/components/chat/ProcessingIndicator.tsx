interface ProcessingIndicatorProps {
  phase: "Retrieving..." | "Evaluating..." | "Generating..." | null;
}

export const ProcessingIndicator: React.FC<ProcessingIndicatorProps> = ({ phase }) => {
  if (!phase) return null;

  return (
    <div className="flex justify-start px-6 py-2 animate-slide-up">
      <div className="flex items-center space-x-3 bg-neutral-900/60 border border-neutral-850 px-4 py-3 rounded-2xl rounded-bl-none shadow-md shadow-neutral-950/20">
        <div className="flex items-center space-x-1">
          <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse"></span>
          <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse [animation-delay:0.2s]"></span>
          <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse [animation-delay:0.4s]"></span>
        </div>
        <span className="text-xs font-semibold text-amber-400 font-mono tracking-wide">
          {phase}
        </span>
      </div>
    </div>
  );
};
