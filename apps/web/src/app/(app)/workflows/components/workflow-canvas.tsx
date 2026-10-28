'use client';

import React, { useState } from 'react';
import { WorkflowDag, WorkflowNode, WorkflowEdge, WorkflowNodeType } from '@pactintel/shared-types';
import {
  Play,
  GitBranch,
  Zap,
  ShieldCheck,
  Clock,
  CheckCircle,
  Trash2,
  Settings,
  ArrowRight,
} from 'lucide-react';

interface WorkflowCanvasProps {
  initialDag?: WorkflowDag;
  onChange: (dag: WorkflowDag) => void;
  readOnly?: boolean;
}

const NODE_TYPE_METADATA: Record<
  WorkflowNodeType,
  {
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    color: string;
    border: string;
    bg: string;
  }
> = {
  trigger: {
    label: 'Trigger Event',
    icon: Play,
    color: 'text-blue-600',
    border: 'border-blue-300',
    bg: 'bg-blue-50',
  },
  condition: {
    label: 'Condition / Branch',
    icon: GitBranch,
    color: 'text-amber-600',
    border: 'border-amber-300',
    bg: 'bg-amber-50',
  },
  action: {
    label: 'System Action',
    icon: Zap,
    color: 'text-indigo-600',
    border: 'border-indigo-300',
    bg: 'bg-indigo-50',
  },
  risk_assessment: {
    label: 'Risk Assessment',
    icon: ShieldCheck,
    color: 'text-purple-600',
    border: 'border-purple-300',
    bg: 'bg-purple-50',
  },
  delay: {
    label: 'Timed Delay',
    icon: Clock,
    color: 'text-cyan-600',
    border: 'border-cyan-300',
    bg: 'bg-cyan-50',
  },
  end: {
    label: 'End Flow',
    icon: CheckCircle,
    color: 'text-emerald-600',
    border: 'border-emerald-300',
    bg: 'bg-emerald-50',
  },
};

export const WORKFLOW_TEMPLATES: Array<{ name: string; description: string; dag: WorkflowDag }> = [
  {
    name: 'Enterprise Contract with Deal Desk Approval',
    description:
      'Trigger on document creation, checks total deal value, requests manager approval for >$50k, and notifies finance.',
    dag: {
      nodes: [
        {
          id: 'node-1',
          type: 'trigger' as const,
          label: 'Document Created',
          config: {},
          position: { x: 50, y: 150 },
        },
        {
          id: 'node-2',
          type: 'condition' as const,
          label: 'Deal Value > $50,000?',
          config: { field: 'totalValue', operator: 'gt', value: 50000 },
          position: { x: 280, y: 150 },
        },
        {
          id: 'node-3',
          type: 'action' as const,
          label: 'Request Finance Approval',
          config: { actionType: 'request_approval', chainId: 'deal-desk' },
          position: { x: 530, y: 60 },
        },
        {
          id: 'node-4',
          type: 'action' as const,
          label: 'Send Document for Signature',
          config: { actionType: 'send_document' },
          position: { x: 530, y: 240 },
        },
        {
          id: 'node-5',
          type: 'delay' as const,
          label: 'Wait 3 Days',
          config: { delayDays: 3 },
          position: { x: 780, y: 240 },
        },
        {
          id: 'node-6',
          type: 'action' as const,
          label: 'Send Gentle Reminder',
          config: { actionType: 'send_notification', subject: 'Signature Reminder' },
          position: { x: 990, y: 240 },
        },
        {
          id: 'node-7',
          type: 'end' as const,
          label: 'Complete',
          config: {},
          position: { x: 1200, y: 240 },
        },
      ],
      edges: [
        { id: 'e1', source: 'node-1', target: 'node-2' },
        {
          id: 'e2',
          source: 'node-2',
          target: 'node-3',
          sourceHandle: 'true' as const,
          label: 'Yes (> $50k)',
        },
        {
          id: 'e3',
          source: 'node-2',
          target: 'node-4',
          sourceHandle: 'false' as const,
          label: 'No (Standard)',
        },
        { id: 'e4', source: 'node-3', target: 'node-4' },
        { id: 'e5', source: 'node-4', target: 'node-5' },
        { id: 'e6', source: 'node-5', target: 'node-6' },
        { id: 'e7', source: 'node-6', target: 'node-7' },
      ],
    },
  },
  {
    name: 'Fast-Track Standard NDA',
    description: 'Instant dispatch with automated risk scoring and CRM contact sync.',
    dag: {
      nodes: [
        {
          id: 't1',
          type: 'trigger' as const,
          label: 'Document Created',
          config: {},
          position: { x: 50, y: 150 },
        },
        {
          id: 'r1',
          type: 'risk_assessment' as const,
          label: 'Risk Score Check',
          config: {},
          position: { x: 280, y: 150 },
        },
        {
          id: 'a1',
          type: 'action' as const,
          label: 'Send Directly for Signature',
          config: { actionType: 'send_document' },
          position: { x: 530, y: 150 },
        },
        {
          id: 'a2',
          type: 'action' as const,
          label: 'Sync Deal Stage in CRM',
          config: { actionType: 'update_crm_field' },
          position: { x: 780, y: 150 },
        },
        {
          id: 'e1',
          type: 'end' as const,
          label: 'Done',
          config: {},
          position: { x: 1000, y: 150 },
        },
      ],
      edges: [
        { id: 'e1', source: 't1', target: 'r1' },
        { id: 'e2', source: 'r1', target: 'a1' },
        { id: 'e3', source: 'a1', target: 'a2' },
        { id: 'e4', source: 'a2', target: 'e1' },
      ],
    },
  },
];

