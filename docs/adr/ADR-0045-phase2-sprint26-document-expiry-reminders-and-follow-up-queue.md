# ADR-0045: Document Expiry Automation, Inactivity Reminders & Follow-Up Nudge Queue

## Status

Accepted

## Context

In business contract management and proposal automation, proposals and sales agreements have a finite validity period (e.g. 14, 30, or 60 days). Without automation, expired documents may remain accessible or be signed past agreed commercial terms, causing legal and financial liabilities. Furthermore, stalled proposals require sales rep follow-ups, but automated follow-ups must balance promptness with professional discretion.

Sprint 2.6 implements document expiry automation, inactivity reminders, and the follow-up review queue adhering to Blueprint v2.0.0 and Phase 2 Build Plan.

## Requirements & Invariants

1. **Rule FOLLOW-001 (Rep Review Mandatory)**: Automated follow-up emails are **NEVER** sent directly without sales rep review. The system creates entries in `follow_up_queue` (nudge queue) and sends a daily digest to the rep. The sales rep must explicitly click "Send" for each follow-up.
2. **Invariant I-07 (Process Types & Scheduled Work)**: All scheduled work runs via BullMQ job schedulers (`upsertJobScheduler`) on Redis queues (`expiry-check`, `reminder-check`, `follow-up-digest`). Never use `@Cron` or `@nestjs/schedule` in application code.
3. **Invariant I-06 (Transactional Outbox)**: Expiry events (`document.expiry_approaching`, `document.expired`) and follow-up dispatches (`follow_up.sent`) must be emitted through `outbox_events` within the same database transaction.
4. **Idempotency & Resilience**:
   - `ExpiryCheckJob`: Hourly scheduler; documents with `expires_at < now` are transitioned to `status = 'expired'` idempotently. Documents expiring within 24 hours have `expiry_warning_sent_at` recorded to prevent duplicate warnings.
   - `ReminderCheckJob`: Daily scheduler; documents in `status = 'sent'` with `inactivity_reminder_days` set are evaluated against `last_viewed_at` (or `created_at` if never viewed per `EC-EXPIRY-05`). Items already in `follow_up_queue` are deduplicated/upserted (`EC-AUTO-05`).
   - `EC-EXPIRY-04`: If a follow-up item's document is already signed when the rep clicks "Send", the service rejects with `409 Conflict` (`DOCUMENT_ALREADY_SIGNED`) and auto-dismisses the queue item.
5. **CASL Permissions**:
   - `FollowUpQueueItem` action permissions:
     - `admin` & `manager`: can `read`, `send`, `snooze`, `dismiss`, and `manage`.
     - `member`: can `read`, `send`, `snooze`, `dismiss` for own items (`ownerId === user.id`).
     - `collaborator`: denied access.

## Architecture & Implementation

- **Repository Methods**:
  - `DocumentRepository`: `findExpiringSoon()`, `setExpiryWarningAt()`, `findJustExpired()`, `findInactiveDocuments()`, `updateSettings()`.
  - `FollowUpRepository`: `findPendingForUser()`, `findByIdOrThrow()`, `upsertInactivityItem()`, `upsertExpiryWarningItem()`, `updateStatus()`, `delete()`.
- **Scheduled Jobs (BullMQ)**:
  - `ExpiryCheckJob`: Hourly `0 * * * *`, process expiry warnings and status transitions.
  - `ReminderCheckJob`: Daily `0 9 * * *`, process inactivity thresholds into queue items.
  - `FollowUpDigestJob`: Daily `0 8 * * *`, sends digest summaries to reps.
- **REST Endpoints**:
  - `GET /api/v1/follow-ups` (List pending for current user with filtering: all, inactivity, expiry_warning, custom).
  - `POST /api/v1/follow-ups/:id/send` (Confirm and dispatch follow-up email).
  - `POST /api/v1/follow-ups/:id/snooze` (Snooze item until specified date).
  - `DELETE /api/v1/follow-ups/:id` (Dismiss queue item).
  - `PATCH /api/v1/documents/:id/settings` (Configure `expiresInDays` and `inactivityReminderDays`).
- **Frontend UI Screens**:
  - `Screen P2-04 (/follow-ups)`: Real `<table>` listing pending follow-up items with tab filters, send modal, snooze picker, and empty/loading states.
  - `Screen P2-03 (/documents/[id]/settings)`: Expiry and inactivity reminder configuration section.

## Consequences

- Guarantees zero stale proposals remain open indefinitely.
- Guarantees sales reps retain full editorial control over external customer communications (preventing embarrassing automated emails for already closed or sensitive deals).
- Complete outbox telemetry and audit logging for legal compliance.
