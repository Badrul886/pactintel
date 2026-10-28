'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  FolderKanban,
  Plus,
  Search,
  ExternalLink,
  Users,
  FileText,
  Share2,
  Check,
  AlertCircle,
} from 'lucide-react';
import { DealRoomResponseDto } from '@pactintel/shared-types';

export default function DealRoomsDashboardPage() {
  const [dealRooms, setDealRooms] = useState<DealRoomResponseDto[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);

  // New Deal Room Modal State
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [newTitle, setNewTitle] = useState<string>('');
  const [newSlug, setNewSlug] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

  const fetchDealRooms = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      let url = `${apiBase}/api/v1/deal-rooms`;
      const queryParams: string[] = [];
      if (statusFilter !== 'all') queryParams.push(`status=${statusFilter}`);
      if (searchQuery) queryParams.push(`search=${encodeURIComponent(searchQuery)}`);
      if (queryParams.length > 0) url += `?${queryParams.join('&')}`;

      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) {
        throw new Error(`Failed to load deal rooms: HTTP ${res.status}`);
      }
      const data = await res.json();
      setDealRooms(data.items || []);
    } catch (err: any) {
      setErrorMessage(err.message || 'Could not load deal rooms.');
    } finally {
      setIsLoading(false);
    }
  }, [apiBase, statusFilter, searchQuery]);

  useEffect(() => {
    fetchDealRooms();
  }, [fetchDealRooms]);

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      const res = await fetch(`${apiBase}/api/v1/deal-rooms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          workspaceId: '00000000-0000-7000-8000-000000000001', // Default workspace
          title: newTitle.trim(),
          slug: newSlug.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to create deal room');
      }

      setIsModalOpen(false);
      setNewTitle('');
      setNewSlug('');
      fetchDealRooms();
    } catch (err: any) {
      setErrorMessage(err.message || 'Error creating deal room');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopyLink = (slug: string) => {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
    const publicUrl = `${origin}/r/${slug}`;
    navigator.clipboard.writeText(publicUrl);
    setCopiedSlug(slug);
    setTimeout(() => setCopiedSlug(null), 2500);
  };

  // Metrics calculation
  const totalCount = dealRooms.length;
  const activeCount = dealRooms.filter((r) => r.status === 'active').length;
  const closedCount = dealRooms.filter((r) => r.status === 'closed').length;

  return (
    <div
      style={{
        padding: '32px',
        maxWidth: '1400px',
        margin: '0 auto',
        fontFamily: 'var(--font-sans, Inter, sans-serif)',
      }}
    >
      {/* Page Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: '28px',
        }}
      >
        <div>
          <h1
            style={{
              fontSize: '24px',
              fontWeight: 600,
              color: 'var(--color-gray-950, #09090b)',
              margin: '0 0 6px 0',
            }}
          >
            Deal Rooms
          </h1>
          <p style={{ fontSize: '14px', color: 'var(--color-gray-500, #71717a)', margin: 0 }}>
            Collaborative buyer-seller workspaces with mutual action plans, shared documents, and
            live deal chat.
          </p>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            backgroundColor: '#2563EB',
            color: '#FFFFFF',
            padding: '9px 16px',
            borderRadius: '6px',
            fontSize: '14px',
            fontWeight: 500,
            border: 'none',
            cursor: 'pointer',
          }}
        >
          <Plus size={16} />
          New Deal Room
        </button>
      </div>

      {/* Metrics Strip */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '16px',
          marginBottom: '28px',
        }}
      >
        <div
          style={{
            backgroundColor: 'var(--surface-card, #FFFFFF)',
            border: '1px solid var(--border-color, #E4E4E7)',
            borderRadius: '8px',
            padding: '16px 20px',
          }}
        >
          <div
            style={{
              fontSize: '13px',
              fontWeight: 500,
              color: 'var(--color-gray-500, #71717a)',
              marginBottom: '4px',
            }}
          >
            Total Deal Rooms
          </div>
          <div
            style={{ fontSize: '24px', fontWeight: 600, color: 'var(--color-gray-950, #09090b)' }}
          >
            {totalCount}
          </div>
        </div>
        <div
          style={{
            backgroundColor: 'var(--surface-card, #FFFFFF)',
            border: '1px solid var(--border-color, #E4E4E7)',
            borderRadius: '8px',
            padding: '16px 20px',
          }}
        >
          <div style={{ fontSize: '13px', fontWeight: 500, color: '#16a34a', marginBottom: '4px' }}>
            Active Rooms
          </div>
          <div
            style={{ fontSize: '24px', fontWeight: 600, color: 'var(--color-gray-950, #09090b)' }}
          >
            {activeCount}
          </div>
        </div>
        <div
          style={{
            backgroundColor: 'var(--surface-card, #FFFFFF)',
            border: '1px solid var(--border-color, #E4E4E7)',
            borderRadius: '8px',
            padding: '16px 20px',
          }}
        >
          <div
            style={{
              fontSize: '13px',
              fontWeight: 500,
              color: 'var(--color-gray-500, #71717a)',
              marginBottom: '4px',
            }}
          >
            Closed / Won
          </div>
          <div
            style={{ fontSize: '24px', fontWeight: 600, color: 'var(--color-gray-950, #09090b)' }}
          >
            {closedCount}
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '12px',
          marginBottom: '20px',
        }}
      >
        <div style={{ position: 'relative', flex: 1, maxWidth: '360px' }}>
          <Search
            size={16}
            style={{
              position: 'absolute',
              left: '12px',
              top: '10px',
              color: 'var(--color-gray-400, #a1a1aa)',
            }}
          />
          <input
            type="text"
            placeholder="Search deal rooms..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 12px 8px 36px',
              border: '1px solid var(--border-color, #E4E4E7)',
              borderRadius: '6px',
              fontSize: '14px',
              backgroundColor: 'var(--surface-card, #FFFFFF)',
              color: 'var(--color-gray-950, #09090b)',
            }}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <label style={{ fontSize: '13px', color: 'var(--color-gray-500, #71717a)' }}>
            Status:
          </label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{
              padding: '8px 12px',
              border: '1px solid var(--border-color, #E4E4E7)',
              borderRadius: '6px',
              fontSize: '13px',
              backgroundColor: 'var(--surface-card, #FFFFFF)',
              color: 'var(--color-gray-900, #18181b)',
            }}
          >
            <option value="all">All Statuses</option>
            <option value="active">Active</option>
            <option value="closed">Closed</option>
            <option value="archived">Archived</option>
          </select>
        </div>
      </div>

      {/* Error Alert */}
      {errorMessage && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '12px 16px',
            backgroundColor: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: '6px',
            color: '#b91c1c',
            marginBottom: '20px',
            fontSize: '14px',
          }}
        >
          <AlertCircle size={18} />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Table Data View (Strictly real <table> per Design System Section 6) */}
      <div
        style={{
          backgroundColor: 'var(--surface-card, #FFFFFF)',
          border: '1px solid var(--border-color, #E4E4E7)',
          borderRadius: '8px',
          overflow: 'hidden',
        }}
      >
        {isLoading ? (
          <div
            style={{
              padding: '60px 20px',
              textAlign: 'center',
              color: 'var(--color-gray-500, #71717a)',
              fontSize: '14px',
            }}
          >
            Loading deal rooms...
          </div>
        ) : dealRooms.length === 0 ? (
          <div style={{ padding: '64px 20px', textAlign: 'center' }}>
            <FolderKanban
              size={40}
              style={{ margin: '0 auto 16px auto', color: 'var(--color-gray-400, #a1a1aa)' }}
            />
            <h3
              style={{
                fontSize: '16px',
                fontWeight: 600,
                color: 'var(--color-gray-950, #09090b)',
                marginBottom: '6px',
              }}
            >
              No deal rooms found
            </h3>
            <p
              style={{
                fontSize: '14px',
                color: 'var(--color-gray-500, #71717a)',
                marginBottom: '20px',
                maxWidth: '400px',
                margin: '0 auto 20px auto',
              }}
            >
              Create your first digital sales room to share mutual action plans, documents, and
              real-time chat with prospective buyers.
            </p>
            <button
              onClick={() => setIsModalOpen(true)}
              style={{
                backgroundColor: '#2563EB',
                color: '#FFFFFF',
                padding: '8px 16px',
                borderRadius: '6px',
                fontSize: '14px',
                fontWeight: 500,
                border: 'none',
                cursor: 'pointer',
              }}
            >
              Create Deal Room
            </button>
          </div>
        ) : (
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              textAlign: 'left',
              fontSize: '14px',
            }}
          >
            <thead>
              <tr
                style={{
                  borderBottom: '1px solid var(--border-color, #E4E4E7)',
                  backgroundColor: 'var(--surface-page, #FAFAFA)',
                }}
              >
                <th
                  style={{
                    padding: '12px 16px',
                    fontWeight: 600,
                    color: 'var(--color-gray-700, #3f3f46)',
                  }}
                >
                  Deal Room
                </th>
                <th
                  style={{
                    padding: '12px 16px',
                    fontWeight: 600,
                    color: 'var(--color-gray-700, #3f3f46)',
                  }}
                >
                  Status
                </th>
                <th
                  style={{
                    padding: '12px 16px',
                    fontWeight: 600,
                    color: 'var(--color-gray-700, #3f3f46)',
                  }}
                >
                  MAP Progress
                </th>
                <th
                  style={{
                    padding: '12px 16px',
                    fontWeight: 600,
                    color: 'var(--color-gray-700, #3f3f46)',
                  }}
                >
                  Members
                </th>
                <th
                  style={{
                    padding: '12px 16px',
                    fontWeight: 600,
                    color: 'var(--color-gray-700, #3f3f46)',
                  }}
                >
                  Documents
                </th>
                <th
                  style={{
                    padding: '12px 16px',
                    fontWeight: 600,
                    color: 'var(--color-gray-700, #3f3f46)',
                  }}
                >
                  Created
                </th>
                <th
                  style={{
                    padding: '12px 16px',
                    fontWeight: 600,
                    color: 'var(--color-gray-700, #3f3f46)',
                    textAlign: 'right',
                  }}
                >
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {dealRooms.map((room) => {
                const milestones = (room.mutualActionPlan as any[]) || [];
                const completed = milestones.filter((m) => m.status === 'complete').length;
                const progress =
                  milestones.length > 0 ? Math.round((completed / milestones.length) * 100) : 0;

                return (
                  <tr
                    key={room.id}
                    style={{
                      borderBottom: '1px solid var(--border-color, #E4E4E7)',
                      transition: 'background-color 0.15s ease',
                    }}
                  >
                    <td style={{ padding: '14px 16px' }}>
                      <Link
                        href={`/deal-rooms/${room.id}`}
                        style={{
                          fontWeight: 600,
                          color: '#2563EB',
                          textDecoration: 'none',
                          display: 'block',
                          marginBottom: '2px',
                        }}
                      >
                        {room.title}
                      </Link>
                      <span style={{ fontSize: '12px', color: 'var(--color-gray-400, #a1a1aa)' }}>
                        /r/{room.slug}
                      </span>
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '2px 8px',
                          borderRadius: '12px',
                          fontSize: '12px',
                          fontWeight: 500,
                          backgroundColor:
                            room.status === 'active'
                              ? '#dcfce7'
                              : room.status === 'closed'
                                ? '#e0e7ff'
                                : '#f4f4f5',
                          color:
                            room.status === 'active'
                              ? '#15803d'
                              : room.status === 'closed'
                                ? '#4338ca'
                                : '#71717a',
                        }}
                      >
                        {room.status.charAt(0).toUpperCase() + room.status.slice(1)}
                      </span>
                    </td>
                    <td style={{ padding: '14px 16px', minWidth: '160px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div
                          style={{
                            flex: 1,
                            height: '6px',
                            backgroundColor: '#e4e4e7',
                            borderRadius: '3px',
                            overflow: 'hidden',
                          }}
                        >
                          <div
                            style={{
                              width: `${progress}%`,
                              height: '100%',
                              backgroundColor: progress === 100 ? '#16a34a' : '#2563EB',
                            }}
                          />
                        </div>
                        <span
                          style={{
                            fontSize: '12px',
                            fontWeight: 500,
                            color: 'var(--color-gray-600, #52525b)',
                            minWidth: '32px',
                          }}
                        >
                          {progress}%
                        </span>
                      </div>
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          color: 'var(--color-gray-600, #52525b)',
                        }}
                      >
                        <Users size={15} />
                        <span>{room.members?.length || 1}</span>
                      </div>
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          color: 'var(--color-gray-600, #52525b)',
                        }}
                      >
                        <FileText size={15} />
                        <span>{room.documents?.length || 0}</span>
                      </div>
                    </td>
                    <td
                      style={{
                        padding: '14px 16px',
                        color: 'var(--color-gray-500, #71717a)',
                        fontSize: '13px',
                      }}
                    >
                      {new Date(room.createdAt).toLocaleDateString()}
                    </td>
                    <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                        <button
                          onClick={() => handleCopyLink(room.slug)}
                          title="Copy Public Link"
                          style={{
                            padding: '6px 10px',
                            borderRadius: '6px',
                            border: '1px solid var(--border-color, #E4E4E7)',
                            backgroundColor:
                              copiedSlug === room.slug ? '#f0fdf4' : 'var(--surface-card, #FFFFFF)',
                            color:
                              copiedSlug === room.slug
                                ? '#16a34a'
                                : 'var(--color-gray-700, #3f3f46)',
                            fontSize: '12px',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                          }}
                        >
                          {copiedSlug === room.slug ? <Check size={14} /> : <Share2 size={14} />}
                          {copiedSlug === room.slug ? 'Copied' : 'Share'}
                        </button>
                        <Link
                          href={`/deal-rooms/${room.id}`}
                          style={{
                            padding: '6px 10px',
                            borderRadius: '6px',
                            border: '1px solid #2563EB',
                            backgroundColor: '#2563EB',
                            color: '#FFFFFF',
                            fontSize: '12px',
                            textDecoration: 'none',
                            fontWeight: 500,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                          }}
                        >
                          Workspace
                          <ExternalLink size={13} />
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Create Modal Dialog */}
      {isModalOpen && (
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
              maxWidth: '480px',
              boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
            }}
          >
            <h2
              style={{
                fontSize: '18px',
                fontWeight: 600,
                color: 'var(--color-gray-950, #09090b)',
                margin: '0 0 16px 0',
              }}
            >
              Create New Deal Room
            </h2>

            <form onSubmit={handleCreateRoom}>
              <div style={{ marginBottom: '16px' }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: '13px',
                    fontWeight: 500,
                    color: 'var(--color-gray-700, #3f3f46)',
                    marginBottom: '6px',
                  }}
                >
                  Deal Room Title *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Acme Corp Enterprise Expansion"
                  value={newTitle}
                  onChange={(e) => {
                    setNewTitle(e.target.value);
                    if (!newSlug) {
                      setNewSlug(
                        e.target.value
                          .toLowerCase()
                          .replace(/[^a-z0-9-]+/g, '-')
                          .replace(/^-+|-+$/g, ''),
                      );
                    }
                  }}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '1px solid var(--border-color, #E4E4E7)',
                    borderRadius: '6px',
                    fontSize: '14px',
                  }}
                />
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: '13px',
                    fontWeight: 500,
                    color: 'var(--color-gray-700, #3f3f46)',
                    marginBottom: '6px',
                  }}
                >
                  Custom URL Slug
                </label>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <span
                    style={{
                      padding: '8px 10px',
                      backgroundColor: '#f4f4f5',
                      border: '1px solid #e4e4e7',
                      borderRight: 'none',
                      borderRadius: '6px 0 0 6px',
                      fontSize: '13px',
                      color: '#71717a',
                    }}
                  >
                    /r/
                  </span>
                  <input
                    type="text"
                    placeholder="acme-corp-expansion"
                    value={newSlug}
                    onChange={(e) => setNewSlug(e.target.value)}
                    style={{
                      flex: 1,
                      padding: '8px 12px',
                      border: '1px solid var(--border-color, #E4E4E7)',
                      borderRadius: '0 6px 6px 0',
                      fontSize: '14px',
                    }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '6px',
                    border: '1px solid var(--border-color, #E4E4E7)',
                    backgroundColor: '#FFFFFF',
                    color: 'var(--color-gray-700, #3f3f46)',
                    fontSize: '14px',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '6px',
                    border: 'none',
                    backgroundColor: '#2563EB',
                    color: '#FFFFFF',
                    fontSize: '14px',
                    fontWeight: 500,
                    cursor: isSubmitting ? 'not-allowed' : 'pointer',
                    opacity: isSubmitting ? 0.7 : 1,
                  }}
                >
                  {isSubmitting ? 'Creating...' : 'Create Room'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
