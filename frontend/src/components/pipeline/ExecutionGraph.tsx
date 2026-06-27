import React, { useMemo } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
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
      </ReactFlow>
    </div>
  );
};
