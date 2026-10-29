# PactIntel API Changelog

All notable changes to the PactIntel Public REST API will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this platform adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html) and Architecture Invariant I-08.

---

## [1.0.0] - Phase 3 Completion

### Added

- **Public REST API**: Canonical `/api/v1/` endpoints for Documents, Templates, E-Signatures, CPQ, Forms, and Analytics.
- **API Keys**: High-performance SHA-256 indexed authentication via header `X-Api-Key` with sliding-window rate limiting (1000 req/min) and admin MFA protection.
- **Webhooks**: Real-time event notifications with HMAC-SHA256 signatures and 3-attempt exponential backoff retries.
- **Standalone Forms**: Public form endpoints (`/f/:orgSlug/:formSlug`), staged multi-role continuation, and CSV export.
- **Mobile Device Registration**: Endpoints `POST /api/v1/devices/register` and `DELETE /api/v1/devices/:id` for FCM/APNs push notification delivery.
- **Embedded Editor & Signing**: White-label iframe routes `/embed/editor/:id` and `/embed/sign/:id` with postMessage events.
- **MCP Connector**: Model Context Protocol microservice exposing 8 standard tools for AI agent pair programming.
- **OpenAPI 3.0 & Postman**: Committed specifications at `docs/api/openapi.yaml` and `docs/api/pactintel.postman_collection.json`.
