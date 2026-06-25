import React, { useEffect, useMemo } from "react";
import { 
  ReactFlow, 
  Handle, 
  Position, 
  useNodesState, 
  useEdgesState 
} from "@xyflow/react";
import type { Node, Edge, NodeProps } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useExecution } from "../../hooks/useExecution";

// 1. Custom Node Data Type with index signature for Record compatibility
type CustomNodeData = {
  label: string;
  displayName: string;
  status: "PENDING" | "RUNNING" | "SUCCESS" | "FAILED" | "SKIPPED";
  type: string;
  durationMs?: number;
  isRetriever?: boolean;
  isGenerator?: boolean;
  [key: string]: unknown;
};

type PipelineNode = Node<CustomNodeData>;
type PipelineNodeProps = NodeProps<PipelineNode>;

const CustomPipelineNode: React.FC<PipelineNodeProps> = ({ 
  data, 
  selected 
}) => {
  const getStatusStyles = () => {
    switch (data.status) {
      case "SUCCESS":
        return "border-emerald-500 bg-emerald-950/20 text-emerald-300 shadow-emerald-950/20";
      case "FAILED":
        return "border-red-500 bg-red-950/20 text-red-400 shadow-red-950/20";
      case "SKIPPED":
        return "border-neutral-800 bg-neutral-900/10 text-neutral-600 opacity-40 shadow-transparent";
      case "RUNNING":
        return "border-amber-500 bg-amber-950/20 text-amber-300 shadow-amber-950/20 border-dashed";
      default:
        return "border-neutral-800 bg-neutral-900/60 text-neutral-400 shadow-neutral-950/25";
    }
  };

  const getStatusBadge = () => {
    switch (data.status) {
      case "SUCCESS": return "Ready";
      case "FAILED": return "Failed";
      case "SKIPPED": return "Skipped";
      case "RUNNING": return "Running";
      default: return "Pending";
    }
  };

  return (
    <div 
      className={`px-4 py-3 rounded-xl border-2 shadow-md min-w-[150px] transition-all duration-300 flex flex-col items-center justify-center font-sans ${getStatusStyles()} ${
        selected ? "ring-2 ring-primary ring-offset-2 ring-offset-neutral-950 scale-105" : ""
      }`}
    >
      {/* Input Handle */}
      {!data.isRetriever && (
        <Handle
          type="target"
          position={Position.Top}
          className="w-2.5 h-2.5 bg-neutral-700 border border-neutral-600"
        />
      )}

      {/* Node Content */}
      <span className="text-[10px] uppercase tracking-wider font-bold text-neutral-500 mb-0.5">
        {data.type}
      </span>
      <span className="text-xs font-bold text-neutral-100 text-center">
        {data.displayName}
      </span>
      
      {/* Node Status Indicator */}
      <div className="flex items-center space-x-1 mt-1.5">
        <span 
          className={`h-1.5 w-1.5 rounded-full ${
            data.status === "SUCCESS"
              ? "bg-emerald-500"
              : data.status === "FAILED"
                ? "bg-red-500"
                : data.status === "RUNNING"
                  ? "bg-amber-500"
                  : "bg-neutral-600"
          }`}
        />
        <span className="text-[8px] uppercase tracking-wider font-bold opacity-75">
          {getStatusBadge()}
        </span>
      </div>

      {/* Output Handle */}
      {!data.isGenerator && (
        <Handle
          type="source"
          position={Position.Bottom}
          className="w-2.5 h-2.5 bg-neutral-700 border border-neutral-600"
        />
      )}
    </div>
  );
};

// 2. Map Node Types
const nodeTypes = {
  pipeline: CustomPipelineNode,
};

