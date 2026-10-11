# PactIntel Design System

**Version:** 1.0.0-draft
**Date:** 2026-09-17
**Status:** DRAFT — Awaiting owner approval
**Companion documents:** [MASTER_IMPLEMENTATION_BLUEPRINT.md](file:///d:/Badrul/All%20files/Programming/Projects/pactintel2/docs/MASTER_IMPLEMENTATION_BLUEPRINT.md), [PRODUCT_BLUEPRINT.md](file:///d:/Badrul/All%20files/Programming/Projects/pactintel2/docs/PRODUCT_BLUEPRINT.md)

> [!IMPORTANT]
> This document governs all visual and interaction decisions for PactIntel. Any agent or engineer making UI changes MUST read this document before writing CSS, choosing colors, sizing type, or laying out components. If a decision isn't covered here, ask — don't improvise and don't fall back to "SaaS template" defaults.

---

## Table of Contents

1. [Design Rationale](#1-design-rationale)
2. [Color Palette](#2-color-palette)
3. [Typography](#3-typography)
4. [Spacing & Layout Grid](#4-spacing--layout-grid)
5. [Elevation & Borders](#5-elevation--borders)
6. [Border Radius](#6-border-radius)
7. [Icon System](#7-icon-system)
8. [Component Specifications](#8-component-specifications)
9. [Layout Patterns](#9-layout-patterns)
10. [Recipient-Facing Surfaces](#10-recipient-facing-surfaces)
11. [States: Empty, Loading, Error](#11-states-empty-loading-error)
12. [Motion & Animation](#12-motion--animation)
13. [Accessibility Floor](#13-accessibility-floor)
14. [Product Copy Conventions](#14-product-copy-conventions)
15. [Anti-Patterns (Explicitly Banned)](#15-anti-patterns-explicitly-banned)
16. [Research Notes](#16-research-notes)

---

## 1. Design Rationale

### What this product is

PactIntel is a document, proposal, quoting, e-signature, and contract-lifecycle platform used **all day** by sales reps, legal professionals, and operations teams. Its internal screens are dense with actionable data: signature statuses, deal values, approval chains, contract terms, payment states. Its external screens — the signing flow, recipient viewing page, payment collection — represent the sender's professionalism to their own clients.

### What the design must achieve

1. **Legibility at density.** Internal users scan hundreds of rows of data. The design must support sortable, filterable tables with status badges — not card grids standing in for tabular data.
2. **Content over decoration.** The actual content (signature status, deal value, contract terms) is more visually interesting than any decorative treatment. The design system clears the way for content, not competes with it.
3. **Restraint that signals competence.** Enterprise buyers assess software partly on visual sobriety. A design that looks like a marketing template undermines the trust the product exists to create.
4. **Consistency at scale.** This system will be implemented across 30+ screens by multiple agents over months. Every token, component, and pattern must be named, specified, and unambiguous.

### Design references (what informed these choices)

| Reference | What we took from it | What we deliberately did NOT take |
|-----------|---------------------|----------------------------------|
| **DocuSign** | The signing experience's focus on a single task with minimal chrome; the use of a single blue action color (Cobalt) against a mostly white/neutral interface; trust signals integrated into the flow rather than bolted on | Their gradient system (Pearl, Atmosphere, etc.), custom brand font, decorative color treatments |
| **Linear** | Information density achieved through luminance hierarchy rather than decoration; strategic use of a single accent color (lavender-blue) reserved exclusively for interactive elements; consistent 4px grid | Dark-mode-first approach (we're light-mode-first for document work), their near-black canvas |
| **Notion** | Clean workspace patterns; clear hierarchy between navigation and content; how semantic colors are used for status without overwhelming the interface; 8px corner radius for structured identity | Their pastel-tinted database card backgrounds, the "lego block" content model |
| **Papermark** | HSL-based CSS variable architecture (shadcn/ui pattern); sidebar + content layout; status badge pattern using `color/15%` background with `color-600` text; semantic variant system for components | Their orange brand color, Tremor chart library integration, some specific animation patterns |

---

## 2. Color Palette

### Design principle

One primary action color, used sparingly and exclusively for interactive elements. Everything else is neutral or semantic (status-driven). The palette is cool-toned — appropriate for a platform handling legal and financial documents, where warmth reads as casual.

### 2.1 Primary

| Token | Value | Usage |
|-------|-------|-------|
| `--color-primary` | `#2563EB` (Blue 600) | Primary buttons, active nav items, interactive links, focus rings |
| `--color-primary-hover` | `#1D4ED8` (Blue 700) | Primary button hover state |
| `--color-primary-subtle` | `#EFF6FF` (Blue 50) | Selected row background, active filter background |
| `--color-primary-muted` | `#DBEAFE` (Blue 100) | Selected badge background, tag highlight |

**Rationale:** Blue 600 (`#2563EB`) is a clean, saturated blue that reads as "action" without reading as "brand decoration." It passes WCAG AA contrast on white backgrounds (4.6:1). It's not the same shade as DocuSign Cobalt (theirs is darker), nor is it the electric blue common in AI SaaS templates. It sits in the established "trust/action" range that legal and financial users expect.

### 2.2 Neutrals (Cool Gray)

| Token | Value | Usage |
|-------|-------|-------|
| `--color-gray-950` | `#0C0F1D` | Page titles, table headers, primary text |
| `--color-gray-800` | `#1E293B` | Body text, emphasis secondary text |
| `--color-gray-600` | `#475569` | Secondary labels, descriptions |
| `--color-gray-500` | `#64748B` | Placeholder text, disabled text, meta information |
| `--color-gray-400` | `#94A3B8` | Icons (inactive), subtle dividers |
| `--color-gray-200` | `#E2E8F0` | Borders, dividers, table row separators |
| `--color-gray-100` | `#F1F5F9` | Table header background, sidebar background, input backgrounds |
| `--color-gray-50` | `#F8FAFC` | Page background (main content area), hover rows |
| `--color-white` | `#FFFFFF` | Card/panel backgrounds, input fields, recipient page background |

**Rationale:** Slate-based cool grays (not warm grays, not pure neutral grays) provide a professional, slightly blue-tinted backdrop that harmonizes with the blue primary without introducing visible warmth. This avoids the "cream-and-something" cliché. The gray scale has 9 stops — enough to express the luminance hierarchy that Linear uses for density without decoration.

### 2.3 Semantic / Status Colors

These colors communicate document and workflow states. They appear ONLY in status badges, status dots, and inline status indicators — never as decorative backgrounds.

| Token | Background | Text | Dot/Icon | Meaning |
|-------|-----------|------|----------|---------|
| `--status-success` | `#F0FDF4` | `#15803D` | `#22C55E` | Signed, Completed, Active, Paid |
| `--status-warning` | `#FFFBEB` | `#B45309` | `#F59E0B` | Pending, Awaiting signature, Expiring soon |
| `--status-error` | `#FEF2F2` | `#B91C1C` | `#EF4444` | Declined, Failed, Expired, Overdue |
| `--status-info` | `#EFF6FF` | `#1E40AF` | `#3B82F6` | Viewed, In review, Sent |
| `--status-neutral` | `#F1F5F9` | `#475569` | `#94A3B8` | Draft, Archived, Inactive |

**Badge format:** Background at `color-50` or `color/15%`, text at `color-700`, small leading dot or icon at `color-500`. No border. Font: 12px/500 weight. Padding: 2px 8px. Border-radius: 4px (not full-round pills — pills read as tags, not status indicators).

**Rationale:** This is the Papermark pattern (`bg-green-500/[.15] text-green-600`) but with our specific palette values. Each status color was chosen for clear differentiation at a glance — green for "complete/good," amber for "needs attention," red for "problem," blue for "information/in progress," gray for "inactive." These are not creative choices; they are learned conventions in enterprise software.

### 2.4 Surface Colors

| Token | Value | Usage |
|-------|-------|-------|
| `--surface-page` | `#F8FAFC` (Gray 50) | Main content background |
| `--surface-card` | `#FFFFFF` | Cards, panels, modals, popovers |
| `--surface-sidebar` | `#F1F5F9` (Gray 100) | Sidebar background |
| `--surface-overlay` | `rgba(15, 23, 42, 0.5)` | Modal/dialog backdrop |
| `--surface-input` | `#FFFFFF` | Input fields, text areas |

### 2.5 Dark Mode (Phase 2)

Dark mode is not in Phase 0-1. When implemented, it follows the Papermark pattern: invert semantic tokens via `.dark` class on the root element. Key principle: dark mode is NOT "near-black canvas with neon accent" (the Linear aesthetic). It is "dark gray canvas with muted colors" — appropriate for a document platform where the document itself should be the brightest element on screen.

Dark mode base values (for planning, not immediate implementation):
- Background: `#0F172A` (Slate 900), not `#000000`
- Card surface: `#1E293B` (Slate 800)
- Text: `#F1F5F9` (Slate 100)
- Borders: `#334155` (Slate 700)
- Primary action: `#60A5FA` (Blue 400, lightened for contrast on dark)

---

## 3. Typography

### Design principle

One typeface family, two weights for body, one for headings. Real hierarchy comes from size and weight differences, not decorative variations. Document content is readable for extended sessions.

### 3.1 Typeface

**Inter** — variable font, loaded from Google Fonts.

```css
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap');
```

**Why Inter:**
- Designed specifically for computer screens with taller x-height and open apertures.
- Industry standard across enterprise SaaS (Linear, Notion, Vercel, Supabase).
- Variable font allows precise weight control.
- Excellent rendering at small sizes (12-14px), which matters for data-dense tables.
- Free, no licensing cost, no custom font hosting.

**Why not a second font:**
- A single typeface family enforces consistency across 30+ screens built by multiple agents.
- Two fonts create decisions (which font where?) that agents will answer inconsistently.
- Inter covers the full range from 12px table cells to 30px page titles without needing a display font.

### 3.2 Type Scale

| Token | Size | Weight | Line Height | Tracking | Usage |
|-------|------|--------|-------------|----------|-------|
| `--text-page-title` | 24px | 600 | 32px (1.33) | -0.01em | Page titles: "Documents Hub", "Home Dashboard" |
| `--text-section-title` | 18px | 600 | 28px (1.56) | -0.005em | Section headings within a page |
| `--text-card-title` | 16px | 600 | 24px (1.5) | normal | Card/panel headers, modal titles |
| `--text-body` | 14px | 400 | 20px (1.43) | normal | Body text, descriptions, paragraph content |
| `--text-body-medium` | 14px | 500 | 20px (1.43) | normal | Emphasized body text, table cell values, nav items |
| `--text-small` | 13px | 400 | 18px (1.38) | normal | Table cells, metadata, timestamps |
| `--text-caption` | 12px | 500 | 16px (1.33) | 0.01em | Table headers, status badges, labels, helper text |
| `--text-overline` | 11px | 500 | 16px (1.45) | 0.03em | Section labels within sidebars (e.g., "WORKSPACE", "SETTINGS") — used sparingly, see anti-patterns |
| `--text-metric` | 30px | 600 | 36px (1.2) | -0.02em | Dashboard KPI values (total documents sent, total signed) |

**What "overline" means here vs. what it does NOT mean:**
The `--text-overline` token is used ONLY for sidebar section labels (the gray all-caps "DOCUMENTS", "SETTINGS" grouping headers in the sidebar nav). It is NOT used as an "eyebrow" above page titles. Page titles stand on their own — there is no "OVERVIEW" label above "Home Dashboard." See anti-patterns section.

### 3.3 Type Rules

1. **Maximum two weights visible simultaneously** on any single screen region. Body (400) and headings/emphasis (600). The 500 weight is for subtle emphasis within 400-weight text (nav items, table values that need to be scannable).
2. **No italic in the UI.** Italic is reserved for user-generated document content within the Tiptap editor.
3. **No underline except for inline text links** within body paragraphs. Navigation items, buttons, and action links do not use underline.
4. **Negative tracking only on large text** (24px+ page titles, 30px metrics). Body text and small text use `normal` or slightly positive tracking.
5. **Tabular numbers** (`font-variant-numeric: tabular-nums`) on all numeric data: deal values, dates, percentages, counts. This ensures columns align in tables.

---

## 4. Spacing & Layout Grid

### Design principle

A 4px base grid. Every padding, margin, and gap is a multiple of 4px. This creates rhythmic consistency without requiring designers or agents to make case-by-case spacing decisions.

### 4.1 Spacing Scale

| Token | Value | Common Usage |
|-------|-------|--------------|
| `--space-1` | 4px | Inline spacing between icon and label, gap within tight groups |
| `--space-2` | 8px | Padding inside badges, gap between small elements, inner input padding |
| `--space-3` | 12px | Table cell padding, gap between related items |
| `--space-4` | 16px | Card padding, section gap within a panel |
| `--space-5` | 20px | Gap between cards, sidebar item padding-left |
| `--space-6` | 24px | Page margin (horizontal), gap between major sections |
| `--space-8` | 32px | Large section separator, padding within spacious panels |
| `--space-10` | 40px | Page margin (top), vertical gap between page-level sections |
| `--space-12` | 48px | Only for the largest vertical separators (e.g., between page header and content) |

### 4.2 Layout Zones

| Zone | Width | Context |
|------|-------|---------|
| Sidebar | 240px (collapsed: 64px, icon-only) | Persistent left sidebar for logged-in app |
| Content area | Fluid, max-width 1280px, centered | Main content region |
| Table max-width | 100% of content area | Tables fill the content area, horizontal scroll on overflow |
| Recipient page | max-width 720px, centered | Signing flow, recipient viewing page (narrower for focused reading) |
| Modal (standard) | max-width 480px | Confirmation dialogs, simple forms |
| Modal (wide) | max-width 640px | Document preview, settings panels |
| Modal (full) | max-width 960px | Complex forms, multi-column settings |

### 4.3 Density Guidance

| Screen type | Density | Row height | Cell padding |
|-------------|---------|------------|-------------|
| **Data tables** (Documents Hub, Contracts, Payments) | Dense | 44px | 12px vertical, 16px horizontal |
| **Dashboard cards** | Medium | N/A | 16px all sides |
| **Settings forms** | Comfortable | N/A | 24px between fields |
| **Recipient page** | Spacious | N/A | 24-32px between sections |

---

## 5. Elevation & Borders

### Design principle

Structure is defined by borders, not shadows. Shadows are reserved for elements that float above the page plane (popovers, dropdowns, modals). This is a "flat with edges" system, not a "material with shadows" system.

### 5.1 Borders

| Token | Value | Usage |
|-------|-------|-------|
| `--border-default` | 1px solid `#E2E8F0` (Gray 200) | Card edges, table row separators, input borders, sidebar edge |
| `--border-subtle` | 1px solid `#F1F5F9` (Gray 100) | Internal dividers within a card, section separators |
| `--border-input-focus` | 2px solid `#2563EB` (Primary) | Focused input border — replaces the default border, does not add to it |
| `--border-error` | 1px solid `#EF4444` (Red 500) | Invalid input border |

### 5.2 Shadows

| Token | Value | Usage |
|-------|-------|-------|
| `--shadow-popover` | `0 4px 12px rgba(15, 23, 42, 0.08), 0 1px 3px rgba(15, 23, 42, 0.06)` | Dropdown menus, popovers, tooltips |
| `--shadow-modal` | `0 8px 24px rgba(15, 23, 42, 0.12), 0 2px 6px rgba(15, 23, 42, 0.06)` | Modal dialogs |
| `--shadow-toast` | `0 4px 12px rgba(15, 23, 42, 0.1)` | Toast notifications |

**That's it. Three shadow values.** Cards, panels, sections, sidebar — these have borders, not shadows. Tables have no shadow. The page itself has no shadow. If you're about to add `box-shadow` to a non-floating element, you're violating this system.

---

## 6. Border Radius

### Design principle

One radius value for interactive and container elements. Not zero (too harsh), not 12px+ (too soft, reads as consumer app).

| Token | Value | Usage |
|-------|-------|-------|
| `--radius-default` | 6px | Buttons, inputs, cards, panels, modals, dropdown items |
| `--radius-badge` | 4px | Status badges (not full-round pills) |
| `--radius-avatar` | 9999px (full circle) | User avatars, org logos |
| `--radius-none` | 0px | Table cells, full-width sections |

**Why 6px specifically:**
- 4px reads as slightly too mechanical (government forms).
- 8px is where "friendly consumer app" starts.
- 6px is the middle ground: structured but not rigid. It matches what Papermark uses (`--radius: 0.5rem` → 8px) but we deliberately go slightly tighter because our content (contracts, legal terms) benefits from a more structured feel.

---

## 7. Icon System

### Chosen library: Lucide

**Why Lucide:**
- Open source, MIT licensed, no cost.
- 1,500+ icons covering all our use cases (document states, payment methods, signature types, navigation).
- Consistent stroke weight (1.5px default) across the entire set.
- Used by Papermark, shadcn/ui, and many enterprise SaaS products.
- Tree-shakeable — only the icons we import are bundled.

### Icon sizing

| Size | Value | Usage |
|------|-------|-------|
| `--icon-sm` | 16px | Inline with small text (12-13px), inside badges, table row actions |
| `--icon-md` | 20px | Inline with body text (14px), sidebar nav items, button icons |
| `--icon-lg` | 24px | Page-level actions, empty state illustrations |

### Icon usage rules

1. **Stroke weight:** Always 1.5px (Lucide default). Never 1px (too thin at small sizes) or 2px (too heavy, reads as illustration).
2. **Color:** Icons inherit the text color of their parent element. Never color icons independently unless they are the status dot inside a badge (where the dot IS the icon).
3. **No decorative icons.** Icons are functional — they label an action, indicate a state, or help with navigation. They are not placed in empty whitespace for visual interest.
4. **Icon + text pairing:** When an icon accompanies text (e.g., sidebar nav item), the icon is on the left, 4px gap. The icon is vertically centered with the text, not top-aligned.

---

## 8. Component Specifications

### 8.1 Buttons

| Variant | Background | Text | Border | Usage |
|---------|-----------|------|--------|-------|
| **Primary** | `--color-primary` | White | None | Primary page action: "Send for signature", "Create document" |
| **Secondary** | White | `--color-gray-800` | `--border-default` | Secondary actions: "Cancel", "Save draft", "Export" |
| **Ghost** | Transparent | `--color-gray-600` | None | Tertiary actions, icon-only buttons, toolbar actions |
| **Destructive** | `--status-error` text color, transparent bg | `#B91C1C` | None (or `1px solid #FCA5A5` for emphasis) | "Delete", "Void", "Revoke" — always requires confirmation dialog |

**Button text rules:**
- Sentence case, never ALL CAPS: "Send for signature" not "SEND FOR SIGNATURE"
- No trailing arrows (→, ›, →) on button text. The button itself is the call to action.
- Verb-first, specific: "Create document" not "New" or "+" with no label
- Consistent verbs: "Send" (not "Submit" or "Dispatch"), "Create" (not "Add" or "New"), "Delete" (not "Remove" or "Discard")

**Button sizes:**
- Default: height 36px, padding 0 16px, 14px text
- Small: height 32px, padding 0 12px, 13px text
- Large: height 40px, padding 0 20px, 14px text

### 8.2 Status Badges

```
┌──────────────────────┐
│ ● Awaiting signature │  ← Status badge: amber
└──────────────────────┘
```

- Background: status color at 15% opacity (or the `color-50` swatch)
- Leading dot: 6px circle, status color at 100%
- Text: 12px, weight 500, status color at 700 shade
- Padding: 2px 8px
- Border-radius: 4px
- No border
- The dot is optional — some badges use an icon instead (checkmark for Signed, clock for Pending)

**Status badge values for document lifecycle:**

| Status | Dot | Background | Text |
|--------|-----|-----------|------|
| Draft | `#94A3B8` | `#F1F5F9` | `#475569` |
| Sent | `#3B82F6` | `#EFF6FF` | `#1E40AF` |
| Viewed | `#3B82F6` | `#EFF6FF` | `#1E40AF` |
| Signed | `#22C55E` | `#F0FDF4` | `#15803D` |
| Declined | `#EF4444` | `#FEF2F2` | `#B91C1C` |
| Expired | `#EF4444` | `#FEF2F2` | `#B91C1C` |
| Voided | `#94A3B8` | `#F1F5F9` | `#475569` |
| Awaiting signature | `#F59E0B` | `#FFFBEB` | `#B45309` |

### 8.3 Tables

Tables are the primary data pattern for the logged-in app. They are real HTML `<table>` elements (not card grids), sortable, filterable, with pagination.

**Table structure:**

```
┌─────────────────────────────────────────────────────────────────────┐
│  ☐  Name              Status          Sent          Value     ••• │ ← Header row: gray-100 bg, 12px/500 gray-600 text, uppercase: NO
├─────────────────────────────────────────────────────────────────────┤
│  ☐  Q4 Enterprise...  ● Signed       Sep 15, 2026  $48,000   ••• │ ← Data row: white bg, 13px/400 gray-800 text
│  ☐  MSA Renewal...    ● Sent         Sep 14, 2026  —         ••• │ ← Hover: gray-50 bg
│  ☐  SOW Phase 2...    ● Draft        —             $12,500   ••• │
└─────────────────────────────────────────────────────────────────────┘
                                                    ‹ 1 2 3 ... 12 ›  ← Pagination: text buttons, current page highlighted
```

**Table specifications:**
- Header row: background `--color-gray-100`, text `--text-caption` style (12px, 500 weight, `--color-gray-600`). NOT uppercase. NOT bold.
- Data rows: background white, border-bottom `--border-default`
- Row hover: `--color-gray-50` background
- Selected row: `--color-primary-subtle` background
- Cell padding: 12px vertical, 16px horizontal
- Row height: 44px (minimum, may expand for multi-line content)
- Column alignment: text left, numbers right, actions right (kebab menu)
- Empty column values: em dash (—), not "N/A" or blank

### 8.4 Navigation

**Sidebar (logged-in app):**
- Width: 240px, collapsible to 64px (icon-only)
- Background: `--surface-sidebar` (Gray 100)
- Right border: `--border-default`
- Nav items: 14px/500, `--color-gray-600`, 8px vertical padding, 12px left padding
- Active item: `--color-primary` text, `--color-primary-subtle` background, 2px left border accent
- Hover: `--color-gray-50` background
- Section labels: `--text-overline` style (11px/500, `--color-gray-400`, uppercase). Used ONLY for grouping labels ("WORKSPACE", "SETTINGS"), not as eyebrows above content.
- Org switcher at top, user profile at bottom
- Sidebar footer: usage progress bar (seat count, document count)

**Top bar:**
- Not a full navigation bar — the sidebar handles primary nav
- Contains: breadcrumb trail (current location), global search, notification bell, help menu
- Height: 48px
- Background: white, border-bottom `--border-default`
- Breadcrumbs: 13px, `--color-gray-500` for parent levels, `--color-gray-950` for current level, `/` separator (not `>` or `›`)

**Tab navigation (within a page):**
- For sub-sections within a screen (e.g., Document detail → Overview | Activity | Analytics)
- Style: underline tabs, not pill tabs. Active tab has 2px bottom border in `--color-primary`.
- Text: 14px/500, `--color-gray-500` inactive, `--color-gray-950` active

### 8.5 Forms & Inputs

- Input height: 36px
- Border: `--border-default`
- Border-radius: `--radius-default` (6px)
- Padding: 8px 12px
- Focus: border changes to `--border-input-focus` (2px blue), no shadow glow
- Placeholder: `--color-gray-400`, 14px, weight 400
- Label: 13px, weight 500, `--color-gray-800`, positioned above the input with 4px gap
- Helper text: 12px, weight 400, `--color-gray-500`, positioned below the input with 4px gap
- Error state: border `--border-error`, helper text in `--status-error` text color, error icon (Lucide `AlertCircle`) in the input

### 8.6 Cards & Panels

Cards are used for dashboard widgets, summary stats, and grouped content — NOT as a substitute for table rows.

- Background: `--surface-card` (white)
- Border: `--border-default` (1px solid Gray 200)
- Border-radius: `--radius-default` (6px)
- Padding: 16px
- No shadow. The border defines the card boundary.
- Card title: `--text-card-title` (16px/600)

### 8.7 Modals & Dialogs

- Overlay: `--surface-overlay`
- Card: white background, `--shadow-modal`, `--radius-default`
- Header: 18px/600 title, optional subtitle in 14px/400 `--color-gray-600`
- Actions: right-aligned, primary button on the right, secondary (Cancel) on the left
- Close button: top-right X icon, 20px, `--color-gray-400`, hover `--color-gray-800`

---

## 9. Layout Patterns

### 9.1 Internal App Shell

```
┌──────────┬────────────────────────────────────────────────────────┐
│          │  Breadcrumb / Search                        🔔  👤    │
│  SIDEBAR │──────────────────────────────────────────────────────│
│          │                                                      │
│  Logo    │  Page Title                        [Primary Action]  │
│  ────    │                                                      │
│  Nav     │  ┌─────────────────────────────────────────────────┐ │
│  Items   │  │  Content Area                                   │ │
│          │  │  (table, cards, form, editor, etc.)              │ │
│  ────    │  │                                                   │ │
│  Settings│  │                                                   │ │
│  ────    │  └─────────────────────────────────────────────────┘ │
│  Usage   │                                                      │
└──────────┴────────────────────────────────────────────────────────┘
```

### 9.2 Page Header Pattern

Every internal page has a consistent header:

```
Page Title                                           [Primary Action Button]
Optional description text in gray-600

[Tab: Overview] [Tab: Activity] [Tab: Settings]        ← Only if page has sub-sections
──────────────────────────────────────────────────────────────────────────────
```

- Page title: `--text-page-title` (24px/600)
- Description: `--text-body` (14px/400, `--color-gray-600`)
- Primary action: right-aligned, always a labeled button (never just an icon)
- No decorative line or gradient under the title. The tab underlines or a simple `--border-subtle` separator provide visual separation.

### 9.3 Dashboard Cards (KPI Summary)

```
┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│ Total Sent   │  │ Signed       │  │ Pending      │  │ Revenue      │
│ 247          │  │ 183          │  │ 31           │  │ $1,245,000   │
│ ↑12% vs last │  │ ↑8% vs last  │  │ ↓2 vs last   │  │ ↑22% vs last │
└──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘
```

- 4-column grid on desktop, 2-column on tablet, 1-column on mobile
- Label: `--text-caption` (12px/500, `--color-gray-600`)
- Value: `--text-metric` (30px/600, `--color-gray-950`, `tabular-nums`)
- Trend: 12px/400, green for positive, red for negative, gray for neutral. Plain text, no arrows — the text "↑12% vs last month" is sufficient. No green/red background — the text color alone conveys the direction.

---

## 10. Recipient-Facing Surfaces

> These screens represent the sender's professionalism to their own clients. They receive MORE design attention than internal screens, not less.

### 10.1 Recipient Viewing Page

- Max-width: 720px, centered on a white background
- Minimal chrome: sender's logo (top-left), document title, "Powered by PactIntel" (bottom, small, gray)
- No sidebar, no navigation, no visible product UI — the document IS the page
- Typography follows the document's styling (Tiptap output), not the app's type scale
- Action buttons at bottom: "Sign this document", "Download PDF" — primary blue, centered

### 10.2 Signing Flow

- Clean, focused, single-task interface
- Progress indicator: step dots or a simple progress bar (not numbered steps — the signer doesn't need to know there are "5 steps")
- Signer identity verification: clean form, no decorative elements
- Signature capture: large, clear signing area with instructions
- Trust signals: lock icon + "Your signature is legally binding under ESIGN/UETA" — inline text, not a badge or banner
- Post-signature: confirmation screen with clear "Download signed document" and "Return to [sender's org name]" actions

### 10.3 Payment Collection Page

- Same 720px max-width, centered, white
- Clear: amount, description, sender's org name and logo
- Payment form: standard card fields or redirect to external payment link
- Trust: "Payment processed by [their processor name]" — this is BYOK, the payer should see their counterparty's processor, not PactIntel

### 10.4 Brand Kit Application

- Recipient-facing pages respect the sender's brand kit (Phase 1): custom logo, primary color override, custom domain
- The brand color REPLACES `--color-primary` on recipient pages ONLY — it does not affect status colors, error states, or text colors
- If no brand kit is configured, default PactIntel branding applies
- Brand color must pass WCAG AA contrast on white. If it doesn't, the system falls back to PactIntel primary blue with a warning to the admin.

---

## 11. States: Empty, Loading, Error

> Every major screen MUST have designed empty, loading, and error states. These are not afterthoughts — they are the first thing a new user sees.

### 11.1 Empty States

**Structure:**
```
┌─────────────────────────────────────────────┐
│                                             │
│        [Lucide icon, 48px, gray-300]        │
│                                             │
│        No documents yet                     │  ← 16px/600, gray-950
│                                             │
│   Create your first document to start       │  ← 14px/400, gray-500
│   sending proposals and collecting           │
│   signatures.                               │
│                                             │
│          [Create document]                   │  ← Primary button
│                                             │
└─────────────────────────────────────────────┘
```

**Copy rules for empty states:**
- State what's absent in plain language: "No documents yet", "No signatures pending", "No team members"
- Explain what the user should do, specifically: "Create your first document to start sending proposals and collecting signatures." NOT "Get started by adding your first item."
- Include the primary action that resolves the empty state
- No "Oops!" or "Looks like there's nothing here!" — active, direct voice

### 11.2 Loading States

- **Table loading:** Skeleton rows (3-5 rows of gray-100 pulsing rectangles matching the column layout). Not a centered spinner.
- **Card loading:** Skeleton card matching the card's dimensions with pulsing gray-100 rectangles for title, value, and description.
- **Page loading:** Skeleton of the page header + skeleton of the primary content area. The sidebar renders normally (it's already loaded).
- **Button loading:** Button text replaced with a small spinner (16px) centered in the button. Button is disabled.
- **Skeleton pulse animation:** `background-color` oscillates between `--color-gray-100` and `--color-gray-200` with a 1.5s ease-in-out cycle. No opacity animation — skeleton elements have full opacity and defined shapes.

### 11.3 Error States

**Inline errors (form validation):**
- Red border on the field, red helper text below: "Email address is required" or "Must be a valid email address."
- Specific, actionable error messages. NOT "Invalid input" or "Error."

**Page-level errors (API failure):**
```
┌─────────────────────────────────────────────┐
│                                             │
│        [AlertTriangle icon, gray-400]       │
│                                             │
│        Something went wrong                 │  ← 16px/600, gray-950
│                                             │
│   We couldn't load your documents.          │  ← 14px/400, gray-500
│   This is usually temporary.                │
│                                             │
│          [Try again]                        │  ← Secondary button
│                                             │
└─────────────────────────────────────────────┘
```

**Error copy rules:**
- State what failed: "We couldn't load your documents" not "An error occurred"
- Suggest what to do: "Try again" or "Check your connection and try again" or "Contact support if this continues"
- No blame: "Something went wrong" not "You did something wrong" or "Bad request"
- Include a request ID for support escalation: "If this continues, contact support with reference: req_abc123"

---

## 12. Motion & Animation

### Design principle

Animation serves function (feedback, orientation, state transitions). It does not serve decoration (entrance effects, attention-grabbing, visual flair).

### 12.1 Allowed Animations

| Animation | Duration | Easing | Usage |
|-----------|----------|--------|-------|
| **Hover background** | 150ms | `ease` | Table rows, nav items, buttons |
| **Focus ring** | 0ms (instant) | N/A | Input focus, button focus — instant, not animated |
| **Dropdown open** | 150ms | `ease-out` | Popovers, dropdown menus, select options |
| **Modal enter** | 200ms | `ease-out` | Modal/dialog fade-in + slight scale (0.98 → 1.0) |
| **Modal exit** | 150ms | `ease-in` | Modal/dialog fade-out |
| **Toast enter** | 200ms | `ease-out` | Toast notification slide-in from top-right |
| **Toast exit** | 300ms | `ease-in` | Toast notification fade-out |
| **Skeleton pulse** | 1500ms | `ease-in-out` | Loading skeleton background oscillation |
| **Accordion expand** | 200ms | `ease-out` | Sidebar sub-menu expand, collapsible sections |
| **Progress bar** | 300ms | `ease-out` | Upload progress, step completion |

### 12.2 Reduced Motion

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

All animations are wrapped in a `prefers-reduced-motion` check. When reduced motion is preferred, all transitions become instant.

---

## 13. Accessibility Floor

These are non-negotiable. Enterprise procurement checks for them, and they're part of not looking amateur.

### 13.1 Color Contrast

- All text MUST pass WCAG AA (4.5:1 for body text, 3:1 for large text 18px+).
- All interactive elements MUST have 3:1 contrast ratio against their background.
- Status badges: the text color within the badge is chosen to pass AA contrast against the badge background. This has been verified for all badge values in Section 8.2.
- Never convey information through color alone. Status badges always include text ("Signed"), not just a colored dot.

### 13.2 Keyboard Navigation

- All interactive elements are focusable via Tab key in a logical order.
- Focus is visible: a 2px `--color-primary` outline with 2px offset. Not a browser default blue glow. Not invisible.
- Modal focus trap: when a modal is open, Tab cycles within the modal. Escape closes the modal.
- Skip-to-content link: hidden by default, visible on focus, positioned at the top of the page.

### 13.3 Screen Reader Support

- All images have `alt` text (empty `alt=""` for decorative images).
- All form inputs have associated `<label>` elements (not just placeholder text).
- Interactive elements have `aria-label` when their visual label is insufficient (e.g., icon-only buttons: `aria-label="Delete document"`).
- Status changes (toast notifications, inline errors) use `aria-live` regions to announce changes.
- Tables use proper `<thead>`, `<th>`, `<tbody>`, `<td>` structure with `scope="col"` on headers.

---

## 14. Product Copy Conventions

### 14.1 Voice

- **Active, direct.** "Send for signature" not "This document can be sent for signature."
- **Plain English.** "Delete" not "Terminate instance." "Team members" not "Organizational users."
- **Specific.** "You've sent 47 of 50 documents this month" not "You're approaching your limit."

### 14.2 Action Naming Consistency

Use these exact verbs for these exact actions — every time, everywhere, across all screens:

| Action | Verb | NOT |
|--------|------|----|
| Create a new document | "Create document" | "New", "Add", "Start" |
| Send a document for signing | "Send for signature" | "Submit", "Dispatch", "Request signature" |
| Download a file | "Download" | "Export", "Get", "Save" |
| Remove permanently | "Delete" | "Remove", "Discard", "Trash" |
| Cancel a signature request | "Void" | "Cancel", "Revoke", "Withdraw" |
| Add a team member | "Invite" | "Add", "Create user" |
| Edit document content | "Edit" | "Modify", "Update", "Change" |
| View document analytics | "Analytics" | "Stats", "Metrics", "Insights" |
| Copy a shareable link | "Copy link" | "Share", "Get link" |
| Save without sending | "Save draft" | "Save", "Store" |

### 14.3 Meta Information Format

Display metadata as `key: value` pairs or in structured table cells. NOT as dot-separated strings.

```
✗ Bad:   "John Smith · Sales Rep · Acme Corp · Sep 15, 2026"
✗ Bad:   "Sent — Sep 15, 2026 — 3 signers — $48,000"
✓ Good:  Structured layout with labels on each value
✓ Good:  Table columns where each piece of data has its own column
```

---

## 15. Anti-Patterns (Explicitly Banned)

> [!CAUTION]
> If you are an AI agent and you find yourself about to write any of the following, STOP. These are not suggestions — they are hard bans. Each one is banned for a specific reason stated below.

### 15.1 Visual Anti-Patterns

| Banned Pattern | Why it's banned | What to do instead |
|---------------|----------------|-------------------|
| **Gradient backgrounds or blobs as decoration** | Reads as "marketing site template," not as enterprise software. Our content is more interesting than decorative blurs. | Use flat, solid surface colors (`--surface-page`, `--surface-card`) |
| **Identical cards with one shadow style for every kind of content** | Masks the hierarchy of information. A KPI summary and a document row are not the same thing. | Use the specific component for the specific purpose: tables for lists, metric cards for KPIs, forms for input |
| **ALL-CAPS "eyebrow" labels above page titles** | Redundant — the page title already tells the user where they are. Adds visual noise without information. | Page titles stand alone. Sidebar section labels use `--text-overline` sparingly. |
| **Middle-dot (·) or em-dash (—) joined meta strings** | Reduces scannable information to an unparseable run-on sentence. | Display each metadata value in its own labeled field, column, or structured layout |
| **Arrows (→, ›, >) appended to button text or links** | The button itself signals interactivity. Adding an arrow is redundant and creates visual inconsistency when some buttons have arrows and others don't. | Button text alone. No arrows. |
| **Scattered fade-in animation on every card or element** | Creates a "cascading reveal" effect that slows down perceived performance and distracts from content. | No entrance animations on content. Only animate state transitions (dropdown open, modal enter). |
| **Cream-and-terracotta color palette** | An immediately recognizable cliché from AI-generated SaaS templates. Reads as "template" not "product." | Use the cool gray and blue palette defined in this document. |
| **Near-black canvas with single acid-accent color** | Another recognizable cliché. Also poor for a document platform where the document should be the brightest element. | Light-mode-first with `--surface-page` (Gray 50) as the base. |
| **Glassmorphism (frosted glass effect)** | Inappropriate for a document/contract platform. Reduces legibility and reads as consumer tech. | Solid backgrounds with borders for structure. |
| **Full-round pill badges for status indicators** | Pills read as tags or categories, not as status. They also waste horizontal space. | 4px border-radius status badges with leading dot and text. |

### 15.2 Structural Anti-Patterns

| Banned Pattern | Why it's banned | What to do instead |
|---------------|----------------|-------------------|
| **Card grids instead of tables for list data** | Documents, contracts, payments — these are tabular data with sortable columns. Card grids can't sort, can't show column headers, and waste space. | `<table>` with sortable column headers, row selection, pagination |
| **Marketing-site navigation (hamburger menu, centered logo, CTA button)** | This is a logged-in app, not a landing page. Users need persistent, always-visible navigation. | Persistent sidebar + top bar |
| **Generic error messages ("An error occurred")** | Tells the user nothing. Generates support tickets. | Specific messages: "We couldn't load your documents. Try again." |
| **Placeholder content ("Lorem ipsum", "Jane Doe", "Acme Corp")** in screenshots or demos | If showing demo data, use realistic but clearly fictional data. | "Northwind Traders", "Proposal for Website Redesign", "$24,500" |

---

## 16. Research Notes

### 16.1 DocuSign Observations

- **Signing experience:** Focused, single-purpose interface with minimal chrome. White background, clear "Sign" CTA in DocuSign blue. No sidebar, no navigation. The document IS the page. Trust signals ("Powered by DocuSign") are small, bottom-positioned, not banner-style.
- **Brand color:** "DocuSign Cobalt" is their primary — a saturated blue used for action buttons and active states. Secondary colors (Deep Violet, Poppy red) appear in marketing materials but NOT in the product interface.
- **Typography:** Custom "Docusign Indigo" font — a geometric-grotesque hybrid. We use Inter instead (free, widely available, similar character).
- **Navigation:** The internal dashboard uses a left sidebar with icon + label nav items. Tab navigation within pages for sub-sections. Breadcrumbs in the top bar.
- **Density:** The admin interface is data-dense — real tables with sorting, filtering, pagination. Document lists are tables, not cards.
- **Status indicators:** Small colored dots or badges next to document titles. Green for complete, yellow for pending, red for error. No elaborate badge decorations.

### 16.2 Linear Observations

- **Density through luminance:** Linear achieves high information density without clutter by using 8-10 levels of gray luminance. The most important text is brightest, secondary text is dimmer, chrome is barely visible.
- **Single accent color:** Their lavender-blue (`#5e6ad2`) is used ONLY for interactive elements — active nav, focused inputs, primary buttons. It never appears as decoration.
- **Borders over shadows:** UI structure is defined by thin, semi-transparent borders, not shadows. Shadows appear only on floating elements (popovers, dropdowns).
- **Motion restraint:** No entrance animations. Transitions are fast (100-200ms) and only on state changes. The UI feels instant, not animated.
- **Typography:** Inter variable font with aggressive negative tracking on headlines. Body text at 13-14px. Very few font sizes — hierarchy through weight and luminance.

### 16.3 Papermark Design Tokens (Reference Extraction)

- **Color system:** HSL-based CSS custom properties via shadcn/ui. Light mode: white backgrounds, gray-950 foreground, gray-200 borders. Dark mode: full inversion via `.dark` class.
- **Primary action:** Gray-900 in light mode (dark button) — NOT a brand color. We diverge here: our primary is blue, not dark gray.
- **Sidebar:** Gray-50 background, icon+label nav, collapsible to icon-only. Usage progress bars in footer.
- **Status badges:** `bg-color-500/[.15] text-color-600` pattern — exactly the pattern we adopted in Section 8.2.
- **Tables:** Standard HTML tables, 12px/medium header text in muted-foreground, 13-14px body text, hover state bg-gray-100.
- **Radius:** `--radius: 0.5rem` (8px). We adjusted to 6px for a slightly more structured feel.
- **Component library:** shadcn/ui with Radix UI primitives. Lucide icons. CVA (class-variance-authority) for variant management. This is the exact stack we'll use.

---

## Open Questions for Review

> [!IMPORTANT]
> Please confirm or adjust the following before I save this as the official design system and begin implementation:

1. **Primary color choice:** I chose Blue 600 (`#2563EB`) — a clean, professional blue. Is this acceptable, or do you have a specific brand color in mind for PactIntel?

2. **Type scale at 14px base:** Body text at 14px is the enterprise SaaS standard (Linear, Notion, GitHub). Some document platforms go to 15px or 16px for body. Should we stay at 14px for the app UI? (The document editor will have its own configurable type size regardless.)

3. **Light-mode-first:** This system is light-mode-first, with dark mode planned for Phase 2. The rationale is that document work benefits from a light canvas where the document is the brightest element. Is this the right priority?

4. **Shadcn/ui as component foundation:** The Papermark reference uses shadcn/ui (Radix primitives + CVA). This is the natural fit for our Next.js + React stack and provides pre-built accessible components that we skin with our tokens. Confirm this is acceptable.

5. **"PactIntel" branding on recipient pages:** The default is a small "Powered by PactIntel" in gray at the bottom of recipient pages. Senders on Professional+ plans can replace this with their own branding. Is this the right approach?
