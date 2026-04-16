# Brain OS — Design Guidelines

Design reference for all UI work on Brain OS. Every value here is derived from the actual codebase. Do not deviate without updating this document.

---

## Philosophy

Brain OS is inspired by the design language of best-in-class AI productivity tools (Claude.ai, Linear, Notion). The guiding principles:

1. **Radical clarity** — Every element earns its place. No decorative noise.
2. **Warm, not cold** — Beige paper tones, terracotta accents. Intelligence feels human.
3. **Dual-brain** — Two distinct accent systems: one for the user's workspace, one for AI. They never mix.
4. **Speed signals trust** — Fast transitions, instant feedback, skeleton loading. Latency is a design problem.
5. **Depth through hierarchy** — Typography weight and color carry information, not size alone.
6. **Keyboard-first** — Every primary action has a keyboard shortcut or ⌘K equivalent.

---

## Color System

All colors are CSS variables. **Never hardcode hex values** in components.

### Light Mode (default: `:root`)

| Token | Value | Usage |
|-------|-------|-------|
| `--bg-base` | `#F5F5F0` | Page background — warm beige paper |
| `--bg-sidebar` | `#EAEAE5` | Sidebar background — slightly darker |
| `--bg-surface` | `#FFFFFF` | Cards, panels, modals |
| `--bg-elevated` | `#F7F7F4` | Elevated surfaces within surface |
| `--bg-hover` | `#EDEDEA` | Hover state for interactive rows |
| `--bg-card` | `#FFFFFF` | Card background |
| `--bg-card-hover` | `#F7F7F4` | Card hover |

### Dark Mode (`[data-theme="dark"]`)

| Token | Value | Usage |
|-------|-------|-------|
| `--bg-base` | `#1C1C1E` | Warm dark — not cold black |
| `--bg-sidebar` | `#161618` | Sidebar — deepest surface |
| `--bg-surface` | `#2C2C2E` | Cards, panels |
| `--bg-elevated` | `#3A3A3C` | Elevated within surface |
| `--bg-hover` | `#3A3A3C` | Hover state |
| `--bg-card` | `#2C2C2E` | Card |
| `--bg-card-hover` | `#3A3A3C` | Card hover |

### Text Hierarchy

| Token | Light | Dark | Usage |
|-------|-------|------|-------|
| `--text-1` | `#1A1A18` | `#F5F5F3` | Headings, primary content |
| `--text-2` | `#6B6B68` | `#A1A1A6` | Body, nav labels, secondary info |
| `--text-3` | `#9C9C99` | `#636366` | Placeholders, labels, timestamps, hints |

### Borders

| Token | Light | Dark | Usage |
|-------|-------|------|-------|
| `--border` | `#E2E2DE` | `#3A3A3C` | Standard dividers, card edges |
| `--border-subtle` | `#EAEAE6` | `#2C2C2E` | Very faint separators |
| `--border-hover` | `#CACAC6` | `rgba(255,255,255,0.12)` | Border on hover |
| `--border-accent` | `rgba(212,119,92,0.35)` | `rgba(212,119,92,0.40)` | Accent-tinted borders |

### Primary Accent — Terracotta

The main brand color. Used for CTAs, active states, selection, and interactive emphasis.

| Token | Value | Usage |
|-------|-------|-------|
| `--accent` | `#D4775C` | Buttons, active nav, icons on active |
| `--accent-hover` | `#E8926E` | Hover state for accent elements |
| `--accent-dim` | `rgba(212,119,92,0.12)` | Active nav background, subtle tints |
| `--accent-glow` | `rgba(212,119,92,0.25)` | Hover glow, focus rings |
| `--border-accent` | `rgba(212,119,92,0.35)` | Accent-tinted border |
| `--focus-ring` | `rgba(212,119,92,0.45)` | Keyboard focus outline |

### AI Accent — Sage

**Exclusively for AI-related UI.** Never use for general UI elements.

