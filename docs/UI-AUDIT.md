# UI Design Audit & Token Implementation

**Project:** Drift — Generative Particle Depth Canvas  
**Date:** 2026-11-09  
**Specification:** Task 6 UI Tokens and Styling (`src/style.css`)

---

## 1. Executive Summary

This design audit documents the alignment of Drift's user interface styling with minimalist, high-legibility design tokens. The update establishes a disciplined token system in `:root`, replaces disparate border radii with uniform control (10px) and dock (14px) metrics, enforces tabular typography with sentence casing, limits backdrop blur to a performant 8px, removes decorative neon halos, and constrains animations to smooth 160ms transitions on GPU-accelerated properties (`opacity` and `transform`).

---

## 2. Token Architecture & Variable Mappings

The primary design tokens are declared in `src/style.css` under `:root` and mapped throughout the stylesheet:

| Token | Value | Purpose / Mapping |
| :--- | :--- | :--- |
| `--bg` | `#050506` | Deep neutral canvas and viewport background |
| `--ink` | `#ECE8E1` | Primary text, wordmarks, active mode chip foreground |
| `--ink-dim` | `rgba(236, 232, 225, 0.58)` | Secondary typography, metadata, inactive labels |
| `--line` | `rgba(236, 232, 225, 0.10)` | Subtle borders, dividers, card outlines |
| `--surface` | `rgba(12, 12, 14, 0.78)` | Glassmorphic floating dock panels, modal sheets |
| `--rec` | `#E5484D` | Recording indicator, recording badge, record active state |

### Spacing Scale

The spacing scale is locked to 6 foundational intervals:
- `--space-1`: `4px`
- `--space-2`: `8px`
- `--space-3`: `12px`
- `--space-4`: `16px`
- `--space-5`: `24px`
- `--space-6`: `32px`

---

## 3. Contrast Ratio Verification (WCAG 2.1)

All text color tokens were verified against the background (`#050506`) and surface glass (`rgba(12, 12, 14, 0.78)`):

| Element / Color | Effective Foreground | Effective Background | Contrast Ratio | WCAG Compliance |
| :--- | :--- | :--- | :--- | :--- |
| Primary Text (`--ink`) | `#ECE8E1` | `#050506` | **16.66:1** | **Passes AAA** (>= 7:1) |
| Secondary Text (`--ink-dim`) | `#8B8985` *(composite)* | `#050506` | **6.02:1** | **Passes AA** (>= 4.5:1) |
| Recording Accent (`--rec`) | `#E5484D` | `#050506` | **5.18:1** | **Passes AA** (>= 4.5:1) |
| Active Mode Chip | `#050506` (text) | `#ECE8E1` (bg) | **16.66:1** | **Passes AAA** (>= 7:1) |
| Accent Cyan (`--accent-cyan`) | `#64D2FF` | `#050506` | **10.82:1** | **Passes AAA** (>= 7:1) |

---

## 4. Typography Standards

1. **Family Hierarchy**:
   - **UI & Controls**: `Manrope` (`--font-sans`) at 12–13px in sentence case. Minimum font size anywhere across desktop and mobile is strictly **11px** (eliminated legacy 8px, 9px, and 10px micro-copy).
   - **Brand Wordmark**: `Noto Serif TC` (`--font-serif`) is strictly reserved for the wordmark ("Drift" / "浮流") in `.brand-title` and `.app-branding-title`. Modal headers and drawer titles now use `Manrope`.
2. **Sentence Casing**:
   - Removed blanket `text-transform: uppercase;` on buttons, badges, section headers, and pill controls. All UI copy now uses clean sentence case for reduced cognitive load.
3. **Tabular Numerics**:
   - `font-variant-numeric: tabular-nums;` is applied globally to all counters, timers, and telemetry metrics (`.image-counter`, `.telemetry-badge`, `.telemetry-value`, `.telemetry-fps`, `.telemetry-pts`, `.recording-badge`, `.loading-pct`, `.setting-value`, `.sys-dpr-pill`, `.thumb-number`, `.key-shortcut`, `.depth-hud-pill`). This prevents jitter in live-updating values.

---

## 5. Border Radii & Component Geometry

Per design specification, all controls and dock containers follow a strict two-tier radius hierarchy:

- **Control Radius (`10px` / `--radius-control`)**:
  - Buttons (`.btn`, `.btn-primary`, `.btn-secondary`, `.btn-depth-action`, `.btn-drawer-action`)
  - Floating controls (`.mode-pill` when inactive, `.overlay-pill`, `.color-pill`)
  - Icon actions (`.action-icon-btn`, `.title-close-btn`, `.drawer-close-btn`, `.credits-close-btn`, `.depth-modal-close-btn`)
  - Badges and indicators (`.telemetry-badge`, `.recording-badge`, `.error-badge`, `.depth-hud-pill`, `.sys-dpr-pill`, `.image-indicator`)
  - Switches and cards (`.slider-switch`, `.credit-card`, `.telemetry-card`, `.thumb-pill`)
- **Dock Radius (`14px` / `--radius-dock`)**:
  - Bottom controls dock (`.controls-panel`)
  - Modal sheets and panels (`.credits-modal-panel`, `.depth-debug-panel`, `.loading-card`)
  - Title drop zone (`.drop-zone`)
  - Mobile bottom drawer top corners (`.settings-drawer-panel`)
- **Pill Exception**:
  - **Only the active mode chip** (`.mode-pill.active`) retains a full stadium pill (`border-radius: var(--radius-pill);` / `9999px`) to distinctly anchor user focus on the current rendering state.

---

## 6. Visual Effects & Performance

1. **Backdrop Blur**:
   - All glassmorphism layers (`.glassmorphic-panel`, `.title-screen`, `.settings-drawer-panel`, `.loading-overlay`, `.credits-modal-panel`, `.depth-debug-panel`) are capped at **8px** (`backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);`), preserving high frame rates on lower-power GPUs and mobile devices.
2. **Glows & Halos Elimination**:
   - Removed all neon `box-shadow` glows (e.g. `0 0 14px rgba(255,255,255,0.25)`, `0 0 10px var(--accent-cyan-glow)`, `0 0 12px rgba(239,68,68,0.4)`).
   - Replaced `recordGlow` keyframe animation with clean opacity and border pulsation (`recordPulse`).
   - Retained only subtle, non-glowing directional drop shadows for spatial layering (e.g., `box-shadow: -4px 0 24px rgba(0, 0, 0, 0.45);`).
3. **Smooth 160ms Transitions**:
   - Replaced all multi-property (`transition: all ...`) and non-standard duration animations with `160ms ease-out` targeting hardware-accelerated `opacity` and `transform` properties only.

---

## 7. Verification

- `npm run lint`: **0 errors** (ESLint 8.57.1 / TypeScript-ESLint passed).
- `npm run build`: **Clean production bundle generated** (`tsc && vite build` built in <4s with 0 CSS or TypeScript errors).
