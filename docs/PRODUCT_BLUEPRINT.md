# Master Blueprint: Unified Proposal, Quoting, E-Signature & Contract Platform

_A complete build spec combining the full feature surface of Proposify, Better Proposals, Qwilr, and PandaDoc into one product._

## Table of Contents

1. Scope & How to Use This Document
2. Application Map — Every Screen You're Building
3. User, Role & Workspace Model
4. Permission Matrix
5. Full Feature Inventory (by module)
6. Core Data Model
7. Tier & Packaging Map
8. Tech Stack
9. Edge Cases
10. Build Sequencing

---

## 1. Scope & How to Use This Document

This is the combined feature surface of four products that together represent roughly 40 company-years of development. It's organized as a build reference, not a pitch: application map → who's allowed to do what → the complete feature spec, module by module → the data model underneath it → how it's packaged into tiers → what to build it with → where it breaks if you're not careful → and the order to actually build it in. Section 10 is the one section that isn't "everything at once" — a feature can be Enterprise-tier in pricing while still being built in Phase 1 because three other features depend on it existing first. Everything else in this document specs the full, combined end-state.

---

## 2. Application Map — Every Screen You're Building

### Internal (logged-in) screens

| #   | Screen                         | Primary users                     | Core purpose                                                                  | What lives there                                                                                                                                                                           |
| --- | ------------------------------ | --------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Home Dashboard                 | Everyone                          | At-a-glance daily view                                                        | Recent documents, pending actions (awaiting your signature/approval), this-week stats, quick-create, notification preview                                                                  |
| 2   | Documents Hub                  | Everyone (scoped by permission)   | Central list of every proposal/quote/contract/brochure/SOW/sign-off/job offer | Filterable/searchable list, folders, status badges (draft/sent/viewed/signed/expired/declined), bulk actions, saved views                                                                  |
| 3   | Document Editor                | Creators, collaborators           | Building/editing one document                                                 | Block-based canvas, brand-kit auto-apply, content-library insert, pricing-table block, e-sign block placement, Smart Content rules, comments/redlining, version history, AI drafting panel |
| 4   | Template Library               | Creators, admins                  | Managing reusable templates                                                   | Browse by category/industry, create-from-scratch, save-as-template, per-template default settings (expiry, access rules), folders                                                          |
| 5   | Content Library                | Creators, admins                  | Reusable blocks/snippets (case studies, bios, clauses, images)                | Tagging, search, insert-into-document, "used in N templates" tracking                                                                                                                      |
| 6   | Quoting / CPQ Workspace        | Reps, RevOps admins               | Building and configuring quotes                                               | Product catalog admin, pricing/discount rules engine, bundle builder, approval-threshold config, quote builder UI                                                                          |
| 7   | Contracts Repository           | Legal, sales ops, admins          | Dedicated archive of executed + in-flight agreements                          | Search by party/date/value, renewal alerts, AI-extracted metadata view, clause library                                                                                                     |
| 8   | Deal Rooms                     | Reps, external buyers             | Persistent multi-party workspace for one deal                                 | Shared document feed, messaging, video embeds, mutual-action-plan tracker, all-parties activity view                                                                                       |
| 9   | Forms Builder & Submissions    | Marketing, ops                    | Standalone web forms outside the proposal flow                                | Form builder canvas, submission inbox, routing rules, embed/share                                                                                                                          |
| 10  | Signing Center                 | Everyone, external signers        | Tracking every signature request                                              | Pending/completed/declined tabs, per-signer status, resend/void, audit-trail viewer                                                                                                        |
| 11  | Payments Dashboard             | Finance, admins, reps             | Money movement tied to documents                                              | Transaction list, payout schedule, refunds/disputes, connected-account status                                                                                                              |
| 12  | Analytics & Reporting          | Managers, admins, reps (own data) | Performance visibility                                                        | Document engagement (opens/time-on-section), team/company roll-ups, conversion reports, custom report builder, export                                                                      |
| 13  | Automations / Workflows        | Admins, RevOps                    | Rule-based behavior                                                           | Trigger→action builder, approval-chain designer, CRM-sync rules, expiry/reminder schedules                                                                                                 |
| 14  | AI Assistant                   | Everyone                          | Conversational account interface                                              | Chat panel, "ask about any document," activity Q&A, natural-language task execution (extend an expiry, draft a reminder)                                                                   |
| 15  | Integrations Marketplace       | Admins                            | Connecting third-party tools                                                  | Browse/connect CRM, payments, PM, chat; per-integration config; sync-health view                                                                                                           |
| 16  | Notary / RON Session Room      | Notaries, signers, admins         | Live video-witnessed signing (Enterprise)                                     | Video/audio call UI, ID-verification step, electronic notary journal, session recordings                                                                                                   |
| 17  | Team & Workspace Settings      | Owners, admins                    | Org structure and access                                                      | User list, invite flow, role assignment, workspace/team creation, seat management                                                                                                          |
| 18  | Security & Compliance Settings | Owners, admins                    | Org-wide security posture                                                     | SSO/SAML config, 2FA policy, IP allowlisting, data-residency choice, audit-log export, API keys, webhooks                                                                                  |
| 19  | Billing & Subscription         | Owners, billing admins            | Plan and payment management                                                   | Plan vs. usage, upgrade/downgrade, invoices, seat add/remove, add-ons (Notary, extra AI credits)                                                                                           |
| 20  | Brand & White-Label Settings   | Admins, marketing                 | Visual identity across every sent document                                    | Multiple brand kits, custom domain, custom fonts, sender white-labeling, badge removal                                                                                                     |

### External-facing screens (no login required, unless noted)

