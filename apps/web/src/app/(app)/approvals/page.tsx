'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  FileText,
  ChevronRight,
  ShieldAlert,
  MessageSquare,
} from 'lucide-react';
import { ApprovalStepDto, ApprovalChainDto } from '@pactintel/shared-types';

interface ApprovalChainWithDoc extends ApprovalChainDto {
  documentTitle?: string;
  documentId?: string;
}

export default function ApprovalsPage() {
  const [chains, setChains] = useState<ApprovalChainWithDoc[]>([]);
  const [selectedChainId, setSelectedChainId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Modal State for Approve/Reject Decision
  const [decisionModalOpen, setDecisionModalOpen] = useState(false);
  const [decisionType, setDecisionType] = useState<'approved' | 'rejected'>('approved');
  const [targetStep, setTargetStep] = useState<ApprovalStepDto | null>(null);
  const [decisionComment, setDecisionComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Current user mock/session ID for approver check
  const [currentUserId] = useState<string>('');
  const [isAdmin] = useState<boolean>(true);

  const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch approval chains
      const chainsRes = await fetch(`${apiBase}/api/v1/approval-chains`, {
        credentials: 'include',
      });
      if (chainsRes.ok) {
        const chainsData = await chainsRes.json();
        const chainList: ApprovalChainWithDoc[] = chainsData.data || chainsData || [];
        setChains(chainList);
        if (chainList.length > 0 && !selectedChainId) {
          setSelectedChainId(chainList[0].id);
        }
      }
    } catch {
      setError('Unable to load approval data. Please check your connection.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [apiBase]);

  const selectedChain = useMemo(() => {
    return chains.find((c) => c.id === selectedChainId) || chains[0] || null;
  }, [chains, selectedChainId]);

  // Identify stalled steps: created_at > timeoutHours ago and still pending
  const stalledSteps = useMemo(() => {
    const allSteps: ApprovalStepDto[] = chains.flatMap((c) => c.steps || []);
    const now = Date.now();
    return allSteps.filter((s) => {
      if (s.status !== 'pending') return false;
      const createdTime = new Date(s.createdAt).getTime();
      const elapsedHours = (now - createdTime) / (1000 * 60 * 60);
      return elapsedHours > (s.timeoutHours || 168);
    });
  }, [chains]);

  const openDecisionModal = (step: ApprovalStepDto, type: 'approved' | 'rejected') => {
    setTargetStep(step);
    setDecisionType(type);
    setDecisionComment('');
    setDecisionModalOpen(true);
  };

  const closeDecisionModal = () => {
    setDecisionModalOpen(false);
    setTargetStep(null);
    setDecisionComment('');
  };

  const handleSubmitDecision = async () => {
    if (!targetStep) return;

    try {
      setIsSubmitting(true);
      setError(null);
      const res = await fetch(`${apiBase}/api/v1/approval-steps/${targetStep.id}/decide`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          decision: decisionType,
          comment: decisionComment.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        throw new Error(errJson?.error?.message || `Failed to submit decision: ${res.statusText}`);
      }

      setSuccessMessage(`Step marked as ${decisionType} successfully.`);
      closeDecisionModal();
      await fetchData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error submitting decision';
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading && chains.length === 0) {
    return (
      <div className="p-8 max-w-7xl mx-auto">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-[#2563EB] border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-slate-500 font-medium">Loading approvals...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">Approvals</h1>
          <p className="text-sm text-slate-500 mt-1">
            Review and take action on documents requiring your sign-off
          </p>
        </div>
        <div className="flex items-center gap-2">
          {stalledSteps.length > 0 && isAdmin && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-800 border border-amber-200">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
              {stalledSteps.length} Stalled Approval{stalledSteps.length > 1 ? 's' : ''}
            </span>
          )}
        </div>
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

      {/* Main Two-Panel Content or Empty State */}
      {chains.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center max-w-xl mx-auto mt-12 shadow-sm">
          <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4 text-slate-400">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <h3 className="text-base font-medium text-slate-900">No pending approvals</h3>
          <p className="text-sm text-slate-500 mt-2 max-w-md mx-auto">
            All document approvals assigned to you or your organization are up to date. New approval
            requests will appear here.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Panel: Approval Chains List */}
          <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
            <div className="p-4 border-b border-slate-100 bg-slate-50/50">
              <h2 className="text-sm font-semibold text-slate-900">Active Approval Chains</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Select a workflow to inspect approval steps
              </p>
            </div>
            <div className="divide-y divide-slate-100 max-h-[600px] overflow-y-auto">
              {chains.map((chain) => {
                const isSelected = chain.id === (selectedChain?.id || '');
                const pendingCount = (chain.steps || []).filter(
                  (s) => s.status === 'pending',
                ).length;

                return (
                  <button
                    key={chain.id}
                    onClick={() => setSelectedChainId(chain.id)}
                    className={`w-full text-left p-4 transition-colors flex items-center justify-between group ${
                      isSelected ? 'bg-blue-50/70 border-l-4 border-blue-600' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="min-w-0 pr-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-slate-900 truncate">
                          {chain.name}
                        </span>
                        {chain.isActive ? (
                          <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
                        ) : (
                          <span className="inline-block w-2 h-2 rounded-full bg-slate-300" />
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-1 text-xs text-slate-500">
                        <FileText className="w-3.5 h-3.5 text-slate-400" />
                        <span className="truncate">
                          {chain.documentTitle || 'Workspace Document Workflow'}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-2 text-xs text-slate-400">
                        <span>Created {new Date(chain.createdAt).toLocaleDateString()}</span>
                        <span>•</span>
                        <span>{chain.steps?.length || 0} Steps</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {pendingCount > 0 && (
                        <span className="px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800">
                          {pendingCount} Pending
                        </span>
                      )}
                      <ChevronRight
                        className={`w-4 h-4 text-slate-400 group-hover:text-slate-600 ${
                          isSelected ? 'text-blue-600' : ''
                        }`}
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right Panel: Step list for selected chain */}
          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
            {selectedChain ? (
              <div>
                <div className="p-5 border-b border-slate-100 flex items-center justify-between">
                  <div>
                    <h2 className="text-base font-semibold text-slate-900">{selectedChain.name}</h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Workflow execution sequence and decision timeline
                    </p>
                  </div>
                  <span
                    className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                      selectedChain.isActive
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'bg-slate-100 text-slate-600 border border-slate-200'
                    }`}
                  >
                    {selectedChain.isActive ? 'Active Workflow' : 'Inactive'}
                  </span>
                </div>

                <div className="p-6">
                  <div className="space-y-4">
                    {(selectedChain.steps || []).map((step, idx) => {
                      const isCurrentUserApprover =
                        !currentUserId ||
                        step.approverId === currentUserId ||
                        step.fallbackApproverId === currentUserId;
                      const canDecide = step.status === 'pending' && isCurrentUserApprover;

                      return (
                        <div
                          key={step.id || idx}
                          className="border border-slate-200 rounded-lg p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50/30 hover:border-slate-300 transition-colors"
                        >
                          {/* Step Info */}
                          <div className="flex items-start gap-3">
                            <span className="flex items-center justify-center w-7 h-7 rounded-full bg-slate-200 text-slate-700 text-xs font-semibold shrink-0">
                              {step.stepOrder}
                            </span>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-slate-900">
                                  {step.approver?.name ||
                                    step.approver?.email ||
                                    'Designated Approver'}
                                </span>
                                {step.fallbackApprover && (
                                  <span className="text-xs text-slate-400">
                                    (Fallback:{' '}
                                    {step.fallbackApprover.name || step.fallbackApprover.email})
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-3 text-xs text-slate-500 mt-1">
                                <span className="flex items-center gap-1">
                                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                                  Timeout: {step.timeoutHours}h
                                </span>
                                {step.decidedAt && (
                                  <span>
                                    Decided on {new Date(step.decidedAt).toLocaleString()}
                                  </span>
                                )}
                              </div>
                              {step.comment && (
                                <div className="mt-2 text-xs text-slate-600 bg-white p-2 rounded border border-slate-200 flex items-start gap-1.5">
                                  <MessageSquare className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" />
                                  <span>&ldquo;{step.comment}&rdquo;</span>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Status and Action Buttons */}
                          <div className="flex items-center gap-3 shrink-0 self-end sm:self-center">
                            {/* Status Chip */}
                            {step.status === 'pending' && (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">
                                <Clock className="w-3 h-3 text-slate-500" />
                                Pending
                              </span>
                            )}
                            {step.status === 'approved' && (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-800 border border-emerald-200">
                                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                Approved
                              </span>
                            )}
                            {step.status === 'rejected' && (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-red-50 text-red-800 border border-red-200">
                                <XCircle className="w-3 h-3 text-red-600" />
                                Rejected
                              </span>
                            )}
                            {step.status === 'skipped' && (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-50 text-slate-400 border border-slate-200">
                                Skipped
                              </span>
                            )}

                            {/* Decide Action Buttons */}
                            {canDecide && (
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => openDecisionModal(step, 'approved')}
                                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[#2563EB] text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-[#2563EB] focus:ring-offset-1 transition-colors"
                                >
                                  Approve
                                </button>
                                <button
                                  onClick={() => openDecisionModal(step, 'rejected')}
                                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white border border-red-300 text-red-700 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-1 transition-colors"
                                >
                                  Reject
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-12 text-center text-slate-400">
                Select an approval chain to view steps
              </div>
            )}
          </div>
        </div>
      )}

      {/* Stalled Approvals Section (Admin view) */}
      {isAdmin && stalledSteps.length > 0 && (
        <div className="mt-10 bg-white border border-amber-200 rounded-xl overflow-hidden shadow-sm">
          <div className="p-4 bg-amber-50/60 border-b border-amber-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-amber-700" />
              <h3 className="text-sm font-semibold text-amber-900">
                Stalled Approvals Requiring Attention
              </h3>
            </div>
            <span className="text-xs text-amber-700 font-medium">
              Elapsed time exceeds configured timeout window
            </span>
          </div>
          <div className="p-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs font-medium text-slate-500">
                  <th className="py-2.5 px-3">Workflow Step</th>
                  <th className="py-2.5 px-3">Designated Approver</th>
                  <th className="py-2.5 px-3">Timeout Config</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">Created</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {stalledSteps.map((step) => (
                  <tr key={step.id} className="hover:bg-slate-50/50">
                    <td className="py-3 px-3 font-medium text-slate-900">Step #{step.stepOrder}</td>
                    <td className="py-3 px-3 text-slate-600">
                      {step.approver?.name || step.approver?.email || 'Unassigned'}
                    </td>
                    <td className="py-3 px-3 text-slate-500">{step.timeoutHours} hours</td>
                    <td className="py-3 px-3">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800">
                        <AlertTriangle className="w-3 h-3 text-amber-600" />
                        Stalled
                      </span>
                    </td>
                    <td className="py-3 px-3 text-slate-500 text-xs">
                      {new Date(step.createdAt).toLocaleDateString()}
                    </td>
                    <td className="py-3 px-3 text-right">
                      <button
                        onClick={() => openDecisionModal(step, 'approved')}
                        className="text-xs font-medium text-[#2563EB] hover:underline mr-3"
                      >
                        Override Approve
                      </button>
                      <button
                        onClick={() => openDecisionModal(step, 'rejected')}
                        className="text-xs font-medium text-red-600 hover:underline"
                      >
                        Reject
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Decision Modal */}
      {decisionModalOpen && targetStep && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl border border-slate-200">
            <h3 className="text-lg font-semibold text-slate-900">
              {decisionType === 'approved' ? 'Approve Step' : 'Reject Step'}
            </h3>
            <p className="text-sm text-slate-500 mt-1">
              Confirm your decision for Step #{targetStep.stepOrder}. This action will be immutably
              recorded in the audit log.
            </p>

            <div className="mt-4">
              <label
                htmlFor="decision-comment"
                className="block text-xs font-medium text-slate-700 mb-1.5"
              >
                Decision Comment (Optional)
              </label>
              <textarea
                id="decision-comment"
                rows={3}
                value={decisionComment}
                onChange={(e) => setDecisionComment(e.target.value)}
                placeholder="Enter any context or justification for this sign-off..."
                className="w-full text-sm p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#2563EB] focus:border-transparent outline-none transition-all placeholder:text-slate-400"
              />
            </div>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={closeDecisionModal}
                disabled={isSubmitting}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-300"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmitDecision}
                disabled={isSubmitting}
                className={`px-4 py-2 text-sm font-medium text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-1 ${
                  decisionType === 'approved'
                    ? 'bg-[#2563EB] hover:bg-blue-700 focus:ring-[#2563EB]'
                    : 'bg-red-600 hover:bg-red-700 focus:ring-red-600'
                }`}
              >
                {isSubmitting
                  ? 'Submitting...'
                  : `Confirm ${decisionType === 'approved' ? 'Approval' : 'Rejection'}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
