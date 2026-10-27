'use client';

import React, { useState, useEffect } from 'react';
import {
  Zap,
  Plus,
  Trash2,
  Edit2,
  AlertTriangle,
  CheckCircle2,
  X,
  Play,
  Clock,
} from 'lucide-react';
import { AutomationRuleDto, AutomationCondition, AutomationAction } from '@pactintel/shared-types';

const TRIGGER_OPTIONS = [
  { value: 'document.signed', label: 'Document Signed' },
  { value: 'document.viewed', label: 'Document Viewed' },
  { value: 'document.sent', label: 'Document Sent' },
  { value: 'document.expired', label: 'Document Expired' },
  { value: 'approval.chain.approved', label: 'Approval Chain Approved' },
  { value: 'approval.chain.rejected', label: 'Approval Chain Rejected' },
];

const ACTION_TYPE_OPTIONS = [
  { value: 'send_notification', label: 'Send In-App Notification' },
  { value: 'send_email', label: 'Send Email' },
  { value: 'add_to_follow_up', label: 'Add to Follow-Up Queue' },
  { value: 'trigger_webhook', label: 'Trigger Webhook' },
  { value: 'update_document_tag', label: 'Update Document Tag' },
];

const OPERATOR_OPTIONS = [
  { value: 'eq', label: 'equals (=)' },
  { value: 'not_eq', label: 'not equals (≠)' },
  { value: 'gt', label: 'greater than (>)' },
  { value: 'lt', label: 'less than (<)' },
  { value: 'contains', label: 'contains' },
];

