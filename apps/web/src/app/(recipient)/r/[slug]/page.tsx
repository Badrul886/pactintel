'use client';

import React, { useState, useEffect, useCallback, use } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  CheckCircle2,
  Clock,
  FileText,
  MessageSquare,
  Send,
  AlertCircle,
  ExternalLink,
  ShieldCheck,
  Check,
} from 'lucide-react';
import {
  DealRoomResponseDto,
  DealRoomMessageResponseDto,
  MutualActionPlanMilestone,
} from '@pactintel/shared-types';

export default function RecipientDealRoomPage({ params }: { params: Promise<{ slug: string }> }) {
  const resolvedParams = use(params);
  const slug = resolvedParams.slug;
  const searchParams = useSearchParams();
  const rawToken = searchParams.get('token') || '';

  const [room, setRoom] = useState<DealRoomResponseDto | null>(null);
  const [messages, setMessages] = useState<DealRoomMessageResponseDto[]>([]);
  const [newMessage, setNewMessage] = useState<string>('');
  const [guestSession, setGuestSession] = useState<any>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSending, setIsSending] = useState<boolean>(false);

  const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

  const loadRecipientRoom = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      if (rawToken) {
        // Authenticate via cryptographic magic link
        const res = await fetch(`${apiBase}/api/v1/deal-rooms/access/${rawToken}`);
        if (!res.ok) {
          throw new Error('This magic link has expired or is invalid.');
        }
        const data = await res.json();
        setGuestSession(data.session);
        setRoom(data.room);
        setMessages(data.messages || []);
      } else {
        // Public slug view
        const res = await fetch(`${apiBase}/api/v1/deal-rooms/public/${slug}`);
        if (!res.ok) {
          throw new Error('Deal room not found.');
        }
        const data = await res.json();
        setRoom(data.room);
        setMessages(data.messages || []);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Unable to access deal room.');
    } finally {
      setIsLoading(false);
    }
  }, [apiBase, rawToken, slug]);

  useEffect(() => {
    loadRecipientRoom();
  }, [loadRecipientRoom]);

  // Handle recipient message send
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !rawToken) return;

    setIsSending(true);
    try {
      const res = await fetch(
        `${apiBase}/api/v1/deal-rooms/public/${slug}/messages?token=${rawToken}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-magic-link-token': rawToken,
          },
          body: JSON.stringify({
            body: newMessage.trim(),
            visibility: 'external',
            authorName: guestSession?.name || 'Buyer',
          }),
        },
      );

      if (res.ok) {
        const postedMsg = await res.json();
        setMessages((prev) => [...prev, postedMsg]);
        setNewMessage('');
      }
    } catch (err) {
      console.error('Failed to post message:', err);
    } finally {
      setIsSending(false);
    }
  };

  if (isLoading) {
    return (
      <div
        style={{
          textAlign: 'center',
          padding: '60px 20px',
          color: 'var(--color-gray-500, #71717a)',
        }}
      >
        Loading Deal Room workspace...
      </div>
    );
  }

  if (errorMessage || !room) {
    return (
      <div
        style={{
          backgroundColor: '#FFFFFF',
          border: '1px solid var(--border-color, #E4E4E7)',
          borderRadius: '8px',
          padding: '40px',
          textAlign: 'center',
        }}
      >
        <AlertCircle size={40} style={{ color: '#dc2626', margin: '0 auto 16px auto' }} />
        <h2
          style={{
            fontSize: '18px',
            fontWeight: 600,
            color: 'var(--color-gray-950, #09090b)',
            marginBottom: '8px',
          }}
        >
          Access Notice
        </h2>
        <p style={{ fontSize: '14px', color: 'var(--color-gray-600, #52525b)', margin: 0 }}>
          {errorMessage || 'This deal room is currently unavailable.'}
        </p>
      </div>
    );
  }

  const milestones = (room.mutualActionPlan as MutualActionPlanMilestone[]) || [];
  const completedCount = milestones.filter((m) => m.status === 'complete').length;
  const progressPercent =
    milestones.length > 0 ? Math.round((completedCount / milestones.length) * 100) : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Branded Recipient Hero */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          border: '1px solid var(--border-color, #E4E4E7)',
          borderRadius: '8px',
          padding: '28px',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '12px',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              color: '#16a34a',
              fontSize: '12px',
              fontWeight: 500,
            }}
          >
            <ShieldCheck size={16} /> Verified Secure Deal Room
          </div>
          {guestSession && (
            <span style={{ fontSize: '12px', color: 'var(--color-gray-500, #71717a)' }}>
              Logged in as{' '}
              <strong style={{ color: 'var(--color-gray-800, #27272a)' }}>
                {guestSession.email}
              </strong>
            </span>
          )}
        </div>

        <h1
          style={{
            fontSize: '22px',
            fontWeight: 600,
            color: 'var(--color-gray-950, #09090b)',
            margin: '0 0 8px 0',
          }}
        >
          {room.title}
        </h1>
        <p
          style={{
            fontSize: '14px',
            color: 'var(--color-gray-600, #52525b)',
            margin: '0 0 20px 0',
          }}
        >
          Welcome to your joint evaluation workspace. Review agreed milestones, shared contract
          documents, and collaborate directly with the account team.
        </p>

        {/* Mutual Progress */}
        <div
          style={{
            backgroundColor: '#fafafa',
            border: '1px solid #f4f4f5',
            borderRadius: '6px',
            padding: '16px',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: '13px',
              fontWeight: 500,
              marginBottom: '8px',
            }}
          >
            <span style={{ color: 'var(--color-gray-700, #3f3f46)' }}>
              Mutual Action Plan Progress
            </span>
            <span style={{ color: '#2563EB', fontWeight: 600 }}>{progressPercent}% Complete</span>
          </div>
          <div
            style={{
              width: '100%',
              height: '8px',
              backgroundColor: '#e4e4e7',
              borderRadius: '4px',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${progressPercent}%`,
                height: '100%',
                backgroundColor: progressPercent === 100 ? '#16a34a' : '#2563EB',
                transition: 'width 0.3s ease',
              }}
            />
          </div>
        </div>
      </div>

      {/* Shared Documents Section */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          border: '1px solid var(--border-color, #E4E4E7)',
          borderRadius: '8px',
          padding: '24px',
        }}
      >
        <h2
          style={{
            fontSize: '16px',
            fontWeight: 600,
            color: 'var(--color-gray-950, #09090b)',
            margin: '0 0 16px 0',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <FileText size={18} style={{ color: '#2563EB' }} />
          Shared Documents & Agreements
        </h2>

        {!room.documents || room.documents.length === 0 ? (
          <p style={{ fontSize: '13px', color: 'var(--color-gray-500, #71717a)', margin: 0 }}>
            No documents shared yet.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {room.documents.map((doc) => (
              <div
                key={doc.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 16px',
                  backgroundColor: '#fafafa',
                  border: '1px solid var(--border-color, #E4E4E7)',
                  borderRadius: '6px',
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: '14px',
                      fontWeight: 600,
                      color: 'var(--color-gray-900, #18181b)',
                    }}
                  >
                    {doc.documentTitle || 'Legal Agreement'}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--color-gray-500, #71717a)' }}>
                    Status:{' '}
                    <span style={{ textTransform: 'capitalize' }}>
                      {doc.documentStatus || 'Active'}
                    </span>
                  </div>
                </div>

                <Link
                  href={`/documents/${doc.documentId}`}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '6px 12px',
                    borderRadius: '6px',
                    backgroundColor: '#2563EB',
                    color: '#FFFFFF',
                    fontSize: '13px',
                    fontWeight: 500,
                    textDecoration: 'none',
                  }}
                >
                  Review & Sign <ExternalLink size={13} />
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Mutual Action Plan Timeline */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          border: '1px solid var(--border-color, #E4E4E7)',
          borderRadius: '8px',
          padding: '24px',
        }}
      >
        <h2
          style={{
            fontSize: '16px',
            fontWeight: 600,
            color: 'var(--color-gray-950, #09090b)',
            margin: '0 0 16px 0',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <CheckCircle2 size={18} style={{ color: '#2563EB' }} />
          Evaluation Roadmap
        </h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
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
                <div
                  style={{
                    width: '20px',
                    height: '20px',
                    borderRadius: '4px',
                    backgroundColor: isDone ? '#16a34a' : '#f4f4f5',
                    color: '#FFFFFF',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginTop: '2px',
                    flexShrink: 0,
                  }}
                >
                  {isDone && <Check size={13} />}
                </div>

                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      marginBottom: '2px',
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
                      {ms.owner === 'internal' ? 'Seller Task' : 'Buyer Task'}
                    </span>
                  </div>
                  {ms.description && (
                    <p
                      style={{
                        fontSize: '13px',
                        color: 'var(--color-gray-600, #52525b)',
                        margin: '0 0 4px 0',
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
                      <Clock size={12} /> Target: {new Date(ms.dueDate).toLocaleDateString()}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Collaboration Chat (External Only) */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          border: '1px solid var(--border-color, #E4E4E7)',
          borderRadius: '8px',
          padding: '24px',
        }}
      >
        <h2
          style={{
            fontSize: '16px',
            fontWeight: 600,
            color: 'var(--color-gray-950, #09090b)',
            margin: '0 0 16px 0',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <MessageSquare size={18} style={{ color: '#2563EB' }} />
          Team Discussion
        </h2>

        <div
          style={{
            minHeight: '160px',
            maxHeight: '360px',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            marginBottom: '16px',
          }}
        >
          {messages.length === 0 ? (
            <p
              style={{
                fontSize: '13px',
                color: 'var(--color-gray-400, #a1a1aa)',
                textAlign: 'center',
                padding: '30px 0',
              }}
            >
              No messages yet. Send a message to chat directly with the seller team.
            </p>
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id}
                style={{
                  padding: '10px 14px',
                  backgroundColor: '#f4f4f5',
                  borderRadius: '6px',
                  maxWidth: '85%',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: '12px',
                    fontWeight: 600,
                    color: 'var(--color-gray-900, #18181b)',
                    marginBottom: '2px',
                  }}
                >
                  <span>{msg.authorName || 'Seller Team'}</span>
                  <span
                    style={{
                      fontSize: '11px',
                      color: 'var(--color-gray-400, #a1a1aa)',
                      fontWeight: 400,
                    }}
                  >
                    {new Date(msg.createdAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
                <div style={{ fontSize: '13px', color: 'var(--color-gray-800, #27272a)' }}>
                  {msg.body}
                </div>
              </div>
            ))
          )}
        </div>

        {rawToken ? (
          <form onSubmit={handleSendMessage} style={{ display: 'flex', gap: '8px' }}>
            <input
              type="text"
              placeholder="Ask a question or leave a comment..."
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
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
              disabled={isSending}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 16px',
                backgroundColor: '#2563EB',
                color: '#FFFFFF',
                borderRadius: '6px',
                border: 'none',
                fontSize: '13px',
                fontWeight: 500,
                cursor: isSending ? 'not-allowed' : 'pointer',
              }}
            >
              <Send size={14} /> Send
            </button>
          </form>
        ) : (
          <div
            style={{
              padding: '10px 14px',
              backgroundColor: '#f4f4f5',
              borderRadius: '6px',
              fontSize: '12px',
              color: 'var(--color-gray-500, #71717a)',
              textAlign: 'center',
            }}
          >
            You are viewing this room in read-only public mode. To participate in chat, please use
            your personalized magic link.
          </div>
        )}
      </div>
    </div>
  );
}