| Token | Light | Dark | Usage |
|-------|-------|------|-------|
| `--ai-accent` | `#5B8A7A` | `#7BADA0` | AI icons, AI active states |
| `--ai-accent-dim` | `rgba(91,138,122,0.10)` | `rgba(123,173,160,0.12)` | AI panel hover bg |
| `--ai-accent-glow` | `rgba(91,138,122,0.20)` | `rgba(123,173,160,0.22)` | AI glow effects |
| `--ai-border` | `rgba(91,138,122,0.25)` | `rgba(123,173,160,0.28)` | AI panel borders, focus |

> **Rule:** If an element is AI-related (AI panel, AI Assistant nav item, AI send button, sparkle icon), use `--ai-accent`. For everything else, use `--accent`.

### Shadows

| Token | Light | Dark |
|-------|-------|------|
| `--shadow-sm` | `0 1px 2px rgba(0,0,0,0.04)` | `0 1px 3px rgba(0,0,0,0.35)` |
| `--shadow-md` | `0 2px 8px rgba(0,0,0,0.07)` | `0 2px 10px rgba(0,0,0,0.45)` |
| `--shadow-lg` | `0 4px 16px rgba(0,0,0,0.09)` | `0 4px 20px rgba(0,0,0,0.60)` |

Use `--shadow-sm` for buttons and small interactive elements. `--shadow-md` for panels and dropdowns. `--shadow-lg` for modals and command palette.

### Semantic Colors (hardcoded, not tokenized)

| Usage | Value |
|-------|-------|
| Destructive/error text | `#DC2626` |
| Destructive hover bg | `rgba(255,69,58,0.10)` |
| Destructive icon | `#FF453A` |

---

## Typography

**Font:** Geist Sans (via `next/font/google`), fallback: SF Pro Display, system-ui, Arial.

**Anti-aliasing:** Always enabled. Set at root level — do not override.

### Scale

| Role | Size | Weight | Letter-spacing | Usage |
|------|------|--------|----------------|-------|
| Page heading | `26px` | `600` | `-0.025em` | Dashboard h1 |
| Section heading | `18–20px` | `600` | `-0.02em` | Page sub-sections |
| Card title | `15px` | `600` | `-0.015em` | Note titles, entity names |
| Body | `16px` | `400` | — | Base |
| UI label | `14px` | `400–500` | — | Nav items, card body |
| Small / meta | `13px` | `400` | — | Descriptions, secondary info |
| Caption | `12px` | `400` | — | Timestamps, counts, hints |
| Micro | `11px` | `400–600` | — | Email in sidebar footer, kbd hints |
| Section header | `10px` | `600` | `0.08em` | Sidebar group labels (uppercase) |

### Section Headers (grouped nav)

```
10px / weight 600 / letter-spacing 0.08em / uppercase / color: --text-3
padding: 8px 14px 3px
```

### Keyboard Shortcut Pills

```
font-size: 10–11px / font-family: inherit / color: --text-3
background: --bg-hover / padding: 2px 6px / border-radius: 5px
```

---

## Layout

### Three-Zone Shell

```
┌─────────────────────────────────────────────────┐
│  Sidebar (240px, fixed)  │  Main  │  AI (320px) │
│  --sidebar-w             │  flex  │  --ai-panel-w│
└─────────────────────────────────────────────────┘
```

- Sidebar: `position: fixed`, full height, `z-index: 50`
- Main: `flex: 1`, `margin-left: var(--sidebar-w)`, `margin-right: var(--ai-panel-w)` when AI open
- AI Panel: `position: fixed`, right edge, `z-index: 40`
- Transitions: sidebar 200ms, AI panel 220ms, both `ease-in-out`
- At ≤ 1100px: AI panel overlays instead of pushing main content

### Page Content