| #   | Screen                  | Who sees it                | Purpose                                                                                    |
| --- | ----------------------- | -------------------------- | ------------------------------------------------------------------------------------------ |
| 21  | Recipient Viewing Page  | The buyer/client           | The actual sent document, as a responsive tracked webpage — not a PDF attachment           |
| 22  | Signing Flow            | Signers                    | Embedded in #21: identity check → review → sign (type/draw/click-to-accept) → confirmation |
| 23  | Payment Collection Flow | Payers                     | Embedded in #21, post-signature or alongside it                                            |
| 24  | Onboarding Flow         | The client, post-signature | Step sequence: forms, payment, content, call booking, redirect                             |
| 25  | Public Form-Fill Page   | Anyone with the link       | Standalone Forms product submissions                                                       |

Mobile apps (iOS/Android) mirror a subset of #1, #2, #10, #12 — create, track, and sign from a phone, plus camera-scan-to-document and push alerts. They are a thinner client on the same backend, not a separate product.

---

## 3. User, Role & Workspace Model

**Hierarchy:** Organization (the billing entity) → Workspace(s) (optional — separates franchises, departments, or child companies, each with its own templates/branding/reporting) → Team(s) (a group within a workspace, with a manager) → User (holds exactly one role _per workspace_ — a person can be a Manager in Workspace A and a plain Member in Workspace B; only Owner is account-wide).

**Roles:**

- **Owner** — exactly one per account (transferable, never deleted without a successor). Everything an Admin can do, plus the two irreversible actions: deleting the account and transferring ownership.
- **Admin** — full settings access (users, billing, security, integrations, branding), can create/manage Workspaces and Teams. Cannot delete the account or transfer ownership.
- **Manager** — scoped to specific Teams/Workspaces. Sees team-level analytics and reports, can sit in approval chains, can reassign documents within their team. No org-wide billing/security access.
- **Member (full seat)** — the standard paying seat. Creates, sends, and manages their own documents; uses templates and the content library; sees their own analytics. Cannot manage other users or org settings.
- **Collaborator (limited seat)** — cheaper (or plan-included-free-up-to-N) seat type. Can view, comment, redline, and approve documents they're invited into, and edit unlocked sections. **Cannot** create a new document from scratch or send one externally. Mirrors the 1/3/5-collaborator-seat pattern common across this category.
- **Content/Legal Admin** — a permission _overlay_, not a separate seat type. Grants content-locking rights over specific sections or templates to whichever Member or Manager holds it.
- **API / Integration identity** — non-human principal tied to an API key or OAuth connection. Scoped permissions like any other role, but audited separately from human users.
- **External Signer / Viewer** — never a seat, never logs into the main app. Identity established per-document via emailed link, optional password, optional ID-verification step. Only becomes a persistent logged-in "client portal" account if you deliberately build that (out of scope until Phase 3 — see Section 10).
- **Notary** — Enterprise-only, licensed and jurisdiction-verified, with their own scheduling queue and journal-of-record obligations.

**Seat-counting rule:** Owner, Admin, Manager, and Member all count as a full seat for per-seat billing. Collaborators count as a separate, cheaper (or plan-included) category. API identities and external signers never count as seats.

