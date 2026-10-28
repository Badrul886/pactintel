'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Save, CheckCircle, AlertTriangle, Sparkles, X } from 'lucide-react';
import WorkflowCanvas, { WORKFLOW_TEMPLATES } from '../components/workflow-canvas';
import {
  WorkflowDag,
  CreateWorkflowDefinitionDto,
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
  { value: 'document.approval_approved', label: 'Approval Step Approved' },
  { value: 'document.payment_completed', label: 'Payment Completed' },
];

export default function NewWorkflowPage() {
  const router = useRouter();

  // Workflow Metadata State
  const [name, setName] = useState<string>('Untitled Workflow');
  const [description, setDescription] = useState<string>('');
  const [triggerEvent, setTriggerEvent] = useState<string>('document.signed');

  // DAG State (default starting DAG: Trigger -> End)
  const [dag, setDag] = useState<WorkflowDag>({
    nodes: [
      {
        id: 'node-trigger',
        type: 'trigger',
        label: 'When Document is Signed',
        config: { event: 'document.signed' },
        position: { x: 50, y: 150 },
      },
      {
        id: 'node-end',
        type: 'end',
        label: 'End Workflow',
        config: {},
        position: { x: 400, y: 150 },
      },
    ],
    edges: [
      {
        id: 'edge-1',
        source: 'node-trigger',
        target: 'node-end',
      },
    ],
  });

  // UI States
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [templatesModalOpen, setTemplatesModalOpen] = useState<boolean>(false);

  const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

  // Apply Pre-built Template
  const handleApplyTemplate = (templateIndex: number) => {
    const selected = WORKFLOW_TEMPLATES[templateIndex];
    if (!selected) return;

    setName(selected.name);
    setDescription(selected.description);
    setDag(JSON.parse(JSON.stringify(selected.dag)));
    setTemplatesModalOpen(false);
  };

  // Submit creation
  const handleSave = async (intendedStatus: WorkflowDefinitionStatus) => {
    try {
      setIsSubmitting(true);
      setErrorMessage(null);

      if (!name.trim()) {
        throw new Error('Please enter a valid workflow name.');
      }

      if (!dag.nodes || dag.nodes.length === 0) {
        throw new Error('Workflow DAG must contain at least one node.');
      }

      const hasTriggerNode = dag.nodes.some((n) => n.type === 'trigger');
      if (!hasTriggerNode) {
        throw new Error('Workflow DAG must contain at least one Trigger node.');
      }

      const payload: CreateWorkflowDefinitionDto = {
        workspaceId: '0192a000-0000-7000-8000-000000000002',
        name: name.trim(),
        description: description.trim() || undefined,
        triggerEvent,
        dag,
        maxInstances: 1000,
      };

      const res = await fetch(`${apiBase}/api/v1/workflows`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errorJson = await res.json().catch(() => null);
        if (res.status === 402) {
          throw new Error(
            errorJson?.error?.message ||
              'Active workflow limit reached for your subscription tier. Please upgrade your plan or set another workflow to draft.',
          );
        }
        throw new Error(
          errorJson?.error?.message || `Failed to create workflow: ${res.statusText}`,
        );
      }

      const created = await res.json();
      const workflowId = created.data?.id || created.id;

      // If user wanted active status, patch it to active
      if (intendedStatus === 'active') {
        await fetch(`${apiBase}/api/v1/workflows/${workflowId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ status: 'active' }),
        });
      }

      router.push(`/workflows/${workflowId}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error creating workflow';
      setErrorMessage(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="w-full flex flex-col h-[calc(100vh-140px)]">
      {/* Top Header & Settings Bar */}
      <div className="bg-white border border-slate-200 rounded p-4 mb-4 flex-shrink-0">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          {/* Back button & Title input */}
          <div className="flex items-center gap-3">
            <Link
              href="/workflows"
              className="p-1.5 text-slate-500 hover:text-slate-800 rounded border border-slate-200 hover:bg-slate-50"
              title="Return to workflows list"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Workflow Name (e.g. Enterprise Deal Desk Approval)"
                className="text-lg font-semibold text-slate-900 border-b border-transparent hover:border-slate-300 focus:border-[#2563EB] focus:outline-none px-1 py-0.5 rounded"
              />
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Add optional description or purpose..."
                className="block text-xs text-slate-500 border-b border-transparent hover:border-slate-300 focus:border-[#2563EB] focus:outline-none px-1 py-0.5 w-full max-w-lg mt-0.5"
              />
            </div>
          </div>

          {/* Controls: Trigger Event, Template Selector, Actions */}
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

            {/* Template picker button */}
            <button
              type="button"
              onClick={() => setTemplatesModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-50"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              Templates
            </button>

            {/* Save as Draft */}
            <button
              type="button"
              onClick={() => handleSave('draft')}
              disabled={isSubmitting}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-50 disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              Save Draft
            </button>

            {/* Publish & Activate */}
            <button
              type="button"
              onClick={() => handleSave('active')}
              disabled={isSubmitting}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium text-white bg-[#2563EB] rounded hover:bg-blue-700 disabled:opacity-50"
            >
              <CheckCircle className="w-3.5 h-3.5" />
              {isSubmitting ? 'Publishing...' : 'Publish & Activate'}
            </button>
          </div>
        </div>

        {/* Error Alert Banner */}
        {errorMessage && (
          <div className="mt-3 p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0" />
              <span>{errorMessage}</span>
            </div>
            <button
              onClick={() => setErrorMessage(null)}
              className="text-rose-600 hover:text-rose-900 font-medium ml-4"
            >
              Dismiss
            </button>
          </div>
        )}
      </div>

      {/* Main Interactive Canvas Area */}
      <div className="flex-1 bg-white border border-slate-200 rounded overflow-hidden relative">
        <WorkflowCanvas
          initialDag={dag}
          onChange={(newDag: WorkflowDag) => setDag(newDag)}
          readOnly={false}
        />
      </div>

      {/* Templates Modal */}
      {templatesModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-2xl bg-white border border-slate-200 rounded p-6 shadow-xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-amber-500" />
                <h3 className="text-base font-semibold text-slate-900">
                  Pre-Built Orchestration Blueprints
                </h3>
              </div>
              <button
                onClick={() => setTemplatesModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-500 mt-2 mb-4">
              Select an enterprise-standard DAG orchestration workflow template to automatically
              populate nodes, branching logic, and actions.
            </p>

            <div className="flex-1 overflow-y-auto space-y-3 pr-1">
              {WORKFLOW_TEMPLATES.map((tmpl, idx) => (
                <div
                  key={idx}
                  className="p-4 border border-slate-200 rounded hover:border-[#2563EB] hover:bg-blue-50/20 transition-all cursor-pointer group"
                  onClick={() => handleApplyTemplate(idx)}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm text-slate-900 group-hover:text-[#2563EB]">
                      {tmpl.name}
                    </span>
                    <span className="text-xs font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                      {tmpl.dag.nodes.length} nodes
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 mt-1">{tmpl.description}</p>
                </div>
              ))}
            </div>

            <div className="pt-4 border-t border-slate-200 flex justify-end">
              <button
                type="button"
                onClick={() => setTemplatesModalOpen(false)}
                className="px-4 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
