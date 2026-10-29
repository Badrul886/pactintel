# ADR-0057: Advanced Analytics, Proprietary Engagement Scoring, and Custom Report Engine

## Status

Accepted

## Context

Phase 1 established basic document tracking (1x1 pixel, opens, heartbeat durations) and Phase 2 introduced section-level reading telemetry (IntersectionObserver) with stakeholder forward tracking (RULE AN-001, AN-002).
Phase 3 Sprint 3.10 delivers the complete enterprise analytics suite:

1. Company-wide and team-level roll-ups with role-based scoping (Owner/Admin: company-wide, Manager: supervised teams, Member: personal only).
2. Conversion funnels and template performance reports with deal velocity.
3. Proprietary engagement scoring (0–100) reflecting true commercial buyer intent, detecting when deals go quiet (> 7 days inactivity, disengaged) or reopen (re-engaged).
4. Custom Report Builder with dynamic JSONB definitions, flexible dimensions/metrics/filters, plan gating (Business+), and OWASP-safe CSV export.
5. Manager Overdue Follow-up radar for team deals.

Key architectural decisions required:

- Storage strategy: ClickHouse for high-velocity telemetry and analytical roll-ups vs. PostgreSQL for report definitions, schedules, and tenant metadata.
- Calculation model: Synchronous vs. asynchronous execution for engagement scores and scheduled reports.
- Injection defense: Protection against SQL injection in dynamic report filters and OWASP CSV formula injection in spreadsheet exports.
- Multi-tenancy & plan gating: Strict RLS enforcement and subscription tier restrictions.

## Decision

### 1. Dual-Datastore Routing (Invariant I-10)

- **ClickHouse (Columnar Store)**: Houses `analytics_events`, `viewer_sessions`, `section_views`, and `document_engagement`. High-volume aggregation queries (time to sign, view counts, conversion rates, dwell times) execute against ClickHouse for sub-100ms response times without placing read load on transactional Cloud SQL.
- **Cloud SQL PostgreSQL**: Houses `custom_reports` metadata (UUIDv7, JSONB definition, scheduling config, RLS policies).

### 2. Proprietary Engagement Scoring Algorithm (0–100)

Calculated via multi-factor weighting:

- Time on Page (0–40 pts): $\min(40, (\text{durationSeconds} / 300) \times 40)$
- Section Completion (0–30 pts): $(\text{completionRatePct} / 100) \times 30$
- Return Visits (0–15 pts): $\min(15, \max(0, \text{sessionsCount} - 1) \times 3)$
- Multiple Viewers (0–15 pts): $\min(15, \text{uniqueViewersCount} \times 5)$
- Dormancy Decay: If `daysSinceLastView >= 7` without signature: $-35$ pts decay, flagged as `is_disengaged`. Emits `analytics.engagement.disengaged` outbox event.
- Reactivation: If dormant > 7 days and new view arrives: decay lifted, flagged as `is_reengaged`. Emits `analytics.engagement.reengaged` outbox event.
- Completed Freezing: Once document is `signed` or `declined`, score is frozen to prevent post-close decay.

### 3. Asynchronous BullMQ Execution (Invariant I-07)

- Telemetry pings trigger `ComputeEngagementScoreProcessor` on BullMQ queue `analytics-engagement` debounced with job ID `score-doc-${documentId}` (5-second debounce window) to prevent telemetry storms from overloading compute.
- Scheduled reports are processed by `RunScheduledReportProcessor` on BullMQ queue `analytics-reports` triggered via Cloud Scheduler (never `@Cron` in code).

### 4. Custom Report Engine & Security Posture

- Dynamic queries validate dimensions and metrics against an explicit whitelist enum (`ReportDimension`, `ReportMetric`).
- Filter values are strongly typed and parameterized; zero raw string interpolation into SQL.
- Query limits are capped at 10,000 rows to prevent Cloud Run memory exhaustion.
- CSV export sanitizes values starting with `=`, `+`, `-`, `@`, `\t`, `\r` by prefixing with a single quote `'` (OWASP CSV Injection / DDE defense).
- Plan gating: Feature gate validates `Subscription.planTier in ['business', 'enterprise']`. Free/Starter/Professional tiers receive HTTP 403 `PLAN_FEATURE_LOCKED`. On downgrade, existing reports are preserved in read-only status.

## Consequences

### Positive

- Sub-100ms analytical dashboards even with millions of section views.
- No impact on recipient viewing or signing latency due to debounced async background scoring.
- Strong security posture preventing both SQL injection and CSV formula execution.
- Clear role separation: Admins, Managers, and Members see only permitted analytical scopes.
- Strict Invariant compliance (I-01 through I-15).

### Negative / Trade-offs

- Slight eventual consistency (up to 5 seconds) for computed engagement scores due to debounce queue.
- Dual-datastore coordination requires mock ClickHouse client in integration test suites.

## Alternatives Considered

- Direct raw SQL queries from client JSON: Rejected due to catastrophic SQL injection vulnerability.
- In-process calculation on every HTTP request: Rejected due to CPU latency spikes on recipient page loads.
- In-process `@Cron` for report scheduling: Rejected per Invariant I-07 (BullMQ + Cloud Scheduler required).
