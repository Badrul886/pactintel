'use client';

import React, { useState, useEffect, useCallback, use } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Share2,
  Check,
  CheckCircle2,
  Clock,
  AlertCircle,
  FileText,
  MessageSquare,
  Activity,
  Plus,
  Send,
  Lock,
  Globe,
  ExternalLink,
} from 'lucide-react';
import {
  DealRoomResponseDto,
  DealRoomMessageResponseDto,
  DealRoomActivityDto,
  MutualActionPlanMilestone,
} from '@pactintel/shared-types';

export default function DealRoomDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const roomId = resolvedParams.id;

  const [room, setRoom] = useState<DealRoomResponseDto | null>(null);
  const [activeTab, setActiveTab] = useState<'map' | 'documents' | 'chat' | 'activity'>('map');
  const [chatVisibility, setChatVisibility] = useState<'external' | 'internal'>('external');
  const [messages, setMessages] = useState<DealRoomMessageResponseDto[]>([]);
  const [newMessageBody, setNewMessageBody] = useState<string>('');
  const [activities, setActivities] = useState<DealRoomActivityDto[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState<boolean>(false);

  // Invite Member Modal
  const [isInviteModalOpen, setIsInviteModalOpen] = useState<boolean>(false);
  const [inviteEmail, setInviteEmail] = useState<string>('');
  const [inviteName, setInviteName] = useState<string>('');
  const [inviteRole, setInviteRole] = useState<'viewer' | 'member'>('viewer');
  const [inviteSuccessLink, setInviteSuccessLink] = useState<string | null>(null);

  // Add Document Modal
  const [isDocModalOpen, setIsDocModalOpen] = useState<boolean>(false);
  const [docIdToAdd, setDocIdToAdd] = useState<string>('');

  const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

  const fetchRoomData = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      // 1. Fetch Room Details
      const res = await fetch(`${apiBase}/api/v1/deal-rooms/${roomId}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load deal room');
      const roomData = await res.json();
      setRoom(roomData);

      // 2. Fetch Messages
      const msgRes = await fetch(`${apiBase}/api/v1/deal-rooms/${roomId}/messages`, {
        credentials: 'include',
      });
      if (msgRes.ok) {
        const msgData = await msgRes.json();
        setMessages(msgData || []);
      }

      // 3. Fetch Activity
      const actRes = await fetch(`${apiBase}/api/v1/deal-rooms/${roomId}/activity`, {
        credentials: 'include',
      });
      if (actRes.ok) {
        const actData = await actRes.json();
        setActivities(actData || []);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Error loading deal room');
    } finally {
      setIsLoading(false);
    }
  }, [apiBase, roomId]);

  useEffect(() => {
    fetchRoomData();
  }, [fetchRoomData]);

  // Toggle milestone completion
  const handleToggleMilestone = async (milestoneId: string, currentStatus: string) => {
    if (!room) return;
    const currentMilestones = (room.mutualActionPlan as MutualActionPlanMilestone[]) || [];
    const updated = currentMilestones.map((m) => {
      if (m.id === milestoneId) {
        const isComplete = currentStatus === 'complete';
        return {
          ...m,
          status: (isComplete ? 'pending' : 'complete') as any,
          completedAt: isComplete ? undefined : new Date().toISOString(),
        };
      }
      return m;
    });

    try {
      const res = await fetch(`${apiBase}/api/v1/deal-rooms/${roomId}/map`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ mutualActionPlan: updated }),
      });
      if (res.ok) {
        setRoom({ ...room, mutualActionPlan: updated });
      }
    } catch (err) {
      console.error('Failed to update milestone:', err);
    }
  };

  // Post chat message
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessageBody.trim()) return;

    try {
      const res = await fetch(`${apiBase}/api/v1/deal-rooms/${roomId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          body: newMessageBody.trim(),
          visibility: chatVisibility,
        }),
      });

      if (res.ok) {
        const newMsg = await res.json();
        setMessages((prev) => [...prev, newMsg]);
        setNewMessageBody('');
      }
    } catch (err) {
      console.error('Failed to post message:', err);
    }
  };

  // Invite buyer member
  const handleInviteMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;

    try {
      const res = await fetch(`${apiBase}/api/v1/deal-rooms/${roomId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          externalEmail: inviteEmail.trim(),
          externalName: inviteName.trim() || undefined,
          role: inviteRole,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.magicLink?.url) {
          setInviteSuccessLink(data.magicLink.url);
        } else {
          setIsInviteModalOpen(false);
          setInviteEmail('');
          setInviteName('');
        }
        fetchRoomData();
      }
    } catch (err) {
      console.error('Failed to invite member:', err);
    }
  };

  // Link document
  const handleAddDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!docIdToAdd.trim()) return;

    try {
      const res = await fetch(`${apiBase}/api/v1/deal-rooms/${roomId}/documents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ documentId: docIdToAdd.trim() }),
      });

      if (res.ok) {
        setIsDocModalOpen(false);
        setDocIdToAdd('');
        fetchRoomData();
      }
    } catch (err) {
      console.error('Failed to link document:', err);
    }
  };

  const copyPublicLink = () => {
    if (!room) return;
    const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
    navigator.clipboard.writeText(`${origin}/r/${room.slug}`);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  if (isLoading) {
    return (
      <div
        style={{
          padding: '60px 20px',
          textAlign: 'center',
          color: 'var(--color-gray-500, #71717a)',
        }}
      >
        Loading Deal Room workspace...
      </div>
    );
  }

  if (errorMessage || !room) {
    return (
      <div style={{ padding: '40px', maxWidth: '800px', margin: '0 auto', textAlign: 'center' }}>
        <AlertCircle size={40} style={{ color: '#dc2626', margin: '0 auto 12px auto' }} />
        <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--color-gray-950, #09090b)' }}>
          {errorMessage || 'Deal room not found'}
        </h2>
        <Link
          href="/deal-rooms"
          style={{
            color: '#2563EB',
            textDecoration: 'none',
            fontSize: '14px',
            marginTop: '16px',
            display: 'inline-block',
          }}
        >
          &larr; Back to Deal Rooms
        </Link>
      </div>
    );
  }

  const milestones = (room.mutualActionPlan as MutualActionPlanMilestone[]) || [];
  const completedCount = milestones.filter((m) => m.status === 'complete').length;
  const progressPercent =
    milestones.length > 0 ? Math.round((completedCount / milestones.length) * 100) : 0;

  return (
    <div
      style={{
        padding: '24px 32px',
        maxWidth: '1400px',
        margin: '0 auto',
        fontFamily: 'var(--font-sans, Inter, sans-serif)',
      }}
    >
      {/* Top Navigation */}
      <div style={{ marginBottom: '16px' }}>
        <Link
          href="/deal-rooms"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            color: 'var(--color-gray-500, #71717a)',
            fontSize: '13px',
            textDecoration: 'none',
          }}
        >
          <ArrowLeft size={14} /> Back to Deal Rooms
        </Link>
      </div>

      {/* Header Banner */}
      <div
        style={{
          backgroundColor: 'var(--surface-card, #FFFFFF)',
          border: '1px solid var(--border-color, #E4E4E7)',
          borderRadius: '8px',
          padding: '20px 24px',
          marginBottom: '24px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '16px',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
            <h1
              style={{
                fontSize: '20px',
                fontWeight: 600,
                color: 'var(--color-gray-950, #09090b)',
                margin: 0,
              }}
            >
              {room.title}
            </h1>
            <span
              style={{
                padding: '2px 8px',
                borderRadius: '12px',
                fontSize: '12px',
                fontWeight: 500,
                backgroundColor: room.status === 'active' ? '#dcfce7' : '#f4f4f5',
                color: room.status === 'active' ? '#15803d' : '#71717a',
              }}
            >
              {room.status.toUpperCase()}
            </span>
          </div>
          <div style={{ fontSize: '13px', color: 'var(--color-gray-500, #71717a)' }}>
            Recipient Link:{' '}
            <code style={{ backgroundColor: '#f4f4f5', padding: '2px 6px', borderRadius: '4px' }}>
              /r/{room.slug}
            </code>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {/* Progress bar */}
          <div style={{ textAlign: 'right', minWidth: '140px' }}>
            <div
              style={{
                fontSize: '12px',
                fontWeight: 500,
                color: 'var(--color-gray-600, #52525b)',
                marginBottom: '4px',
              }}
            >
              Plan: {completedCount}/{milestones.length} ({progressPercent}%)
            </div>
            <div
              style={{
                width: '100%',
                height: '6px',
                backgroundColor: '#e4e4e7',
                borderRadius: '3px',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${progressPercent}%`,
                  height: '100%',
                  backgroundColor: progressPercent === 100 ? '#16a34a' : '#2563EB',
                }}
              />
            </div>
          </div>

          <button
            onClick={copyPublicLink}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 14px',
              borderRadius: '6px',
              border: '1px solid var(--border-color, #E4E4E7)',
              backgroundColor: copiedLink ? '#f0fdf4' : '#FFFFFF',
              color: copiedLink ? '#16a34a' : 'var(--color-gray-700, #3f3f46)',
              fontSize: '13px',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            {copiedLink ? <Check size={14} /> : <Share2 size={14} />}
            {copiedLink ? 'Copied Link' : 'Copy Recipient URL'}
          </button>
        </div>
      </div>

      {/* Workspace Tabs */}
      <div
        style={{
          display: 'flex',
          borderBottom: '1px solid var(--border-color, #E4E4E7)',
          marginBottom: '20px',
          gap: '24px',
        }}
      >
        <button
          onClick={() => setActiveTab('map')}
          style={{
            padding: '10px 4px',
            border: 'none',
            borderBottom: activeTab === 'map' ? '2px solid #2563EB' : '2px solid transparent',
            backgroundColor: 'transparent',
            color: activeTab === 'map' ? '#2563EB' : 'var(--color-gray-600, #52525b)',
            fontWeight: activeTab === 'map' ? 600 : 500,
            fontSize: '14px',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <CheckCircle2 size={16} />
          Mutual Action Plan ({milestones.length})
        </button>

        <button
          onClick={() => setActiveTab('documents')}
          style={{
            padding: '10px 4px',
            border: 'none',
            borderBottom: activeTab === 'documents' ? '2px solid #2563EB' : '2px solid transparent',
            backgroundColor: 'transparent',
            color: activeTab === 'documents' ? '#2563EB' : 'var(--color-gray-600, #52525b)',
            fontWeight: activeTab === 'documents' ? 600 : 500,
            fontSize: '14px',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <FileText size={16} />
          Shared Documents ({room.documents?.length || 0})
        </button>

        <button
          onClick={() => setActiveTab('chat')}
          style={{
            padding: '10px 4px',
            border: 'none',
            borderBottom: activeTab === 'chat' ? '2px solid #2563EB' : '2px solid transparent',
            backgroundColor: 'transparent',
            color: activeTab === 'chat' ? '#2563EB' : 'var(--color-gray-600, #52525b)',
            fontWeight: activeTab === 'chat' ? 600 : 500,
            fontSize: '14px',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <MessageSquare size={16} />
          Collaboration Chat ({messages.length})
        </button>

        <button
          onClick={() => setActiveTab('activity')}
          style={{
            padding: '10px 4px',
            border: 'none',
            borderBottom: activeTab === 'activity' ? '2px solid #2563EB' : '2px solid transparent',
            backgroundColor: 'transparent',
            color: activeTab === 'activity' ? '#2563EB' : 'var(--color-gray-600, #52525b)',
            fontWeight: activeTab === 'activity' ? 600 : 500,
            fontSize: '14px',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <Activity size={16} />
          Activity Log
        </button>
      </div>

      {/* Main Workspace Layout (Content + Sidebar) */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '24px' }}>
        {/* Left Column: Tab Views */}
        <div>
          {/* TAB 1: MUTUAL ACTION PLAN */}
          {activeTab === 'map' && (
            <div
              style={{
                backgroundColor: '#FFFFFF',
                border: '1px solid var(--border-color, #E4E4E7)',
                borderRadius: '8px',
                padding: '20px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '16px',
                }}
              >
                <h3
                  style={{
                    fontSize: '15px',
                    fontWeight: 600,
                    color: 'var(--color-gray-950, #09090b)',
                    margin: 0,
                  }}
                >
                  Deal Milestones & Deliverables
                </h3>
                <span style={{ fontSize: '13px', color: 'var(--color-gray-500, #71717a)' }}>
                  Click checkmark to toggle status
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {milestones.map((ms, index) => {
                  const isDone = ms.status === 'complete';
                  return (
                    <div
                      key={ms.id}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '12px',
                        padding: '14px 16px',
                        backgroundColor: isDone ? '#f9fafb' : '#FFFFFF',
                        border: '1px solid var(--border-color, #E4E4E7)',
                        borderRadius: '6px',
                      }}
                    >
                      <button
                        onClick={() => handleToggleMilestone(ms.id, ms.status)}
                        style={{
                          width: '22px',
                          height: '22px',
                          borderRadius: '4px',
                          border: isDone ? 'none' : '2px solid #d4d4d8',
                          backgroundColor: isDone ? '#16a34a' : 'transparent',
                          color: '#FFFFFF',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                          marginTop: '2px',
                          flexShrink: 0,
                        }}
                      >
                        {isDone && <Check size={14} />}
                      </button>

                      <div style={{ flex: 1 }}>
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            marginBottom: '4px',
                          }}
                        >
                          <span
                            style={{
                              fontSize: '14px',
                              fontWeight: 600,
                              color: isDone
                                ? 'var(--color-gray-500, #71717a)'
                                : 'var(--color-gray-950, #09090b)',
                              textDecoration: isDone ? 'line-through' : 'none',
                            }}
                          >
                            {index + 1}. {ms.title}
                          </span>
                          <span
                            style={{
                              fontSize: '11px',
                              fontWeight: 500,
                              padding: '2px 6px',
                              borderRadius: '4px',
                              backgroundColor: ms.owner === 'internal' ? '#eff6ff' : '#fef3c7',
                              color: ms.owner === 'internal' ? '#1d4ed8' : '#b45309',
                            }}
                          >
                            {ms.owner === 'internal' ? 'Seller Team' : 'Buyer Team'}
                          </span>
                        </div>
                        {ms.description && (
                          <p
                            style={{
                              fontSize: '13px',
                              color: 'var(--color-gray-600, #52525b)',
                              margin: '0 0 6px 0',
                            }}
                          >
                            {ms.description}
                          </p>
                        )}
                        {ms.dueDate && (
                          <div
                            style={{
                              fontSize: '12px',
                              color: 'var(--color-gray-400, #a1a1aa)',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                            }}
                          >
                            <Clock size={12} /> Due: {new Date(ms.dueDate).toLocaleDateString()}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 2: DOCUMENTS */}
          {activeTab === 'documents' && (
            <div
              style={{
                backgroundColor: '#FFFFFF',
                border: '1px solid var(--border-color, #E4E4E7)',
                borderRadius: '8px',
                padding: '20px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '16px',
                }}
              >
                <h3
                  style={{
                    fontSize: '15px',
                    fontWeight: 600,
                    color: 'var(--color-gray-950, #09090b)',
                    margin: 0,
                  }}
                >
                  Documents Shared in Deal Room
                </h3>
                <button
                  onClick={() => setIsDocModalOpen(true)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '6px 12px',
                    borderRadius: '6px',
                    backgroundColor: '#2563EB',
                    color: '#FFFFFF',
                    border: 'none',
                    fontSize: '13px',
                    fontWeight: 500,
                    cursor: 'pointer',
                  }}
                >
                  <Plus size={14} /> Link Document
                </button>
              </div>

              {!room.documents || room.documents.length === 0 ? (
                <div
                  style={{
                    padding: '40px 20px',
                    textAlign: 'center',
                    color: 'var(--color-gray-500, #71717a)',
                  }}
                >
                  No documents linked yet. Click &quot;Link Document&quot; to share proposals,
                  contracts, or agreements.
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr
                      style={{
                        borderBottom: '1px solid var(--border-color, #E4E4E7)',
                        textAlign: 'left',
                        color: 'var(--color-gray-500, #71717a)',
                      }}
                    >
                      <th style={{ padding: '10px 12px' }}>Document</th>
                      <th style={{ padding: '10px 12px' }}>Status</th>
                      <th style={{ padding: '10px 12px' }}>Added Date</th>
                      <th style={{ padding: '10px 12px', textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {room.documents.map((doc) => (
                      <tr
                        key={doc.id}
                        style={{ borderBottom: '1px solid var(--border-color, #E4E4E7)' }}
                      >
                        <td style={{ padding: '12px' }}>
                          <span
                            style={{ fontWeight: 600, color: 'var(--color-gray-900, #18181b)' }}
                          >
                            {doc.documentTitle || 'Contract Document'}
                          </span>
                        </td>
                        <td style={{ padding: '12px' }}>
                          <span
                            style={{
                              padding: '2px 8px',
                              borderRadius: '10px',
                              fontSize: '11px',
                              backgroundColor: '#e0e7ff',
                              color: '#4338ca',
                            }}
                          >
                            {doc.documentStatus || 'draft'}
                          </span>
                        </td>
                        <td style={{ padding: '12px', color: 'var(--color-gray-500, #71717a)' }}>
                          {new Date(doc.createdAt).toLocaleDateString()}
                        </td>
                        <td style={{ padding: '12px', textAlign: 'right' }}>
                          <Link
                            href={`/documents/${doc.documentId}`}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              color: '#2563EB',
                              textDecoration: 'none',
                              fontWeight: 500,
                            }}
                          >
                            Open <ExternalLink size={12} />
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* TAB 3: COLLABORATION CHAT */}
          {activeTab === 'chat' && (
            <div
              style={{
                backgroundColor: '#FFFFFF',
                border: '1px solid var(--border-color, #E4E4E7)',
                borderRadius: '8px',
                display: 'flex',
                flexDirection: 'column',
                height: '600px',
              }}
            >
              {/* Chat Sub-Navigation: External vs Internal */}
              <div
                style={{
                  display: 'flex',
                  borderBottom: '1px solid var(--border-color, #E4E4E7)',
                  padding: '8px 16px',
                  gap: '12px',
                  backgroundColor: '#fafafa',
                }}
              >
                <button
                  onClick={() => setChatVisibility('external')}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '6px 12px',
                    borderRadius: '6px',
                    border: '1px solid',
                    borderColor: chatVisibility === 'external' ? '#2563EB' : 'transparent',
                    backgroundColor: chatVisibility === 'external' ? '#eff6ff' : 'transparent',
                    color: chatVisibility === 'external' ? '#2563EB' : '#71717a',
                    fontSize: '13px',
                    fontWeight: 500,
                    cursor: 'pointer',
                  }}
                >
                  <Globe size={14} /> Buyer-Seller Chat (External)
                </button>

                <button
                  onClick={() => setChatVisibility('internal')}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '6px 12px',
                    borderRadius: '6px',
                    border: '1px solid',
                    borderColor: chatVisibility === 'internal' ? '#b45309' : 'transparent',
                    backgroundColor: chatVisibility === 'internal' ? '#fef3c7' : 'transparent',
                    color: chatVisibility === 'internal' ? '#b45309' : '#71717a',
                    fontSize: '13px',
                    fontWeight: 500,
                    cursor: 'pointer',
                  }}
                >
                  <Lock size={14} /> Internal Seller Notes (Private)
                </button>
              </div>

              {/* Messages Scroll Area */}
              <div
                style={{
                  flex: 1,
                  padding: '20px',
                  overflowY: 'auto',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                }}
              >
                {messages
                  .filter((m) => chatVisibility === 'internal' || m.visibility === 'external')
                  .map((msg) => {
                    const isInternal = msg.visibility === 'internal';
                    return (
                      <div
                        key={msg.id}
                        style={{
                          padding: '12px 16px',
                          borderRadius: '8px',
                          backgroundColor: isInternal ? '#fffbeb' : '#f4f4f5',
                          border: isInternal ? '1px solid #fde68a' : '1px solid #e4e4e7',
                          maxWidth: '85%',
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            marginBottom: '4px',
                          }}
                        >
                          <span
                            style={{
                              fontSize: '13px',
                              fontWeight: 600,
                              color: 'var(--color-gray-900, #18181b)',
                            }}
                          >
                            {msg.authorName || 'Collaborator'}
                          </span>
                          <span
                            style={{ fontSize: '11px', color: 'var(--color-gray-400, #a1a1aa)' }}
                          >
                            {new Date(msg.createdAt).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>
                        <p
                          style={{
                            fontSize: '13px',
                            color: 'var(--color-gray-800, #27272a)',
                            margin: 0,
                          }}
                        >
                          {msg.body}
                        </p>
                      </div>
                    );
                  })}
              </div>

              {/* Chat Input Bar */}
              <form
                onSubmit={handleSendMessage}
                style={{
                  padding: '16px',
                  borderTop: '1px solid var(--border-color, #E4E4E7)',
                  display: 'flex',
                  gap: '10px',
                }}
              >
                <input
                  type="text"
                  placeholder={
                    chatVisibility === 'internal'
                      ? 'Write internal note for seller team...'
                      : 'Write message to buyer...'
                  }
                  value={newMessageBody}
                  onChange={(e) => setNewMessageBody(e.target.value)}
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    border: '1px solid var(--border-color, #E4E4E7)',
                    borderRadius: '6px',
                    fontSize: '13px',
                  }}
                />
                <button
                  type="submit"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '8px 16px',
                    borderRadius: '6px',
                    backgroundColor: chatVisibility === 'internal' ? '#b45309' : '#2563EB',
                    color: '#FFFFFF',
                    border: 'none',
                    fontSize: '13px',
                    fontWeight: 500,
                    cursor: 'pointer',
                  }}
                >
                  <Send size={14} /> Send
                </button>
              </form>
            </div>
          )}

          {/* TAB 4: ACTIVITY LOG */}
          {activeTab === 'activity' && (
            <div
              style={{
                backgroundColor: '#FFFFFF',
                border: '1px solid var(--border-color, #E4E4E7)',
                borderRadius: '8px',
                padding: '20px',
              }}
            >
              <h3
                style={{
                  fontSize: '15px',
                  fontWeight: 600,
                  color: 'var(--color-gray-950, #09090b)',
                  marginBottom: '16px',
                }}
              >
                Audit & Activity Timeline
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {activities.map((act) => (
                  <div
                    key={act.id}
                    style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}
                  >
                    <div
                      style={{
                        width: '8px',
                        height: '8px',
                        borderRadius: '4px',
                        backgroundColor: '#2563EB',
                        marginTop: '6px',
                      }}
                    />
                    <div style={{ flex: 1 }}>
                      <div
                        style={{
                          fontSize: '13px',
                          fontWeight: 600,
                          color: 'var(--color-gray-900, #18181b)',
                        }}
                      >
                        {act.title}
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--color-gray-500, #71717a)' }}>
                        By {act.actor} &bull; {new Date(act.timestamp).toLocaleString()}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Members & Quick Info */}
        <div>
          <div
            style={{
              backgroundColor: '#FFFFFF',
              border: '1px solid var(--border-color, #E4E4E7)',
              borderRadius: '8px',
              padding: '20px',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '16px',
              }}
            >
              <h3
                style={{
                  fontSize: '14px',
                  fontWeight: 600,
                  color: 'var(--color-gray-950, #09090b)',
                  margin: 0,
                }}
              >
                Deal Room Members
              </h3>
              <button
                onClick={() => {
                  setInviteSuccessLink(null);
                  setIsInviteModalOpen(true);
                }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '4px 8px',
                  borderRadius: '4px',
                  border: '1px solid var(--border-color, #E4E4E7)',
                  backgroundColor: '#FFFFFF',
                  color: '#2563EB',
                  fontSize: '12px',
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                <Plus size={13} /> Invite
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {room.members?.map((m) => (
                <div
                  key={m.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    fontSize: '13px',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 500, color: 'var(--color-gray-900, #18181b)' }}>
                      {m.externalName || m.externalEmail || 'Member'}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--color-gray-400, #a1a1aa)' }}>
                      {m.externalEmail || 'Internal Member'}
                    </div>
                  </div>
                  <span
                    style={{
                      fontSize: '11px',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      backgroundColor: '#f4f4f5',
                      color: '#71717a',
                    }}
                  >
                    {m.role}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Invite Member Modal */}
      {isInviteModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
        >
          <div
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '8px',
              padding: '24px',
              width: '100%',
              maxWidth: '440px',
            }}
          >
            <h3 style={{ fontSize: '16px', fontWeight: 600, margin: '0 0 16px 0' }}>
              Invite Buyer to Deal Room
            </h3>

            {inviteSuccessLink ? (
              <div>
                <p style={{ fontSize: '13px', color: '#16a34a', marginBottom: '12px' }}>
                  Invitation created! Share this unique single-room magic link with the buyer:
                </p>
                <input
                  type="text"
                  readOnly
                  value={inviteSuccessLink}
                  style={{
                    width: '100%',
                    padding: '8px',
                    fontSize: '12px',
                    backgroundColor: '#f4f4f5',
                    border: '1px solid #e4e4e7',
                    borderRadius: '4px',
                    marginBottom: '16px',
                  }}
                />
                <button
                  onClick={() => setIsInviteModalOpen(false)}
                  style={{
                    width: '100%',
                    padding: '8px',
                    backgroundColor: '#2563EB',
                    color: '#FFFFFF',
                    borderRadius: '6px',
                    border: 'none',
                    cursor: 'pointer',
                  }}
                >
                  Done
                </button>
              </div>
            ) : (
              <form onSubmit={handleInviteMember}>
                <div style={{ marginBottom: '14px' }}>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '12px',
                      fontWeight: 500,
                      marginBottom: '4px',
                    }}
                  >
                    Buyer Email *
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="buyer@client.com"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px',
                      border: '1px solid #e4e4e7',
                      borderRadius: '6px',
                      fontSize: '13px',
                    }}
                  />
                </div>
                <div style={{ marginBottom: '14px' }}>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '12px',
                      fontWeight: 500,
                      marginBottom: '4px',
                    }}
                  >
                    Buyer Name
                  </label>
                  <input
                    type="text"
                    placeholder="Jane Doe"
                    value={inviteName}
                    onChange={(e) => setInviteName(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px',
                      border: '1px solid #e4e4e7',
                      borderRadius: '6px',
                      fontSize: '13px',
                    }}
                  />
                </div>
                <div style={{ marginBottom: '14px' }}>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '12px',
                      fontWeight: 500,
                      marginBottom: '4px',
                    }}
                  >
                    Role
                  </label>
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value as any)}
                    style={{
                      width: '100%',
                      padding: '8px',
                      border: '1px solid #e4e4e7',
                      borderRadius: '6px',
                      fontSize: '13px',
                      backgroundColor: '#fff',
                    }}
                  >
                    <option value="viewer">Viewer (Read-only)</option>
                    <option value="member">Collaborator (Can Chat &amp; Mark Tasks)</option>
                  </select>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => setIsInviteModalOpen(false)}
                    style={{
                      padding: '8px 14px',
                      borderRadius: '6px',
                      border: '1px solid #e4e4e7',
                      backgroundColor: '#fff',
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    style={{
                      padding: '8px 14px',
                      borderRadius: '6px',
                      border: 'none',
                      backgroundColor: '#2563EB',
                      color: '#fff',
                    }}
                  >
                    Generate Magic Link
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Link Document Modal */}
      {isDocModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
        >
          <div
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '8px',
              padding: '24px',
              width: '100%',
              maxWidth: '440px',
            }}
          >
            <h3 style={{ fontSize: '16px', fontWeight: 600, margin: '0 0 16px 0' }}>
              Link Document to Deal Room
            </h3>
            <form onSubmit={handleAddDocument}>
              <div style={{ marginBottom: '16px' }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: '12px',
                    fontWeight: 500,
                    marginBottom: '4px',
                  }}
                >
                  Document UUID *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 0192a000-0000-7000-8000-000000000001"
                  value={docIdToAdd}
                  onChange={(e) => setDocIdToAdd(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px',
                    border: '1px solid #e4e4e7',
                    borderRadius: '6px',
                    fontSize: '13px',
                  }}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => setIsDocModalOpen(false)}
                  style={{
                    padding: '8px 14px',
                    borderRadius: '6px',
                    border: '1px solid #e4e4e7',
                    backgroundColor: '#fff',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{
                    padding: '8px 14px',
                    borderRadius: '6px',
                    border: 'none',
                    backgroundColor: '#2563EB',
                    color: '#fff',
                  }}
                >
                  Link Document
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
