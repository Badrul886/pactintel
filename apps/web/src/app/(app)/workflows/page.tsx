'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Play,
  Plus,
  Search,
  Filter,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  RotateCcw,
  Layers,
  Activity,
  ExternalLink,
  Trash2,
  Edit2,
  ToggleLeft,
  ToggleRight,
  ShieldAlert,
} from 'lucide-react';
import {
  WorkflowDefinitionResponseDto,
  WorkflowInstanceResponseDto,
  WorkflowMetricsDto,
} from '@pactintel/shared-types';

export default function WorkflowsDashboardPage() {
  // Tab State: 'blueprints' | 'executions'
  const [activeTab, setActiveTab] = useState<'blueprints' | 'executions'>('blueprints');

  // Metrics State
  const [metrics, setMetrics] = useState<WorkflowMetricsDto>({
    totalTriggered: 0,
    totalCompleted: 0,
    totalFailed: 0,
    totalHalted: 0,
    activeWorkflowsCount: 0,
  });

  // Blueprints State
  const [blueprints, setBlueprints] = useState<WorkflowDefinitionResponseDto[]>([]);
  const [blueprintStatusFilter, setBlueprintStatusFilter] = useState<string>('all');
  const [blueprintSearch, setBlueprintSearch] = useState<string>('');

  // Executions State
  const [executions, setExecutions] = useState<WorkflowInstanceResponseDto[]>([]);
  const [executionStatusFilter, setExecutionStatusFilter] = useState<string>('all');

  // Loading & Error States
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Deletion Confirmation Modal State
  const [deleteModalOpen, setDeleteModalOpen] = useState<boolean>(false);
  const [workflowToDelete, setWorkflowToDelete] = useState<WorkflowDefinitionResponseDto | null>(
    null,
  );
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      // 1. Fetch Metrics
      const metricsRes = await fetch(`${apiBase}/api/v1/workflows/metrics`, {
        credentials: 'include',
      });
      if (metricsRes.ok) {
        const metricsJson = await metricsRes.json();
        setMetrics(metricsJson.data || metricsJson);
      }

      // 2. Fetch Blueprints
      const bpStatusQuery =
        blueprintStatusFilter !== 'all' ? `?status=${blueprintStatusFilter}` : '';
      const blueprintsRes = await fetch(`${apiBase}/api/v1/workflows${bpStatusQuery}`, {
        credentials: 'include',
      });
      if (blueprintsRes.ok) {
        const bpJson = await blueprintsRes.json();
        setBlueprints(bpJson.data?.items || bpJson.items || bpJson || []);
      }

      // 3. Fetch Executions
      const exStatusQuery =
        executionStatusFilter !== 'all' ? `?status=${executionStatusFilter}` : '';
      const executionsRes = await fetch(`${apiBase}/api/v1/workflows/instances${exStatusQuery}`, {
        credentials: 'include',
      });
      if (executionsRes.ok) {
        const exJson = await executionsRes.json();
        setExecutions(exJson.data?.items || exJson.items || exJson || []);
      }
    } catch {
      setErrorMessage(
        'Failed to connect to workflow engine service. Please verify your connection.',
      );
    } finally {
      setIsLoading(false);
    }
  }, [apiBase, blueprintStatusFilter, executionStatusFilter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Toggle workflow status (draft <-> active)
  const handleToggleStatus = async (wf: WorkflowDefinitionResponseDto) => {
    try {
      const nextStatus = wf.status === 'active' ? 'draft' : 'active';
      const res = await fetch(`${apiBase}/api/v1/workflows/${wf.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status: nextStatus }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.error?.message || 'Failed to update workflow status');
      }

      setSuccessMessage(`Workflow "${wf.name}" is now ${nextStatus}.`);
      setTimeout(() => setSuccessMessage(null), 4000);
      await fetchData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error updating workflow status';
      setErrorMessage(msg);
    }
  };

  // Open delete confirmation modal
  const openDeleteModal = (wf: WorkflowDefinitionResponseDto) => {
    setWorkflowToDelete(wf);
    setDeleteModalOpen(true);
  };

  // Confirm deletion
  const handleConfirmDelete = async () => {
    if (!workflowToDelete) return;
    try {
      setIsDeleting(true);
      const res = await fetch(`${apiBase}/api/v1/workflows/${workflowToDelete.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.error?.message || 'Failed to delete workflow');
      }

      setSuccessMessage(`Workflow "${workflowToDelete.name}" deleted.`);
      setTimeout(() => setSuccessMessage(null), 4000);
      setDeleteModalOpen(false);
      setWorkflowToDelete(null);
      await fetchData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error deleting workflow';
      setErrorMessage(msg);
    } finally {
      setIsDeleting(false);
    }
  };

  // Filtered blueprints
  const filteredBlueprints = blueprints.filter((b) => {
    if (!blueprintSearch.trim()) return true;
    const query = blueprintSearch.toLowerCase();
    return (
      b.name.toLowerCase().includes(query) ||
      b.triggerEvent.toLowerCase().includes(query) ||
      (b.description && b.description.toLowerCase().includes(query))
    );
  });

  const successRate =
    metrics.totalTriggered > 0
      ? ((metrics.totalCompleted / metrics.totalTriggered) * 100).toFixed(1)
      : '100.0';

  return (
    <div className="w-full">
      {/* Toast Notifications */}
      {successMessage && (
        <div className="mb-4 p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm rounded flex items-center justify-between">
          <span>{successMessage}</span>
          <button
            onClick={() => setSuccessMessage(null)}
            className="text-emerald-600 hover:text-emerald-900 font-medium"
          >
            Dismiss
          </button>
        </div>
      )}

      {errorMessage && (
        <div className="mb-4 p-4 bg-rose-50 border border-rose-200 text-rose-800 text-sm rounded flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button
            onClick={() => {
              setErrorMessage(null);
              fetchData();
            }}
            className="text-rose-700 hover:text-rose-900 font-medium underline ml-4 text-xs"
          >
            Retry
          </button>
        </div>
      )}

      {/* Header Banner */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">
            Workflow Orchestration
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Visual multi-branch DAG workflow automation across approvals, risk scoring,
            integrations, and webhooks.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={fetchData}
            title="Refresh data"
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-50"
          >
            <RotateCcw className="w-4 h-4 text-slate-500" />
            Refresh
          </button>
          <Link
            href="/workflows/new"
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-[#2563EB] rounded hover:bg-blue-700"
          >
            <Plus className="w-4 h-4" />
            Create Workflow
          </Link>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="p-4 bg-white border border-slate-200 rounded">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Active Workflows</span>
            <Layers className="w-4 h-4 text-blue-600" />
          </div>
          <div className="mt-2 text-2xl font-semibold text-slate-900">
            {metrics.activeWorkflowsCount}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            {blueprints.length} configured blueprints
          </div>
        </div>

        <div className="p-4 bg-white border border-slate-200 rounded">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Total Executions</span>
            <Activity className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="mt-2 text-2xl font-semibold text-slate-900">{metrics.totalTriggered}</div>
          <div className="text-xs text-slate-500 mt-1">Total DAG executions dispatched</div>
        </div>

        <div className="p-4 bg-white border border-slate-200 rounded">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Success Rate</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="mt-2 text-2xl font-semibold text-slate-900">{successRate}%</div>
          <div className="text-xs text-slate-500 mt-1">
            {metrics.totalCompleted} completed successfully
          </div>
        </div>

        <div className="p-4 bg-white border border-slate-200 rounded">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Failed / Halted</span>
            <ShieldAlert className="w-4 h-4 text-rose-600" />
          </div>
          <div className="mt-2 text-2xl font-semibold text-slate-900">
            {metrics.totalFailed + metrics.totalHalted}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            {metrics.totalFailed} failed, {metrics.totalHalted} halted
          </div>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="border-b border-slate-200 mb-6 flex items-center justify-between">
        <div className="flex space-x-8">
          <button
            onClick={() => setActiveTab('blueprints')}
            className={`py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'blueprints'
                ? 'border-[#2563EB] text-[#2563EB]'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            Workflow Blueprints ({blueprints.length})
          </button>
          <button
            onClick={() => setActiveTab('executions')}
            className={`py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'executions'
                ? 'border-[#2563EB] text-[#2563EB]'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            Live Executions ({executions.length})
          </button>
        </div>
      </div>

      {/* Loading Skeleton */}
      {isLoading && (
        <div className="p-12 flex flex-col items-center justify-center bg-white border border-slate-200 rounded">
          <div className="w-8 h-8 border-2 border-[#2563EB] border-t-transparent rounded-full animate-spin mb-3" />
          <p className="text-sm text-slate-500 font-medium">Loading workflows data...</p>
        </div>
      )}

      {/* TAB 1: BLUEPRINTS */}
      {!isLoading && activeTab === 'blueprints' && (
        <div className="bg-white border border-slate-200 rounded">
          {/* Controls Bar */}
          <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search workflows by title, event, or keyword..."
                value={blueprintSearch}
                onChange={(e) => setBlueprintSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-sm bg-white border border-slate-300 rounded focus:outline-none focus:border-[#2563EB]"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-slate-500 flex items-center gap-1">
                <Filter className="w-3.5 h-3.5" /> Status:
              </span>
              <select
                value={blueprintStatusFilter}
                onChange={(e) => setBlueprintStatusFilter(e.target.value)}
                className="text-xs bg-white border border-slate-300 rounded px-2.5 py-1.5 focus:outline-none focus:border-[#2563EB]"
              >
                <option value="all">All Statuses</option>
                <option value="active">Active Only</option>
                <option value="draft">Draft Only</option>
                <option value="archived">Archived Only</option>
              </select>
            </div>
          </div>

          {/* Table */}
          {filteredBlueprints.length === 0 ? (
            <div className="p-12 text-center">
              <Layers className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <h3 className="text-sm font-semibold text-slate-900">No workflow blueprints found</h3>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                {blueprintSearch || blueprintStatusFilter !== 'all'
                  ? 'No workflows match your search or filter criteria. Try clearing filters.'
                  : 'Get started by creating your first multi-branch automated workflow blueprint.'}
              </p>
              {!blueprintSearch && blueprintStatusFilter === 'all' && (
                <div className="mt-4">
                  <Link
                    href="/workflows/new"
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-[#2563EB] rounded hover:bg-blue-700"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Create Your First Workflow
                  </Link>
                </div>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-700">
                <thead className="bg-slate-50 text-xs text-slate-500 uppercase border-b border-slate-200">
                  <tr>
                    <th scope="col" className="px-4 py-3 font-medium">
                      Workflow Blueprint
                    </th>
                    <th scope="col" className="px-4 py-3 font-medium">
                      Trigger Event
                    </th>
                    <th scope="col" className="px-4 py-3 font-medium">
                      Nodes
                    </th>
                    <th scope="col" className="px-4 py-3 font-medium">
                      Version
                    </th>
                    <th scope="col" className="px-4 py-3 font-medium">
                      Status
                    </th>
                    <th scope="col" className="px-4 py-3 font-medium">
                      Last Modified
                    </th>
                    <th scope="col" className="px-4 py-3 font-medium text-right">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filteredBlueprints.map((wf) => {
                    const nodeCount = wf.dag?.nodes ? wf.dag.nodes.length : 0;
                    return (
                      <tr key={wf.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="px-4 py-3">
                          <Link
                            href={`/workflows/${wf.id}`}
                            className="font-medium text-slate-900 hover:text-[#2563EB] block"
                          >
                            {wf.name}
                          </Link>
                          {wf.description && (
                            <span className="text-xs text-slate-500 line-clamp-1 mt-0.5">
                              {wf.description}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-mono bg-slate-100 text-slate-700 border border-slate-200">
                            {wf.triggerEvent}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-600">
                          {nodeCount} {nodeCount === 1 ? 'node' : 'nodes'}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-600 font-mono">
                          v{wf.version}
                        </td>
                        <td className="px-4 py-3">
                          {wf.status === 'active' ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                              Active
                            </span>
                          ) : wf.status === 'draft' ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">
                              Draft
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
                              Archived
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500">
                          {new Date(wf.updatedAt).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => handleToggleStatus(wf)}
                              title={
                                wf.status === 'active' ? 'Switch to Draft' : 'Activate Workflow'
                              }
                              className="p-1 text-slate-500 hover:text-slate-800 rounded hover:bg-slate-100"
                            >
                              {wf.status === 'active' ? (
                                <ToggleRight className="w-4 h-4 text-emerald-600" />
                              ) : (
                                <ToggleLeft className="w-4 h-4 text-slate-400" />
                              )}
                            </button>
                            <Link
                              href={`/workflows/${wf.id}`}
                              title="Edit in Visual Builder"
                              className="p-1 text-slate-500 hover:text-[#2563EB] rounded hover:bg-slate-100"
                            >
                              <Edit2 className="w-4 h-4" />
                            </Link>
                            <button
                              onClick={() => openDeleteModal(wf)}
                              title="Delete Workflow"
                              className="p-1 text-slate-500 hover:text-rose-600 rounded hover:bg-slate-100"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: LIVE EXECUTIONS */}
      {!isLoading && activeTab === 'executions' && (
        <div className="bg-white border border-slate-200 rounded">
          {/* Controls Bar */}
          <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <span className="text-sm font-medium text-slate-700">
              Recent Workflow Execution Audits
            </span>
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-slate-500 flex items-center gap-1">
                <Filter className="w-3.5 h-3.5" /> Status:
              </span>
              <select
                value={executionStatusFilter}
                onChange={(e) => setExecutionStatusFilter(e.target.value)}
                className="text-xs bg-white border border-slate-300 rounded px-2.5 py-1.5 focus:outline-none focus:border-[#2563EB]"
              >
                <option value="all">All Statuses</option>
                <option value="running">Running</option>
                <option value="completed">Completed</option>
                <option value="failed">Failed</option>
                <option value="halted">Halted</option>
              </select>
            </div>
          </div>

          {/* Table */}
          {executions.length === 0 ? (
            <div className="p-12 text-center">
              <Activity className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <h3 className="text-sm font-semibold text-slate-900">No execution records found</h3>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                Trigger events such as document signing, approval actions, or payment receipts will
                invoke workflows and record execution audits here.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-700">
                <thead className="bg-slate-50 text-xs text-slate-500 uppercase border-b border-slate-200">
                  <tr>
                    <th scope="col" className="px-4 py-3 font-medium">
                      Execution ID
                    </th>
                    <th scope="col" className="px-4 py-3 font-medium">
                      Trigger Event
                    </th>
                    <th scope="col" className="px-4 py-3 font-medium">
                      Depth
                    </th>
                    <th scope="col" className="px-4 py-3 font-medium">
                      Status
                    </th>
                    <th scope="col" className="px-4 py-3 font-medium">
                      Started At
                    </th>
                    <th scope="col" className="px-4 py-3 font-medium">
                      Duration
                    </th>
                    <th scope="col" className="px-4 py-3 font-medium text-right">
                      Details
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {executions.map((ex) => {
                    const started = new Date(ex.startedAt).getTime();
                    const completed = ex.completedAt ? new Date(ex.completedAt).getTime() : null;
                    const durationStr = completed
                      ? `${((completed - started) / 1000).toFixed(2)}s`
                      : 'Running...';

                    const eventLabel =
                      (ex.triggerPayload?.event as string) ||
                      (ex.triggerPayload?.triggerEvent as string) ||
                      ex.workflowName ||
                      'Workflow Trigger';

                    return (
                      <tr key={ex.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="px-4 py-3">
                          <Link
                            href={`/workflows/instances/${ex.id}`}
                            className="font-mono text-xs text-[#2563EB] hover:underline"
                          >
                            {ex.id.slice(0, 8)}...
                          </Link>
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-mono bg-slate-100 text-slate-700 border border-slate-200">
                            {eventLabel}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-600 font-mono">
                          {ex.chainDepth} / 20
                        </td>
                        <td className="px-4 py-3">
                          {ex.status === 'completed' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              Completed
                            </span>
                          ) : ex.status === 'failed' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-rose-50 text-rose-700 border border-rose-200">
                              <XCircle className="w-3 h-3 text-rose-600" />
                              Failed
                            </span>
                          ) : ex.status === 'halted' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
                              <Clock className="w-3 h-3 text-amber-600" />
                              Halted
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
                              <Play className="w-3 h-3 text-blue-600" />
                              Running
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500">
                          {new Date(ex.startedAt).toLocaleString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                          })}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-600 font-mono">
                          {durationStr}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Link
                            href={`/workflows/instances/${ex.id}`}
                            className="inline-flex items-center gap-1 text-xs font-medium text-[#2563EB] hover:underline"
                          >
                            Inspect
                            <ExternalLink className="w-3 h-3" />
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Deletion Confirmation Modal */}
      {deleteModalOpen && workflowToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-md bg-white border border-slate-200 rounded p-6 shadow-lg">
            <h3 className="text-base font-semibold text-slate-900">Delete Workflow Blueprint</h3>
            <p className="text-xs text-slate-600 mt-2">
              Are you sure you want to delete{' '}
              <span className="font-semibold text-slate-900">"{workflowToDelete.name}"</span>?
              Existing execution history will remain intact, but new events will not trigger this
              workflow.
            </p>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setDeleteModalOpen(false);
                  setWorkflowToDelete(null);
                }}
                disabled={isDeleting}
                className="px-3.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="px-3.5 py-1.5 text-xs font-medium text-white bg-rose-600 rounded hover:bg-rose-700 disabled:opacity-50"
              >
                {isDeleting ? 'Deleting...' : 'Delete Workflow'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