- Standard page padding: `48px` all sides
- Max content width: unconstrained (uses flex within main zone)
- Two-column layout class: `.calendar-layout` with `gap: 32px`
- Sticky sidebar column: `width: 340px`, `position: sticky`, `top: 32px`
- Collapses to single column at ≤ 1024px

### Mobile (≤ 768px)

- Sidebar hidden by default; toggled via fixed top bar (height: `48px`)
- Top bar: `background: --bg-sidebar`, `border-bottom: 1px solid --border`, `z-index: 60`
- Sidebar overlays full screen with backdrop (`rgba(0,0,0,0.45)`, blur)
- Mobile sidebar: `width: 280px`, `translateX(-100%)` → `translateX(0)` on open
- Main content: `margin-top: 48px` on mobile

---

## Spacing

Spacing is not tokenized. Use these consistent values:

| Context | Value |
|---------|-------|
| Page padding | `48px` |
| Section gap (widgets) | `24–32px` |
| Card internal padding | `12–16px` |
| Nav item padding | `8px 14px` |
| Quick-create button padding | `7px 12px` |
| Footer padding | `12px 14px` |
| Input padding | `8px 10px` (inside container) |
| Gap between nav items | `1px` |
| Gap between quick-create buttons | `5px` |
| Sidebar nav section gap | `8px` margin-top |

---

## Border Radius

| Context | Value |
|---------|-------|
| Nav items, buttons, tags | `8px` |
| Command palette | `14px` |
| AI panel input | `10px` |
| Message bubbles | `12px 12px 3px 12px` (user) |
| Modals, large cards | `12px` |
| Small interactive icons | `4–6px` |
| Avatar | `50%` |
| Focus ring | `6px` |
| Kbd pills | `3–5px` |

---

## Iconography

**All icons are inline SVG.** No icon library. This keeps the bundle small and allows precise control.

### Sizing

| Context | Size |
|---------|------|
| Navigation icons | `15×15px` |
| Inline content icons | `14×14px` |
| Brand logo | `18×18px` |
| Search icon (command bar) | `16×16px` |
| AI sparkle (header) | `16×16px` |
| AI sparkle (messages) | `14×14px` |
| Theme/sign-out icons | `13×13px` |
| Collapse chevron | `14×14px` |
| Section collapse chevron | `10×10px` |

### Stroke

| Context | Stroke width |
|---------|-------------|
| Navigation, content icons | `1.75` |
| Close, interactive icons | `2.0` |
| Brand logo | `1.5` |

Always use: `strokeLinecap="round"`, `strokeLinejoin="round"`, `fill="none"`.

### Icon Color Convention

| State | Color |
|-------|-------|
| Default (nav inactive) | `--text-3` |
| Active (nav active) | `--accent` |
| AI-related icon | `--ai-accent` |
| Action icon | `--accent` |
| Hover (icon button) | `--text-1` |
| Destructive | `#FF453A` |

---

## Component Patterns

### Buttons

#### Primary (filled accent)
```css
background: var(--accent)
color: #fff
border: none
border-radius: 8px
padding: 7px 12px
font-size: 13px
font-weight: 500
cursor: pointer
transition: opacity 0.18s
hover: opacity 0.88
```

#### Secondary (ghost)
```css
background: transparent
color: var(--text-2)
border: 1px solid var(--border)
border-radius: 8px
padding: 7px 12px
font-size: 13px
cursor: pointer
transition: border-color 0.18s, color 0.18s, background 0.18s
hover: border-color --border-hover, color --text-1, background --bg-hover
```

#### Icon button
```css
background: transparent
border: none
color: var(--text-3)
padding: 3–6px
border-radius: 5–8px
cursor: pointer
transition: color 0.16s
hover: color --text-1
```

#### Destructive icon button
```css
hover: color #FF453A, background rgba(255,69,58,0.10)
```

### Navigation Items

