import React, { useMemo } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  useReactFlow,
  useStore,
  useViewport,
} from "@xyflow/react";
import type { Edge, Node, NodeProps } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useExecution } from "../../hooks/useExecution";

type NodeStatus = "PENDING" | "RUNNING" | "SUCCESS" | "FAILED" | "SKIPPED";
type NodeKind = "stage" | "branch";

type CustomNodeData = {
  label: string;
  displayName: string;
  status: NodeStatus;
  type: string;
  kind: NodeKind;
  isRetriever?: boolean;
  isGenerator?: boolean;
  [key: string]: unknown;
};

type PipelineNode = Node<CustomNodeData>;
type PipelineNodeProps = NodeProps<PipelineNode>;

const STATUS_STYLES: Record<NodeStatus, string> = {
  SUCCESS: "border-emerald-400 bg-emerald-50 text-emerald-800 shadow-emerald-100",
  FAILED: "border-red-400 bg-red-50 text-red-800 shadow-red-100",
  SKIPPED: "border-slate-200 bg-slate-50 text-slate-400 opacity-45 shadow-transparent",
  RUNNING: "border-blue-400 bg-blue-50 text-blue-800 shadow-blue-100 border-dashed",
  PENDING: "border-slate-200 bg-white text-slate-500 shadow-slate-100/70",
};

const STATUS_BADGES: Record<NodeStatus, string> = {
  SUCCESS: "Ready",
  FAILED: "Failed",
  SKIPPED: "Skipped",
  RUNNING: "Running",
  PENDING: "Pending",
};

const BRANCH_TONES: Record<string, string> = {
  correct: "border-emerald-400 bg-emerald-50 text-emerald-800",
  ambiguous: "border-amber-400 bg-amber-50 text-amber-800",
  incorrect: "border-red-400 bg-red-50 text-red-800",
};

const minimapColors: Record<NodeStatus, { fill: string; stroke: string }> = {
  SUCCESS: { fill: "#10b981", stroke: "#047857" },
  RUNNING: { fill: "#3b82f6", stroke: "#1d4ed8" },
  FAILED: { fill: "#ef4444", stroke: "#b91c1c" },
  SKIPPED: { fill: "#cbd5e1", stroke: "#94a3b8" },
  PENDING: { fill: "#94a3b8", stroke: "#64748b" },
};

const NODE_PREVIEW_SIZE: Record<string, { width: number; height: number }> = {
  branch: { width: 134, height: 78 },
  stage: { width: 176, height: 96 },
};

const CustomPipelineNode: React.FC<PipelineNodeProps> = ({ data, selected }) => {
  const toneClass =
    data.kind === "branch"
      ? BRANCH_TONES[data.displayName.toLowerCase()] || "border-slate-200 bg-white text-slate-700"
      : STATUS_STYLES[data.status];

  return (
    <div
      className={`rounded-2xl border-2 px-4 py-3 shadow-md transition-all duration-300 ${
        data.kind === "branch" ? "min-w-[132px] text-center" : "min-w-[170px] flex flex-col items-center justify-center"
      } ${toneClass} ${selected ? "ring-2 ring-blue-500 ring-offset-2 ring-offset-white scale-[1.03]" : ""}`}
    >
      {!data.isRetriever && (
        <Handle
          type="target"
          position={Position.Top}
          className="w-2.5 h-2.5 border border-slate-400 bg-white"
        />
      )}

      <span className={`text-[10px] uppercase tracking-[0.2em] font-bold ${data.kind === "branch" ? "text-inherit" : "text-slate-500"}`}>
        {data.type}
      </span>

      <span className={`mt-0.5 text-sm font-bold text-slate-900 ${data.kind === "branch" ? "text-base" : ""}`}>
        {data.displayName}
      </span>

      <div className="mt-1.5 flex items-center gap-1.5">
        <span
          className={`h-1.5 w-1.5 rounded-full ${
            data.status === "SUCCESS"
              ? "bg-emerald-500"
              : data.status === "FAILED"
                ? "bg-red-500"
                : data.status === "RUNNING"
                  ? "bg-blue-500"
                  : "bg-slate-300"
          }`}
        />
        <span className="text-[8px] uppercase tracking-wider font-bold opacity-75 text-slate-500">
          {STATUS_BADGES[data.status]}
        </span>
      </div>

      {!data.isGenerator && (
        <Handle
          type="source"
          position={Position.Bottom}
          className="w-2.5 h-2.5 border border-slate-400 bg-white"
        />
      )}
    </div>
  );
};

