'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Sparkles,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  Database,
  Layers,
  FileCheck,
} from 'lucide-react';

interface IntakeQuestion {
  id: string;
  key: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'email' | 'single_select' | 'multi_select' | 'crm_field';
  required?: boolean;
  options?: string[];
  placeholder?: string;
  crmFieldMapping?: string;
  dependsOn?: {
    questionId: string;
    operator: 'equals' | 'not_equals' | 'contains' | 'is_truthy';
    value?: any;
  };
}

interface ProposalTemplate {
  id: string;
  title: string;
  category: string;
  description: string;
  intakeQuestions: IntakeQuestion[];
}

const SAMPLE_TEMPLATES: ProposalTemplate[] = [
  {
    id: '0192a000-0000-7000-8000-000000000101',
    title: 'Enterprise Software & Cloud Services Proposal',
    category: 'Software / SaaS',
    description:
      'Comprehensive commercial proposal covering scope of work, cloud architecture, SLA guarantees, and pricing schedules.',
    intakeQuestions: [
      {
        id: 'q1',
        key: 'client_name',
        label: 'Client / Company Name',
        type: 'text',
        required: true,
        placeholder: 'e.g. Acme Corporation',
        crmFieldMapping: 'company_name',
      },
      {
        id: 'q2',
        key: 'project_scope',
        label: 'Engagement Type',
        type: 'single_select',
        required: true,
        options: [
          'New Implementation',
          'Cloud Migration',
          'Annual Renewal & Expansion',
          'Custom Enterprise Integration',
        ],
      },
      {
        id: 'q3',
        key: 'include_sla',
        label: 'Include 24/7 Enterprise SLA Commitment?',
        type: 'single_select',
        required: true,
        options: ['Yes', 'No'],
      },
      {
        id: 'q4',
        key: 'sla_tier',
        label: 'SLA Support Tier',
        type: 'single_select',
        options: [
          'Platinum (99.99% uptime, 15m response)',
          'Gold (99.9% uptime, 1h response)',
          'Standard Business Hours',
        ],
        dependsOn: {
          questionId: 'include_sla',
          operator: 'equals',
          value: 'Yes',
        },
      },
      {
        id: 'q5',
        key: 'contract_value',
        label: 'Estimated Annual Contract Value ($)',
        type: 'number',
        required: true,
        placeholder: '75000',
        crmFieldMapping: 'deal_amount',
      },
      {
        id: 'q6',
        key: 'target_start_date',
        label: 'Target Implementation Date',
        type: 'date',
        required: true,
        crmFieldMapping: 'close_date',
      },
      {
        id: 'q7',
        key: 'primary_contact',
        label: 'Lead Buyer / Signer Name',
        type: 'text',
        required: true,
        placeholder: 'Jane Doe',
        crmFieldMapping: 'contact_name',
      },
      {
        id: 'q8',
        key: 'primary_email',
        label: 'Signer Work Email',
        type: 'email',
        required: true,
        placeholder: 'jane@acme.com',
        crmFieldMapping: 'contact_email',
      },
    ],
  },
  {
    id: '0192a000-0000-7000-8000-000000000102',
    title: 'Professional Consulting & Advisory Agreement',
    category: 'Consulting',
    description:
      'Statement of Work and consulting proposal detailing milestones, deliverable acceptance criteria, and fee structures.',
    intakeQuestions: [
      {
        id: 'q1',
        key: 'client_name',
        label: 'Client Company Name',
        type: 'text',
        required: true,
        placeholder: 'e.g. Globex Industries',
        crmFieldMapping: 'company_name',
      },
      {
        id: 'q2',
        key: 'billing_model',
        label: 'Billing Structure',
        type: 'single_select',
        required: true,
        options: ['Fixed Fee Milestone-Based', 'Time & Materials', 'Monthly Retainer'],
      },
      {
        id: 'q3',
        key: 'contract_value',
        label: 'Total Fee / Project Value ($)',
        type: 'number',
        required: true,
        placeholder: '45000',
        crmFieldMapping: 'deal_amount',
      },
      {
        id: 'q4',
        key: 'deliverables_summary',
        label: 'Key Strategic Deliverables',
        type: 'text',
        required: true,
        placeholder: 'e.g. Architecture audit, security compliance review, migration roadmap',
      },
    ],
  },
];

