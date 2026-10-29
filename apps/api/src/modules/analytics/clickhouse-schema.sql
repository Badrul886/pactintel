-- =============================================================================
-- ClickHouse Analytics Schema — PactIntel (v2.0.0, GCP Region)
-- Invariant I-10: Columnar storage for sub-100ms analytical queries.
-- RULE AN-001: Pub/Sub buffer ONLY — NEVER direct ClickHouse INSERT from client.
-- =============================================================================

-- 1. analytics_events (Phase 0/1: raw view events)
CREATE TABLE IF NOT EXISTS analytics_events (
  event_id          UUID,
  organization_id   UUID,
  document_id       UUID,
  session_id        String,
  event_type        LowCardinality(String),
  viewer_email      Nullable(String),
  ip_address        Nullable(String),
  country           Nullable(String),
  duration_ms       UInt32,
  created_at        DateTime64(3, 'UTC')
) ENGINE = MergeTree()
  PARTITION BY toYYYYMM(created_at)
  ORDER BY (organization_id, document_id, session_id, created_at);

-- 2. viewer_sessions (Phase 0/1: session intervals)
CREATE TABLE IF NOT EXISTS viewer_sessions (
  session_id        String,
  organization_id   UUID,
  document_id       UUID,
  viewer_email      Nullable(String),
  started_at        DateTime64(3, 'UTC'),
  last_active_at    DateTime64(3, 'UTC'),
  total_duration_ms UInt32,
  ip_address        Nullable(String),
  country           Nullable(String)
) ENGINE = ReplacingMergeTree(last_active_at)
  ORDER BY (organization_id, document_id, session_id);

-- 3. section_views (Phase 2: highest-volume table in the system — ALWAYS use Pub/Sub buffer)
CREATE TABLE IF NOT EXISTS section_views (
  event_id          UUID,
  organization_id   UUID,
  document_id       UUID,
  session_id        String,
  block_id          String,       -- Tiptap block node ID
  section_title     Nullable(String),
  duration_ms       UInt32,       -- time spent on this section (ms)
  visibility_pct    Float32,      -- IntersectionObserver ratio (0.0–1.0)
  scroll_depth_pct  Float32,      -- how far they scrolled (0.0–1.0)
  created_at        DateTime64(3, 'UTC')
) ENGINE = MergeTree()
  PARTITION BY toYYYYMM(created_at)
  ORDER BY (organization_id, document_id, session_id, created_at);

-- 4. document_engagement (Phase 3 Sprint 3.10: computed engagement score & state flags)
CREATE TABLE IF NOT EXISTS document_engagement (
  document_id          UUID,
  organization_id      UUID,
  engagement_score     Float32,
  is_disengaged        UInt8,
  is_reengaged         UInt8,
  dwell_time_seconds   UInt32,
  completion_rate_pct  Float32,
  views_count          UInt32,
  unique_viewers_count UInt32,
  last_viewed_at       DateTime64(3, 'UTC'),
  updated_at           DateTime64(3, 'UTC')
) ENGINE = ReplacingMergeTree(updated_at)
  ORDER BY (organization_id, document_id);