export function WorkflowCanvas({ initialDag, onChange, readOnly = false }: WorkflowCanvasProps) {
  const [nodes, setNodes] = useState<WorkflowNode[]>(
    initialDag?.nodes && initialDag.nodes.length > 0
      ? initialDag.nodes
      : [
          {
            id: 'node-1',
            type: 'trigger',
            label: 'Document Created',
            config: {},
            position: { x: 60, y: 150 },
          },
          {
            id: 'node-2',
            type: 'end',
            label: 'Complete Agreement',
            config: {},
            position: { x: 500, y: 150 },
          },
        ],
  );

  const [edges, setEdges] = useState<WorkflowEdge[]>(
    initialDag?.edges && initialDag.edges.length > 0
      ? initialDag.edges
      : [{ id: 'edge-1', source: 'node-1', target: 'node-2' }],
  );

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [connectSourceId, setConnectSourceId] = useState<string | null>(null);
  const [draggedNodeId, setDraggedNodeId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const selectedNode = nodes.find((n) => n.id === selectedNodeId) || null;

  const updateDag = (newNodes: WorkflowNode[], newEdges: WorkflowEdge[]) => {
    setNodes(newNodes);
    setEdges(newEdges);
    onChange({ nodes: newNodes, edges: newEdges });
  };

  const handleAddNode = (type: WorkflowNodeType) => {
    if (readOnly) return;
    const newId = `node-${Date.now()}`;
    const meta = NODE_TYPE_METADATA[type];
    const newNode: WorkflowNode = {
      id: newId,
      type,
      label: meta.label,
      config: type === 'condition' ? { field: 'totalValue', operator: 'gt', value: 10000 } : {},
      position: {
        x: 260 + Math.floor(Math.random() * 80),
        y: 100 + Math.floor(Math.random() * 80),
      },
    };

    const newNodes = [...nodes, newNode];
    updateDag(newNodes, edges);
    setSelectedNodeId(newId);
  };

  const handleDeleteNode = (nodeId: string) => {
    if (readOnly) return;
    const newNodes = nodes.filter((n) => n.id !== nodeId);
    const newEdges = edges.filter((e) => e.source !== nodeId && e.target !== nodeId);
    if (selectedNodeId === nodeId) {
      setSelectedNodeId(null);
    }
    updateDag(newNodes, newEdges);
  };

  const handleNodeClick = (nodeId: string) => {
    if (connectSourceId && connectSourceId !== nodeId) {
      // Create new edge
      const newEdgeId = `edge-${Date.now()}`;
      const sourceNode = nodes.find((n) => n.id === connectSourceId);
      const isCondition = sourceNode?.type === 'condition';

      // Check existing edges from this condition node to assign handles
      const existingFromSource = edges.filter((e) => e.source === connectSourceId);
      const sourceHandle: 'true' | 'false' | 'default' = isCondition
        ? existingFromSource.length === 0
          ? 'true'
          : 'false'
        : 'default';
      const label = isCondition ? (sourceHandle === 'true' ? 'Yes' : 'No') : undefined;

      const newEdge: WorkflowEdge = {
        id: newEdgeId,
        source: connectSourceId,
        target: nodeId,
        sourceHandle,
        label,
      };

      const newEdges: WorkflowEdge[] = [
        ...edges.filter((e) => !(e.source === connectSourceId && e.target === nodeId)),
        newEdge,
      ];

      setConnectSourceId(null);
      updateDag(nodes, newEdges);
    } else {
      setSelectedNodeId(nodeId);
    }
  };

  const handleDeleteEdge = (edgeId: string) => {
    if (readOnly) return;
    const newEdges = edges.filter((e) => e.id !== edgeId);
    updateDag(nodes, newEdges);
  };

  const handleApplyTemplate = (dag: WorkflowDag) => {
    if (readOnly) return;
    updateDag(dag.nodes, dag.edges);
    setSelectedNodeId(null);
  };

  // Node Dragging Handlers
  const handleMouseDown = (e: React.MouseEvent, nodeId: string) => {
    if (readOnly) return;
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return;
    setDraggedNodeId(nodeId);
    setDragOffset({
      x: e.clientX - node.position.x,
      y: e.clientY - node.position.y,
    });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!draggedNodeId || readOnly) return;
    const newX = Math.max(20, Math.min(1800, e.clientX - dragOffset.x));
    const newY = Math.max(20, Math.min(900, e.clientY - dragOffset.y));

    const newNodes = nodes.map((n) =>
      n.id === draggedNodeId ? { ...n, position: { x: newX, y: newY } } : n,
    );
    setNodes(newNodes);
  };

  const handleMouseUp = () => {
    if (draggedNodeId) {
      onChange({ nodes, edges });
      setDraggedNodeId(null);
    }
  };

  return (
    <div
      className="flex flex-col h-[700px] border border-neutral-200 bg-neutral-50 rounded select-none relative overflow-hidden"
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    >
      {/* Top Toolbar */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-white border-b border-neutral-200">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">
            Palette:
          </span>
          {(Object.keys(NODE_TYPE_METADATA) as WorkflowNodeType[]).map((type) => {
            const meta = NODE_TYPE_METADATA[type];
            const Icon = meta.icon;
            return (
              <button
                key={type}
                type="button"
                onClick={() => handleAddNode(type)}
                disabled={readOnly}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded border border-neutral-200 bg-white hover:bg-neutral-50 text-neutral-700 transition ${
                  readOnly ? 'opacity-50 cursor-not-allowed' : ''
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${meta.color}`} />
                {meta.label}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          {!readOnly && (
            <div className="relative inline-block text-left">
              <select
                aria-label="Workflow Template Gallery"
                onChange={(e) => {
                  const idx = parseInt(e.target.value, 10);
                  if (!isNaN(idx) && WORKFLOW_TEMPLATES[idx]) {
                    handleApplyTemplate(WORKFLOW_TEMPLATES[idx].dag);
                  }
                }}
                defaultValue=""
                className="text-xs bg-white border border-neutral-200 text-neutral-700 py-1 px-2.5 rounded focus:outline-none focus:ring-1 focus:ring-blue-600"
              >
                <option value="" disabled>
                  Load Template...
                </option>
                {WORKFLOW_TEMPLATES.map((tmpl, i) => (
                  <option key={tmpl.name} value={i}>
                    {tmpl.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {connectSourceId && (
            <div className="inline-flex items-center gap-2 px-2.5 py-1 bg-blue-50 text-blue-700 text-xs font-medium rounded border border-blue-200">
              <span>Click target node to connect</span>
              <button
                type="button"
                onClick={() => setConnectSourceId(null)}
                className="underline hover:text-blue-900"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Main Canvas Area */}
      <div className="relative flex-1 bg-slate-50/70 overflow-auto">
        {/* SVG Connection Lines */}
        <svg className="absolute inset-0 w-[2000px] h-[1000px] pointer-events-none">
          <defs>
            <marker
              id="arrow"
              viewBox="0 0 10 10"
              refX="10"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#64748B" />
            </marker>
          </defs>

          {edges.map((edge) => {
            const sourceNode = nodes.find((n) => n.id === edge.source);
            const targetNode = nodes.find((n) => n.id === edge.target);
            if (!sourceNode || !targetNode) return null;

            const startX = sourceNode.position.x + 180;
            const startY = sourceNode.position.y + 40;
            const endX = targetNode.position.x;
            const endY = targetNode.position.y + 40;

            const deltaX = Math.abs(endX - startX) * 0.5;
            const pathData = `M ${startX} ${startY} C ${startX + deltaX} ${startY}, ${endX - deltaX} ${endY}, ${endX} ${endY}`;
            const midX = (startX + endX) / 2;
            const midY = (startY + endY) / 2;

            return (
              <g key={edge.id} className="pointer-events-auto group">
                <path
                  d={pathData}
                  stroke="#94A3B8"
                  strokeWidth="2"
                  fill="none"
                  markerEnd="url(#arrow)"
                  className="group-hover:stroke-blue-600 transition"
                />
                {edge.label && (
                  <text
                    x={midX}
                    y={midY - 6}
                    textAnchor="middle"
                    className="text-[10px] font-semibold fill-neutral-600 bg-white"
                  >
                    {edge.label}
                  </text>
                )}
                {!readOnly && (
                  <circle
                    cx={midX}
                    cy={midY}
                    r="8"
                    fill="#FFFFFF"
                    stroke="#EF4444"
                    strokeWidth="1.5"
                    className="opacity-0 group-hover:opacity-100 cursor-pointer transition"
                    onClick={() => handleDeleteEdge(edge.id)}
                  >
                    <title>Delete connection</title>
                  </circle>
                )}
              </g>
            );
          })}
        </svg>

        {/* Nodes Layer */}
        {nodes.map((node) => {
          const meta = NODE_TYPE_METADATA[node.type];
          const Icon = meta.icon;
          const isSelected = selectedNodeId === node.id;
          const isConnectSource = connectSourceId === node.id;

          return (
            <div
              key={node.id}
              style={{
                transform: `translate(${node.position.x}px, ${node.position.y}px)`,
              }}
              onMouseDown={(e) => handleMouseDown(e, node.id)}
              onClick={() => handleNodeClick(node.id)}
              className={`absolute w-[180px] p-3 rounded bg-white border shadow-sm cursor-move transition-shadow ${
                isSelected
                  ? 'border-blue-600 ring-2 ring-blue-100'
                  : isConnectSource
                    ? 'border-dashed border-blue-500 bg-blue-50'
                    : 'border-neutral-200 hover:border-neutral-300'
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-1.5">
                  <div className={`p-1 rounded ${meta.bg}`}>
                    <Icon className={`w-3.5 h-3.5 ${meta.color}`} />
                  </div>
                  <span className="text-[11px] font-medium text-neutral-500 uppercase tracking-wider">
                    {node.type}
                  </span>
                </div>

                {!readOnly && (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      aria-label="Connect Node"
                      onClick={(e) => {
                        e.stopPropagation();
                        setConnectSourceId(node.id);
                      }}
                      title="Connect to another node"
                      className="p-0.5 text-neutral-400 hover:text-blue-600 rounded"
                    >
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      aria-label="Delete Node"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteNode(node.id);
                      }}
                      title="Delete node"
                      className="p-0.5 text-neutral-400 hover:text-red-600 rounded"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>

              <div className="text-xs font-semibold text-neutral-950 truncate">{node.label}</div>

              {node.type === 'condition' && (
                <div className="mt-1 text-[10px] text-neutral-500 truncate">
                  if {(node.config as any).field} {(node.config as any).operator}{' '}
                  {(node.config as any).value}
                </div>
              )}

              {node.type === 'delay' && (
                <div className="mt-1 text-[10px] text-neutral-500">
                  Delay: {(node.config as any).delayDays || 0}d{' '}
                  {(node.config as any).delayHours || 0}h
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Node Inspector Drawer */}
      {selectedNode && (
        <div className="w-80 bg-white border-l border-neutral-200 p-4 absolute top-0 right-0 bottom-0 shadow-lg z-10 flex flex-col justify-between overflow-y-auto">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-neutral-200 mb-4">
              <div className="flex items-center gap-2">
                <Settings className="w-4 h-4 text-neutral-600" />
                <h4 className="text-xs font-bold text-neutral-950 uppercase tracking-wider">
                  Node Inspector
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setSelectedNodeId(null)}
                className="text-xs text-neutral-500 hover:text-neutral-900"
              >
                Close
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-neutral-700 mb-1">
                  Node Label
                </label>
                <input
                  type="text"
                  value={selectedNode.label}
                  disabled={readOnly}
                  onChange={(e) => {
                    const newNodes = nodes.map((n) =>
                      n.id === selectedNode.id ? { ...n, label: e.target.value } : n,
                    );
                    updateDag(newNodes, edges);
                  }}
                  className="w-full text-xs px-2.5 py-1.5 border border-neutral-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-600"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-700 mb-1">Node Type</label>
                <input
                  type="text"
                  value={selectedNode.type}
                  disabled
                  className="w-full text-xs px-2.5 py-1.5 bg-neutral-100 border border-neutral-200 rounded text-neutral-500 cursor-not-allowed"
                />
              </div>

              {selectedNode.type === 'condition' && (
                <div className="space-y-3 pt-2 border-t border-neutral-200">
                  <h5 className="text-[11px] font-semibold text-neutral-950 uppercase tracking-wider">
                    Condition Rule
                  </h5>
                  <div>
                    <label className="block text-[11px] font-medium text-neutral-600 mb-1">
                      Context Field
                    </label>
                    <input
                      type="text"
                      value={(selectedNode.config as any).field || ''}
                      disabled={readOnly}
                      placeholder="e.g. totalValue, documentType"
                      onChange={(e) => {
                        const newConfig = { ...selectedNode.config, field: e.target.value };
                        const newNodes = nodes.map((n) =>
                          n.id === selectedNode.id ? { ...n, config: newConfig } : n,
                        );
                        updateDag(newNodes, edges);
                      }}
                      className="w-full text-xs px-2 py-1 border border-neutral-200 rounded"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-neutral-600 mb-1">
                      Operator
                    </label>
                    <select
                      value={(selectedNode.config as any).operator || 'equals'}
                      disabled={readOnly}
                      onChange={(e) => {
                        const newConfig = { ...selectedNode.config, operator: e.target.value };
                        const newNodes = nodes.map((n) =>
                          n.id === selectedNode.id ? { ...n, config: newConfig } : n,
                        );
                        updateDag(newNodes, edges);
                      }}
                      className="w-full text-xs px-2 py-1 border border-neutral-200 rounded bg-white"
                    >
                      <option value="equals">Equals (==)</option>
                      <option value="not_equals">Not Equals (!=)</option>
                      <option value="gt">Greater Than (&gt;)</option>
                      <option value="gte">Greater Than or Equal (&gt;=)</option>
                      <option value="lt">Less Than (&lt;)</option>
                      <option value="contains">Contains</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-neutral-600 mb-1">
                      Target Value
                    </label>
                    <input
                      type="text"
                      value={(selectedNode.config as any).value ?? ''}
                      disabled={readOnly}
                      placeholder="e.g. 50000, nda, vip"
                      onChange={(e) => {
                        const newConfig = { ...selectedNode.config, value: e.target.value };
                        const newNodes = nodes.map((n) =>
                          n.id === selectedNode.id ? { ...n, config: newConfig } : n,
                        );
                        updateDag(newNodes, edges);
                      }}
                      className="w-full text-xs px-2 py-1 border border-neutral-200 rounded"
                    />
                  </div>
                </div>
              )}

              {selectedNode.type === 'action' && (
                <div className="space-y-3 pt-2 border-t border-neutral-200">
                  <h5 className="text-[11px] font-semibold text-neutral-950 uppercase tracking-wider">
                    Action Settings
                  </h5>
                  <div>
                    <label className="block text-[11px] font-medium text-neutral-600 mb-1">
                      Action Type
                    </label>
                    <select
                      value={(selectedNode.config as any).actionType || 'send_notification'}
                      disabled={readOnly}
                      onChange={(e) => {
                        const newConfig = { ...selectedNode.config, actionType: e.target.value };
                        const newNodes = nodes.map((n) =>
                          n.id === selectedNode.id ? { ...n, config: newConfig } : n,
                        );
                        updateDag(newNodes, edges);
                      }}
                      className="w-full text-xs px-2 py-1 border border-neutral-200 rounded bg-white"
                    >
                      <option value="send_notification">Send Notification / Email</option>
                      <option value="send_document">Send Document for Signature</option>
                      <option value="request_approval">Request Approval Chain</option>
                      <option value="collect_payment">Collect Payment</option>
                      <option value="update_crm_field">
                        Update CRM Field (HubSpot/Salesforce)
                      </option>
                      <option value="trigger_webhook">Trigger Outbound Webhook (ITSM/ERP)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-neutral-600 mb-1">
                      Recipient / Target Endpoint
                    </label>
                    <input
                      type="text"
                      value={
                        (selectedNode.config as any).recipientEmail ||
                        (selectedNode.config as any).endpoint ||
                        ''
                      }
                      disabled={readOnly}
                      placeholder="e.g. legal@corp.com or https://api..."
                      onChange={(e) => {
                        const newConfig = {
                          ...selectedNode.config,
                          recipientEmail: e.target.value,
                          endpoint: e.target.value,
                        };
                        const newNodes = nodes.map((n) =>
                          n.id === selectedNode.id ? { ...n, config: newConfig } : n,
                        );
                        updateDag(newNodes, edges);
                      }}
                      className="w-full text-xs px-2 py-1 border border-neutral-200 rounded"
                    />
                  </div>
                </div>
              )}

              {selectedNode.type === 'delay' && (
                <div className="space-y-3 pt-2 border-t border-neutral-200">
                  <h5 className="text-[11px] font-semibold text-neutral-950 uppercase tracking-wider">
                    Delay Parameters
                  </h5>
                  <div>
                    <label className="block text-[11px] font-medium text-neutral-600 mb-1">
                      Delay Days
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={(selectedNode.config as any).delayDays || 0}
                      disabled={readOnly}
                      onChange={(e) => {
                        const newConfig = {
                          ...selectedNode.config,
                          delayDays: parseInt(e.target.value, 10) || 0,
                        };
                        const newNodes = nodes.map((n) =>
                          n.id === selectedNode.id ? { ...n, config: newConfig } : n,
                        );
                        updateDag(newNodes, edges);
                      }}
                      className="w-full text-xs px-2 py-1 border border-neutral-200 rounded"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-neutral-600 mb-1">
                      Delay Hours
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={(selectedNode.config as any).delayHours || 0}
                      disabled={readOnly}
                      onChange={(e) => {
                        const newConfig = {
                          ...selectedNode.config,
                          delayHours: parseInt(e.target.value, 10) || 0,
                        };
                        const newNodes = nodes.map((n) =>
                          n.id === selectedNode.id ? { ...n, config: newConfig } : n,
                        );
                        updateDag(newNodes, edges);
                      }}
                      className="w-full text-xs px-2 py-1 border border-neutral-200 rounded"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {!readOnly && (
            <div className="pt-3 border-t border-neutral-200">
              <button
                type="button"
                onClick={() => handleDeleteNode(selectedNode.id)}
                className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-red-700 bg-red-50 hover:bg-red-100 rounded border border-red-200 transition"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete Node
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default WorkflowCanvas;
