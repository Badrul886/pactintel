'use client';

import React, { useState, useEffect } from 'react';
import { Sparkles, X, Check, Trash2, AlertCircle, RefreshCw } from 'lucide-react';
import { AiTaskId } from '@pactintel/shared-types';

interface AiDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  documentId: string;
  selectedText?: string;
  onAcceptContent: (content: string, isReplacement: boolean) => void;
}

type AiMode = 'draft' | 'refine' | 'grammar';

export const AiDrawer: React.FC<AiDrawerProps> = ({
  isOpen,
  onClose,
  documentId,
  selectedText = '',
  onAcceptContent,
}) => {
  const [mode, setMode] = useState<AiMode>('draft');
  const [promptTask, setPromptTask] = useState('');
  const [tone, setTone] = useState<'professional' | 'friendly' | 'formal' | 'casual'>(
    'professional',
  );
  const [refineInstruction, setRefineInstruction] = useState<
    'condense' | 'expand' | 'change_tone' | 'grammar_fix' | 'custom'
  >('condense');
  const [customInstruction, setCustomInstruction] = useState('');
  const [documentContext, setDocumentContext] = useState('');

  // Generation state
  const [isLoading, setIsLoading] = useState(false);
  const [generatedResult, setGeneratedResult] = useState<string | null>(null);
  const [tokensUsed, setTokensUsed] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

  // Automatically switch to 'refine' if text is selected when opened
  useEffect(() => {
    if (selectedText && selectedText.trim().length > 10) {
      setMode('refine');
    }
  }, [selectedText]);

  if (!isOpen) return null;

  const handleGenerate = async () => {
    try {
      setIsLoading(true);
      setErrorMessage(null);
      setGeneratedResult(null);
      setTokensUsed(null);

      let taskId: AiTaskId = 'DRAFT_SECTION_V1';
      let input: Record<string, unknown> = {};

      if (mode === 'draft') {
        taskId = 'DRAFT_SECTION_V1';
        if (!promptTask.trim()) {
          setErrorMessage('Please describe the clause or section to draft.');
          setIsLoading(false);
          return;
        }
        input = {
          task: promptTask.trim(),
          tone,
          documentContext: documentContext.trim().slice(0, 500) || undefined,
        };
      } else if (mode === 'refine') {
        taskId = 'REFINE_TEXT_V1';
        if (!selectedText.trim()) {
          setErrorMessage('Please select text in the document to refine.');
          setIsLoading(false);
          return;
        }
        input = {
          originalText: selectedText,
          instruction: refineInstruction,
          tone,
          additionalInstructions: customInstruction.trim() || undefined,
        };
      } else if (mode === 'grammar') {
        taskId = 'GRAMMAR_FIX_V1';
        if (!selectedText.trim()) {
          setErrorMessage('Please select text in the document to check for grammar.');
          setIsLoading(false);
          return;
        }
        input = {
          originalText: selectedText,
        };
      }

      const res = await fetch(`${apiBase}/api/v1/ai/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          documentId,
          taskId,
          input,
        }),
      });

      if (res.status === 429) {
        setErrorMessage("You've reached the AI limit. Try again in a minute.");
        return;
      }

      if (res.status === 403) {
        const errJson = await res.json().catch(() => null);
        setErrorMessage(
          errJson?.message || 'AI is not permitted for this document or organization.',
        );
        return;
      }

      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        setErrorMessage(errJson?.message || 'AI is temporarily unavailable. Please try again.');
        return;
      }

      const data = await res.json();
      setGeneratedResult(data.content);
      setTokensUsed(data.tokensUsed || null);
    } catch {
      setErrorMessage('AI is temporarily unavailable. Please check your connection.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAccept = () => {
    if (!generatedResult) return;
    const isReplacement = mode === 'refine' || mode === 'grammar';
    onAcceptContent(generatedResult, isReplacement);
    setGeneratedResult(null);
  };

  const handleDiscard = () => {
    setGeneratedResult(null);
  };

  return (
    <div
      style={{
        width: '300px',
        backgroundColor: '#FFFFFF',
        borderLeft: '1px solid #E2E8F0',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        zIndex: 40,
        overflowY: 'auto',
      }}
      className="shrink-0"
    >
      {/* Drawer Header */}
      <div
        style={{
          padding: '14px 16px',
          borderBottom: '1px solid #E2E8F0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: '#F8FAFC',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Sparkles size={16} color="#2563EB" />
          <span style={{ fontSize: '14px', fontWeight: 600, color: '#0F172A' }}>AI Assistant</span>
        </div>
        <button
          onClick={onClose}
          style={{
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            padding: '4px',
            color: '#64748B',
            borderRadius: '4px',
          }}
          title="Close AI Assistant"
        >
          <X size={16} />
        </button>
      </div>

      {/* Mode Selector Tabs */}
      <div
        style={{
          display: 'flex',
          borderBottom: '1px solid #E2E8F0',
          backgroundColor: '#F8FAFC',
          padding: '4px',
          gap: '4px',
        }}
      >
        <button
          type="button"
          onClick={() => {
            setMode('draft');
            setGeneratedResult(null);
            setErrorMessage(null);
          }}
          style={{
            flex: 1,
            padding: '6px 4px',
            fontSize: '11px',
            fontWeight: 500,
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            backgroundColor: mode === 'draft' ? '#FFFFFF' : 'transparent',
            color: mode === 'draft' ? '#2563EB' : '#64748B',
            boxShadow: mode === 'draft' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
          }}
        >
          Draft
        </button>
        <button
          type="button"
          onClick={() => {
            setMode('refine');
            setGeneratedResult(null);
            setErrorMessage(null);
          }}
          style={{
            flex: 1,
            padding: '6px 4px',
            fontSize: '11px',
            fontWeight: 500,
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            backgroundColor: mode === 'refine' ? '#FFFFFF' : 'transparent',
            color: mode === 'refine' ? '#2563EB' : '#64748B',
            boxShadow: mode === 'refine' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
          }}
        >
          Refine
        </button>
        <button
          type="button"
          onClick={() => {
            setMode('grammar');
            setGeneratedResult(null);
            setErrorMessage(null);
          }}
          style={{
            flex: 1,
            padding: '6px 4px',
            fontSize: '11px',
            fontWeight: 500,
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            backgroundColor: mode === 'grammar' ? '#FFFFFF' : 'transparent',
            color: mode === 'grammar' ? '#2563EB' : '#64748B',
            boxShadow: mode === 'grammar' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
          }}
        >
          Grammar
        </button>
      </div>

      {/* Panel Form Body */}
      <div
        style={{ padding: '16px', flex: 1, display: 'flex', flexDirection: 'column', gap: '14px' }}
      >
        {/* Error alert */}
        {errorMessage && (
          <div
            style={{
              padding: '10px 12px',
              backgroundColor: '#FEF2F2',
              border: '1px solid #FECACA',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'start',
              gap: '8px',
              fontSize: '12px',
              color: '#991B1B',
            }}
          >
            <AlertCircle size={14} style={{ marginTop: '2px', flexShrink: 0 }} />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Selected Text Preview (for Refine & Grammar) */}
        {(mode === 'refine' || mode === 'grammar') && (
          <div>
            <label
              style={{
                display: 'block',
                fontSize: '11px',
                fontWeight: 600,
                color: '#475569',
                marginBottom: '4px',
              }}
            >
              Selected Text Preview
            </label>
            {selectedText && selectedText.trim().length > 0 ? (
              <div
                style={{
                  padding: '8px',
                  backgroundColor: '#F8FAFC',
                  border: '1px solid #E2E8F0',
                  borderRadius: '6px',
                  fontSize: '12px',
                  color: '#334155',
                  maxHeight: '90px',
                  overflowY: 'auto',
                  fontStyle: 'italic',
                }}
              >
                &ldquo;{selectedText.slice(0, 200)}
                {selectedText.length > 200 ? '...' : ''}&rdquo;
              </div>
            ) : (
              <p style={{ fontSize: '11px', color: '#94A3B8', margin: 0 }}>
                Highlight text in the document editor to use this mode.
              </p>
            )}
          </div>
        )}

        {/* Mode: Draft Section */}
        {mode === 'draft' && (
          <>
            <div>
              <label
                htmlFor="ai-prompt-task"
                style={{
                  display: 'block',
                  fontSize: '11px',
                  fontWeight: 600,
                  color: '#475569',
                  marginBottom: '4px',
                }}
              >
                What would you like to draft? *
              </label>
              <textarea
                id="ai-prompt-task"
                rows={4}
                value={promptTask}
                onChange={(e) => setPromptTask(e.target.value)}
                placeholder="e.g. Write a liability limitation clause capped at total fees paid in the past 12 months..."
                style={{
                  width: '100%',
                  padding: '8px',
                  fontSize: '12px',
                  border: '1px solid #CBD5E1',
                  borderRadius: '6px',
                  outline: 'none',
                  resize: 'vertical',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <div>
              <label
                htmlFor="ai-draft-tone"
                style={{
                  display: 'block',
                  fontSize: '11px',
                  fontWeight: 600,
                  color: '#475569',
                  marginBottom: '4px',
                }}
              >
                Tone of Voice
              </label>
              <select
                id="ai-draft-tone"
                value={tone}
                onChange={(e) => setTone(e.target.value as any)}
                style={{
                  width: '100%',
                  padding: '6px 8px',
                  fontSize: '12px',
                  border: '1px solid #CBD5E1',
                  borderRadius: '6px',
                  backgroundColor: '#FFFFFF',
                  outline: 'none',
                }}
              >
                <option value="professional">Professional</option>
                <option value="formal">Formal & Legal</option>
                <option value="friendly">Friendly & Commercial</option>
                <option value="casual">Casual</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="ai-draft-context"
                style={{
                  display: 'block',
                  fontSize: '11px',
                  fontWeight: 600,
                  color: '#475569',
                  marginBottom: '4px',
                }}
              >
                Brief Context (Optional, max 500 chars)
              </label>
              <input
                id="ai-draft-context"
                type="text"
                maxLength={500}
                value={documentContext}
                onChange={(e) => setDocumentContext(e.target.value)}
                placeholder="e.g. Enterprise SaaS SLA agreement for Tier 1 client"
                style={{
                  width: '100%',
                  padding: '6px 8px',
                  fontSize: '12px',
                  border: '1px solid #CBD5E1',
                  borderRadius: '6px',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>
          </>
        )}

        {/* Mode: Refine Selected */}
        {mode === 'refine' && (
          <>
            <div>
              <label
                htmlFor="ai-refine-action"
                style={{
                  display: 'block',
                  fontSize: '11px',
                  fontWeight: 600,
                  color: '#475569',
                  marginBottom: '4px',
                }}
              >
                Refinement Goal
              </label>
              <select
                id="ai-refine-action"
                value={refineInstruction}
                onChange={(e) => setRefineInstruction(e.target.value as any)}
                style={{
                  width: '100%',
                  padding: '6px 8px',
                  fontSize: '12px',
                  border: '1px solid #CBD5E1',
                  borderRadius: '6px',
                  backgroundColor: '#FFFFFF',
                  outline: 'none',
                }}
              >
                <option value="condense">Condense & Shorten</option>
                <option value="expand">Expand & Elaborate</option>
                <option value="change_tone">Change Tone</option>
                <option value="grammar_fix">Fix Grammar Only</option>
                <option value="custom">Custom Instructions</option>
              </select>
            </div>

            {refineInstruction === 'change_tone' && (
              <div>
                <label
                  htmlFor="ai-refine-tone"
                  style={{
                    display: 'block',
                    fontSize: '11px',
                    fontWeight: 600,
                    color: '#475569',
                    marginBottom: '4px',
                  }}
                >
                  Target Tone
                </label>
                <select
                  id="ai-refine-tone"
                  value={tone}
                  onChange={(e) => setTone(e.target.value as any)}
                  style={{
                    width: '100%',
                    padding: '6px 8px',
                    fontSize: '12px',
                    border: '1px solid #CBD5E1',
                    borderRadius: '6px',
                    backgroundColor: '#FFFFFF',
                    outline: 'none',
                  }}
                >
                  <option value="professional">Professional</option>
                  <option value="formal">Formal & Legal</option>
                  <option value="friendly">Friendly & Collaborative</option>
                  <option value="casual">Casual</option>
                </select>
              </div>
            )}

            {refineInstruction === 'custom' && (
              <div>
                <label
                  htmlFor="ai-custom-guidance"
                  style={{
                    display: 'block',
                    fontSize: '11px',
                    fontWeight: 600,
                    color: '#475569',
                    marginBottom: '4px',
                  }}
                >
                  Custom Guidance
                </label>
                <input
                  id="ai-custom-guidance"
                  type="text"
                  value={customInstruction}
                  onChange={(e) => setCustomInstruction(e.target.value)}
                  placeholder="e.g. Make it sound like a standard indemnification clause"
                  style={{
                    width: '100%',
                    padding: '6px 8px',
                    fontSize: '12px',
                    border: '1px solid #CBD5E1',
                    borderRadius: '6px',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
            )}
          </>
        )}

        {/* Mode: Grammar Fix */}
        {mode === 'grammar' && (
          <p style={{ fontSize: '12px', color: '#64748B', lineHeight: '1.5', margin: 0 }}>
            Click Generate to scan the selected clause for typos, grammatical inaccuracies, and
            punctuation errors.
          </p>
        )}

        {/* Generate Button */}
        <button
          type="button"
          onClick={handleGenerate}
          disabled={
            isLoading || ((mode === 'refine' || mode === 'grammar') && !selectedText.trim())
          }
          style={{
            width: '100%',
            padding: '9px 12px',
            backgroundColor: isLoading ? '#93C5FD' : '#2563EB',
            color: '#FFFFFF',
            fontSize: '13px',
            fontWeight: 500,
            border: 'none',
            borderRadius: '6px',
            cursor: isLoading ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            transition: 'background-color 150ms ease',
          }}
        >
          {isLoading ? (
            <>
              <RefreshCw size={14} className="animate-spin" />
              <span>Generating...</span>
            </>
          ) : (
            <>
              <Sparkles size={14} />
              <span>Generate Content</span>
            </>
          )}
        </button>

        {/* Result Area */}
        {generatedResult && (
          <div
            style={{
              marginTop: '8px',
              border: '1px solid #CBD5E1',
              borderRadius: '6px',
              backgroundColor: '#F8FAFC',
              padding: '12px',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  color: '#2563EB',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                AI Output
              </span>
              {tokensUsed && (
                <span style={{ fontSize: '10px', color: '#94A3B8' }}>{tokensUsed} tokens</span>
              )}
            </div>

            <div
              style={{
                fontSize: '12px',
                color: '#1E293B',
                lineHeight: 1.6,
                maxHeight: '160px',
                overflowY: 'auto',
                whiteSpace: 'pre-wrap',
                backgroundColor: '#FFFFFF',
                padding: '8px',
                borderRadius: '4px',
                border: '1px solid #E2E8F0',
              }}
            >
              {generatedResult}
            </div>

            <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
              <button
                type="button"
                onClick={handleAccept}
                style={{
                  flex: 1,
                  padding: '6px 8px',
                  backgroundColor: '#2563EB',
                  color: '#FFFFFF',
                  fontSize: '12px',
                  fontWeight: 500,
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '4px',
                }}
              >
                <Check size={14} />
                <span>Accept</span>
              </button>
              <button
                type="button"
                onClick={handleDiscard}
                style={{
                  padding: '6px 12px',
                  backgroundColor: '#FFFFFF',
                  color: '#64748B',
                  fontSize: '12px',
                  border: '1px solid #CBD5E1',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                title="Discard Output"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
