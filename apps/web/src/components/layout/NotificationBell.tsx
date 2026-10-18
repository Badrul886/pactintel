'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Bell, Check, Trash2, X } from 'lucide-react';
import { InAppNotificationDto } from '@pactintel/shared-types';

export default function NotificationBell() {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<InAppNotificationDto[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [toast, setToast] = useState<{ id: string; title: string; body: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

  // Fetch initial notifications
  const loadNotifications = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${apiBase}/api/v1/notifications?limit=20`, {
        credentials: 'include',
      });
      if (res.ok) {
        const json = await res.json();
        const items: InAppNotificationDto[] = json.data?.items || json.data || [];
        setNotifications(items);
        setUnreadCount(items.filter((n) => !n.isRead).length);
      }
    } catch {
      // Non-blocking degradation
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadNotifications();

    // Setup SSE connection
    let eventSource: EventSource | null = null;
    try {
      eventSource = new EventSource(`${apiBase}/api/v1/notifications/stream`, {
        withCredentials: true,
      });

      eventSource.onmessage = (event) => {
        try {
          const raw = JSON.parse(event.data);
          // Ignore keep-alive heartbeats
          if (raw.type === 'ping' || raw.data?.type === 'ping') return;

          const newNotif: InAppNotificationDto = raw.data || raw;
          if (!newNotif.id) return;

          setNotifications((prev) => [newNotif, ...prev.filter((n) => n.id !== newNotif.id)]);
          setUnreadCount((c) => c + 1);

          // Show floating toast
          setToast({
            id: newNotif.id,
            title: newNotif.title,
            body: newNotif.body,
          });

          // Auto-hide toast after 5s
          setTimeout(() => {
            setToast((current) => (current?.id === newNotif.id ? null : current));
          }, 5000);
        } catch {
          // Ignore malformed ping or non-json message
        }
      };

      eventSource.onerror = () => {
        // SSE automatically reconnects
      };
    } catch {
      // EventSource not supported or blocked
    }

    // Click outside to close dropdown
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      eventSource?.close();
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [apiBase]);

  const handleMarkAllRead = async () => {
    try {
      const res = await fetch(`${apiBase}/api/v1/notifications/mark-all-read`, {
        method: 'POST',
        credentials: 'include',
      });
      if (res.ok) {
        setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
        setUnreadCount(0);
      }
    } catch {
      // Fallback
    }
  };

  const handleMarkRead = async (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    try {
      const res = await fetch(`${apiBase}/api/v1/notifications/${id}/read`, {
        method: 'PATCH',
        credentials: 'include',
      });
      if (res.ok) {
        setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
        setUnreadCount((c) => Math.max(0, c - 1));
      }
    } catch {
      // Fallback
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await fetch(`${apiBase}/api/v1/notifications/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (res.ok) {
        setNotifications((prev) => {
          const item = prev.find((n) => n.id === id);
          if (item && !item.isRead) {
            setUnreadCount((c) => Math.max(0, c - 1));
          }
          return prev.filter((n) => n.id !== id);
        });
      }
    } catch {
      // Fallback
    }
  };

  const handleItemClick = (notification: InAppNotificationDto) => {
    if (!notification.isRead) {
      handleMarkRead(notification.id);
    }
    if (notification.resourceType === 'document' && notification.resourceId) {
      window.location.href = `/documents/${notification.resourceId}`;
    }
  };

  return (
    <div style={{ position: 'relative' }} ref={dropdownRef}>
      {/* Toast Alert for Incoming Real-Time Notifications */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: 'fixed',
            top: '20px',
            right: '20px',
            zIndex: 9999,
            backgroundColor: '#ffffff',
            border: '1px solid #2563EB',
            borderLeft: '4px solid #2563EB',
            borderRadius: '6px',
            padding: '12px 16px',
            boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
            maxWidth: '360px',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '12px',
          }}
        >
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '13px', fontWeight: 600, color: '#0F172A' }}>{toast.title}</div>
            <div style={{ fontSize: '12px', color: '#475569', marginTop: '2px' }}>{toast.body}</div>
          </div>
          <button
            onClick={() => setToast(null)}
            style={{
              background: 'none',
              border: 'none',
              padding: '2px',
              cursor: 'pointer',
              color: '#64748B',
            }}
            aria-label="Close notification"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Bell Trigger */}
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        style={{
          position: 'relative',
          padding: '8px',
          borderRadius: '6px',
          background: 'none',
          border: '1px solid #E2E8F0',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: isOpen ? '#2563EB' : '#475569',
          backgroundColor: isOpen ? '#EFF6FF' : '#FFFFFF',
        }}
        aria-label="View notifications"
        aria-expanded={isOpen}
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <span
            style={{
              position: 'absolute',
              top: '-4px',
              right: '-4px',
              backgroundColor: '#2563EB',
              color: '#ffffff',
              fontSize: '10px',
              fontWeight: 700,
              borderRadius: '9999px',
              minWidth: '18px',
              height: '18px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0 4px',
              border: '2px solid #ffffff',
            }}
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Notifications Dropdown (Design System §9 - Floating Popover) */}
      {isOpen && (
        <div
          style={{
            position: 'absolute',
            right: 0,
            marginTop: '8px',
            width: '380px',
            backgroundColor: '#ffffff',
            border: '1px solid #E2E8F0',
            borderRadius: '8px',
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
            zIndex: 1000,
            overflow: 'hidden',
          }}
        >
          {/* Header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 16px',
              borderBottom: '1px solid #E2E8F0',
              backgroundColor: '#F8FAFC',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '14px', fontWeight: 600, color: '#0F172A' }}>
                Notifications
              </span>
              {unreadCount > 0 && (
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 600,
                    backgroundColor: '#EFF6FF',
                    color: '#2563EB',
                    padding: '1px 6px',
                    borderRadius: '4px',
                  }}
                >
                  {unreadCount} new
                </span>
              )}
            </div>

            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                style={{
                  fontSize: '12px',
                  color: '#2563EB',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  fontWeight: 500,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <Check size={14} />
                Mark all read
              </button>
            )}
          </div>

          {/* List Area */}
          <div style={{ maxHeight: '380px', overflowY: 'auto' }}>
            {loading && notifications.length === 0 ? (
              <div
                style={{
                  padding: '32px 16px',
                  textAlign: 'center',
                  fontSize: '13px',
                  color: '#64748B',
                }}
              >
                Loading notifications...
              </div>
            ) : notifications.length === 0 ? (
              <div
                style={{
                  padding: '40px 16px',
                  textAlign: 'center',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <Bell size={28} color="#CBD5E1" />
                <span style={{ fontSize: '13px', fontWeight: 500, color: '#475569' }}>
                  No notifications yet
                </span>
                <span style={{ fontSize: '12px', color: '#94A3B8' }}>
                  You are completely caught up!
                </span>
              </div>
            ) : (
              notifications.map((notif) => (
                <div
                  key={notif.id}
                  onClick={() => handleItemClick(notif)}
                  style={{
                    padding: '12px 16px',
                    borderBottom: '1px solid #F1F5F9',
                    backgroundColor: notif.isRead ? '#ffffff' : '#F0F7FF',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    gap: '12px',
                    transition: 'background-color 0.15s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = notif.isRead ? '#F8FAFC' : '#E0EFFF';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = notif.isRead ? '#ffffff' : '#F0F7FF';
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div
                      style={{
                        fontSize: '13px',
                        fontWeight: notif.isRead ? 500 : 600,
                        color: '#0F172A',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                      }}
                    >
                      {!notif.isRead && (
                        <span
                          style={{
                            width: '6px',
                            height: '6px',
                            borderRadius: '50%',
                            backgroundColor: '#2563EB',
                            display: 'inline-block',
                          }}
                        />
                      )}
                      {notif.title}
                    </div>
                    <div
                      style={{
                        fontSize: '12px',
                        color: '#475569',
                        marginTop: '2px',
                        lineHeight: 1.4,
                      }}
                    >
                      {notif.body}
                    </div>
                    <div
                      style={{
                        fontSize: '11px',
                        color: '#94A3B8',
                        marginTop: '4px',
                      }}
                    >
                      {new Date(notif.createdAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    {!notif.isRead && (
                      <button
                        onClick={(e) => handleMarkRead(notif.id, e)}
                        title="Mark as read"
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#64748B',
                          cursor: 'pointer',
                          padding: '4px',
                        }}
                      >
                        <Check size={14} />
                      </button>
                    )}
                    <button
                      onClick={(e) => handleDelete(notif.id, e)}
                      title="Delete"
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#94A3B8',
                        cursor: 'pointer',
                        padding: '4px',
                      }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
