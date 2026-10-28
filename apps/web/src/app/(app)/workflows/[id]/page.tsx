'use client';

import React, { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { ArrowLeft, Save, AlertTriangle } from 'lucide-react';
import WorkflowCanvas from '../components/workflow-canvas';
import {
  WorkflowDag,
  WorkflowDefinitionResponseDto,
  UpdateWorkflowDefinitionDto,
  WorkflowDefinitionStatus,
} from '@pactintel/shared-types';

const TRIGGER_EVENTS = [
  { value: 'document.created', label: 'Document Created' },
  { value: 'document.sent', label: 'Document Sent' },
  { value: 'document.viewed', label: 'Document Viewed' },
  { value: 'document.signed', label: 'Document Signed' },
  { value: 'document.completed', label: 'Document Completed' },
  { value: 'document.expired', label: 'Document Expired' },
  { value: 'document.rejected', label: 'Document Rejected' },
  { value: 'document.approval_requested', label: 'Approval Requested' },
  { value: 'document.approval_approved', label: 'Approval Approved' },
  { value: 'document.payment_completed', label: 'Payment Completed' },
];

export default function EditWorkflowPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const workflowId = resolvedParams.id;

  const [workflow, setWorkflow] = useState<WorkflowDefinitionResponseDto | null>(null);
  const [name, setName] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [triggerEvent, setTriggerEvent] = useState<string>('document.signed');
  const [status, setStatus] = useState<WorkflowDefinitionStatus>('draft');
  const [dag, setDag] = useState<WorkflowDag | null>(null);

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

  useEffect(() => {
    async function loadWorkflow() {
      try {
        setIsLoading(true);
        setErrorMessage(null);

        const res = await fetch(`${apiBase}/api/v1/workflows/${workflowId}`, {
          credentials: 'include',
        });

        if (!res.ok) {
          throw new Error(`Failed to load workflow (${res.statusText})`);
        }

        const data = await res.json();
        const wf: WorkflowDefinitionResponseDto = data.data || data;

        setWorkflow(wf);
        setName(wf.name);
        setDescription(wf.description || '');
        setTriggerEvent(wf.triggerEvent);
        setStatus(wf.status);
        setDag(wf.dag);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Error loading workflow';
        setErrorMessage(msg);
      } finally {
        setIsLoading(false);
      }
    }

    if (workflowId) {
      loadWorkflow();
    }
  }, [apiBase, workflowId]);

  const handleSave = async (intendedStatus?: WorkflowDefinitionStatus) => {
    if (!dag) return;

    try {
      setIsSaving(true);
      setErrorMessage(null);

      const targetStatus = intendedStatus || status;

      const payload: UpdateWorkflowDefinitionDto = {
        name: name.trim(),
        description: description.trim() || undefined,
        triggerEvent,
        status: targetStatus,
        dag,
      };

      const res = await fetch(`${apiBase}/api/v1/workflows/${workflowId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        if (res.status === 402) {
          throw new Error(
            errJson?.error?.message ||
              'Active workflow limit reached for your subscription plan. Upgrade or set another workflow to draft.',
          );
        }
        throw new Error(errJson?.error?.message || `Failed to update workflow: ${res.statusText}`);
      }

      const updated = await res.json();
      const wf = updated.data || updated;
      setWorkflow(wf);
      setStatus(wf.status);
      setSuccessMessage('Workflow blueprint updated successfully.');
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error updating workflow';
      setErrorMessage(msg);
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="w-full flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-[#2563EB] border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-slate-500 font-medium">Loading workflow blueprint...</p>
        </div>
      </div>
    );
  }

  if (errorMessage && !workflow) {
    return (
      <div className="p-8 max-w-xl mx-auto text-center">
        <AlertTriangle className="w-12 h-12 text-rose-500 mx-auto mb-3" />
        <h2 className="text-lg font-semibold text-slate-900">Workflow Not Found</h2>
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

  return (
    <div className="w-full flex flex-col h-[calc(100vh-140px)]">
      {/* Top Header & Settings Bar */}
      <div className="bg-white border border-slate-200 rounded p-4 mb-4 flex-shrink-0">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          {/* Back button, Title & Version */}
          <div className="flex items-center gap-3">
            <Link
              href="/workflows"
              className="p-1.5 text-slate-500 hover:text-slate-800 rounded border border-slate-200 hover:bg-slate-50"
              title="Return to workflows list"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Workflow Name"
                  className="text-lg font-semibold text-slate-900 border-b border-transparent hover:border-slate-300 focus:border-[#2563EB] focus:outline-none px-1 py-0.5 rounded"
                />
                <span className="text-xs font-mono text-slate-500 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded">
                  v{workflow?.version || 1}
                </span>
              </div>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Add optional description..."
                className="block text-xs text-slate-500 border-b border-transparent hover:border-slate-300 focus:border-[#2563EB] focus:outline-none px-1 py-0.5 w-full max-w-lg mt-0.5"
              />
            </div>
          </div>

          {/* Controls: Trigger Selector, Status Toggle, Save Actions */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Trigger Selector */}
            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded px-2.5 py-1">
              <span className="text-xs font-medium text-slate-500">Trigger:</span>
              <select
                value={triggerEvent}
                onChange={(e) => setTriggerEvent(e.target.value)}
                className="text-xs bg-transparent text-slate-800 font-mono focus:outline-none"
              >
                {TRIGGER_EVENTS.map((ev) => (
                  <option key={ev.value} value={ev.value}>
                    {ev.label} ({ev.value})
                  </option>
                ))}
              </select>
            </div>

            {/* Status Selector */}
            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded px-2.5 py-1">
              <span className="text-xs font-medium text-slate-500">Status:</span>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as WorkflowDefinitionStatus)}
                className="text-xs bg-transparent text-slate-800 font-medium focus:outline-none"
              >
                <option value="draft">Draft</option>
                <option value="active">Active</option>
                <option value="archived">Archived</option>
              </select>
            </div>

            {/* Save Changes Button */}
            <button
              type="button"
              onClick={() => handleSave()}
              disabled={isSaving}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium text-white bg-[#2563EB] rounded hover:bg-blue-700 disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              {isSaving ? 'Saving...' : 'Save Blueprint'}
            </button>
          </div>
        </div>

        {/* Notifications */}
        {successMessage && (
          <div className="mt-3 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded flex items-center justify-between">
            <span>{successMessage}</span>
            <button
              onClick={() => setSuccessMessage(null)}
              className="text-emerald-700 hover:text-emerald-900"
            >
              Dismiss
            </button>
          </div>
        )}

        {errorMessage && (
          <div className="mt-3 p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0" />
              <span>{errorMessage}</span>
            </div>
            <button
              onClick={() => setErrorMessage(null)}
              className="text-rose-700 hover:text-rose-900"
            >
              Dismiss
            </button>
          </div>
        )}
      </div>

      {/* Main Interactive Canvas Area */}
      <div className="flex-1 bg-white border border-slate-200 rounded overflow-hidden relative">
        {dag && (
          <WorkflowCanvas
            initialDag={dag}
            onChange={(newDag: WorkflowDag) => setDag(newDag)}
            readOnly={false}
          />
        )}
      </div>
    </div>
  );
}