export default function AutomationSettingsPage() {
  const [rules, setRules] = useState<AutomationRuleDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Drawer state
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Form State
  const [name, setName] = useState('');
  const [triggerEvent, setTriggerEvent] = useState<string>('document.signed');
  const [conditions, setConditions] = useState<AutomationCondition[]>([]);
  const [actions, setActions] = useState<AutomationAction[]>([
    {
      type: 'send_notification',
      config: { title: 'Document Signed', message: 'Ready for processing' },
    },
  ]);

  // Dry-run testing state
  const [testPayloadJson, setTestPayloadJson] = useState(
    JSON.stringify({ dealValue: 50000, recipientEmail: 'client@example.com' }, null, 2),
  );
  const [testResult, setTestResult] = useState<{
    conditionsMatch: boolean;
    simulatedActions: Array<{
      type: string;
      config: Record<string, unknown>;
      wouldExecute: boolean;
    }>;
  } | null>(null);
  const [isTesting, setIsTesting] = useState(false);

  const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

  const loadRules = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`${apiBase}/api/v1/automation-rules`, {
        credentials: 'include',
      });
      if (res.ok) {
        const json = await res.json();
        setRules(json.data || json || []);
      } else {
        const errJson = await res.json().catch(() => null);
        setError(errJson?.error?.message || 'Failed to fetch automation rules');
      }
    } catch {
      setError('Network connection error loading automation rules');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRules();
  }, [apiBase]);

  const handleOpenCreate = () => {
    setEditingRuleId(null);
    setName('');
    setTriggerEvent('document.signed');
    setConditions([]);
    setActions([
      {
        type: 'send_notification',
        config: { title: 'Document Alert', message: 'Action occurred' },
      },
    ]);
    setTestResult(null);
    setIsDrawerOpen(true);
  };

  const handleOpenEdit = (rule: AutomationRuleDto) => {
    setEditingRuleId(rule.id);
    setName(rule.name);
    setTriggerEvent(rule.triggerEvent);
    setConditions(rule.conditions || []);
    setActions(rule.actions || []);
    setTestResult(null);
    setIsDrawerOpen(true);
  };

  const handleToggleActive = async (rule: AutomationRuleDto) => {
    const updatedStatus = !rule.isActive;
    try {
      // Optimistic update
      setRules((prev) =>
        prev.map((r) => (r.id === rule.id ? { ...r, isActive: updatedStatus } : r)),
      );

      const res = await fetch(`${apiBase}/api/v1/automation-rules/${rule.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ isActive: updatedStatus }),
      });

      if (!res.ok) {
        throw new Error('Failed to update rule status');
      }
    } catch {
      // Revert on error
      setRules((prev) =>
        prev.map((r) => (r.id === rule.id ? { ...r, isActive: rule.isActive } : r)),
      );
      setError(`Failed to update status for rule "${rule.name}"`);
    }
  };

  const handleDeleteRule = async (ruleId: string) => {
    if (!window.confirm('Are you sure you want to delete this automation rule?')) {
      return;
    }

    try {
      const res = await fetch(`${apiBase}/api/v1/automation-rules/${ruleId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) {
        throw new Error('Failed to delete rule');
      }
      setSuccessMessage('Rule deleted successfully');
      setRules((prev) => prev.filter((r) => r.id !== ruleId));
    } catch {
      setError('Could not delete rule. Please try again.');
    }
  };

  // Conditions helpers
  const addCondition = () => {
    if (conditions.length >= 5) return;
    setConditions([...conditions, { field: '', operator: 'eq', value: '' }]);
  };

  const updateCondition = (
    index: number,
    field: keyof AutomationCondition,
    val: string | number | boolean,
  ) => {
    const updated = [...conditions];
    updated[index] = { ...updated[index], [field]: val };
    setConditions(updated);
  };

  const removeCondition = (index: number) => {
    setConditions(conditions.filter((_, i) => i !== index));
  };

  // Actions helpers
  const addAction = () => {
    if (actions.length >= 5) return;
    setActions([
      ...actions,
      { type: 'send_notification', config: { title: 'Alert', message: 'Rule triggered' } },
    ]);
  };

  const updateActionType = (index: number, type: AutomationAction['type']) => {
    const updated = [...actions];
    let defaultConfig: Record<string, unknown> = {};
    if (type === 'send_notification') {
      defaultConfig = { title: 'Notification', message: 'Details...' };
    } else if (type === 'send_email') {
      defaultConfig = { to: 'signer@example.com', subject: 'Document Notice', template: 'default' };
    } else if (type === 'add_to_follow_up') {
      defaultConfig = { delayHours: 48, reason: 'Follow-up on signature' };
    } else if (type === 'trigger_webhook') {
      defaultConfig = { url: 'https://api.external.com/webhook', method: 'POST' };
    } else if (type === 'update_document_tag') {
      defaultConfig = { tag: 'auto-processed' };
    }
    updated[index] = { type, config: defaultConfig };
    setActions(updated);
  };

  const updateActionConfig = (index: number, key: string, value: unknown) => {
    const updated = [...actions];
    updated[index] = {
      ...updated[index],
      config: { ...updated[index].config, [key]: value },
    };
    setActions(updated);
  };

  const removeAction = (index: number) => {
    if (actions.length <= 1) return;
    setActions(actions.filter((_, i) => i !== index));
  };

  const handleSaveRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Rule name is required');
      return;
    }
    if (actions.length === 0) {
      setError('At least one action is required');
      return;
    }

    try {
      setSaving(true);
      setError(null);

      const payload = {
        name: name.trim(),
        triggerEvent,
        conditions,
        actions,
      };

      let res;
      if (editingRuleId) {
        res = await fetch(`${apiBase}/api/v1/automation-rules/${editingRuleId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(payload),
        });
      } else {
        // Need workspace ID for create; use first rule's workspace or fallback
        const workspaceId = rules[0]?.workspaceId || '0192a000-0000-7000-8000-000000000001';
        res = await fetch(`${apiBase}/api/v1/automation-rules`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ ...payload, workspaceId }),
        });
      }

      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        throw new Error(errJson?.error?.message || 'Failed to save automation rule');
      }

      setSuccessMessage(`Rule ${editingRuleId ? 'updated' : 'created'} successfully`);
      setIsDrawerOpen(false);
      await loadRules();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error saving rule';
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleRunTest = async () => {
    if (!editingRuleId) {
      setError('Please save the rule first before running a dry-run test.');
      return;
    }

    try {
      setIsTesting(true);
      setTestResult(null);
      setError(null);

      let parsedPayload = {};
      try {
        parsedPayload = JSON.parse(testPayloadJson);
      } catch {
        throw new Error('Invalid JSON format in sample payload');
      }

      const res = await fetch(`${apiBase}/api/v1/automation-rules/${editingRuleId}/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ samplePayload: parsedPayload }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        throw new Error(errJson?.error?.message || 'Dry-run test failed');
      }

      const result = await res.json();
      setTestResult(result.data || result);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Test simulation error';
      setError(msg);
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto">
      {/* Page Header */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">Automation Rules</h1>
          <p className="text-sm text-slate-500 mt-1">
            Configure event-driven automations, notifications, follow-ups, and external webhook
            triggers
          </p>
        </div>
        <button
          onClick={handleOpenCreate}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-[#2563EB] text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-[#2563EB] focus:ring-offset-2 transition-colors shrink-0"
        >
          <Plus className="w-4 h-4" />
          Create Rule
        </button>
      </div>

      {/* Alerts */}
      {error && (
        <div className="mb-6 p-4 rounded-lg bg-red-50 border border-red-200 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5 shrink-0" />
          <div className="flex-1 text-sm text-red-800">{error}</div>
          <button
            onClick={() => setError(null)}
            className="text-red-500 hover:text-red-700 text-sm font-medium"
          >
            Dismiss
          </button>
        </div>
      )}

      {successMessage && (
        <div className="mb-6 p-4 rounded-lg bg-emerald-50 border border-emerald-200 flex items-start gap-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 mt-0.5 shrink-0" />
          <div className="flex-1 text-sm text-emerald-800">{successMessage}</div>
          <button
            onClick={() => setSuccessMessage(null)}
            className="text-emerald-500 hover:text-emerald-700 text-sm font-medium"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Rule List (Real HTML <table> element conforming to DESIGN_SYSTEM.md) */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
        {loading ? (
          <div className="p-12 text-center">
            <div className="w-7 h-7 border-2 border-[#2563EB] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-slate-500">Loading automation rules...</p>
          </div>
        ) : rules.length === 0 ? (
          <div className="p-12 text-center max-w-md mx-auto">
            <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4 text-slate-400">
              <Zap className="w-6 h-6" />
            </div>
            <h3 className="text-base font-medium text-slate-900">No automation rules configured</h3>
            <p className="text-sm text-slate-500 mt-2">
              Automate follow-ups, notifications, and webhooks whenever documents are sent, viewed,
              or signed.
            </p>
            <button
              onClick={handleOpenCreate}
              className="mt-6 inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-[#2563EB] text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-[#2563EB] transition-colors"
            >
              <Plus className="w-4 h-4" />
              Configure First Rule
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-semibold text-slate-600">
                  <th className="py-3 px-4">Name</th>
                  <th className="py-3 px-4">Trigger Event</th>
                  <th className="py-3 px-4">Actions</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Last Run</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rules.map((rule) => {
                  const triggerLabel =
                    TRIGGER_OPTIONS.find((t) => t.value === rule.triggerEvent)?.label ||
                    rule.triggerEvent;

                  return (
                    <tr key={rule.id} className="hover:bg-slate-50/50 transition-colors">
                      {/* Name */}
                      <td className="py-3.5 px-4">
                        <div className="font-medium text-slate-900">{rule.name}</div>
                        <div className="text-xs text-slate-400 mt-0.5">
                          {rule.conditions?.length || 0} condition
                          {rule.conditions?.length === 1 ? '' : 's'}
                        </div>
                      </td>

                      {/* Trigger */}
                      <td className="py-3.5 px-4 text-slate-600">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">
                          <Zap className="w-3 h-3 text-slate-500" />
                          {triggerLabel}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4">
                        <div className="flex flex-wrap gap-1.5">
                          {(rule.actions || []).map((act, idx) => (
                            <span
                              key={idx}
                              className="text-xs px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-100"
                            >
                              {act.type.replace(/_/g, ' ')}
                            </span>
                          ))}
                        </div>
                      </td>

                      {/* Status Toggle Switch */}
                      <td className="py-3.5 px-4">
                        <label className="inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={rule.isActive}
                            onChange={() => handleToggleActive(rule)}
                            className="sr-only peer"
                          />
                          <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-[#2563EB] rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#2563EB]" />
                          <span className="ml-2 text-xs font-medium text-slate-600">
                            {rule.isActive ? 'Active' : 'Paused'}
                          </span>
                        </label>
                      </td>

                      {/* Last Run */}
                      <td className="py-3.5 px-4 text-xs text-slate-500">
                        {rule.lastExecutedAt ? (
                          <div className="flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5 text-slate-400" />
                            {new Date(rule.lastExecutedAt).toLocaleDateString()}
                          </div>
                        ) : (
                          <span className="text-slate-400">Never</span>
                        )}
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          {rule.executionCount || 0} run{rule.executionCount === 1 ? '' : 's'}
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleOpenEdit(rule)}
                            className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded transition-colors"
                            title="Edit Rule"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteRule(rule.id)}
                            className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded transition-colors"
                            title="Delete Rule"
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

      {/* 480px Slide-in Drawer */}
      {isDrawerOpen && (
        <div className="fixed inset-0 z-50 overflow-hidden bg-slate-900/40">
          <div className="absolute inset-y-0 right-0 max-w-full flex">
            <div className="w-screen max-w-[480px] bg-white shadow-2xl border-l border-slate-200 flex flex-col h-full">
              {/* Drawer Header */}
              <div className="p-6 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">
                    {editingRuleId ? 'Edit Automation Rule' : 'Create Automation Rule'}
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Define triggers, matching conditions, and actions
                  </p>
                </div>
                <button
                  onClick={() => setIsDrawerOpen(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Drawer Scrollable Body */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {/* Section 1: Name + Trigger */}
                <div className="space-y-4">
                  <h3 className="text-xs font-semibold text-slate-900 uppercase tracking-wider text-slate-400">
                    Section 1: Rule Details
                  </h3>
                  <div>
                    <label
                      htmlFor="rule-name"
                      className="block text-xs font-medium text-slate-700 mb-1"
                    >
                      Rule Name *
                    </label>
                    <input
                      id="rule-name"
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g., Enterprise Deal Follow-Up"
                      className="w-full text-sm p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#2563EB] focus:border-transparent outline-none"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="trigger-event"
                      className="block text-xs font-medium text-slate-700 mb-1"
                    >
                      Trigger Event *
                    </label>
                    <select
                      id="trigger-event"
                      value={triggerEvent}
                      onChange={(e) => setTriggerEvent(e.target.value)}
                      className="w-full text-sm p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#2563EB] focus:border-transparent outline-none bg-white"
                    >
                      {TRIGGER_OPTIONS.map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Section 2: Conditions (up to 5) */}
                <div className="space-y-3 pt-4 border-t border-slate-200">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-xs font-semibold text-slate-900 uppercase tracking-wider text-slate-400">
                        Section 2: Conditions (Optional, Max 5)
                      </h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Rule triggers only if all conditions evaluate to true
                      </p>
                    </div>
                    {conditions.length < 5 && (
                      <button
                        type="button"
                        onClick={addCondition}
                        className="text-xs font-medium text-[#2563EB] hover:underline inline-flex items-center gap-1"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Add Condition
                      </button>
                    )}
                  </div>

                  {conditions.length === 0 ? (
                    <div className="text-xs text-slate-400 bg-slate-50 p-3 rounded-lg border border-dashed border-slate-200">
                      No conditions set. This rule will run unconditionally for every trigger event.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {conditions.map((cond, idx) => (
                        <div
                          key={idx}
                          className="flex items-center gap-2 p-2.5 bg-slate-50 rounded-lg border border-slate-200 text-xs"
                        >
                          <input
                            type="text"
                            placeholder="field (e.g. dealValue)"
                            value={cond.field}
                            onChange={(e) => updateCondition(idx, 'field', e.target.value)}
                            className="w-1/3 p-1.5 border border-slate-300 rounded bg-white text-xs outline-none"
                          />
                          <select
                            value={cond.operator}
                            onChange={(e) =>
                              updateCondition(
                                idx,
                                'operator',
                                e.target.value as AutomationCondition['operator'],
                              )
                            }
                            className="w-1/3 p-1.5 border border-slate-300 rounded bg-white text-xs outline-none"
                          >
                            {OPERATOR_OPTIONS.map((op) => (
                              <option key={op.value} value={op.value}>
                                {op.label}
                              </option>
                            ))}
                          </select>
                          <input
                            type="text"
                            placeholder="value"
                            value={String(cond.value)}
                            onChange={(e) => updateCondition(idx, 'value', e.target.value)}
                            className="w-1/3 p-1.5 border border-slate-300 rounded bg-white text-xs outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => removeCondition(idx)}
                            className="p-1 text-slate-400 hover:text-red-600 rounded"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Section 3: Actions (up to 5, min 1) */}
                <div className="space-y-3 pt-4 border-t border-slate-200">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-xs font-semibold text-slate-900 uppercase tracking-wider text-slate-400">
                        Section 3: Actions (1 to 5)
                      </h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Actions executed in sequence when conditions are met
                      </p>
                    </div>
                    {actions.length < 5 && (
                      <button
                        type="button"
                        onClick={addAction}
                        className="text-xs font-medium text-[#2563EB] hover:underline inline-flex items-center gap-1"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Add Action
                      </button>
                    )}
                  </div>

                  <div className="space-y-3">
                    {actions.map((act, idx) => (
                      <div
                        key={idx}
                        className="p-3.5 bg-slate-50 rounded-lg border border-slate-200 space-y-2.5 text-xs"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-slate-700">Action #{idx + 1}</span>
                          {actions.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeAction(idx)}
                              className="text-slate-400 hover:text-red-600 text-xs"
                            >
                              Remove
                            </button>
                          )}
                        </div>

                        <div>
                          <label className="block text-[11px] font-medium text-slate-600 mb-1">
                            Action Type
                          </label>
                          <select
                            value={act.type}
                            onChange={(e) =>
                              updateActionType(idx, e.target.value as AutomationAction['type'])
                            }
                            className="w-full p-2 border border-slate-300 rounded bg-white text-xs outline-none"
                          >
                            {ACTION_TYPE_OPTIONS.map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Dynamic config fields based on action type */}
                        {act.type === 'send_notification' && (
                          <div className="space-y-2">
                            <div>
                              <label className="block text-[11px] font-medium text-slate-600 mb-1">
                                Notification Title
                              </label>
                              <input
                                type="text"
                                value={String(act.config.title || '')}
                                onChange={(e) => updateActionConfig(idx, 'title', e.target.value)}
                                className="w-full p-2 border border-slate-300 rounded bg-white text-xs"
                              />
                            </div>
                            <div>
                              <label className="block text-[11px] font-medium text-slate-600 mb-1">
                                Notification Message
                              </label>
                              <input
                                type="text"
                                value={String(act.config.message || '')}
                                onChange={(e) => updateActionConfig(idx, 'message', e.target.value)}
                                className="w-full p-2 border border-slate-300 rounded bg-white text-xs"
                              />
                            </div>
                          </div>
                        )}

                        {act.type === 'send_email' && (
                          <div className="space-y-2">
                            <div>
                              <label className="block text-[11px] font-medium text-slate-600 mb-1">
                                Recipient (e.g. signer@company.com or variable)
                              </label>
                              <input
                                type="text"
                                value={String(act.config.to || '')}
                                onChange={(e) => updateActionConfig(idx, 'to', e.target.value)}
                                className="w-full p-2 border border-slate-300 rounded bg-white text-xs"
                              />
                            </div>
                            <div>
                              <label className="block text-[11px] font-medium text-slate-600 mb-1">
                                Email Subject
                              </label>
                              <input
                                type="text"
                                value={String(act.config.subject || '')}
                                onChange={(e) => updateActionConfig(idx, 'subject', e.target.value)}
                                className="w-full p-2 border border-slate-300 rounded bg-white text-xs"
                              />
                            </div>
                          </div>
                        )}

                        {act.type === 'add_to_follow_up' && (
                          <div className="space-y-2">
                            <div>
                              <label className="block text-[11px] font-medium text-slate-600 mb-1">
                                Follow-Up Delay (Hours)
                              </label>
                              <input
                                type="number"
                                value={Number(act.config.delayHours || 24)}
                                onChange={(e) =>
                                  updateActionConfig(
                                    idx,
                                    'delayHours',
                                    parseInt(e.target.value, 10),
                                  )
                                }
                                className="w-full p-2 border border-slate-300 rounded bg-white text-xs"
                              />
                            </div>
                            <div>
                              <label className="block text-[11px] font-medium text-slate-600 mb-1">
                                Reason
                              </label>
                              <input
                                type="text"
                                value={String(act.config.reason || '')}
                                onChange={(e) => updateActionConfig(idx, 'reason', e.target.value)}
                                className="w-full p-2 border border-slate-300 rounded bg-white text-xs"
                              />
                            </div>
                          </div>
                        )}

                        {act.type === 'trigger_webhook' && (
                          <div>
                            <label className="block text-[11px] font-medium text-slate-600 mb-1">
                              Webhook Endpoint URL
                            </label>
                            <input
                              type="url"
                              value={String(act.config.url || '')}
                              onChange={(e) => updateActionConfig(idx, 'url', e.target.value)}
                              placeholder="https://your-crm.com/api/webhook"
                              className="w-full p-2 border border-slate-300 rounded bg-white text-xs"
                            />
                          </div>
                        )}

                        {act.type === 'update_document_tag' && (
                          <div>
                            <label className="block text-[11px] font-medium text-slate-600 mb-1">
                              Tag Label
                            </label>
                            <input
                              type="text"
                              value={String(act.config.tag || '')}
                              onChange={(e) => updateActionConfig(idx, 'tag', e.target.value)}
                              placeholder="e.g. vip-client, processed"
                              className="w-full p-2 border border-slate-300 rounded bg-white text-xs"
                            />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Dry-Run Testing Section */}
                {editingRuleId && (
                  <div className="pt-4 border-t border-slate-200 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-xs font-semibold text-slate-900 uppercase tracking-wider text-slate-400">
                          Dry-Run Simulation
                        </h3>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Test evaluation without dispatching real actions
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={handleRunTest}
                        disabled={isTesting}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 transition-colors"
                      >
                        <Play className="w-3.5 h-3.5 text-slate-600" />
                        {isTesting ? 'Simulating...' : 'Test Rule'}
                      </button>
                    </div>

                    <div>
                      <label className="block text-[11px] font-medium text-slate-600 mb-1">
                        Sample Event Payload (JSON)
                      </label>
                      <textarea
                        rows={3}
                        value={testPayloadJson}
                        onChange={(e) => setTestPayloadJson(e.target.value)}
                        className="w-full p-2 font-mono text-xs border border-slate-300 rounded bg-slate-50 outline-none"
                      />
                    </div>

                    {testResult && (
                      <div className="p-3 rounded-lg border border-slate-200 bg-slate-50 text-xs space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-700">Conditions Match:</span>
                          <span
                            className={`px-2 py-0.5 rounded text-[11px] font-medium ${
                              testResult.conditionsMatch
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-red-100 text-red-800'
                            }`}
                          >
                            {testResult.conditionsMatch ? 'MATCHED (True)' : 'FAILED (False)'}
                          </span>
                        </div>
                        <div>
                          <span className="font-semibold text-slate-700">Simulated Actions:</span>
                          <div className="mt-1 space-y-1">
                            {testResult.simulatedActions.map((act, i) => (
                              <div
                                key={i}
                                className="flex items-center justify-between text-[11px] p-1.5 bg-white rounded border border-slate-200"
                              >
                                <span>{act.type}</span>
                                <span
                                  className={
                                    act.wouldExecute
                                      ? 'text-emerald-700 font-medium'
                                      : 'text-slate-400'
                                  }
                                >
                                  {act.wouldExecute ? 'Would Execute' : 'Skipped'}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Drawer Footer Actions */}
              <div className="p-4 border-t border-slate-200 bg-slate-50/50 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsDrawerOpen(false)}
                  disabled={saving}
                  className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveRule}
                  disabled={saving}
                  className="px-4 py-2 text-sm font-medium text-white bg-[#2563EB] hover:bg-blue-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                >
                  {saving ? 'Saving...' : editingRuleId ? 'Save Changes' : 'Create Rule'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