export default function GuidedProposalBuilderPage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [selectedTemplate, setSelectedTemplate] = useState<ProposalTemplate | null>(
    SAMPLE_TEMPLATES[0],
  );
  const [answers, setAnswers] = useState<Record<string, any>>({
    client_name: 'Acme Global Corporation',
    project_scope: 'New Implementation',
    include_sla: 'Yes',
    sla_tier: 'Platinum (99.99% uptime, 15m response)',
    contract_value: '125000',
    target_start_date: '2026-11-15',
    primary_contact: 'Alex Mercer',
    primary_email: 'alex.mercer@acmeglobal.com',
  });

  const [crmEntityId, setCrmEntityId] = useState<string>('deal_hubspot_88329');
  const [crmData, setCrmData] = useState<Record<string, any>>({
    company_name: 'Acme Global Corporation',
    deal_amount: 125000,
    contact_name: 'Alex Mercer',
    contact_email: 'alex.mercer@acmeglobal.com',
    close_date: '2026-11-15',
    provider: 'hubspot',
  });
  const [crmWarning, setCrmWarning] = useState<string | null>(null);

  const [isAssembling, setIsAssembling] = useState<boolean>(false);
  const [assembledProposal, setAssembledProposal] = useState<any>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleAnswerChange = (key: string, val: any) => {
    setAnswers((prev) => ({ ...prev, [key]: val }));
  };

  const isQuestionVisible = (q: IntakeQuestion): boolean => {
    if (!q.dependsOn) return true;
    const depVal = answers[q.dependsOn.questionId];
    if (q.dependsOn.operator === 'equals') {
      return depVal === q.dependsOn.value;
    }
    if (q.dependsOn.operator === 'not_equals') {
      return depVal !== q.dependsOn.value;
    }
    if (q.dependsOn.operator === 'contains') {
      return Array.isArray(depVal) && depVal.includes(q.dependsOn.value);
    }
    if (q.dependsOn.operator === 'is_truthy') {
      return Boolean(depVal);
    }
    return true;
  };

  const handleAssemble = async () => {
    if (!selectedTemplate) return;
    setIsAssembling(true);
    setErrorMessage(null);

    try {
      const res = await fetch('/api/v1/ai/guided-proposal/assemble', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateId: selectedTemplate.id,
          title: `${answers.client_name || 'Client'} - Commercial Proposal`,
          answers,
          crmEntityId,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        if (res.status === 403 && errorData.code === 'AI_GUARDRAIL_VIOLATION') {
          throw new Error('AI generation is restricted by organizational guardrail settings.');
        }
        throw new Error(errorData.message || `Assembly failed with status ${res.status}`);
      }

      const data = await res.json();
      setAssembledProposal(data);
      if (data.crmWarning) {
        setCrmWarning(data.crmWarning);
      }
      setCurrentStep(4);
    } catch (err: any) {
      setErrorMessage(err.message || 'An error occurred assembling the proposal.');
    } finally {
      setIsAssembling(false);
    }
  };

  const handleAcceptAndSave = () => {
    // In production, redirects to created document editor
    router.push('/documents');
  };

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto', paddingBottom: '60px' }}>
      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
          <Link
            href="/documents"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '13px',
              color: 'var(--color-gray-600)',
              textDecoration: 'none',
            }}
          >
            <ArrowLeft size={14} /> Back to Documents
          </Link>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h1 style={{ fontSize: '24px', fontWeight: 600, color: 'var(--color-gray-950)' }}>
              Guided AI Proposal Builder
            </h1>
            <p style={{ color: 'var(--color-gray-600)', fontSize: '14px', marginTop: '4px' }}>
              Assemble custom commercial proposals in seconds from intake answers and live CRM
              records.
            </p>
          </div>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              backgroundColor: '#EFF6FF',
              border: '1px solid #BFDBFE',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 500,
              color: '#1D4ED8',
            }}
          >
            <Sparkles size={14} />
            <span>AI-Powered Assembly</span>
          </div>
        </div>
      </div>

      {/* Wizard Step Indicator */}
      <div
        style={{
          display: 'flex',
          borderBottom: '1px solid var(--color-gray-200)',
          marginBottom: '32px',
          backgroundColor: '#FFFFFF',
          borderRadius: '8px',
          border: '1px solid var(--color-gray-200)',
          overflow: 'hidden',
        }}
      >
        {[
          { num: 1, label: '1. Select Template' },
          { num: 2, label: '2. Intake Questions' },
          { num: 3, label: '3. CRM Context' },
          { num: 4, label: '4. AI Review & Accept' },
        ].map((step) => {
          const isActive = currentStep === step.num;
          const isDone = currentStep > step.num;
          return (
            <div
              key={step.num}
              style={{
                flex: 1,
                padding: '12px 16px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '13px',
                fontWeight: isActive ? 600 : 500,
                color: isActive
                  ? '#2563EB'
                  : isDone
                    ? 'var(--color-gray-900)'
                    : 'var(--color-gray-400)',
                backgroundColor: isActive ? '#F8FAFC' : '#FFFFFF',
                borderBottom: isActive ? '2px solid #2563EB' : '2px solid transparent',
              }}
            >
              {isDone ? (
                <CheckCircle2 size={16} color="#16A34A" />
              ) : (
                <span
                  style={{
                    width: '20px',
                    height: '20px',
                    borderRadius: '50%',
                    backgroundColor: isActive ? '#2563EB' : 'var(--color-gray-200)',
                    color: isActive ? '#FFFFFF' : 'var(--color-gray-600)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '11px',
                  }}
                >
                  {step.num}
                </span>
              )}
              {step.label}
            </div>
          );
        })}
      </div>

      {/* Error Message Banner */}
      {errorMessage && (
        <div
          style={{
            padding: '12px 16px',
            backgroundColor: '#FEF2F2',
            border: '1px solid #FCA5A5',
            borderRadius: '6px',
            marginBottom: '24px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            color: '#B91C1C',
            fontSize: '14px',
          }}
        >
          <AlertCircle size={18} />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* STEP 1: SELECT TEMPLATE */}
      {currentStep === 1 && (
        <div>
          <h2
            style={{
              fontSize: '16px',
              fontWeight: 600,
              color: 'var(--color-gray-900)',
              marginBottom: '16px',
            }}
          >
            Choose a Proposal Framework
          </h2>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
              gap: '16px',
            }}
          >
            {SAMPLE_TEMPLATES.map((tpl) => {
              const isSelected = selectedTemplate?.id === tpl.id;
              return (
                <div
                  key={tpl.id}
                  onClick={() => setSelectedTemplate(tpl)}
                  style={{
                    padding: '20px',
                    borderRadius: '8px',
                    border: isSelected ? '2px solid #2563EB' : '1px solid var(--color-gray-200)',
                    backgroundColor: isSelected ? '#F0F7FF' : '#FFFFFF',
                    cursor: 'pointer',
                    transition: 'border-color 0.15s ease',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      marginBottom: '8px',
                    }}
                  >
                    <span
                      style={{
                        fontSize: '11px',
                        textTransform: 'uppercase',
                        fontWeight: 600,
                        color: isSelected ? '#1D4ED8' : 'var(--color-gray-500)',
                        letterSpacing: '0.05em',
                      }}
                    >
                      {tpl.category}
                    </span>
                    {isSelected && <CheckCircle2 size={18} color="#2563EB" />}
                  </div>
                  <h3
                    style={{
                      fontSize: '16px',
                      fontWeight: 600,
                      color: 'var(--color-gray-950)',
                      marginBottom: '8px',
                    }}
                  >
                    {tpl.title}
                  </h3>
                  <p
                    style={{
                      fontSize: '13px',
                      color: 'var(--color-gray-600)',
                      lineHeight: '1.5',
                      marginBottom: '16px',
                    }}
                  >
                    {tpl.description}
                  </p>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      fontSize: '12px',
                      color: 'var(--color-gray-500)',
                    }}
                  >
                    <Layers size={14} />
                    <span>{tpl.intakeQuestions.length} intake questions configured</span>
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ marginTop: '32px', display: 'flex', justifyContent: 'flex-end' }}>
            <button
              onClick={() => setCurrentStep(2)}
              disabled={!selectedTemplate}
              className="pact-btn pact-btn-primary"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 20px',
                backgroundColor: '#2563EB',
                color: '#FFFFFF',
                borderRadius: '6px',
                border: 'none',
                fontWeight: 500,
                cursor: selectedTemplate ? 'pointer' : 'not-allowed',
                opacity: selectedTemplate ? 1 : 0.6,
              }}
            >
              Continue to Intake Form <ArrowRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* STEP 2: INTAKE QUESTIONS */}
      {currentStep === 2 && selectedTemplate && (
        <div
          style={{
            backgroundColor: '#FFFFFF',
            padding: '28px',
            borderRadius: '8px',
            border: '1px solid var(--color-gray-200)',
          }}
        >
          <div style={{ marginBottom: '24px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--color-gray-900)' }}>
              Intake Questionnaire: {selectedTemplate.title}
            </h2>
            <p style={{ fontSize: '13px', color: 'var(--color-gray-600)', marginTop: '4px' }}>
              Answer these baseline questions to tailor contract terms, scope, and SLA requirements.
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {selectedTemplate.intakeQuestions.filter(isQuestionVisible).map((q) => (
              <div key={q.id}>
                <label
                  style={{
                    display: 'block',
                    fontSize: '13px',
                    fontWeight: 600,
                    color: 'var(--color-gray-900)',
                    marginBottom: '6px',
                  }}
                >
                  {q.label} {q.required && <span style={{ color: '#DC2626' }}>*</span>}
                </label>

                {q.type === 'single_select' && q.options ? (
                  <select
                    value={answers[q.key] || ''}
                    onChange={(e) => handleAnswerChange(q.key, e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      border: '1px solid var(--color-gray-300)',
                      fontSize: '14px',
                      backgroundColor: '#FFFFFF',
                    }}
                  >
                    <option value="">Select an option...</option>
                    {q.options.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type={
                      q.type === 'number'
                        ? 'number'
                        : q.type === 'date'
                          ? 'date'
                          : q.type === 'email'
                            ? 'email'
                            : 'text'
                    }
                    value={answers[q.key] || ''}
                    placeholder={q.placeholder || ''}
                    onChange={(e) => handleAnswerChange(q.key, e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      border: '1px solid var(--color-gray-300)',
                      fontSize: '14px',
                    }}
                  />
                )}
                {q.crmFieldMapping && (
                  <div
                    style={{
                      marginTop: '4px',
                      fontSize: '11px',
                      color: 'var(--color-gray-500)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    <Database size={12} />
                    <span>
                      Auto-mapped to CRM field: <code>{q.crmFieldMapping}</code>
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div
            style={{
              marginTop: '32px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <button
              onClick={() => setCurrentStep(1)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 16px',
                border: '1px solid var(--color-gray-300)',
                backgroundColor: '#FFFFFF',
                borderRadius: '6px',
                fontSize: '13px',
                cursor: 'pointer',
              }}
            >
              <ArrowLeft size={14} /> Back
            </button>
            <button
              onClick={() => setCurrentStep(3)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '9px 18px',
                backgroundColor: '#2563EB',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: '6px',
                fontSize: '14px',
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              Next: Review CRM Context <ArrowRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* STEP 3: CRM CONTEXT & REVIEW */}
      {currentStep === 3 && (
        <div
          style={{
            backgroundColor: '#FFFFFF',
            padding: '28px',
            borderRadius: '8px',
            border: '1px solid var(--color-gray-200)',
          }}
        >
          <div style={{ marginBottom: '24px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--color-gray-900)' }}>
              CRM Live Data Integration
            </h2>
            <p style={{ fontSize: '13px', color: 'var(--color-gray-600)', marginTop: '4px' }}>
              Connected account values are merged into template variables at build time (Invariant
              I-12).
            </p>
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label
              style={{
                display: 'block',
                fontSize: '13px',
                fontWeight: 600,
                color: 'var(--color-gray-900)',
                marginBottom: '6px',
              }}
            >
              Associated CRM Deal / Entity ID
            </label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                value={crmEntityId}
                onChange={(e) => setCrmEntityId(e.target.value)}
                placeholder="e.g. deal_12345"
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: '1px solid var(--color-gray-300)',
                  fontSize: '14px',
                }}
              />
              <button
                onClick={() => {
                  setCrmWarning(null);
                  setCrmData({
                    company_name: answers.client_name || 'Acme Global Corporation',
                    deal_amount: Number(answers.contract_value) || 125000,
                    contact_name: answers.primary_contact || 'Alex Mercer',
                    contact_email: answers.primary_email || 'alex.mercer@acmeglobal.com',
                    close_date: answers.target_start_date || '2026-11-15',
                    provider: 'hubspot',
                  });
                }}
                style={{
                  padding: '8px 14px',
                  borderRadius: '6px',
                  border: '1px solid var(--color-gray-300)',
                  backgroundColor: 'var(--color-gray-50)',
                  fontSize: '13px',
                  cursor: 'pointer',
                }}
              >
                Refresh CRM Data
              </button>
            </div>
          </div>

          {/* CRM Data Card */}
          <div
            style={{
              border: '1px solid var(--color-gray-200)',
              borderRadius: '6px',
              padding: '16px',
              backgroundColor: '#FAFAFA',
              marginBottom: '24px',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                marginBottom: '12px',
                fontSize: '13px',
                fontWeight: 600,
                color: 'var(--color-gray-900)',
              }}
            >
              <Database size={15} color="#2563EB" />
              <span>Resolved CRM Context Properties</span>
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: '12px',
                fontSize: '13px',
              }}
            >
              <div>
                <span style={{ color: 'var(--color-gray-500)' }}>Account / Company:</span>
                <div style={{ fontWeight: 500, color: 'var(--color-gray-900)' }}>
                  {crmData.company_name}
                </div>
              </div>
              <div>
                <span style={{ color: 'var(--color-gray-500)' }}>Deal Amount:</span>
                <div style={{ fontWeight: 500, color: 'var(--color-gray-900)' }}>
                  ${Number(crmData.deal_amount).toLocaleString()}
                </div>
              </div>
              <div>
                <span style={{ color: 'var(--color-gray-500)' }}>Primary Contact:</span>
                <div style={{ fontWeight: 500, color: 'var(--color-gray-900)' }}>
                  {crmData.contact_name} ({crmData.contact_email})
                </div>
              </div>
              <div>
                <span style={{ color: 'var(--color-gray-500)' }}>Close / Target Date:</span>
                <div style={{ fontWeight: 500, color: 'var(--color-gray-900)' }}>
                  {crmData.close_date}
                </div>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <button
              onClick={() => setCurrentStep(2)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 16px',
                border: '1px solid var(--color-gray-300)',
                backgroundColor: '#FFFFFF',
                borderRadius: '6px',
                fontSize: '13px',
                cursor: 'pointer',
              }}
            >
              <ArrowLeft size={14} /> Back
            </button>
            <button
              onClick={handleAssemble}
              disabled={isAssembling}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 20px',
                backgroundColor: '#2563EB',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: '6px',
                fontSize: '14px',
                fontWeight: 500,
                cursor: isAssembling ? 'not-allowed' : 'pointer',
                opacity: isAssembling ? 0.7 : 1,
              }}
            >
              <Sparkles size={16} />
              {isAssembling ? 'AI Assembling Proposal...' : 'Assemble Proposal with AI'}
            </button>
          </div>
        </div>
      )}

      {/* STEP 4: REVIEW ASSEMBLED PROPOSAL */}
      {currentStep === 4 && (
        <div>
          {crmWarning && (
            <div
              style={{
                padding: '12px 16px',
                backgroundColor: '#FFFBEB',
                border: '1px solid #FDE68A',
                borderRadius: '6px',
                marginBottom: '16px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                color: '#92400E',
                fontSize: '13px',
              }}
            >
              <AlertCircle size={16} />
              <span>{crmWarning}</span>
            </div>
          )}

          <div
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '8px',
              border: '1px solid var(--color-gray-200)',
              overflow: 'hidden',
              marginBottom: '24px',
            }}
          >
            <div
              style={{
                padding: '16px 20px',
                borderBottom: '1px solid var(--color-gray-200)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                backgroundColor: '#F8FAFC',
              }}
            >
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--color-gray-950)' }}>
                  {assembledProposal?.title || 'Commercial Services Proposal'}
                </h3>
                <span style={{ fontSize: '12px', color: 'var(--color-gray-500)' }}>
                  Generated using Task ID: <code>guided-proposal-assembly</code>
                </span>
              </div>
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '4px 8px',
                  backgroundColor: '#EFF6FF',
                  border: '1px solid #BFDBFE',
                  borderRadius: '4px',
                  fontSize: '11px',
                  fontWeight: 600,
                  color: '#1D4ED8',
                }}
              >
                <span>RULE AI-002: createdBy: 'ai'</span>
              </div>
            </div>

            {/* Document Preview Pane */}
            <div style={{ padding: '32px', minHeight: '380px', backgroundColor: '#FFFFFF' }}>
              <div style={{ maxWidth: '720px', margin: '0 auto' }}>
                <h1
                  style={{
                    fontSize: '22px',
                    fontWeight: 700,
                    color: 'var(--color-gray-950)',
                    marginBottom: '16px',
                  }}
                >
                  {assembledProposal?.title || `${answers.client_name} - Commercial Proposal`}
                </h1>

                <div
                  style={{
                    padding: '12px 16px',
                    borderLeft: '4px solid #2563EB',
                    backgroundColor: '#F0F7FF',
                    borderRadius: '0 6px 6px 0',
                    marginBottom: '24px',
                    fontSize: '14px',
                    lineHeight: '1.6',
                    color: 'var(--color-gray-800)',
                  }}
                >
                  <strong>Executive Summary:</strong> We are pleased to present this enterprise
                  commercial proposal for <strong>{answers.client_name}</strong>. This agreement
                  sets forth the scope of cloud services, implementation timelines, and support
                  commitments tailored to your strategic milestones.
                </div>

                <h2
                  style={{
                    fontSize: '17px',
                    fontWeight: 600,
                    color: 'var(--color-gray-900)',
                    marginTop: '24px',
                    marginBottom: '12px',
                  }}
                >
                  Scope of Work & Commercial Terms
                </h2>
                <table
                  style={{
                    width: '100%',
                    borderCollapse: 'collapse',
                    marginBottom: '24px',
                    fontSize: '13px',
                  }}
                >
                  <thead>
                    <tr
                      style={{ borderBottom: '2px solid var(--color-gray-200)', textAlign: 'left' }}
                    >
                      <th style={{ padding: '8px', color: 'var(--color-gray-600)' }}>
                        Item / Milestone
                      </th>
                      <th style={{ padding: '8px', color: 'var(--color-gray-600)' }}>Details</th>
                      <th
                        style={{
                          padding: '8px',
                          textAlign: 'right',
                          color: 'var(--color-gray-600)',
                        }}
                      >
                        Value
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr style={{ borderBottom: '1px solid var(--color-gray-200)' }}>
                      <td style={{ padding: '10px 8px', fontWeight: 500 }}>
                        {answers.project_scope || 'Platform Implementation'}
                      </td>
                      <td style={{ padding: '10px 8px', color: 'var(--color-gray-600)' }}>
                        Turnkey setup, data migration, and enterprise validation
                      </td>
                      <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: 600 }}>
                        ${Number(answers.contract_value || 125000).toLocaleString()}
                      </td>
                    </tr>
                    <tr style={{ borderBottom: '1px solid var(--color-gray-200)' }}>
                      <td style={{ padding: '10px 8px', fontWeight: 500 }}>
                        Support & SLA Guarantee
                      </td>
                      <td style={{ padding: '10px 8px', color: 'var(--color-gray-600)' }}>
                        {answers.sla_tier || 'Standard Business Support'}
                      </td>
                      <td
                        style={{
                          padding: '10px 8px',
                          textAlign: 'right',
                          color: 'var(--color-gray-600)',
                        }}
                      >
                        Included
                      </td>
                    </tr>
                  </tbody>
                </table>

                <h2
                  style={{
                    fontSize: '17px',
                    fontWeight: 600,
                    color: 'var(--color-gray-900)',
                    marginTop: '24px',
                    marginBottom: '12px',
                  }}
                >
                  Next Steps & Acceptance
                </h2>
                <p style={{ fontSize: '13px', color: 'var(--color-gray-600)', lineHeight: '1.6' }}>
                  Upon electronic signature of this proposal by{' '}
                  <strong>{answers.primary_contact}</strong> ({answers.primary_email}), project
                  onboarding and initial technical milestones will commence on{' '}
                  <strong>{answers.target_start_date || 'the agreed start date'}</strong>.
                </p>
              </div>
            </div>
          </div>

          {/* Action Bar */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <button
              onClick={() => setCurrentStep(2)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 16px',
                border: '1px solid var(--color-gray-300)',
                backgroundColor: '#FFFFFF',
                borderRadius: '6px',
                fontSize: '13px',
                cursor: 'pointer',
              }}
            >
              <ArrowLeft size={14} /> Adjust Intake Answers
            </button>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={handleAcceptAndSave}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '10px 20px',
                  backgroundColor: '#16A34A',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '14px',
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                <FileCheck size={16} /> Accept AI Proposal & Save Draft
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