const GraphOverview: React.FC<{
  nodes: PipelineNode[];
  edges: Edge[];
  activeEdgeIds: Set<string>;
}> = ({ nodes, edges, activeEdgeIds }) => {
  const { setCenter } = useReactFlow();
  const { x, y, zoom } = useViewport();
  const canvasWidth = useStore((state) => state.width || 1);
  const canvasHeight = useStore((state) => state.height || 1);

  const { scale, offsetX, offsetY, width, height } = useMemo(() => {
    const padding = 24;
    const previewBoxes = nodes.map((node) => {
      const size = node.data.kind === "branch" ? NODE_PREVIEW_SIZE.branch : NODE_PREVIEW_SIZE.stage;
      return {
        id: node.id,
        x: node.position.x,
        y: node.position.y,
        width: size.width,
        height: size.height,
        cx: node.position.x + size.width / 2,
        cy: node.position.y + size.height / 2,
        status: node.data.status,
        label: node.data.displayName,
        kind: node.data.kind,
      };
    });

    const minX = Math.min(...previewBoxes.map((node) => node.x));
    const minY = Math.min(...previewBoxes.map((node) => node.y));
    const maxX = Math.max(...previewBoxes.map((node) => node.x + node.width));
    const maxY = Math.max(...previewBoxes.map((node) => node.y + node.height));
    const boundsWidth = Math.max(maxX - minX, 1);
    const boundsHeight = Math.max(maxY - minY, 1);
    const width = 180;
    const height = 136;
    const scale = Math.min((width - padding * 2) / boundsWidth, (height - padding * 2) / boundsHeight);

    return {
      scale,
      offsetX: padding - minX * scale,
      offsetY: padding - minY * scale,
      width,
      height,
    };
  }, [nodes]);

  const viewportRect = useMemo(() => {
    const viewLeft = -x / zoom;
    const viewTop = -y / zoom;
    const viewWidth = canvasWidth / zoom;
    const viewHeight = canvasHeight / zoom;

    return {
      x: offsetX + viewLeft * scale,
      y: offsetY + viewTop * scale,
      width: viewWidth * scale,
      height: viewHeight * scale,
    };
  }, [canvasHeight, canvasWidth, offsetX, offsetY, scale, x, y, zoom]);

  return (
    <button
      type="button"
      className="absolute bottom-3 right-3 z-10 rounded-xl border border-slate-200 bg-white/95 p-1.5 shadow-xl backdrop-blur-sm"
      aria-label="Graph overview"
      title="Click a node to focus it"
    >
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="block"
        role="img"
        aria-label="CRAG pipeline overview"
        onClick={(event) => {
          const rect = (event.currentTarget as SVGSVGElement).getBoundingClientRect();
          const localX = event.clientX - rect.left;
          const localY = event.clientY - rect.top;
          const graphX = (localX - offsetX) / scale;
          const graphY = (localY - offsetY) / scale;

          const hit = nodes.find((node) => {
            const size = node.data.kind === "branch" ? NODE_PREVIEW_SIZE.branch : NODE_PREVIEW_SIZE.stage;
            return graphX >= node.position.x
              && graphX <= node.position.x + size.width
              && graphY >= node.position.y
              && graphY <= node.position.y + size.height;
          });

          if (hit) {
            const size = hit.data.kind === "branch" ? NODE_PREVIEW_SIZE.branch : NODE_PREVIEW_SIZE.stage;
            setCenter(
              hit.position.x + size.width / 2,
              hit.position.y + size.height / 2,
              { zoom: 1.1, duration: 500 }
            );
          }
        }}
      >
        <defs>
          <pattern id="overview-dots" width="10" height="10" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="0.7" fill="#e2e8f0" />
          </pattern>
        </defs>

          <rect x="0" y="0" width={width} height={height} rx="12" fill="#f8fafc" />
          <rect x="0" y="0" width={width} height={height} rx="16" fill="url(#overview-dots)" opacity="0.45" />

        {edges.map((edge) => {
          const source = nodes.find((node) => node.id === edge.source);
          const target = nodes.find((node) => node.id === edge.target);
          if (!source || !target) {
            return null;
          }

              const sourceSize = source.data.kind === "branch" ? NODE_PREVIEW_SIZE.branch : NODE_PREVIEW_SIZE.stage;
              const targetSize = target.data.kind === "branch" ? NODE_PREVIEW_SIZE.branch : NODE_PREVIEW_SIZE.stage;
          const sourceX = offsetX + (source.position.x + sourceSize.width / 2) * scale;
          const sourceY = offsetY + (source.position.y + sourceSize.height) * scale;
          const targetX = offsetX + (target.position.x + targetSize.width / 2) * scale;
          const targetY = offsetY + target.position.y * scale;
          const midY = (sourceY + targetY) / 2;
          const isActive = activeEdgeIds.has(edge.id);

          return (
            <path
              key={edge.id}
              d={`M ${sourceX} ${sourceY} C ${sourceX} ${midY}, ${targetX} ${midY}, ${targetX} ${targetY}`}
              fill="none"
              stroke={isActive ? "#2563eb" : "#94a3b8"}
              strokeWidth={isActive ? 1.6 : 0.8}
              strokeDasharray={isActive ? "0" : "4 3"}
              opacity={isActive ? 0.95 : 0.55}
            />
          );
        })}

        {nodes.map((node) => {
          const size = node.data.kind === "branch" ? NODE_PREVIEW_SIZE.branch : NODE_PREVIEW_SIZE.stage;
          const fill = minimapColors[node.data.status].fill;
          const stroke = minimapColors[node.data.status].stroke;
          const xPos = offsetX + node.position.x * scale;
          const yPos = offsetY + node.position.y * scale;

          return (
            <g key={node.id}>
              <rect
                x={xPos}
                y={yPos}
                width={size.width * scale}
                height={size.height * scale}
                rx={node.data.kind === "branch" ? 8 : 10}
                fill={fill}
                stroke={stroke}
                strokeWidth={1}
              />
            </g>
          );
        })}

        <rect
          x={viewportRect.x}
          y={viewportRect.y}
          width={viewportRect.width}
          height={viewportRect.height}
          fill="rgba(37, 99, 235, 0.10)"
          stroke="rgba(37, 99, 235, 0.95)"
          strokeWidth="1.2"
          rx="10"
        />

        <text x={16} y={height - 12} fontSize="9" fontWeight="700" fill="#64748b">
          Overview
        </text>
      </svg>
    </button>
  );
};