```css
display: flex
align-items: center
gap: 9px
padding: 8px 14px
border-radius: 8px
font-size: 14px
font-weight: active ? 500 : 400
color: active ? --text-1 : --text-2
background: active ? --accent-dim : transparent
transition: color 0.16s ease-in-out, background 0.16s ease-in-out

icon color: active ? --accent : --text-3
```

Hover (inactive only): `color --text-1`, `background rgba(0,0,0,0.04)` (light) / `rgba(255,255,255,0.05)` (dark).

### Cards

```css
background: var(--bg-surface)
border: 1px solid var(--border)
border-radius: 8–12px
padding: 9–16px 12–16px
transition: border-color 0.16s
hover: border-color --border-hover
```

### Form Inputs

```css
background: var(--bg-base) or transparent
border: 1px solid var(--border)
border-radius: 8–10px
padding: 8–10px 12px
font-size: 13–16px
color: var(--text-1)
outline: none
transition: border-color 0.18s
focus: border-color --ai-border (AI contexts) or --accent (general)
placeholder: color --text-3
```

### Textareas (AI input, note composer)

Same as inputs. Set `resize: none`. Auto-grow with `maxHeight` + `overflow: auto`.

### Modals / Overlays

```css
/* Backdrop */
position: fixed, inset: 0
background: rgba(0,0,0,0.35)
backdrop-filter: blur(4px)
z-index: 200

/* Panel */
position: fixed
top: 20%
left: 50%, transform: translateX(-50%)
width: min(560px, calc(100vw - 40px))
background: var(--bg-elevated)
border: 1px solid var(--border)
border-radius: 14px
box-shadow: var(--shadow-lg)
z-index: 201
overflow: hidden
```

### Message Bubbles (AI Panel)

**User message** (right-aligned):
```css
background: var(--accent-dim)
border: 1px solid var(--border-accent)
border-radius: 12px 12px 3px 12px
padding: 9px 13px
font-size: 13px
max-width: 85%
```

**Assistant message** (left-aligned with sparkle icon):
```css
display: flex, gap: 8px
icon: color --ai-accent
text: font-size 13px, line-height 1.6, color --text-1
```

**Error text:** `color: #DC2626`

### Skeleton Loading

```css
.skeleton {
  background: linear-gradient(90deg, --bg-card 25%, #E8E8E4 50%, --bg-card 75%);
  background-size: 1200px 100%;
  animation: shimmer 1.8s ease-in-out infinite;
}
```

Use for content placeholders while fetching. Height and width match expected content dimensions.

### Quick-Action Suggestion Pills

```css
display: block
padding: 7px 12px
background: var(--bg-hover)
border: 1px solid var(--border)
border-radius: 8px
font-size: 12px
color: var(--text-2)
cursor: pointer
transition: border-color 0.16s, color 0.16s
hover: border-color --ai-border, color --text-1
```

---

## Motion & Animation

### Timing Reference

| Duration | Easing | Usage |
|----------|--------|-------|
| `150ms ease-in-out` | standard | Nav link hover |
| `180ms ease-in-out` | standard | Page fade-in, sidebar nav transitions |
| `200ms ease-in-out` | standard | Sidebar width, main margin, mobile sidebar |
| `220ms ease-in-out` | standard | AI panel slide-in |
| `120ms ease-in-out` | fast | Command bar backdrop |
| `200ms cubic-bezier(0.4,0,0.2,1)` | material | Panel slide-in |
| `1.8s ease-in-out infinite` | loop | Skeleton shimmer |

### Keyframes (defined in globals.css)

| Class | Animation | Usage |
|-------|-----------|-------|
| `.page-enter` / `.page-fade-in` | `fadeInUp` 180ms | Every page on mount |
| `.panel-enter` / `.panel-slide-in` | `slideFromRight` 200ms | Right panels sliding in |
| `.ai-panel-enter` | `slideFromRight` 220ms | AI panel specifically |
| `.command-bar-backdrop` | `fadeInUp` 120ms | Command bar backdrop |
| `.skeleton` | `shimmer` 1.8s | Loading placeholders |

