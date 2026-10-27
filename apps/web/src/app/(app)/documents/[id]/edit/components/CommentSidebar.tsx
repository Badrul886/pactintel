'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  MessageSquare,
  Check,
  RotateCcw,
  Trash2,
  Lock,
  CornerDownRight,
  X,
  Send,
  AlertCircle,
  Clock,
} from 'lucide-react';
import { CommentThreadDto, ContentLockDto } from '@pactintel/shared-types';

interface CommentSidebarProps {
  documentId: string;
  currentUserId: string;
  currentUserRole?: string;
  isOpen: boolean;
  onClose: () => void;
  activeBlockId?: string | null;
  onSelectBlock?: (blockId: string) => void;
}

export function CommentSidebar({
  documentId,
  currentUserId,
  currentUserRole = 'member',
  isOpen,
  onClose,
  activeBlockId,
  onSelectBlock,
}: CommentSidebarProps) {
  const [threads, setThreads] = useState<CommentThreadDto[]>([]);
  const [locks, setLocks] = useState<ContentLockDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterResolved, setFilterResolved] = useState<'all' | 'open' | 'resolved'>('open');
  const [newCommentContent, setNewCommentContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [replyingToId, setReplyingToId] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Fetch comments from API
  const fetchComments = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const url = `/api/v1/documents/${documentId}/comments?limit=50${
        filterResolved === 'open'
          ? '&isResolved=false'
          : filterResolved === 'resolved'
            ? '&isResolved=true'
            : ''
      }`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setThreads(data.items || []);
      }
    } catch {
      setError('Failed to load comments');
    } finally {
      setLoading(false);
    }
  }, [documentId, filterResolved]);

  // Fetch active content locks
  const fetchLocks = useCallback(async () => {
    try {
      const res = await fetch(`/api/v1/documents/${documentId}/content-locks`);
      if (res.ok) {
        const data = await res.json();
        setLocks(Array.isArray(data) ? data : []);
      }
    } catch {
      // non-critical
    }
  }, [documentId]);

  useEffect(() => {
    if (isOpen) {
      fetchComments();
      fetchLocks();
    }
  }, [isOpen, fetchComments, fetchLocks]);

  // Handle post root comment
  const handlePostComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCommentContent.trim() || isSubmitting) return;

    try {
      setIsSubmitting(true);
      setError(null);
      const res = await fetch(`/api/v1/documents/${documentId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: newCommentContent.trim(),
          blockId: activeBlockId || null,
        }),
      });

      if (res.ok) {
        setNewCommentContent('');
        await fetchComments();
      } else {
        const errData = await res.json();
        setError(errData.message || 'Failed to post comment');
      }
    } catch {
      setError('Network error while posting comment');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle reply to thread
  const handlePostReply = async (parentId: string) => {
    if (!replyContent.trim() || isSubmitting) return;

    try {
      setIsSubmitting(true);
      setError(null);
      const res = await fetch(`/api/v1/documents/${documentId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: replyContent.trim(),
          parentId,
        }),
      });

      if (res.ok) {
        setReplyContent('');
        setReplyingToId(null);
        await fetchComments();
      } else {
        const errData = await res.json();
        setError(errData.message || 'Failed to post reply');
      }
    } catch {
      setError('Network error while posting reply');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle resolve thread
  const handleResolveThread = async (commentId: string) => {
    try {
      const res = await fetch(`/api/v1/documents/${documentId}/comments/${commentId}/resolve`, {
        method: 'POST',
      });
      if (res.ok) {
        await fetchComments();
      }
    } catch {
      setError('Failed to resolve thread');
    }
  };

  // Handle reopen thread
  const handleReopenThread = async (commentId: string) => {
    try {
      const res = await fetch(`/api/v1/documents/${documentId}/comments/${commentId}/reopen`, {
        method: 'POST',
      });
      if (res.ok) {
        await fetchComments();
      }
    } catch {
      setError('Failed to reopen thread');
    }
  };

  // Handle delete comment
  const handleDeleteComment = async (commentId: string) => {
    if (!confirm('Are you sure you want to delete this comment?')) return;
    try {
      const res = await fetch(`/api/v1/documents/${documentId}/comments/${commentId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        await fetchComments();
      }
    } catch {
      setError('Failed to delete comment');
    }
  };

  // Handle lock block
  const handleLockBlock = async (blockId: string) => {
    try {
      const res = await fetch(`/api/v1/documents/${documentId}/content-locks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blockId }),
      });
      if (res.ok) {
        await fetchLocks();
      } else if (res.status === 409) {
        alert('This block is already locked by another collaborator.');
      }
    } catch {
      setError('Failed to lock block');
    }
  };

  // Handle unlock block
  const handleUnlockBlock = async (blockId: string) => {
    try {
      const res = await fetch(`/api/v1/documents/${documentId}/content-locks/${blockId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        await fetchLocks();
      }
    } catch {
      setError('Failed to unlock block');
    }
  };

  if (!isOpen) return null;

  const isContentAdmin =
    currentUserRole === 'admin' || currentUserRole === 'owner' || currentUserRole === 'manager';

  return (
    <aside
      aria-label="Document Comments and Locks"
      className="fixed inset-y-0 right-0 z-40 w-96 bg-white border-l border-gray-200 shadow-lg flex flex-col font-sans transition-transform duration-200 ease-in-out"
    >
      {/* Sidebar Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-blue-600" />
          <h2 className="text-sm font-semibold text-gray-900">Comments & Collaboration</h2>
          <span className="px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-700 rounded-full">
            {threads.length}
          </span>
        </div>
        <button
          onClick={onClose}
          className="p-1 text-gray-400 hover:text-gray-600 rounded hover:bg-gray-100"
          aria-label="Close sidebar"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Active Content Locks Banner */}
      {locks.length > 0 && (
        <div className="px-4 py-2.5 bg-amber-50 border-b border-amber-200 text-xs">
          <div className="flex items-center gap-1.5 font-medium text-amber-900 mb-1">
            <Lock className="w-3.5 h-3.5 text-amber-700" />
            <span>Active Section Locks ({locks.length})</span>
          </div>
          <div className="space-y-1">
            {locks.map((lock) => {
              const canUnlock = lock.lockedById === currentUserId || isContentAdmin;
              return (
                <div key={lock.id} className="flex items-center justify-between text-amber-800">
                  <span className="truncate">
                    Block{' '}
                    <code className="font-mono text-[11px] bg-amber-100 px-1 py-0.5 rounded">
                      {lock.blockId}
                    </code>
                    : {lock.lockedBy?.name || 'Collaborator'}
                  </span>
                  {canUnlock && (
                    <button
                      onClick={() => handleUnlockBlock(lock.blockId)}
                      className="ml-2 text-[11px] text-amber-900 font-medium underline hover:text-amber-950"
                    >
                      Unlock
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Filter Tabs */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100 bg-white">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setFilterResolved('open')}
            className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
              filterResolved === 'open'
                ? 'bg-blue-50 text-blue-700'
                : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            Open
          </button>
          <button
            onClick={() => setFilterResolved('resolved')}
            className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
              filterResolved === 'resolved'
                ? 'bg-blue-50 text-blue-700'
                : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            Resolved
          </button>
          <button
            onClick={() => setFilterResolved('all')}
            className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
              filterResolved === 'all'
                ? 'bg-blue-50 text-blue-700'
                : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            All
          </button>
        </div>

        {activeBlockId && (
          <div className="flex items-center gap-1.5 text-xs text-gray-500">
            <span className="font-mono text-[11px] bg-gray-100 px-1.5 py-0.5 rounded">
              {activeBlockId}
            </span>
            <button
              onClick={() => handleLockBlock(activeBlockId)}
              title="Lock this section"
              className="p-1 hover:text-blue-600 hover:bg-blue-50 rounded"
            >
              <Lock className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Error alert */}
      {error && (
        <div className="mx-4 mt-3 p-2.5 bg-red-50 border border-red-200 text-red-700 rounded-md text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Threads List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {loading && (
          <div className="flex justify-center py-8 text-gray-400 text-xs">Loading comments...</div>
        )}

        {!loading && threads.length === 0 && (
          <div className="text-center py-12 px-4">
            <MessageSquare className="w-8 h-8 text-gray-300 mx-auto mb-2" />
            <p className="text-sm font-medium text-gray-900">No comments yet</p>
            <p className="text-xs text-gray-500 mt-1">
              Select text or leave a general comment below to start a discussion.
            </p>
          </div>
        )}

        {!loading &&
          threads.map((thread) => {
            const isThreadAuthor = thread.authorId === currentUserId;
            const canManageThread = isThreadAuthor || isContentAdmin;

            return (
              <div
                key={thread.id}
                className={`p-3 rounded-lg border transition-all ${
                  thread.isResolved
                    ? 'bg-gray-50 border-gray-200 opacity-80'
                    : 'bg-white border-gray-200 hover:border-gray-300 shadow-sm'
                }`}
              >
                {/* Thread Header */}
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-semibold flex items-center justify-center">
                      {thread.author?.name ? thread.author.name.charAt(0).toUpperCase() : 'U'}
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-gray-900">
                        {thread.author?.name || 'Collaborator'}
                      </div>
                      <div className="text-[10px] text-gray-400 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {new Date(thread.createdAt).toLocaleDateString([], {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Thread Actions */}
                  <div className="flex items-center gap-1">
                    {thread.isResolved ? (
                      <button
                        onClick={() => handleReopenThread(thread.id)}
                        className="text-gray-400 hover:text-blue-600 p-1 rounded"
                        title="Reopen thread"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                      </button>
                    ) : (
                      <button
                        onClick={() => handleResolveThread(thread.id)}
                        className="text-gray-400 hover:text-green-600 p-1 rounded"
                        title="Resolve thread"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                    )}

                    {canManageThread && !thread.deletedAt && (
                      <button
                        onClick={() => handleDeleteComment(thread.id)}
                        className="text-gray-400 hover:text-red-600 p-1 rounded"
                        title="Delete comment"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Block Chip */}
                {thread.blockId && (
                  <button
                    onClick={() => onSelectBlock?.(thread.blockId!)}
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 mb-2 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded text-[10px] font-mono"
                  >
                    <span>Anchor: {thread.blockId}</span>
                  </button>
                )}

                {/* Content */}
                <div
                  className={`text-xs text-gray-800 break-words whitespace-pre-wrap ${
                    thread.deletedAt ? 'italic text-gray-400' : ''
                  }`}
                >
                  {thread.content}
                </div>

                {/* Replies */}
                {thread.replies && thread.replies.length > 0 && (
                  <div className="mt-3 pl-3 border-l-2 border-gray-100 space-y-2.5">
                    {thread.replies.map((reply) => {
                      const isReplyAuthor = reply.authorId === currentUserId;
                      const canDeleteReply = isReplyAuthor || isContentAdmin;

                      return (
                        <div key={reply.id} className="text-xs">
                          <div className="flex items-center justify-between mb-0.5">
                            <span className="font-medium text-gray-900 text-[11px]">
                              {reply.author?.name || 'Collaborator'}
                            </span>
                            <div className="flex items-center gap-1">
                              <span className="text-[10px] text-gray-400">
                                {new Date(reply.createdAt).toLocaleDateString([], {
                                  month: 'short',
                                  day: 'numeric',
                                })}
                              </span>
                              {canDeleteReply && !reply.deletedAt && (
                                <button
                                  onClick={() => handleDeleteComment(reply.id)}
                                  className="text-gray-400 hover:text-red-600 p-0.5 rounded"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          </div>
                          <div
                            className={`text-gray-700 break-words ${
                              reply.deletedAt ? 'italic text-gray-400' : ''
                            }`}
                          >
                            {reply.content}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Reply Form / Button */}
                {!thread.isResolved && (
                  <div className="mt-2.5 pt-2 border-t border-gray-100">
                    {replyingToId === thread.id ? (
                      <div className="space-y-1.5">
                        <textarea
                          value={replyContent}
                          onChange={(e) => setReplyContent(e.target.value)}
                          placeholder="Write a reply..."
                          rows={2}
                          className="w-full text-xs p-2 border border-gray-200 rounded focus:ring-1 focus:ring-blue-500 focus:outline-none"
                        />
                        <div className="flex justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setReplyingToId(null);
                              setReplyContent('');
                            }}
                            className="px-2 py-1 text-[11px] text-gray-600 hover:bg-gray-100 rounded"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            disabled={!replyContent.trim() || isSubmitting}
                            onClick={() => handlePostReply(thread.id)}
                            className="px-2.5 py-1 text-[11px] font-medium bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                          >
                            Reply
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          setReplyingToId(thread.id);
                          setReplyContent('');
                        }}
                        className="text-[11px] font-medium text-blue-600 hover:text-blue-700 flex items-center gap-1"
                      >
                        <CornerDownRight className="w-3 h-3" />
                        Reply
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
      </div>

      {/* New Root Comment Form */}
      <form onSubmit={handlePostComment} className="p-4 border-t border-gray-200 bg-white">
        {activeBlockId && (
          <div className="text-[11px] text-gray-500 mb-1 flex items-center justify-between">
            <span>
              Anchored to block: <code className="font-mono">{activeBlockId}</code>
            </span>
          </div>
        )}
        <div className="relative">
          <textarea
            value={newCommentContent}
            onChange={(e) => setNewCommentContent(e.target.value)}
            placeholder="Add a comment to this document..."
            rows={3}
            className="w-full text-xs p-2.5 pr-10 border border-gray-200 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none"
          />
          <button
            type="submit"
            disabled={!newCommentContent.trim() || isSubmitting}
            className="absolute bottom-2.5 right-2 p-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 transition-colors"
            title="Post comment"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
      </form>
    </aside>
  );
}