const nodeTypes = {
  pipeline: CustomPipelineNode,
};

const branchNodeIdByDecision = (decision?: string) => {
  switch (decision) {
    case "CORRECT":
      return "branch_correct";
    case "AMBIGUOUS":
      return "branch_ambiguous";
    case "INCORRECT":
    default:
      return "branch_incorrect";
  }
};

export const ExecutionGraph = () => {
  const { selectedNodeId, selectNode, trace, nodeStatuses } = useExecution();

  const backendNodeStatusMap = useMemo(() => {
    const map: Record<string, NodeStatus> = {};
    trace?.nodes.forEach((node) => {
      map[node.node_id] = node.status as NodeStatus;
    });
    return map;
  }, [trace]);

  const executionSequence = useMemo(() => {
    const executedBackendNodes = trace?.nodes.filter((node) => node.status !== "SKIPPED").map((node) => node.node_id) ?? [];
    if (!trace) {
      return executedBackendNodes;
    }

    const branchNodeId = branchNodeIdByDecision(trace.decision_path);
    const path = ["retriever", "evaluator", "router", branchNodeId];

    executedBackendNodes.forEach((nodeId) => {
      if (!path.includes(nodeId)) {
        path.push(nodeId);
      }
    });

    return path;
  }, [trace]);

  const activeEdgeIds = useMemo(() => {
    const ids = new Set<string>();
    for (let index = 0; index < executionSequence.length - 1; index += 1) {
      ids.add(`${executionSequence[index]}->${executionSequence[index + 1]}`);
    }
    return ids;
  }, [executionSequence]);

  const nodes: PipelineNode[] = useMemo(() => {
    const selectedBranchNodeId = trace ? branchNodeIdByDecision(trace.decision_path) : null;

    const resolvedStatus = (nodeId: string, branchNodeId?: string): NodeStatus => {
      if (nodeStatuses[nodeId]) {
        return nodeStatuses[nodeId];
      }
      if (backendNodeStatusMap[nodeId]) {
        return backendNodeStatusMap[nodeId];
      }
      if (branchNodeId && nodeId === branchNodeId) {
        return "SUCCESS";
      }
      return "PENDING";
    };

    return [
      {
        id: "retriever",
        type: "pipeline",
        position: { x: 290, y: 20 },
        data: {
          label: "1. Retriever",
          displayName: "Retriever",
          type: "Retrieval",
          status: resolvedStatus("retriever"),
          kind: "stage",
          isRetriever: true,
        },
      },
      {
        id: "evaluator",
        type: "pipeline",
        position: { x: 290, y: 150 },
        data: {
          label: "2. Evaluator",
          displayName: "Retrieval Evaluator",
          type: "Evaluation",
          status: resolvedStatus("evaluator"),
          kind: "stage",
        },
      },
      {
        id: "router",
        type: "pipeline",
        position: { x: 290, y: 280 },
        data: {
          label: "3. Router",
          displayName: "Router",
          type: "Routing",
          status: resolvedStatus("router"),
          kind: "stage",
        },
      },
      {
        id: "branch_correct",
        type: "pipeline",
        position: { x: 40, y: 420 },
        data: {
          label: "Correct",
          displayName: "Correct",
          type: "Decision",
          status: selectedBranchNodeId === "branch_correct" ? "SUCCESS" : "SKIPPED",
          kind: "branch",
        },
      },
      {
        id: "branch_ambiguous",
        type: "pipeline",
        position: { x: 250, y: 420 },
        data: {
          label: "Ambiguous",
          displayName: "Ambiguous",
          type: "Decision",
          status: selectedBranchNodeId === "branch_ambiguous" ? "SUCCESS" : "SKIPPED",
          kind: "branch",
        },
      },
      {
        id: "branch_incorrect",
        type: "pipeline",
        position: { x: 460, y: 420 },
        data: {
          label: "Incorrect",
          displayName: "Incorrect",
          type: "Decision",
          status: selectedBranchNodeId === "branch_incorrect" ? "SUCCESS" : "SKIPPED",
          kind: "branch",
        },
      },
      {
        id: "knowledge_refinement",
        type: "pipeline",
        position: { x: 40, y: 575 },
        data: {
          label: "4. Refinement",
          displayName: "Knowledge Refinement",
          type: "Refinement",
          status: resolvedStatus("knowledge_refinement"),
          kind: "stage",
        },
      },
      {
        id: "knowledge_search",
        type: "pipeline",
        position: { x: 250, y: 575 },
        data: {
          label: "5. Search",
          displayName: "Knowledge Search",
          type: "Search",
          status: resolvedStatus("knowledge_search"),
          kind: "stage",
        },
      },
      {
        id: "query_rewrite",
        type: "pipeline",
        position: { x: 460, y: 575 },
        data: {
          label: "4. Rewrite",
          displayName: "Query Rewrite",
          type: "Rewrite",
          status: resolvedStatus("query_rewrite"),
          kind: "stage",
        },
      },
      {
        id: "generator",
        type: "pipeline",
        position: { x: 250, y: 730 },
        data: {
          label: "6. Generator",
          displayName: "Generator",
          type: "Generation",
          status: resolvedStatus("generator"),
          kind: "stage",
          isGenerator: true,
        },
      },
    ].map((node) => ({
      ...node,
      selected: node.id === selectedNodeId,
    })) as PipelineNode[];
  }, [backendNodeStatusMap, nodeStatuses, selectedNodeId, trace]);

  const edges: Edge[] = useMemo(() => {
    const edgePairs: Array<[string, string]> = [
      ["retriever", "evaluator"],
      ["evaluator", "router"],
      ["router", "branch_correct"],
      ["router", "branch_ambiguous"],
      ["router", "branch_incorrect"],
      ["branch_correct", "knowledge_refinement"],
      ["branch_ambiguous", "knowledge_refinement"],
      ["branch_ambiguous", "knowledge_search"],
      ["branch_incorrect", "query_rewrite"],
      ["query_rewrite", "knowledge_search"],
      ["knowledge_refinement", "generator"],
      ["knowledge_search", "generator"],
    ];

    return edgePairs.map(([source, target]) => {
      const id = `${source}->${target}`;
      const isActive = activeEdgeIds.has(id);

      return {
        id,
        source,
        target,
        type: "smoothstep",
        animated: isActive,
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: isActive ? "#2563eb" : "#94a3b8",
        },
        style: {
          stroke: isActive ? "#2563eb" : "#94a3b8",
          strokeWidth: isActive ? 2.5 : 1.4,
          opacity: isActive ? 1 : 0.65,
        },
      };
    });
  }, [activeEdgeIds]);

  const minZoom = 0.45;

  const handleNodeClick = (_event: React.MouseEvent, node: PipelineNode) => {
    if (node.id.startsWith("branch_")) {
      return;
    }
    selectNode(node.id);
  };

  return (
    <div className="relative h-full w-full bg-gradient-to-b from-slate-50 to-white">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.16, minZoom, maxZoom: 1.4 }}
        minZoom={minZoom}
        nodesConnectable={false}
        nodesDraggable={false}
        elementsSelectable
        zoomOnScroll
        zoomOnPinch
        zoomOnDoubleClick
        panOnDrag
        panOnScroll
        preventScrolling={false}
        onNodeClick={handleNodeClick}
        onPaneClick={() => selectNode(null)}
        className="h-full w-full"
      >
        <Controls showInteractive={false} />
        <Background variant={BackgroundVariant.Dots} gap={18} size={1} color="#cbd5e1" />
        <GraphOverview nodes={nodes} edges={edges} activeEdgeIds={activeEdgeIds} />
      </ReactFlow>
    </div>
  );
};
