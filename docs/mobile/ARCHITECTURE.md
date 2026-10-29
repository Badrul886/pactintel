# PactIntel Mobile App — Architecture Specification

> **Status**: Architecture Specification Complete; Client UI Implementation Deferred to Phase 4+ on Demand per Product Roadmap.

---

## 1. Executive Summary & Strategy

PactIntel is a legal-tech platform where contracts, proposals, and agreements must render with absolute typographical, legal, and visual fidelity across all viewports.

To eliminate dual-engine rendering divergence between web ProseMirror/Tiptap editors and mobile native layout trees, PactIntel adopts an **Expo Managed Architecture with WebView-Assisted Document Rendering**. Native screens manage high-frequency workflows (auth, push notifications, document tracking, status counters, camera scanning, and deal rooms), while complex legal document views and signing pads execute through hardened WebView bridges sharing web CSS and verification engines.

---

## 2. Technology Stack Selection

| Component                | Selected Technology                   | Rationale                                                                                                                               |
| ------------------------ | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| **Framework**            | **React Native + Expo (v52+)**        | Managed workflow eliminates brittle native Xcode/Gradle toolchain friction while enabling OTA updates and universal TypeScript sharing. |
| **Routing**              | **Expo Router**                       | File-based navigation mirroring Next.js App Router semantics.                                                                           |
| **State Management**     | **Zustand**                           | Lightweight, predictable state stores matching `@pactintel/web`.                                                                        |
| **Secure Token Storage** | **Expo SecureStore**                  | Hardware-backed Keychain (iOS) and Keystore (Android) for JWT access and refresh tokens. Never AsyncStorage.                            |
| **Biometric Security**   | **Expo LocalAuthentication**          | FaceID, TouchID, and Android Biometrics with 3-attempt fallback to full re-login.                                                       |
| **HTTP Client**          | **Axios with Interceptors**           | Reusable request signing, retry on 429, and automatic refresh token rotation.                                                           |
| **Push Notifications**   | **Expo Notifications (FCM / APNs)**   | Dispatches through backend `NotificationService` registered via `/api/v1/devices/register`.                                             |
| **Camera & OCR**         | **Expo Camera + Google Cloud Vision** | Captures paper documents and triggers OCR via `POST /api/v1/documents/scan`.                                                            |
| **Document/Sign View**   | **React Native WebView**              | Renders live web recipient and signing flows, guaranteeing 100% visual parity.                                                          |

---

## 3. Screen Catalog (Phase 4+ Scope)

- **Screen M-01: Authentication (WorkOS AuthKit Flow)**
  - OAuth 2.0 PKCE / SAML SSO login.
  - Hardware biometric enrollment (FaceID / TouchID).
- **Screen M-02: Executive Home Dashboard**
  - Urgent action items: pending signatures, overdue approval requests.
  - Recent documents list with live progress indicators.
- **Screen M-03: Documents Hub**
  - Search and filter by status (Draft, Sent, Signed, Declined).
  - Quick action: upload camera scan.
- **Screen M-04: Document Detail & Audit View**
  - Participant status timeline, IP audit trail, and sealed certificate download.
- **Screen M-05: Recipient Document Viewer (WebView)**
  - Hardened WebView loading `/d/:slug` with bidirectional postMessage bridge.
- **Screen M-06: Mobile Signing Flow (WebView)**
  - Touch-optimized signing pad, identity verification step-ups, and biometric confirmation.
- **Screen M-07: In-Person Kiosk Signer**
  - Shared-device signing session with automatic cache purge upon completion.
- **Screen M-08: Portfolio Analytics**
  - Mobile charts: close rates, time-to-sign averages, and counterparty summaries.
- **Screen M-09: Notification Center**
  - Push notification feed with deep-linking to documents and deal rooms.
- **Screen M-10: Camera Scan to Draft**
  - Auto edge-detection, perspective warp correction, and Google Cloud Vision text extraction.
- **Screen M-11: Profile & Security Settings**
  - Organization switcher, push notification preferences, and device deregistration.

---

## 4. Backend Contracts & Readiness

The backend is already implemented and active in Phase 3:

1. `devices` table: Stores UUIDv7 PK, `user_id`, `organization_id`, `platform` (ios/android), and unique push tokens. Protected by PostgreSQL Row-Level Security.
2. `POST /api/v1/devices/register`: Registers push tokens on app launch.
3. `DELETE /api/v1/devices/:id`: Deregisters tokens on user logout.
4. `NotificationService`: Automatically dispatches mobile push alerts alongside in-app and email channels, guarded by circuit breakers (`fcmBreaker`, `apnsBreaker`).

---

## 5. Phase 4+ Implementation Path

When demand warrants client UI release:

1. Initialize Expo project in monorepo at `apps/mobile/` with `@pactintel/mobile` Nx tag.
2. Link `@pactintel/shared-types` and `@pactintel/sdk`.
3. Wire WorkOS AuthKit React Native PKCE flow with Expo SecureStore.
4. Build screens M-01 through M-11 adhering to `@pactintel/ui` tokens and colors (Inter typeface, Blue 600 interactive primary).
