'use client';

import React, { useState, useEffect, use } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Clock,
  Play,
  RotateCcw,
  SkipForward,
  Pause,
  AlertTriangle,
  Layers,
  ChevronRight,
  ChevronDown,
  Code2,
} from 'lucide-react';
import { WorkflowInstanceResponseDto, WorkflowNodeExecutionDto } from '@pactintel/shared-types';

export default function WorkflowInstanceDetailPage({
  params,
}: {
  params: Promise<{ instanceId: string }>;
}) {
  const resolvedParams = use(params);
  const instanceId = resolvedParams.instanceId;

  const [instance, setInstance] = useState<WorkflowInstanceResponseDto | null>(null);
  const [nodeExecutions, setNodeExecutions] = useState<WorkflowNodeExecutionDto[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [actionSuccessMessage, setActionSuccessMessage] = useState<string | null>(null);

  // Expanded payloads in timeline
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({});

  // Action Loading states
  const [isResuming, setIsResuming] = useState<boolean>(false);
  const [isHalting, setIsHalting] = useState<boolean>(false);
  const [isSkipping, setIsSkipping] = useState<boolean>(false);

  const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

  const fetchInstance = async () => {
    try {
      setIsLoading(true);
      setErrorMessage(null);

      const res = await fetch(`${apiBase}/api/v1/workflows/instances/${instanceId}`, {
        credentials: 'include',
      });

      if (!res.ok) {
        throw new Error(`Failed to load execution instance (${res.statusText})`);
      }

      const json = await res.json();
      const inst: WorkflowInstanceResponseDto = json.data || json;
      setInstance(inst);

      // Node executions if present on instance or empty list
      if ((inst as any).nodeExecutions) {
        setNodeExecutions((inst as any).nodeExecutions);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error loading execution audit';
      setErrorMessage(msg);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (instanceId) {
      fetchInstance();
    }
  }, [instanceId, apiBase]);

  // Admin Actions
  const handleResume = async () => {
    try {
      setIsResuming(true);
      setActionSuccessMessage(null);
      const res = await fetch(`${apiBase}/api/v1/workflows/instances/${instanceId}/resume`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'resume' }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        throw new Error(errJson?.error?.message || 'Failed to resume workflow');
      }

      setActionSuccessMessage('Workflow resumed successfully.');
      setTimeout(() => setActionSuccessMessage(null), 4000);
      await fetchInstance();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error resuming workflow';
      setErrorMessage(msg);
    } finally {
      setIsResuming(false);
    }
  };

  const handleHalt = async () => {
    try {
      setIsHalting(true);
      setActionSuccessMessage(null);
      const res = await fetch(`${apiBase}/api/v1/workflows/instances/${instanceId}/halt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'halt' }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        throw new Error(errJson?.error?.message || 'Failed to halt workflow');
      }

      setActionSuccessMessage('Workflow halted successfully.');
      setTimeout(() => setActionSuccessMessage(null), 4000);
      await fetchInstance();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error halting workflow';
      setErrorMessage(msg);
    } finally {
      setIsHalting(false);
    }
  };

  const handleSkipNode = async () => {
    try {
      setIsSkipping(true);
      setActionSuccessMessage(null);
      const res = await fetch(`${apiBase}/api/v1/workflows/instances/${instanceId}/skip-node`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'skip' }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        throw new Error(errJson?.error?.message || 'Failed to skip node');
      }

      setActionSuccessMessage('Current node skipped. Evaluation proceeding.');
      setTimeout(() => setActionSuccessMessage(null), 4000);
      await fetchInstance();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error skipping node';
      setErrorMessage(msg);
    } finally {
      setIsSkipping(false);
    }
  };

  const toggleNodeExpand = (nodeId: string) => {
    setExpandedNodes((prev) => ({
      ...prev,
      [nodeId]: !prev[nodeId],
    }));
  };

  if (isLoading && !instance) {
    return (
      <div className="w-full flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-[#2563EB] border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-slate-500 font-medium">Loading execution audit record...</p>
        </div>
      </div>
    );
  }

  if (errorMessage && !instance) {
    return (
      <div className="p-8 max-w-xl mx-auto text-center">
        <AlertTriangle className="w-12 h-12 text-rose-500 mx-auto mb-3" />
        <h2 className="text-lg font-semibold text-slate-900">Execution Not Found</h2>
        <p className="text-sm text-slate-600 mt-2">{errorMessage}</p>
        <div className="mt-6">
          <Link
            href="/workflows"
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-[#2563EB] rounded hover:bg-blue-700"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Workflows
          </Link>
        </div>
      </div>
    );
  }

  if (!instance) return null;

  const started = new Date(instance.startedAt).getTime();
  const completed = instance.completedAt ? new Date(instance.completedAt).getTime() : null;
  const durationText = completed
    ? `${((completed - started) / 1000).toFixed(2)} seconds`
    : 'Execution in progress';

  const triggerEventName =
    (instance.triggerPayload?.event as string) ||
    (instance.triggerPayload?.triggerEvent as string) ||
    instance.workflowName ||
    'Workflow Trigger';

  return (
    <div className="w-full space-y-6">
      {/* Notifications */}
      {actionSuccessMessage && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm rounded flex items-center justify-between">
          <span>{actionSuccessMessage}</span>
          <button
            onClick={() => setActionSuccessMessage(null)}
            className="text-emerald-700 hover:text-emerald-900 font-medium"
          >
            Dismiss
          </button>
        </div>
      )}

      {errorMessage && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 text-sm rounded flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button
            onClick={() => setErrorMessage(null)}
            className="text-rose-700 hover:text-rose-900 font-medium"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/workflows"
            className="p-1.5 text-slate-500 hover:text-slate-800 rounded border border-slate-200 hover:bg-slate-50"
            title="Return to workflows"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold text-slate-900">Execution Audit</h1>
              <span className="font-mono text-xs text-slate-500 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded">
                {instance.id}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Triggered by event{' '}
              <span className="font-mono font-medium text-slate-700">{triggerEventName}</span>
            </p>
          </div>
        </div>

        {/* Status Badge & Administrative Action Buttons */}
        <div className="flex items-center gap-2">
          {/* Status Badge */}
          {instance.status === 'completed' && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              Completed
            </span>
          )}
          {instance.status === 'failed' && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium bg-rose-50 text-rose-700 border border-rose-200">
              <XCircle className="w-3.5 h-3.5 text-rose-600" />
              Failed
            </span>
          )}
          {instance.status === 'halted' && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
              <Clock className="w-3.5 h-3.5 text-amber-600" />
              Halted
            </span>
          )}
          {instance.status === 'running' && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
              <Play className="w-3.5 h-3.5 text-blue-600 animate-pulse" />
              Running
            </span>
          )}

          {/* Admin Buttons: Resume, Halt, Skip */}
          {(instance.status === 'failed' || instance.status === 'halted') && (
            <button
              onClick={handleResume}
              disabled={isResuming}
              className="inline-flex items-center gap-1 px-3 py-1 text-xs font-medium text-white bg-[#2563EB] rounded hover:bg-blue-700 disabled:opacity-50"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              {isResuming ? 'Resuming...' : 'Resume Workflow'}
            </button>
          )}

          {instance.status === 'running' && (
            <button
              onClick={handleHalt}
              disabled={isHalting}
              className="inline-flex items-center gap-1 px-3 py-1 text-xs font-medium text-amber-800 bg-amber-50 border border-amber-200 rounded hover:bg-amber-100 disabled:opacity-50"
            >
              <Pause className="w-3.5 h-3.5" />
              {isHalting ? 'Halting...' : 'Halt'}
            </button>
          )}

          {instance.status !== 'completed' && (
            <button
              onClick={handleSkipNode}
              disabled={isSkipping}
              className="inline-flex items-center gap-1 px-3 py-1 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-50 disabled:opacity-50"
            >
              <SkipForward className="w-3.5 h-3.5" />
              {isSkipping ? 'Skipping...' : 'Skip Node'}
            </button>
          )}

          <button
            onClick={fetchInstance}
            title="Refresh state"
            className="p-1 text-slate-500 hover:text-slate-800 rounded border border-slate-200 hover:bg-slate-50"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Failure Alert Box */}
      {instance.errorMessage && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-xs font-semibold text-rose-900">Execution Error Diagnostic</h3>
              <p className="text-xs font-mono text-rose-800 mt-1 whitespace-pre-wrap">
                {instance.errorMessage}
              </p>
              {instance.currentNodeId && (
                <div className="text-xs text-rose-700 mt-2">
                  Failed at node ID:{' '}
                  <span className="font-mono font-semibold">{instance.currentNodeId}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Execution Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 bg-white border border-slate-200 rounded">
          <span className="text-xs font-medium text-slate-500">Workflow Blueprint</span>
          <div className="mt-1">
            <Link
              href={`/workflows/${instance.workflowId}`}
              className="text-sm font-semibold text-[#2563EB] hover:underline"
            >
              Open Blueprint
            </Link>
          </div>
          <div className="text-xs text-slate-400 font-mono mt-0.5 truncate">
            {instance.workflowId}
          </div>
        </div>

        <div className="p-4 bg-white border border-slate-200 rounded">
          <span className="text-xs font-medium text-slate-500">Execution Depth</span>
          <div className="mt-1 text-sm font-semibold text-slate-900 font-mono">
            {instance.chainDepth} / 20 levels
          </div>
          <div className="text-xs text-slate-500 mt-0.5">
            {instance.visitedNodes ? `${instance.visitedNodes.length} nodes traversed` : ''}
          </div>
        </div>

        <div className="p-4 bg-white border border-slate-200 rounded">
          <span className="text-xs font-medium text-slate-500">Total Duration</span>
          <div className="mt-1 text-sm font-semibold text-slate-900 font-mono">{durationText}</div>
          <div className="text-xs text-slate-500 mt-0.5">
            Started: {new Date(instance.startedAt).toLocaleTimeString()}
          </div>
        </div>

        <div className="p-4 bg-white border border-slate-200 rounded">
          <span className="text-xs font-medium text-slate-500">Active Node</span>
          <div className="mt-1 text-sm font-semibold text-slate-900 font-mono truncate">
            {instance.currentNodeId || 'Completed (None)'}
          </div>
          <div className="text-xs text-slate-500 mt-0.5">
            {instance.status === 'completed' ? 'All branches resolved' : 'Waiting on evaluation'}
          </div>
        </div>
      </div>

      {/* Visited Nodes DAG Trail */}
      <div className="bg-white border border-slate-200 rounded p-4">
        <h2 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-1.5">
          <Layers className="w-4 h-4 text-blue-600" />
          DAG Node Traversal Trail
        </h2>

        {!instance.visitedNodes || instance.visitedNodes.length === 0 ? (
          <p className="text-xs text-slate-500">No nodes have been executed yet.</p>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            {instance.visitedNodes.map((nodeId, index) => (
              <React.Fragment key={index}>
                <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded text-xs font-mono text-slate-800">
                  <span className="w-4 h-4 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-[10px] font-bold">
                    {index + 1}
                  </span>
                  <span>{nodeId}</span>
                </div>
                {index < instance.visitedNodes.length - 1 && (
                  <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                )}
              </React.Fragment>
            ))}
          </div>
        )}
      </div>

      {/* Step-by-Step Node Execution Audits */}
      {nodeExecutions && nodeExecutions.length > 0 && (
        <div className="bg-white border border-slate-200 rounded">
          <div className="p-4 border-b border-slate-200">
            <h2 className="text-sm font-semibold text-slate-900">
              Detailed Node Execution Log ({nodeExecutions.length})
            </h2>
          </div>
          <div className="divide-y divide-slate-200">
            {nodeExecutions.map((exec) => {
              const isExpanded = !!expandedNodes[exec.id];
              const duration =
                exec.completedAt && exec.startedAt
                  ? Math.max(
                      0,
                      new Date(exec.completedAt).getTime() - new Date(exec.startedAt).getTime(),
                    )
                  : 0;

              return (
                <div key={exec.id} className="p-4">
                  <div
                    className="flex items-center justify-between cursor-pointer"
                    onClick={() => toggleNodeExpand(exec.id)}
                  >
                    <div className="flex items-center gap-2.5">
                      <button className="text-slate-400 p-0.5">
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4" />
                        ) : (
                          <ChevronRight className="w-4 h-4" />
                        )}
                      </button>
                      <span className="text-xs font-mono font-medium text-slate-900">
                        {exec.nodeId}
                      </span>
                      <span className="text-xs px-2 py-0.5 rounded font-mono bg-slate-100 text-slate-600 border border-slate-200">
                        {exec.nodeType}
                      </span>
                    </div>

                    <div className="flex items-center gap-3">
                      {exec.status === 'completed' ? (
                        <span className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded font-medium">
                          Completed
                        </span>
                      ) : exec.status === 'failed' ? (
                        <span className="text-xs text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded font-medium">
                          Failed
                        </span>
                      ) : (
                        <span className="text-xs text-slate-600 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded">
                          {exec.status}
                        </span>
                      )}
                      <span className="text-xs font-mono text-slate-500">{duration}ms</span>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="mt-3 pl-6 space-y-2 text-xs">
                      {exec.errorMessage && (
                        <div className="p-2.5 bg-rose-50 border border-rose-200 rounded text-rose-800 font-mono">
                          {exec.errorMessage}
                        </div>
                      )}
                      <div>
                        <span className="font-semibold text-slate-700">Output Payload:</span>
                        <pre className="mt-1 p-2 bg-slate-900 text-slate-100 rounded font-mono text-[11px] overflow-x-auto">
                          {JSON.stringify(exec.output || {}, null, 2)}
                        </pre>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Context Payload & Runtime Memory Inspector */}
      <div className="bg-white border border-slate-200 rounded">
        <div className="p-4 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Code2 className="w-4 h-4 text-slate-500" />
            <h2 className="text-sm font-semibold text-slate-900">
              Runtime Context Payload & Memory
            </h2>
          </div>
          <span className="text-xs font-mono text-slate-500">JSON State</span>
        </div>
        <div className="p-4 bg-slate-900 rounded-b overflow-x-auto">
          <pre className="text-xs font-mono text-emerald-400">
            {JSON.stringify(instance.triggerPayload || {}, null, 2)}
          </pre>
        </div>
      </div>
    </div>
  );
}
