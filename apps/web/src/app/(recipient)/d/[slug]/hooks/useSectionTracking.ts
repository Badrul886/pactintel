'use client';

import { useEffect, useRef } from 'react';
import { SectionViewEvent } from '@pactintel/shared-types';

interface SectionTrackingOptions {
  documentSlug: string;
  sessionId?: string;
  apiBaseUrl?: string;
  enabled?: boolean;
}

interface ActiveSectionEntry {
  entryTime: number;
  highestVisibility: number;
  sectionTitle?: string;
}

/**
 * useSectionTracking
 * Tracks recipient section reading duration and visibility with IntersectionObserver.
 * Adheres strictly to Sprint 2.1 rules and Invariants I-10, AN-001:
 * - IntersectionObserver threshold [0.25, 0.5, 0.75, 1.0]
 * - Entry at >= 25% visibility; exit at < 25%
 * - Batches events every 10 seconds (max 50 events per payload)
 * - Flushes on visibilitychange('hidden') and beforeunload
 * - Resilient: errors silently swallowed to protect recipient UX
 */
export function useSectionTracking({
  documentSlug,
  sessionId,
  apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000',
  enabled = true,
}: SectionTrackingOptions) {
  // Queue of finished section reading events waiting to be flushed
  const pendingEventsRef = useRef<SectionViewEvent[]>([]);

  // Currently visible sections being timed
  const activeSectionsRef = useRef<Map<string, ActiveSectionEntry>>(new Map());

  // Flush timer reference
  const flushTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Send batch to backend
  const flushEvents = useRef(() => {
    // 1. Finalize any currently active visible sections for the flush interval
    const now = Date.now();
    activeSectionsRef.current.forEach((entry, blockId) => {
      const durationMs = now - entry.entryTime;
      if (durationMs > 200) {
        // Minimum 200ms threshold
        pendingEventsRef.current.push({
          blockId,
          sectionTitle: entry.sectionTitle,
          durationMs,
          visibilityPct: entry.highestVisibility,
        });
      }
      // Reset entryTime so ongoing view accumulates subsequent time
      entry.entryTime = now;
    });

    if (pendingEventsRef.current.length === 0) return;

    // Cap at max 50 events per batch (RULE AN-001 / EC-ANALYTICS-01)
    const batch = pendingEventsRef.current.slice(0, 50);
    pendingEventsRef.current = pendingEventsRef.current.slice(50);

    const resolvedSessionId =
      sessionId ||
      (() => {
        try {
          return sessionStorage.getItem('pact_viewer_session') || 'anonymous-recipient';
        } catch {
          return 'anonymous-recipient';
        }
      })();

    const payload = JSON.stringify({
      documentSlug,
      sessionId: resolvedSessionId,
      events: batch,
    });

    // Use navigator.sendBeacon if page is unloading, else standard fetch
    if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
      const blob = new Blob([payload], { type: 'application/json' });
      navigator.sendBeacon(`${apiBaseUrl}/api/v1/analytics/section-events`, blob);
    } else {
      fetch(`${apiBaseUrl}/api/v1/analytics/section-events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        keepalive: true,
      }).catch(() => {
        // Swallow error - never disrupt recipient experience
      });
    }
  });

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;

    // IntersectionObserver with thresholds [0.25, 0.5, 0.75, 1.0]
    const observer = new IntersectionObserver(
      (entries) => {
        const now = Date.now();

        entries.forEach((entry) => {
          const target = entry.target as HTMLElement;
          const blockId = target.getAttribute('data-block-id');
          if (!blockId) return;

          const sectionTitle = target.getAttribute('data-section-title') || undefined;
          const ratio = entry.intersectionRatio;

          if (ratio >= 0.25) {
            // Reached >= 25% visibility
            if (!activeSectionsRef.current.has(blockId)) {
              activeSectionsRef.current.set(blockId, {
                entryTime: now,
                highestVisibility: ratio,
                sectionTitle,
              });
            } else {
              const active = activeSectionsRef.current.get(blockId)!;
              if (ratio > active.highestVisibility) {
                active.highestVisibility = ratio;
              }
            }
          } else {
            // Fallen below 25% visibility
            if (activeSectionsRef.current.has(blockId)) {
              const active = activeSectionsRef.current.get(blockId)!;
              const durationMs = now - active.entryTime;

              if (durationMs > 200) {
                pendingEventsRef.current.push({
                  blockId,
                  sectionTitle: active.sectionTitle,
                  durationMs,
                  visibilityPct: active.highestVisibility,
                });
              }
              activeSectionsRef.current.delete(blockId);
            }
          }
        });
      },
      {
        threshold: [0.25, 0.5, 0.75, 1.0],
      },
    );

    // Observe all elements with [data-block-id]
    const elements = document.querySelectorAll('[data-block-id]');
    elements.forEach((el) => observer.observe(el));

    // Batch flush every 10 seconds (Rule 4)
    flushTimerRef.current = setInterval(() => {
      flushEvents.current();
    }, 10000);

    // Flush on visibilitychange('hidden') (Rule 5)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        flushEvents.current();
      }
    };

    const handleBeforeUnload = () => {
      flushEvents.current();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      observer.disconnect();
      if (flushTimerRef.current) clearInterval(flushTimerRef.current);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      flushEvents.current();
    };
  }, [documentSlug, sessionId, apiBaseUrl, enabled]);
}