export const ExecutionGraph: React.FC = () => {
  const { trace, selectedNodeId, selectNode } = useExecution();
  
  // Statically compute standard nodes list
  const initialNodes: PipelineNode[] = useMemo(() => [
    {
      id: "retriever",
      type: "pipeline",
      position: { x: 140, y: 15 },
      data: { label: "1. Retriever", displayName: "Retriever", type: "Retrieval", status: "PENDING", isRetriever: true },
    },
    {
      id: "evaluator",
      type: "pipeline",
      position: { x: 140, y: 100 },
      data: { label: "2. Evaluator", displayName: "Retrieval Evaluator", type: "Evaluation", status: "PENDING" },
    },
    {
      id: "router",
      type: "pipeline",
      position: { x: 140, y: 185 },
      data: { label: "3. Router", displayName: "Router", type: "Routing", status: "PENDING" },
    },
    {
      id: "knowledge_refinement",
      type: "pipeline",
      position: { x: -20, y: 285 },
      data: { label: "4A. Refiner", displayName: "Knowledge Refinement", type: "Refinement", status: "PENDING" },
    },
    {
      id: "knowledge_search",
      type: "pipeline",
      position: { x: 140, y: 285 },
      data: { label: "4B. Web Search", displayName: "Knowledge Search", type: "Search", status: "PENDING" },
    },
    {
      id: "query_rewrite",
      type: "pipeline",
      position: { x: 300, y: 285 },
      data: { label: "4C. Rewrite", displayName: "Query Rewrite", type: "Query Rewrite", status: "PENDING" },
    },
    {
      id: "generator",
      type: "pipeline",
      position: { x: 140, y: 395 },
      data: { label: "5. Generator", displayName: "Final Generator", type: "Generation", status: "PENDING", isGenerator: true },
    },
  ], []);

  const initialEdges: Edge[] = useMemo(() => [
    // Downstream connections
    { id: "e-retriever-evaluator", source: "retriever", target: "evaluator", animated: false, style: { stroke: "#444" } },
    { id: "e-evaluator-router", source: "evaluator", target: "router", animated: false, style: { stroke: "#444" } },
    
    // Routing branch connections
    { id: "e-router-refiner", source: "router", target: "knowledge_refinement", animated: false, style: { stroke: "#444" } },
    { id: "e-router-search", source: "router", target: "knowledge_search", animated: false, style: { stroke: "#444" } },
    { id: "e-router-rewrite", source: "router", target: "query_rewrite", animated: false, style: { stroke: "#444" } },
    
    // Merge connections downstream
    { id: "e-refiner-generator", source: "knowledge_refinement", target: "generator", animated: false, style: { stroke: "#444" } },
    { id: "e-search-generator", source: "knowledge_search", target: "generator", animated: false, style: { stroke: "#444" } },
    { id: "e-rewrite-search", source: "query_rewrite", target: "knowledge_search", animated: false, style: { stroke: "#444" } },
  ], []);

  const [nodes, setNodes, onNodesChange] = useNodesState<PipelineNode>(initialNodes);
  const [edges, setEdges] = useEdgesState(initialEdges);

  // Sync trace events and selectedNodeId with node statuses and selections
  useEffect(() => {
    setNodes((nds) =>
      nds.map((n) => {
        const matchingNode = trace ? trace.nodes.find((tn) => tn.node_id === n.id) : null;
        const nextStatus = (matchingNode ? matchingNode.status : "PENDING") as CustomNodeData["status"];
        
        return {
          ...n,
          selected: n.id === selectedNodeId,
          data: {
            ...n.data,
            status: nextStatus,
          } as CustomNodeData,
        };
      })
    );

    if (!trace) {
      setEdges((egs) => egs.map((e) => ({ ...e, animated: false, style: { stroke: "#444" } })));
      return;
    }

    // Style edges to highlight the active paths (statically)
    setEdges((egs) =>
      egs.map((edge) => {
        let isSourceActive = false;
        let isTargetActive = false;

        const sourceNode = trace.nodes.find((tn) => tn.node_id === edge.source);
        const targetNode = trace.nodes.find((tn) => tn.node_id === edge.target);

        if (sourceNode && sourceNode.status === "SUCCESS") isSourceActive = true;
        if (targetNode && (targetNode.status === "SUCCESS" || targetNode.status === "RUNNING")) isTargetActive = true;

        const isActiveEdge = isSourceActive && isTargetActive;

        return {
          ...edge,
          style: {
            stroke: isActiveEdge ? "#2563eb" : "#444",
            strokeWidth: isActiveEdge ? 2 : 1,
          },
        };
      })
    );
  }, [trace, selectedNodeId, setNodes, setEdges]);

  const handleNodeClick = (_event: any, node: Node) => {
    selectNode(node.id);
  };

  return (
    <div className="flex-1 w-full h-full bg-neutral-950/40 relative">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodeClick={handleNodeClick}
        onNodesChange={onNodesChange}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        nodesConnectable={false}
        nodesDraggable={false}
        elementsSelectable={true}
        zoomOnScroll={false}
        zoomOnPinch={false}
        panOnDrag={false}
        zoomOnDoubleClick={false}
        className="w-full h-full"
      />
    </div>
  );
};