### Animation Rules

- **Always animate pages** with `.page-fade-in` (or `page-enter`) on mount.
- **Right panels** use `.panel-enter` for slide-from-right.
- **Never animate layout shifts** — use CSS transitions on `margin` and `width`, not JS.
- **Collapsed elements** animate via width/height + overflow hidden, not display none (allows transition).
- **Chevron rotation**: `transform: rotate(-90deg)` for collapsed, `0deg` for open. `transition: transform 0.16s ease-in-out`.

---

## Dark Mode

**Implementation:** `[data-theme="dark"]` attribute on `<html>`. Set via `localStorage` key `"theme"`.

**Never use** `prefers-color-scheme` media query — the toggle is always explicit user preference.

Toggle lives in the sidebar footer row (compact icon button).

```javascript
// Set dark mode
document.documentElement.setAttribute("data-theme", "dark")
localStorage.setItem("theme", "dark")

// Set light mode
document.documentElement.removeAttribute("data-theme")
localStorage.setItem("theme", "light")
```

**Initial load:** Read `localStorage.getItem("theme")` in a `useEffect` on mount. Default is `"light"`.

**Dark mode design intent:** Warm dark, not cold. `#1C1C1E` (not pure black). Apple-inspired surface hierarchy. Shadows are stronger (higher opacity) to maintain depth perception.

---

## Accessibility

- **Focus rings:** `outline: 2px solid var(--focus-ring)`, `outline-offset: 2px`, `border-radius: 6px`. Applied to `button:focus-visible` and `a:focus-visible`.
- **Keyboard navigation:** Command bar (⌘K) supports `↑↓` navigate, `↵` select, `Esc` close.
- **Interactive labels:** All icon-only buttons have `title` attributes.
- **Placeholder contrast:** `color: var(--text-3)` — do not use lighter values.
- **Scrollbars:** Thin (5px) custom scrollbar. Hidden on tag/entity horizontal scrolls.

---

## AI-Specific UI Patterns

### Visual Identity Split

The AI system has its own visual language. This separation signals to the user that they are interacting with intelligence, not just the app.

| Element | Use `--ai-accent` |
|---------|------------------|
| AI Assistant nav item (active) | ✓ |
| AI panel header icon | ✓ |
| AI sparkle icons in messages | ✓ |
| AI send button (filled) | ✓ |
| AI input focus border | ✓ |
| AI suggestion pill hover border | ✓ |
| AI presence dot in nav | ✓ |

All other UI uses `--accent` (terracotta).

### AI Panel Structure

```
┌─────────────────────────┐
│ ✦ AI Assistant    [×]   │  ← Header: 16px padding, border-bottom
├─────────────────────────┤
│                         │  ← Messages: flex:1, overflow scroll
│  [empty state]          │
│                         │
├─────────────────────────┤
│  Quick suggestions      │  ← Only when empty (3 pill buttons)
├─────────────────────────┤
│ [input textarea] [send] │  ← Footer: border-top, border-radius 10px input
│  ↵ send · shift+↵ nl   │
└─────────────────────────┘
```

### Empty State Pattern

```
centered icon (44×44px, border-radius 12px, --ai-accent-dim bg, --ai-border border)
  ↓
title (14px, 500 weight, --text-1)
  ↓
description (12px, --text-3, line-height 1.6, centered, max 2 lines)
```

---

## Sidebar Structure

```
┌─────────────────────────┐
│ [logo] Brain      [←]  │  ← Brand row: 20px 16px 16px padding
│ [+ New Note        N]   │  ← Primary CTA (filled accent)
│ [+ New Task        T]   │  ← Secondary CTA (ghost)
├─────────────────────────┤
│ WORKSPACE               │  ← Section header: 10px, uppercase
│   Home                  │
│   Tasks                 │
│   Notes                 │
├─────────────────────────┤
│ KNOWLEDGE               │
│   Graph                 │
├─────────────────────────┤
│ SPACES ▾                │  ← Collapsible
│   @work                 │
│   @personal             │
├─────────────────────────┤
│ ────────── (flex spacer)│
│ ✦ AI Assistant      •  │  ← AI-accented when active
│ Settings                │
├─────────────────────────┤
│ [A] user@email  ☀  →   │  ← Footer: avatar + email + theme + signout
└─────────────────────────┘
```

