---
name: rashed-ali-design
description: Use this skill to generate well-branded interfaces and assets for Rashed Ali Cafeterias (راشد علي), either for production or throwaway prototypes/mocks/etc. Contains essential design guidelines, colors, type, fonts, assets, and UI kit components for prototyping the Cafeteria HQ financial management app and brand materials.
user-invocable: true
---

Read the README.md file within this skill, and explore the other available files.
If creating visual artifacts (slides, mocks, throwaway prototypes, etc), copy assets out and create static HTML files for the user to view. If working on production code, you can copy assets and read the rules here to become an expert in designing with this brand.
If the user invokes this skill without any other guidance, ask them what they want to build or design, ask some questions, and act as an expert designer who outputs HTML artifacts _or_ production code, depending on the need.

---

## 🎨 Design Elevation Techniques

Apply these techniques to push every output to the next level.

---

### 1. Gold Gradient Mastery
Never use flat gold. Always use the 3-stop gradient:
```css
background: linear-gradient(135deg, #f5e4a8 0%, #c9a227 45%, #8d6d10 100%);
-webkit-background-clip: text;
-webkit-text-fill-color: transparent;
```
For borders and rings: use `conic-gradient` or `linear-gradient` on `border-image`. For glows: `box-shadow: 0 0 32px rgba(201,162,39,0.35)`.

---

### 2. Premium Black Depth
Never use flat `#000`. Use layered radial gradients to create depth:
```css
background:
  radial-gradient(ellipse 60% 50% at 30% 40%, #1a1614 0%, transparent 70%),
  radial-gradient(ellipse 40% 60% at 80% 70%, #110e0b 0%, transparent 60%),
  #000;
```
Cards on black: `background: #0f0d0b; border: 1px solid rgba(201,162,39,0.18);`

---

### 3. Typography Pairing System
| Context | Font | Weight | Treatment |
|---|---|---|---|
| Brand hero | Playfair Display | 700 | Large, gold gradient, tight tracking |
| Arabic brand | Noto Naskh Arabic | 700 | Right-aligned, gold, `text-shadow` glow |
| App headings | Plus Jakarta Sans | 600–700 | Slate-900, no decoration |
| App labels | Plus Jakarta Sans | 600 | Uppercase, `letter-spacing: .08em`, slate-500 |
| Financial figures | system-ui | 600–700 | `font-variant-numeric: tabular-nums` |
| Taglines / quotes | Playfair Display | 400 italic | Cream or white, `text-wrap: pretty` |

---

### 4. Glassmorphism (Brand Context Only)
For overlays on dark/image backgrounds:
```css
background: rgba(12, 11, 9, 0.55);
backdrop-filter: blur(18px) saturate(1.4);
border: 1px solid rgba(201,162,39,0.22);
box-shadow: 0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(201,162,39,0.15);
```

---

### 5. Corner Bracket Frames
Signature brand motif. Use on hero cards, post images, certificates:
```css
.frame-corner::before, .frame-corner::after { content: ''; position: absolute; width: 28px; height: 28px; }
/* TL */ top-left: border-top + border-left in #c9a227
/* Use on all 4 corners */
```

---

### 6. Micro-interactions
- Buttons: `transition: all 0.18s cubic-bezier(0.4,0,0.2,1)` + `transform: translateY(-1px)` on hover
- Cards: `transform: translateY(-2px); box-shadow: var(--shadow-lg)` on hover
- Nav items: `transition: background 0.12s, color 0.12s`
- Brand CTAs: pulse glow on hover: `animation: pulse-gold 1.8s ease-in-out infinite`

```css
@keyframes pulse-gold {
  0%, 100% { box-shadow: 0 0 0 0 rgba(201,162,39,0.4); }
  50% { box-shadow: 0 0 0 8px rgba(201,162,39,0); }
}
```

---

### 7. Data Visualization (Financial App)
For monthly P&L charts:
- Use SVG `<polyline>` or canvas — no external charting libs needed
- Income line: `#2f7bff` with `0.15` opacity fill
- Expense line: `#dc2626` with `0.1` opacity fill
- Net profit: `#059669` dots + connecting line
- Background grid: `rgba(226,232,240,0.5)` horizontal lines only

---

### 8. Layout Principles
- **App sidebar**: Always 240px, white, `border-right: 1px solid #e2e8f0`. Logo at top.
- **Content padding**: `24px` all around, `gap: 24px` between sections.
- **KPI grid**: `grid-template-columns: repeat(4, 1fr)` on desktop, `1fr` on mobile.
- **Card hierarchy**: Page title → KPI row → primary table/chart card → secondary cards.
- **Brand hero**: Full-bleed black, centered logo, corner brackets, gold rule dividers.

---

### 9. Brand Social Media Templates
Standard sizes to produce on request:
| Format | Size | Notes |
|---|---|---|
| Website OG / post | 1200×628 | Done ✓ in `assets/website-post.png` |
| Instagram square | 1080×1080 | Center logo, quote, offer pills |
| Instagram story | 1080×1920 | Vertical — logo top, food image mid, CTA bottom |
| WhatsApp status | 1080×1920 | Same as story |
| Menu card | 800×1100 | A4-ish, black bg, gold sections |

---

### 10. Iconography Rules
- **App**: Inline SVG paths only, `stroke-width: 2`, 16px nav / 20px section headers / 36px empty states.
- **Brand**: No icons — imagery, Arabic calligraphy, and food photography do the work.
- **Never**: emoji, PNG icons in UI, hand-drawn SVG food illustrations (use logo assets instead).

---

### 11. Responsive Breakpoints (App)
```css
/* Mobile first */
@media (min-width: 768px)  { /* 2-col KPI, show sidebar */ }
@media (min-width: 1024px) { /* 4-col KPI, full table */ }
@media (min-width: 1280px) { /* Wide sidebar, chart column */ }
```

---

### 12. Print & PDF (Financial Reports)
- White background, black text, no shadows.
- Brand gold as accent only (table header borders, section titles).
- `font-size: 12pt` minimum.
- Page header: logo-badge at 48px left + "Rashed Ali Cafeterias" right.
- Use `@media print` to hide sidebar, nav, buttons.
