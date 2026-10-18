-- ClickHouse Analytics Schema for PactIntel (Cell Jurisdiction Aware)

CREATE TABLE IF NOT EXISTS analytics_events (
    event_id UUID,
    organization_id UUID,
    document_id UUID,
    session_id String,
    event_type LowCardinality(String),
    page_number Nullable(UInt16),
    duration_ms Nullable(UInt32),
    timestamp DateTime64(3, 'UTC') DEFAULT now(),
    ip_address Nullable(IPv4),
    country LowCardinality(Nullable(String)),
    user_agent Nullable(String)
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (organization_id, document_id, session_id, timestamp);

CREATE TABLE IF NOT EXISTS viewer_sessions (
    session_id String,
    organization_id UUID,
    document_id UUID,
    viewer_email Nullable(String),
    started_at DateTime64(3, 'UTC'),
    last_active_at DateTime64(3, 'UTC'),
    ip_address Nullable(IPv4),
    country Nullable(String)
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(started_at)
ORDER BY (organization_id, document_id, session_id);