**Invitation lifecycle:** invite by email → _pending_ (reserves a seat immediately, so someone can't dodge a seat limit by leaving invites unaccepted) → _active_ → _deactivated_ (frees the seat; their historical documents and audit-trail entries stay intact and permanently attributed to them — you can revoke access, never rewrite history).

---

## 4. Permission Matrix

| Capability                          | Owner | Admin     | Manager            | Member             | Collaborator           | External          |
| ----------------------------------- | ----- | --------- | ------------------ | ------------------ | ---------------------- | ----------------- |
| Create a document                   | Full  | Full      | Full               | Full               | None                   | None              |
| Send a document externally          | Full  | Full      | Full               | Full               | None                   | None              |
| Edit a document pre-send            | Full  | Full      | Full (own+team)    | Own only           | Unlocked sections only | None              |
| Comment / redline post-send         | Full  | Full      | Full               | Own                | Invited docs only      | Invited docs only |
| Lock / unlock content sections      | Full  | Full      | If granted overlay | If granted overlay | None                   | None              |
| View own analytics                  | Full  | Full      | Full               | Full               | N/A                    | None              |
| View team analytics                 | Full  | Full      | Own team(s)        | None               | None                   | None              |
| View company-wide analytics         | Full  | Full      | None               | None               | None                   | None              |
| Manage templates / content library  | Full  | Full      | Own team           | Own                | None                   | None              |
| Configure CPQ / pricing rules       | Full  | Full      | If granted         | None               | None                   | None              |
| Approve documents (workflow step)   | Full  | Full      | If in chain        | If in chain        | None                   | None              |
| Manage integrations                 | Full  | Full      | None               | None               | None                   | None              |
| Manage billing / subscription       | Full  | View only | None               | None               | None                   | None              |
| Manage users / roles                | Full  | Full      | Own team invites   | None               | None                   | None              |
| Configure security (SSO/2FA policy) | Full  | Full      | None               | None               | None                   | None              |
| Access / create API keys            | Full  | Full      | None               | None               | None                   | None              |
| Sign a document as requested signer | Full  | Full      | Full               | Full               | Full                   | Full              |
| View a document they're a party to  | Full  | Full      | Full               | Full               | Full                   | Full              |

---

## 5. Full Feature Inventory

### 5.1 Document Creation & Editing

- Block-based / drag-and-drop editor with live WYSIWYG rendering — no design skill required
- Brand kit (colors, fonts, logo, spacing rules) applied automatically to every new document
- Insertable blocks: text, images, native video upload + YouTube/Vidyard/Wistia/Loom embeds, tables, shapes, GIFs, spreadsheets, scheduling embeds, surveys
- Interactive ROI calculator block (buyer manipulates inputs, sees projected value live)
- Smart Sections/navigation — table-of-contents-style jump links, reusable across documents
- Smart Content — conditional-logic blocks that change wording, pricing, or entire sections based on recipient answers, location, or selected products
- Client input forms embeddable directly inside a document
- Reuse existing documents — bulk import from Word/PDF, individually or via CSV-driven bulk import
- DocX converter — turns an uploaded Word file into the native editable format
- Custom fields & variables, default + custom merge tags
- AI drafting panel (see 5.10) surfaced in the editor toolbar
- Two publishing models supported simultaneously: **(a) live web page** — one URL that stays editable after send, viewer sees the latest version on refresh; **(b) static snapshot** — required the instant any party signs (see Section 9, signature integrity)
- PDF export matching the live version, for offline/print needs
- Fully responsive rendering on any device

### 5.2 Templates & Content Library

- Unlimited saved templates in folders, with drag-and-drop organization, permissions, and bulk delete
- Pre-built template gallery categorized by industry (design, marketing, software/IT, consulting, real estate, construction, events, coaching, nonprofit, etc.) and by document type (Proposals, Quotes, Online Brochures, Statement of Work, Contracts, Sign-Offs, Job Offers)
- Sales-methodology templates: MEDDIC, MEDDPICC, SPIN Selling, Sandler, BANT, Gap Selling
- Sales-process templates: Mutual Action Plan, Digital Sales Room, QBR, Implementation Plan, Customer Onboarding Plan, Proof of Concept, Demo Follow-up, outbound BDR/SDR, competitor battlecards
- Content Library — reusable blocks/snippets/images/case studies, insertable into any document independent of full templates
- Per-template default settings baked in (expiry rules, access rules) so anything generated from that template inherits them
- "Save any finished document as a new template," including predefined variable fields and signer roles
- Paid, done-for-you template design service

### 5.3 Branding & White-Label

- Unlimited brand profiles/kits, one selectable per send
- Custom domain so documents appear to come from the sender's own domain
- Email white-labeling — notifications sent from the org's own domain/sender identity
- Remove-platform-badge — full white-label, no mention of the underlying platform client-side
- Custom document-type naming
- Multi-currency selling
- 1,500+ Google Fonts, Adobe Fonts sync, custom font upload
- Built-in stock image library

### 5.4 Quoting & CPQ

- Interactive pricing tables — recalculating totals, discounts, quantities, one-off vs. recurring pricing, add-ons and packages
- Buyer self-service: prospect can change quantities or select optional add-ons themselves inside the document
- Two presentation formats — traditional line-item quote table, or tiered pricing-plan cards — usable separately or combined
- Product/service catalog — central SKU list with pricing, built item-by-item or bulk-uploaded via spreadsheet
- Fee/pricing library — searchable, filterable, sortable, so reps quote from approved numbers
- Discounting controls at the quote level and the line-item level
- Full CPQ layer: product bundles, a pricing/discount rules engine, guided-selling playbooks, approval thresholds triggered by deal size or discount depth
- Native two-way-synced CPQ experience embedded directly inside connected CRMs
- Version control on quotes — only the current version can be signed
- Quote-to-contract conversion without re-keying data

### 5.5 E-Signature & Agreements

- Multiple signing methods: type, draw, or a customizable one-click "accept without signing" button
- Multi-signee support with per-signer status and a defined signing order for sequenced approvals
- Countersigning; unknown/not-yet-identified signees (add a signer role now, name them later)
- Recipient/identity verification: passcode, SMS code, knowledge-based authentication, government-ID-document challenge
- Qualified Electronic Signature (QES) — the highest eIDAS tier
- Clause-level initials, not just an end-of-document signature
- "Agreements" blocks — plain-text, print-friendly T&C/NDA content, styleable independent of the interactive content around it
- X.509-based digital signature certificate attached to every signed document
- Full audit trail: signer contact details, IP address, device, timestamp of first visit, every notification sent, delivered to all parties as a downloadable record on completion
- In-person signing on a shared device; custom branded signing URLs
- Legal-framework compliance: US ESIGN Act, UETA, EU eIDAS/QES
- Remote Online Notarization (RON) as a distinct licensed add-on: live audio/video notary session, electronic notary journal with recordings, tamper-evident sealed document, support for the business's own in-house notaries

### 5.6 Payments

- Pay at the moment of acceptance, inside the same page that was signed — no separate invoicing step
- Payment methods: credit card, direct debit, ACH/bank transfer
- Partial payments, full payment, deposits, and recurring/subscription billing with configurable frequency, duration, and optional trial period
- Support for additional gateways beyond the primary rail for buyers who need a specific processor
- Multi-currency billing
- Account-wide payment rules: admins define when buyers pay, whether installments are offered, who can enable payments
- Payments dashboard: pending, completed, and failed transactions tied back to source documents
- Optional platform take-rate (basis-point markup on processed volume) as secondary revenue
- Automatic invoice generation in a connected accounting tool once a document is accepted

### 5.7 Post-Signature Onboarding & Workflow Automation

- Auto-onboarding the instant a client signs, replacing manual follow-up chains
- Five reorderable onboarding step types, inheriting the document's branding: **Forms** (custom data collection, auto-CC to staff), **Payment** (deposit/subscription, fixed or auto-calculated from the pricing table), **Content** (thank-you/next-steps), **Call Booking** (scheduling-tool integration), **Redirect** (send the client to any URL on completion)
- Semi-automated "nudge" follow-up: surfaces only accounts needing a nudge today, previews a pre-written editable email, opens it in the rep's own client rather than auto-sending, runs on a defined schedule that can differ by document type
- Rule-based workflow automation: move a document to a folder, push to cloud storage, change a CRM stage, or start another document once a status changes
- Conditional approval workflows: route only when a rule is met (discount above X%, deal value above $Y), auto-approve otherwise; named approvers/groups; act from any device; comment on reject
- Automatic document expiry/auto-archive after a chosen period
- Automated reminders on inactivity or approaching expiry
- Bulk send — personalize and send one template to hundreds of recipients from a CSV list
- Document bundling — group multiple documents into a single send/signing transaction
- Multi-channel delivery: email, shareable link, or SMS

### 5.8 Tracking, Analytics & Reporting

- Document- and section-level engagement tracking: opens, total views, time per section, activity timeline, links clicked, downloads
- Stakeholder/forwarding tracking — every viewer tracked, including internal forwards, surfacing hidden decision-makers
- Anonymous-viewer identification — prompts an unknown visitor for name/email, then tracks that person specifically
- Real-time notifications: opens, signature completion, payment events, a signer stalling mid-signature, a brand-new viewer, internal forwarding
- Proprietary engagement scoring: flags a previously active buyer going quiet ("disengaged") or a stalled deal re-opening ("re-engaged")
- Buying-committee-level reporting for Deal Rooms — the whole group's engagement, not one contact
- Company, team, and individual performance reports: who sold what, conversion rates, which templates convert best
- Manager overview surfacing overdue follow-ups
- Full exportable, filterable document table (CSV); scheduled/on-demand custom reports on higher tiers
- Complete audit trail of who viewed, edited, commented on, and signed each document, and when

### 5.9 Collaboration & Team Management

- Real-time, Google-Docs-style co-editing with live cursors
- Inline threaded comments and a "suggest edits" mode
- Content locking on specific sections while leaving the rest editable
- Roles/permissions down to the individual page or page-element level
- Multi-workspace support for franchises, child companies, or departments, with parent-account oversight and shared asset libraries
- Folder-level permissions controlling which reps/teams can see or use which templates and automations

### 5.10 AI Features

- In-editor AI writing assistant: prompt, write, refine, fix grammar, condense
- Content generation from raw input — paste call notes, transcripts, or rough requirements, get drafted content back
- Targeted drafting: executive summaries, cover letters, scopes of work, project approaches
- Guided, form-based AI proposal builder: a rep answers a short set of questions and the engine assembles a complete document, pulling live CRM data at build time
- AI extraction from unstructured sources (call transcripts, meeting notes) so reps don't manually re-key discovery information
- AI-driven Conditional Content: content, pricing, and structure change automatically based on answers or deal attributes
- Admin-configured AI guardrails: which data sources are usable, where AI is allowed, which content varies by which inputs
- A free, no-login "URL-to-draft" tool: paste any company's website, get a ready-to-edit first draft
- Conversational AI Assistant across the account: search documents in plain language, ask about contract terms, summarize without opening, get activity reports via chat, manage the catalog via chat, auto-organize files, extend an expiration or draft a reminder on request
- AI Data Extraction: auto-detects document type and extracts 100+ structured fields (dates, value, renewal terms, parties) into a queryable panel — PDFs, OCR'd scans, and native documents, multiple languages
- Explicit governance statement that customer content is not used to train underlying models

### 5.11 Deal Rooms / Digital Sales Rooms

- A shared, branded workspace where buyer and seller exchange documents, video, and messages, and complete a deal end-to-end in one URL instead of an email thread
- Also usable for onboarding, hiring, or any multi-step process needing a persistent shared space
- Mutual Action Plan tracking (collaborative deal-milestone timeline) embeddable inside the room
- All-parties activity visibility — the whole buying committee, not one contact

### 5.12 Standalone Forms

- No-code web forms shareable by link or embeddable on a website, independent of the document flow
- Used for intake, applications, job onboarding, registrations, feedback, or donations
- Supports signing order, payment collection, multiple roles, reusable templates
- Edits to a published form apply going forward without breaking existing submissions

### 5.13 Integrations & API

- Native two-way-sync CRM integrations (Salesforce and HubSpot at minimum; broader native support for Pipedrive, Zoho, Microsoft Dynamics 365)
- Payment gateways beyond the primary rail for buyers needing a specific processor
- Accounting integrations with automatic invoice generation on acceptance
- Project-management integrations: auto-create a project once signed
- Live chat/support embeds inside a sent document
- Productivity integrations: Slack, Google Workspace/Gmail, Microsoft Teams, Dropbox/Drive
- Zapier (or equivalent) for long-tail automation
- Full REST API across the document lifecycle: create from template, list/filter, change status, transfer ownership, send/share
- Embedded/white-labeled editing API and embedded/request signing API
- Webhooks for real-time event pushes
- SDKs, Postman collection, sandbox, OpenAPI spec
- An MCP connector so AI agents can trigger document/signature/workflow actions directly
- SSO (OAuth on every plan, SAML on higher tiers) and, eventually, SCIM provisioning

### 5.14 Security, Compliance & Trust

- SOC 2 Type II, independently audited, continuously monitored
- GDPR with a Data Processing Addendum on request; CCPA
- PCI-DSS via the payment processor
- HIPAA with a BAA (Enterprise add-on), FERPA for education, 21 CFR Part 11 optional workspaces
- AES-256 encryption at rest and in transit, encrypted daily backups, FIPS-validated signing cryptography
- Isolated network segments, least-privilege 2FA-gated employee access, OWASP-informed secure coding, 24/7 monitoring
- Data residency choice with a defined post-cancellation deletion timeline
- Annual penetration testing and a public Vulnerability Disclosure Program
- Public trust dashboard and status page
- Buyer-side access controls: password protection, link expiry, view-count limits, domain-restricted access, identity verification
- Incident-notification process for affected account admins

### 5.15 Admin, Billing & Account Settings

- User/seat management: add/remove, roles, bulk invite
- Plan management: usage vs. limits, upgrade/downgrade, seat add/remove, invoices, add-ons
- Custom roles and granular admin-panel permissioning (Enterprise)
- Team/workspace administration
- API key issuance and webhook configuration
- Audit-log export for compliance review

### 5.16 Mobile Apps

- Create, edit, send, track, and e-sign from iOS/Android
- Camera-scan a paper document, or upload an existing PDF
- Full dashboard access, not just a signing-only view
- Real-time push alerts
- On-device personal signature storage; in-person signing on a shared device
- Recipients view and sign from a mobile browser with no install and no account

### 5.17 Support Operations

- Tiered support: self-serve help center → email → live chat → dedicated CSM → priority/professional services
- Structured onboarding packages, lighter through white-glove
- Paid professional services: bulk document conversion, custom template design, ROI-calculator builds, integration setup help
- Self-paced training library
- Content/education arm (blog, guides, benchmark reports, case studies) — an ongoing operational commitment, not a build item

### Additions sourced from DocuSign (not present in the original four)

DocuSign sells two product lines: base **eSignature** plans (Personal → Standard → Business Pro → Enhanced) for straightforward send-and-sign, and **Intelligent Agreement Management (IAM)** plans layered on top of eSignature — IAM Starter ("individuals managing agreements with AI"), IAM Standard and IAM Professional ("teams... with a repository and AI" / "scaling workflows with forms, automation, and AI"), and IAM Enterprise. The IAM layer is where five genuinely distinct capabilities live — none of them present in Proposify, PandaDoc, Qwilr, or Better Proposals as documented earlier in this blueprint. They're numbered into the module list below, with the source DocuSign product named for traceability.

### 5.18 Portfolio Agreement Intelligence (DocuSign Navigator)

- Auto-ingests every executed agreement into one centralized, searchable repository the moment it's signed — not read-one-document-at-a-time, the entire back-catalog as a standing asset
- AI-assisted extraction at portfolio scale, including admin-defined _custom_ extraction fields, not just a fixed field set
- Cross-document search by attribute, keyword, or related term — "every agreement with this counterparty," "everything expiring next quarter" — not search within one document
- Party/relationship management: track and locate every agreement tied to a specific counterparty, surfacing relationship history at a glance
- Obligation management: automatically surfaces and tracks key contractual obligations (renewals, deliverables, deadlines) with automated notifications, instead of relying on someone remembering to check
- AI-generated, customizable reports and dashboards across the whole portfolio
- This is a different capability tier from the per-document AI Data Extraction already in 5.10: that reads one document; this manages the entire agreement back-catalog as a strategic, queryable asset

### 5.19 End-to-End Workflow Orchestration (DocuSign Maestro)

- A dedicated, no-code, visual workflow builder spanning the _entire_ agreement lifecycle — creation, internal approval, e-signature, and post-signature action — as one connected flow, not separate rule-based triggers stitched together
- Native, deep integration into enterprise systems beyond CRM: ITSM tools and ERP systems, so an agreement workflow can kick off from — or write back into — a company's core systems of record
- A risk-assessment step can be inserted directly into a workflow, dynamically routing a participant to stronger or lighter identity verification based on a real-time score (ties to 5.20)
- Full visibility into every workflow instance in flight, cutting manual handoffs between teams
- Workflow count is a real packaging lever DocuSign uses directly (a small number of workflows on the entry IAM tier, more on higher tiers) — worth adopting as a metered dimension rather than an all-or-nothing gate

### 5.20 Risk-Adaptive Identity Verification (DocuSign Identify)

- Goes beyond the fixed menu of verification methods already specified in 5.5 (passcode/SMS/KBA/ID-document): this layer _automatically selects_ which method to apply per recipient, in real time, based on a computed fraud-risk score
- Biometric liveness detection — selfie matched against the ID photo, checking for spoofing and deepfakes, not just a static document upload
- Instant verification against a large pre-verified-user network, skipping repeat verification for recognized individuals
- A formal, exportable proof-of-verification file (method used, result, supporting evidence) built to a named assurance standard, for regulatory contexts like AML/KYC — a compliance artifact, not just an audit-trail line item
- Sits on top of, and is genuinely distinct from, the base identity-verification methods already specified in 5.5

### 5.21 Account-Level Security Monitoring (DocuSign Monitor)

- Watches for suspicious activity _across the account_, not within one document: unusual login patterns, unauthorized access attempts, anomalous sending behavior
- Alerts on detected threats, with chain-of-custody tracking
- Sits above the per-document SignatureEvent audit trail already in Section 6 — this is account-wide anomaly detection, not document-level history

### 5.22 Standalone Consent Capture / Clickwrap (DocuSign Click)

- A separate, lightweight product for standardized, non-negotiable terms (terms of service, privacy policy, waivers, attestations): a single checkbox or button embedded on a website or app, or sent via a link — not a full document workflow
- Supports both high-volume one-to-many capture and personalized one-to-one variants (auto-inserting name, company, date into an otherwise-standard agreement)
- Automatic version control: tracks exactly who agreed to which version and when — essential the moment terms change, since past acceptances must never be silently reattributed to a new version
- Its own dedicated audit trail and REST API, independent of the main document/e-signature flow
- Meaningfully different from the "accept without signing" button already in 5.5, which is built for one negotiated deal — this is built to sit on a public site and capture consent from anyone, at any volume, with zero per-recipient setup

---

## 6. Core Data Model

**Organization** — the billing entity: name, billing details, Subscription, exactly one Owner.

**Workspace** — optional sub-division (franchise/department/child company) of an Organization: own branding defaults, own template/content-library scope, own reporting roll-up.

**Team** — a group within a Workspace with a Manager and many Users.

**User** — one Role _per Workspace_, profile, auth/SSO identity, seat type (full or collaborator).

**Document** — the central entity. Polymorphic `type`: proposal | quote | contract | brochure | sow | sign_off | job_offer | form. Belongs to a Workspace; has an owner (User); has many DocumentVersions; has zero-or-one PricingTable; has many SignatureRequests, Comments, and AnalyticsEvents; has a status (draft/sent/viewed/signed/declined/expired/archived); references the Template it was created from (a copy, not a live link — see Section 9); optionally belongs to a DealRoom.

**DocumentVersion** — an immutable content snapshot. The signed version is a permanent, hashed, locked DocumentVersion that can never be mutated.

**Template** — reusable starting point: category/industry tags, default settings (expiry, access rules), variable-field definitions, predefined signer roles.

**ContentBlock** — a reusable snippet (case study, bio, clause, image), tracked by which templates/documents currently reference it.

**PricingTable** — belongs to a Document; has many LineItems, each referencing a ProductCatalogItem or free text; supports discount rules.

**ProductCatalogItem** — org-level SKU/service/price definition used by PricingTable and CPQ.

**SignatureRequest** — belongs to a Document; has many Signers in a defined order; status (pending/completed/declined/voided).

**Signer** — a User or External party attached to a SignatureRequest: verification method, captured signature data, IP/timestamp, status.

**SignatureEvent** — an immutable audit-log row: who did what, when, from where. The backbone of the audit trail.

**Payment** — belongs to a Document or stands alone; references a ConnectedAccount; has amount, currency, status, recurring schedule if applicable.

**ConnectedAccount** — the org's payment-processor connection (e.g., a Stripe Connect account); holds processor-side identifiers only, never raw card data.

**Subscription** — the Organization's own plan, seat counts by type, add-ons, billing cycle.

**Integration/Connection** — a configured link to a third-party system: OAuth tokens, sync rules, health status.

**Webhook** — an org-configured outbound event subscription.

**AutomationRule** — a stored trigger + condition + action definition.

**ApprovalChain / ApprovalStep** — an ordered sequence of required approvers for documents matching given conditions.

**Comment** — threaded, attached to a Document and optionally a specific block within it.

**AnalyticsEvent** — a raw event row (view, section-view, click, download). High-volume; belongs in an analytics-optimized store, not the primary relational database, from day one.

**DealRoom** — groups multiple Documents, Users, and External parties into one persistent multi-party workspace.

**FormSubmission** — a completed instance of a standalone Form.

**APIKey** — a scoped credential tied to an Organization or integration identity.

**AuditLogEntry** — org-level administrative audit trail (settings changes, user changes, permission changes) — distinct from the document-specific SignatureEvent trail.

**ObligationRecord** _(from 5.18)_ — an AI-extracted or manually tagged tracked obligation (renewal date, deliverable, deadline) tied to a Document, driving automated reminders independent of any one person remembering to check.

**RiskAssessment** _(from 5.20)_ — a computed fraud-risk score for a given Signer/session, determining which verification method gets applied; referenced by Signer, optionally by a workflow step in AutomationRule.

**SecurityAlert** _(from 5.21)_ — an account-level anomaly-detection record (suspicious login, unusual sending pattern); distinct from AuditLogEntry, which records deliberate admin actions rather than detected anomalies.

**ClickwrapAgreement / ClickwrapVersion / ClickwrapAcceptance** _(from 5.22)_ — a standalone, lighter-weight agreement type separate from Document: no editor, no pricing table, no multi-step SignatureRequest. ClickwrapVersion captures each edition of the terms; ClickwrapAcceptance is an immutable record of exactly which version a given person accepted and when — never re-pointed to a newer version after the fact.

Two relationship rules worth locking in architecturally before you write a line of editor code: a Document's link to its Template is copy-on-create, not live, unless a document is explicitly flagged as template-linked; and once any SignatureEvent exists for a Document, its current DocumentVersion becomes immutable — all further changes produce a new version through an explicit amendment flow, never an in-place edit.

---

## 7. Tier & Packaging Map

| Tier             | Adds (on top of the previous tier)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Typical buyer                    |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| **Free**         | Full editor, 1 seat, capped documents/month, basic e-sign (type/draw only), PDF export, 1 brand kit, help-center-only support                                                                                                                                                                                                                                                                                                                                                                                                                | Individual testing the product   |
| **Starter**      | Multiple seats, higher/uncapped sends, Content Library, unlimited templates, custom domain, basic tracking (opens, no section detail), payments via the primary gateway, 1-2 native CRM integrations, Zapier, email support, 2FA, mobile app, standalone consent capture/clickwrap (5.22 — cheap to build, broadly useful, don't gate it high)                                                                                                                                                                                               | Freelancers, small teams         |
| **Professional** | Section-level analytics, in-editor AI writing assistant, CPQ-lite (catalog + basic discounting), simple approval workflows, limited Deal Rooms, collaborator seats, real-time co-editing, content locking, custom fonts, multi-currency, live chat support, basic workflow automation, nudge-style follow-up, a capped number of end-to-end workflow-orchestration flows (5.19, e.g. 1-3)                                                                                                                                                    | Growing sales teams              |
| **Business**     | Full CPQ (bundles, rules engine, approval thresholds, native CRM-embedded CPQ), full workflow automation with a higher orchestration-flow cap (5.19), guided AI proposal builder + AI data extraction, portfolio agreement intelligence (5.18), risk-adaptive identity verification (5.20), unlimited Deal Rooms, multi-workspace, team-level permissions, SAML SSO, advanced analytics retention + custom reports, priority/dedicated CSM, higher API limits, bulk send, document bundling, in-person signing, ID-verification signing, QES | Mid-market, multi-team orgs      |
| **Enterprise**   | HIPAA/FERPA/21 CFR Part 11 workspaces, Notary/RON, account-level security monitoring (5.21), custom roles & granular admin permissions, SCIM, data-residency choice, dedicated infra options, white-glove onboarding + professional services, enhanced API SLAs, MCP/agent connector, conversational AI Assistant, uncapped workflow orchestration and portfolio intelligence, uncapped everything, custom security review on request                                                                                                        | Regulated industries, large orgs |

---

## 8. Tech Stack

| Layer                              | Recommendation                                                                                                                                                       | Why / alternative                                                                                                                                                                       |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frontend                           | React + TypeScript (Next.js)                                                                                                                                         | Fits a block/canvas-heavy editor UI; one pipeline for marketing site + app                                                                                                              |
| Document editor engine             | Tiptap/ProseMirror + a custom canvas layer for pricing tables and interactive blocks                                                                                 | Building a competitive block editor from raw contentEditable is a multi-year trap                                                                                                       |
| Real-time collaboration            | Yjs (CRDT) over WebSockets, or a hosted service (Liveblocks/Hocuspocus)                                                                                              | CRDTs solve simultaneous-edit conflicts correctly; don't hand-roll operational transforms                                                                                               |
| Backend API                        | Node.js/TypeScript (NestJS), or Rails if the founding team is stronger there                                                                                         | Pick whichever the team knows well — differentiation here is workflow depth, not framework choice                                                                                       |
| Primary database                   | PostgreSQL                                                                                                                                                           | Relational integrity for accounts/billing/signatures; JSONB for flexible document content                                                                                               |
| Analytics/event store              | ClickHouse (or managed equivalent), separate from Postgres                                                                                                           | Section-level engagement events will be your highest-volume table by an order of magnitude — isolate early                                                                              |
| Caching/queues                     | Redis + BullMQ (or Sidekiq on Rails)                                                                                                                                 | Background jobs for PDF generation, email, webhook delivery, AI calls                                                                                                                   |
| Object storage                     | S3 (or S3-compatible)                                                                                                                                                | Documents, signed PDFs, uploaded media, notary recordings                                                                                                                               |
| Search                             | Postgres full-text to start; Meilisearch/Elasticsearch once libraries get large                                                                                      | Don't reach for Elasticsearch on day one                                                                                                                                                |
| PDF rendering                      | Headless-browser rendering (Playwright/Puppeteer)                                                                                                                    | Needed so exported PDFs match the live web-page version exactly                                                                                                                         |
| E-signature infrastructure         | Buy via an API-first e-signature provider                                                                                                                            | Already commoditized; the compliance/audit-trail liability of building it yourself isn't worth owning early                                                                             |
| Payments                           | Stripe, using Connect for the platform model                                                                                                                         | The same rail every company in this category already sits on                                                                                                                            |
| Auth/SSO/SAML/SCIM                 | Buy (WorkOS, Clerk, or Auth0)                                                                                                                                        | Enterprise identity is a deep, unglamorous rabbit hole — buy days of integration instead of months of build                                                                             |
| AI/LLM features                    | API calls to a hosted model provider + pgvector for retrieval-augmented drafting and library search                                                                  | Don't train or host your own model for v1                                                                                                                                               |
| Notary/RON infrastructure          | Buy via a specialized RON-compliant vendor if built at all                                                                                                           | MISMO certification and notary law are their own specialized business — easiest module to defer entirely                                                                                |
| Infra/hosting                      | AWS or GCP, containerized; Kubernetes once scale justifies it, a PaaS (Render/Fly.io) before that                                                                    | Match infra complexity to team size, not to the incumbents' scale                                                                                                                       |
| CDN                                | CloudFront or Cloudflare                                                                                                                                             | Recipient-facing viewing pages need to load fast globally                                                                                                                               |
| Observability                      | Sentry (errors) + Grafana/Datadog (metrics/logs)                                                                                                                     | Non-negotiable once customers' signed legal documents depend on your system                                                                                                             |
| Compliance tooling                 | Vanta or Drata once pursuing SOC 2                                                                                                                                   | Not a v1 cost, but design the audit-log architecture from day one so this doesn't mean a rebuild later                                                                                  |
| Fraud/risk scoring (5.20)          | Buy via a specialized identity-risk vendor rather than build your own scoring model                                                                                  | Real-time fraud-risk scoring is its own deep specialty (device fingerprinting, network reputation, behavioral signals) — treat it like e-signature infrastructure: commoditized, buy it |
| Portfolio search/extraction (5.18) | Extend the pgvector setup already used for AI drafting into a dedicated cross-document index, keyed by counterparty/date/value metadata pulled out at ingestion time | The same embedding infrastructure that powers AI drafting can power "search every agreement with this party" once you add structured metadata extraction on top                         |

---

## 9. Edge Cases

**Signature integrity & document lifecycle**

- The "live editable page" model applies only _pre-signature_. The instant the first signature is captured, that DocumentVersion becomes immutable and hash-sealed — any further change is a new, explicit amendment, never an in-place edit, or every signature you've ever collected is legally worthless.
- If a sender tries to edit after only some signers have signed: lock content the moment any signature exists; allow edits only to sections explicitly marked non-substantive, if you support that at all.
- Template updates must not retroactively alter documents already created from that template — content is copied at creation time unless a document is explicitly flagged as template-linked (a separate, deliberate feature).
- Give "declined," "expired," and "voided" distinct terminal states with distinct notification behavior — don't collapse them into one status.
- Signer substitution mid-process needs an explicit "reassign signer" action that preserves the original invitation's audit trail and timestamps the substitution itself.

**Seats & billing**

- Pending invites reserve a seat immediately, so a seat cap can't be gamed by leaving invitations unaccepted.
- Decide proration rules for removing a seat mid-cycle (credit vs. no refund vs. applies at renewal) as a written policy before support tickets force an ad hoc answer.
- Choose one policy deliberately for hitting a document/send cap mid-month — hard block, automatic overage billing, or a soft warning with grace period. Advertising "unlimited" while quietly charging overage fees is a real, visible trust problem in this category today; don't inherit it by accident.
- Decide whether a user in multiple Workspaces consumes one seat per Workspace or one account-wide (default to account-wide unless Workspaces are sold as fully separate sub-accounts).
- Define whether a Collaborator can be temporarily upgraded to send a single document, and how that's billed — don't leave it undefined until a customer asks.

**Payments**

- A deauthorized connected payment account with an active recurring charge needs automatic dunning/notification to both sender and admin, not a silent failure.
- Validate currency support against the connected processor _before_ send, not at the moment of a failed charge.
- Define ownership of chargeback/dispute handling explicitly (platform-mediated vs. purely between the two parties via the processor).

**Data retention & compliance**

- GDPR's "right to be forgotten" directly conflicts with the legal obligation to retain signed contracts as evidence. Resolve this in policy: signed documents and their audit trails are retained per legal requirement even after an erasure request; only non-essential personal data (marketing preferences, unused drafts) is actually purged.
- Data-residency promises must be enforced for _every_ dependent service (email delivery, AI API calls, analytics pipeline) — one US-region third-party call breaks an "EU data stays in the EU" promise even if the primary database is correctly located.

**Access control**

- Define view-counting logic explicitly (session-based, not raw page-load) before combining password protection, domain restriction, and view limits — they interact in confusing ways otherwise.
- A forwarded link reaching someone outside a domain restriction should fail into a clear "request access" flow back to the sender, not a raw error page.
- Custom-domain SSL/DNS misconfiguration needs a monitored fallback (serve from the default domain, alert the admin) rather than a broken page for the recipient.

**Approvals & workflow automation**

- An approver leaving or being deactivated mid-chain needs automatic reassignment or escalation, not an indefinitely stalled document.
- Build loop detection for automation rules before launch (rule A triggers rule B triggers rule A) — this will get hit by a real customer, not just a hypothetical one.

**Integrations & API**

- Webhook delivery needs retry-with-backoff and an idempotency key on every event — a duplicated "signed" or "paid" event firing twice into a customer's CRM causes real damage (duplicate deals, double invoices).
- Define a per-field conflict policy (last-write-wins vs. flag-for-review) for CRM sync conflicts — don't apply one global rule to every field.

**Internationalization**

- Always display expiry/deadline times in the signer's local time zone, with a UTC-anchored value stored server-side — never reason about a bare time without an attached zone.
- Decide explicitly whether translation covers just the app's UI chrome, or also document content and outbound emails — these are two different, both-real asks, and conflating them is a documented gap even among the mature players in this category.

**Risk scoring, portfolio intelligence & clickwrap** _(new with 5.18-5.22)_

- If the third-party fraud-risk-scoring service (5.20) is unreachable, fail to a conservative fixed verification method — never fail open (skip verification) and never hard-block all signing account-wide over one vendor outage.
- When a Document is later amended, decide explicitly whether its linked ObligationRecords (5.18) update automatically or require manual review — auto-updating a renewal date from an unreviewed AI re-extraction is a real source of missed deadlines, not a convenience.
- A ClickwrapAcceptance (5.22) must never be reattributed to a newer ClickwrapVersion after the fact, even if the older version is deleted from active use — the whole legal value of the record is proving what a specific person agreed to at a specific time.
- SecurityAlerts (5.21) need a defined severity/escalation policy before launch — an undifferentiated flood of low-signal alerts trains admins to ignore the channel entirely, which defeats the feature.

---

## 10. Build Sequencing

Every feature above eventually ships in the full combined product this blueprint describes — this section is purely about dependency order and time-to-first-revenue, not about which features matter most.

**Phase 0 — Foundation.** Organization/Workspace/User/Role data model, auth with seat logic, a basic editor (text/image blocks), PDF export, e-signature via a bought API (type/draw, audit trail, ESIGN/UETA compliance), Stripe Connect payment collection, Documents Hub, Home Dashboard. This alone is a sellable v1.

**Phase 1 — A real sales tool.** Templates + Content Library, interactive pricing tables, basic tracking (opens, time-on-page), notifications, custom domain, brand kits, multi-user roles, one CRM integration, mobile-responsive recipient viewing page.

**Phase 2 — Depth that creates switching cost.** Section-level analytics, real-time co-editing, comments/content locking, simple approval workflows, document expiry/reminders, nudge-style follow-up automation, in-editor AI drafting, Zapier, basic CPQ (catalog + discounting), standalone consent capture/clickwrap (5.22 — self-contained, doesn't block anything else).

**Phase 3 — Scale/enterprise readiness.** Full CPQ, a workflow automation engine with full cross-system orchestration (not just internal rules — this is where 5.19 lands), Deal Rooms, guided AI proposal builder, AI data extraction, ID-verification signing methods (KBA/ID-document/QES), portfolio agreement intelligence (5.18, built on the AI-extraction infrastructure above), risk-adaptive identity verification (5.20, layers on top of the ID-verification methods just added), multi-workspace, SAML SSO, SOC 2 audit, advanced/custom reporting, standalone Forms, full webhooks/API, mobile apps.

**Phase 4 — The long tail.** Build only once there's clear, specific demand pulling for it: Notary/RON, HIPAA/FERPA/21 CFR Part 11 workspaces, account-level security monitoring (5.21), the conversational AI Assistant, the MCP/agent connector, SCIM, full document-content translation, white-glove professional services.