---

## Scrollbar

```css
scrollbar-width: thin;
scrollbar-color: #CECECA transparent; /* light */
scrollbar-color: #3A3A3C transparent; /* dark */
width/height: 5px
border-radius: 999px
```

Hidden on horizontal-scroll containers (entity tags): `scrollbar-width: none`.

---

## Coding Conventions for UI

1. **No Tailwind in components.** Use inline `style={{}}` only.
2. **CSS variables only** for colors, never hardcode hex in components.
3. **All transitions** should have explicit `transition` property — never rely on browser defaults.
4. **Mouse hover** implemented via `onMouseEnter`/`onMouseLeave` setting `e.currentTarget.style.*`. Do not use CSS classes for hover on dynamic elements.
5. **Active state** via `data-active="true"` attribute + CSS selector in globals.css (`.nav-link[data-active="true"]`).
6. **Icons:** Inline SVG in the same file, in a dedicated `// ── Icons` section at the top.
7. **Section comments:** Use `// ── Section Name ─────` style dividers between logical blocks.
8. **Class names** (`className`) only used for: `page-fade-in`, `panel-enter`, `ai-panel-enter`, `skeleton`, `nav-link`, `calendar-layout`, `mobile-topbar` — all defined in `globals.css`.

---

## Scalability Guidelines

When adding new features:

### New Pages
- Wrap root div with `className="page-fade-in"` and `background: var(--bg-base)`.
- Use `padding: 48px` as default page padding.
- Add to sidebar navigation under the appropriate section.

### New Panels (side drawers)
- Use `position: fixed`, appropriate edge, `z-index` in the 40–50 range.
- Apply `.panel-enter` animation on mount.
- Background: `var(--bg-surface)`, border: `1px solid var(--border)`.
- Always add a close button (icon button, top right).

### New AI Features
- Always use `--ai-accent` and `--ai-accent-dim` for AI surfaces.
- Use the sparkle icon (`✦`) consistently for AI identity.
- Keep AI affordances visually distinct from workspace actions.

### New Entity / Data Types
- Follow the color convention for entity type badges (defined per-type in graph page).
- Use `--accent-dim` for tinted backgrounds, `--border-accent` for tinted borders.

### New Modal Types
- Use the command bar modal pattern: backdrop blur, centered, `border-radius: 14px`, `--shadow-lg`.
- Always include keyboard dismissal (`Esc`).

### Adding Navigation Items
- New primary nav items: add under existing section or create new `SectionHeader`.
- Follow `NavLink` component pattern exactly — do not create ad-hoc nav items.
- If AI-related: use the `--ai-accent` button pattern, not `NavLink`.

---

## Quick Reference Card

```
Colors:    --accent #D4775C  |  --ai-accent #5B8A7A  |  --text-1/2/3
Surfaces:  --bg-base  --bg-sidebar  --bg-surface  --bg-elevated
Borders:   --border  --border-hover  --border-accent  --ai-border
Shadows:   --shadow-sm  --shadow-md  --shadow-lg

Radii:     8px (default)  |  10px (inputs)  |  14px (modals)
Font:      Geist, 16px/1.65  |  nav: 14px  |  meta: 12–13px  |  label: 10px
Icons:     15×15 nav, 14×14 inline, stroke 1.75 (2.0 for close)
Motion:    180ms ease-in-out  |  220ms AI panel  |  page-fade-in on all pages
Layout:    sidebar 240px  |  AI panel 320px  |  mobile ≤768px
```
