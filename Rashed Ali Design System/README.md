# Rashed Ali Cafeterias — Design System

## Overview

**Rashed Ali Cafeterias** (راشد علي) is a UAE-based food & beverage group operating multiple cafeteria branches. The business offers wraps/shawarma, coffee, juices, and fast food. Their tagline presence is "Group of Companys" and they operate a delivery service.

This design system covers two distinct visual contexts:

1. **Brand** — black & gold, premium Arabic-influenced visual identity used on marketing, menus, signage, and packaging.
2. **Internal Web App (Cafeteria HQ)** — clean light UI used for financial management: tracking income/expenses across branches, managing shareholders, distributions, and audit logs. Built with Next.js + Tailwind CSS + Supabase.

### Sources
- GitHub codebase: `cryptolife676/Rashed-Ali-Cafterias` (private, main branch)
- No Figma files provided.
- Logo and brand imagery found in `public/` of the repo.

---

## File Index

| File / Folder | Description |
|---|---|
| `README.md` | This file — project overview and index |
| `colors_and_type.css` | CSS variables for colors, typography, spacing, radii |
| `assets/` | Logos, brand imagery |
| `preview/` | Design system preview cards (registered in Design System tab) |
| `ui_kits/app/` | UI kit for the Cafeteria HQ financial management web app |
| `SKILL.md` | Agent skill manifest |

### Assets
- `assets/logo-badge.png` — Circular badge logo (black/gold, Arabic + food icons)
- `assets/logo-cup.png` — Premium coffee cup + crown logo (dark & light variants)
- `assets/logo-horizontal.png` — Horizontal lockup + circular badge (on black)
- `assets/brand-promo.jpg` — Brand promotional image (food photography on black)
- `assets/favicon.png` — App favicon

---

## Content Fundamentals

**Language & tone:**
- Bilingual: Arabic (راشد علي) for brand name/display, English for product copy and UI.
- English copy is **all-caps for brand display** (e.g. "RASHED ALI", "CALL FOR DELIVERY") — commanding, confident.
- UI copy is **sentence case**, functional and minimal (e.g. "Sign in", "Active Shareholders", "Net Profit (MTD)").
- No emoji used anywhere — brand is premium, serious.
- Numbers are formatted as currency (AED implied, using `formatMoney`).
- Labels in the app are terse: "MTD" (month-to-date), short field names, uppercase tracking labels.
- Tone is formal, trust-oriented — this is a financial system for business owners/shareholders.

**Examples:**
- Brand: "RASHED ALI — Group of Companys", "CALL FOR DELIVERY"
- App: "Sign in", "Rashed Ali Cafeteria", "Income (MTD)", "No transactions yet — add some in Transactions"
- Error: short, lowercase: "Signing in…", "Redirecting…"

---

## Visual Foundations

### Colors
**Brand palette:** Black (`#0c0b09`) + Gold (`#c9a227`). No other hues. The gold gradient goes from deep `#8d6d10` to bright `#e8c96a`. Cream (`#faf8f3`) as the neutral light surface.

**App palette:** Slate grays for backgrounds/borders, brand blue (`#2f7bff`/`#1f63e0`) for primary actions. Emerald for income/profit, red for expenses/danger.

### Typography
- **Brand display:** Serif (Playfair Display as substitute; original appears custom Arabic + serif English)
- **Arabic:** Noto Naskh Arabic (Google Fonts substitute)
- **App UI:** System sans-serif (`ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto`)
- No custom font files in the repo — system stack is intentional for app.

> ⚠️ **Font substitution:** The brand logo uses a custom Arabic calligraphic font and a custom English serif. Nearest Google Fonts matches: **Playfair Display** (English display) and **Noto Naskh Arabic** (Arabic). Request original font files if available.

### Backgrounds
- **Brand:** Full-bleed black. No patterns or textures — relies on food photography and gold accents.
- **App:** `bg-slate-50` page background, `bg-white` cards and sidebar. No gradients.

### Cards
- **App card:** `bg-white`, `rounded-xl` (12px), `shadow-sm` (1px 2px subtle), `border border-slate-200`, `p-5`.
- **Brand card (if applicable):** Dark `#211f1b` background, `1px solid rgba(201,162,39,0.3)` border, gold shadow.

### Spacing
- App uses Tailwind spacing (4px base unit). Typical gaps: `gap-4` (16px) for KPI grids, `space-y-6` (24px) between sections.

### Corner Radii
- Buttons: `rounded-lg` (8px)
- Cards: `rounded-xl` (12px)
- Inputs: `rounded-lg` (8px)
- Badges/tags: `rounded` (4px) or `rounded-full`

### Shadows
- App: `shadow-sm` only — very subtle. No heavy shadows.
- Brand: Gold glow `0 4px 24px rgba(201,162,39,0.18)`

### Borders
- App: `border-slate-200` for cards, `border-slate-300` for inputs. Clean hairlines.
- No decorative borders or dividers in brand contexts.

### Animation
- App: `transition` class on buttons (color transitions). No elaborate animations.
- No bounces, no easing definitions. Minimal and functional.

### Hover / Press States
- Buttons: `hover:bg-brand-700` (darker), `hover:bg-slate-200` (secondary). No scale transforms.
- Links (sidebar): `hover:bg-slate-100`
- Disabled: `opacity-50`

### Imagery
- Brand photography: **warm, saturated food photography on black backgrounds**. Gold-toned. No cool or desaturated tones.
- No illustrations, no patterns, no textures in app UI.

### Iconography
Icons are from **Lucide React** (outline/stroke style, `w-4 h-4` default size in sidebar). See ICONOGRAPHY section below.

---

## Iconography

The internal app uses **Lucide React** exclusively. Icons used in the sidebar:
- `LayoutDashboard` — Dashboard
- `Receipt` — Transactions
- `Users` — Shareholders
- `BadgeDollarSign` — Distributions
- `FileText` — Reports
- `ScrollText` — Audit Logs

**Style:** Stroke-weight outline icons, 16px (`w-4 h-4`) in navigation, slightly larger in other contexts. Color matches surrounding text (slate-700 in nav).

CDN: `https://unpkg.com/lucide@latest/dist/umd/lucide.js`

No custom icon font. No SVG sprites. No emoji. No PNG icons in the UI.

---

## UI Kits

- [`ui_kits/app/index.html`](ui_kits/app/index.html) — Cafeteria HQ financial web app (Login, Dashboard, Transactions, Shareholders, Distributions, Reports, Audit Logs)

---

## Generated Brand Assets

- [`assets/logo-upgraded.png`](assets/logo-upgraded.png) — Upgraded circular badge logo (600×600px, pure black bg, gold ring, white food icons, Arabic+English text)
- [`assets/favicon-upgraded.png`](assets/favicon-upgraded.png) — "RA" monogram favicon (64×64px)
- [`assets/website-post.png`](assets/website-post.png) — Social post / OG image (1200×628px)
