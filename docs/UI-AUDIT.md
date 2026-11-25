# Drift UI Audit & Design Direction

**Product:** Drift — Generative Particle Depth Canvas  
**Audit Date:** 2026-11-25  
**Viewports Audited:** `1920x917`, `1366x768`, `390x844` (screenshots in `docs/audit-before/`)  
**Review Lenses:** `unslop`, `web-design-guidelines`, `design-critique`, `a11y-debugging`, `review-animations`

---

## 1. Cohesive Design Direction

Derived from what Drift actually is — a client-side monocular depth estimator and 450k-particle WebGL canvas:

- **Product:** A browser-only generative particle depth canvas that turns still images into interactive 3D stipple fields using client-side depth estimation.
- **Character:** Precision optical/print instrument; quiet darkroom terminal. Calm, exact, tactile, and receding.
- **World:** Optical physics bench meets archival printroom. Pitch-black `#050506` field where the luminous particle field is the sole hero; all interface chrome sits on a single neutral graphite ramp (`#050506` -> `#0c0c0e` -> `#141415` -> `#232325`) with warm archival ink (`#ECE8E1`).
- **Moments (the 1–2 places that carry colour):**
  1. **The particle canvas & palette swatches** — the 450,000 stipple particles and the three 20px palette swatches (`True`, `Negative`, `Paper`).
  2. **The live recording indicator (`--rec`: `#E5484D`)** — reserved strictly for active video capture, plus a quiet status pip when depth inference is running.
- **Signature Detail:** Unified hairline + optical-reticle language — `1px` `--line` (`rgba(236, 232, 225, 0.10)`) borders with subtle top highlight (`inset 0 1px 0 rgba(255, 255, 255, 0.08)`), engraved `tabular-nums` micro-typography, and a consistent `--ink` stroke language shared between the Drift bar handle (`src/overlays/driftBar.ts`), camera crop marks (`src/overlays/marks.ts`), and 1.5px-stroke UI icons (`src/ui/icons.ts`).

---

## 2. Visual Audit Summary (From `docs/audit-before/` Screenshots)

Inspecting the captured screenshots at `1920x917`, `1366x768`, and `390x844` reveals four high-impact issues immediately visible to users:
1. **Startup collision (`1920x917-empty.png`):** Initial model download (`LoadingOverlay`) blurs `TitleScreen` on first load while `TopBar` shows a cyan-bordered `MODEL / WEBGPU` pill that collides with `MARK-03` overlay text in the background.
2. **Cyan & neon wash across chrome & overlays (`1920x917-loaded.png`, `1920x917-popover.png`, `1920x917-drawer.png`):** `--accent-cyan` (`#64d2ff`) is sprayed across focus rings, active overlay pills, settings section headers, toggle switches, spinner, progress bar, and the `Inspect Depth Map (D)` button, while `src/overlays/*` paints cyan/yellow (`rgba(100, 210, 255, ...)` / `rgba(255, 214, 10, ...)`) reticles, links, and scan planes over the artwork.
3. **Mobile overflow on `390x844` (`390x844-loaded.png`, `390x844-popover.png`):** The `.drift-strip` overflows the right edge (`65%` is clipped, `Softness` slider is off-screen), and `.bottom-dock` clips `Travel` / `Swarm` / `Melt` / `Overlays` / swatches without clear scroll cues.
4. **All-caps & tracking noise:** `START`, `SOFTNESS`, `HUD OVERLAYS`, `STANDARD` / `HIGH` / `ULTRA`, `DEV TOOL`, `SPARSE` / `BALANCED` / `DENSE` shout in uppercase or wide tracking.

---

## 3. Detailed Findings by Skill Lens

### Lens A: `unslop` (`SKILL.md` & `references/signs.md`)

#### A1. Surfaces & Colour (Cyan Omnipresence, Glows, Washes)
- `src/style.css:25-29` — Unused/slop multi-hue accent tokens (`--accent-cyan: #64d2ff`, `--accent-amber: #ffd60a`, `--accent-magenta: #ec4899`) remain in `:root` and drive 25+ chrome rules.
- `src/style.css:258, 1090` — `button:focus-visible` and `.palette-swatch-btn:focus-visible` use `outline: 2px solid var(--accent-cyan)` instead of `--ink` / `--border-focus`.
- `src/style.css:396, 434-435, 454` — `.brand-tagline`, `.drop-zone:hover` border/wash (`rgba(100, 210, 255, 0.06)`), and `.drop-zone-icon` use `--accent-cyan`.
- `src/style.css:540-542, 562-586, 605-608, 615, 703` — `.app-branding-badge`, `.depth-hud-model` / `.depth-hud-heuristic` saturated green/amber washes, `.top-bar-loading-pill`, `.pulse-dot`, and `.thumb-spinner` use neon cyan/green/amber washes.
- `src/style.css:1052, 1242-1244, 1258, 2683-2685, 2697` — `.dock-overlays-dot`, `.popover-overlay-pill.active`, and `.drawer-overlay-btn.active` use cyan washes, cyan borders, and cyan text instead of quiet surface steps + `--ink`.
- `src/style.css:1469` — `.telemetry-pts` uses `color: var(--accent-cyan)`.
- `src/style.css:1609-1611, 1736` — `.section-title` in Settings Drawer uses cyan text + cyan bottom border; `input:checked + .slider-switch` uses cyan fill.
- `src/style.css:1794, 1803-1805` — `.error-card` and `.error-badge` use saturated red washes (`rgba(255, 80, 80, 0.15)`) instead of toned `--rec` / hairline.
- `src/style.css:1834-1835, 1867, 1880` — `.hud-spinner`, `.loading-pct`, and `.progress-fill` use `--accent-cyan`.
- `src/style.css:2047, 2064, 2079, 2116, 2126` — Credits modal badges, links, `.license-summary`, and `.btn-drawer-action` use `--accent-cyan`.
- `src/style.css:2219, 2268, 2330, 2362-2363` — Depth Debug modal badge, inset black glow (`box-shadow: inset 0 0 20px rgba(0, 0, 0, 0.8)`), `accent-color: var(--accent-cyan)`, and primary button fill use `--accent-cyan`.
- `src/overlays/marks.ts:57, 60` — Camera crop marks and `CROP //` label use `rgba(140, 220, 255, ...)` (neon cyan) on dark backgrounds instead of `--ink` (`rgba(236, 232, 225, ...)`).
- `src/overlays/links.ts:86, 98, 110` — Link lines use glowing cyan `rgba(100, 210, 255, ...)` and `rgba(160, 230, 255, 0.85)`.
- `src/overlays/scan.ts:39-49, 59, 67, 75, 89, 117, 125` — Scan plane gradient, glow line, and pings use cyan + bright yellow (`rgba(255, 214, 10, ...)`).
- `src/overlays/trackers.ts:455-456, 501, 505, 523-524` — Tracker brackets and labels use cyan/blue tints.
- `src/overlays/draw.ts:105, 130, 149, 165, 190` and `src/overlays/trails.ts:72, 95, 105, 111` — Draw strokes and trails use cyan + yellow glows.
- `src/overlays/overlayRenderer.ts:175` — Active overlay accent stroke uses `rgba(100, 210, 255, 0.95)`.

#### A2. Type & Tracking
- `src/style.css:537, 553, 1186, 1368, 1459, 1606, 1799, 2037, 2215` — Heavy `font-weight: 700` on badges, titles, timers, and section headers (violates `400`/`500` scale, `600` max). Also `src/style.css:459` (`.drop-zone-text-primary` `700`).
- `src/style.css:385, 394, 460, 528, 543, 556, 1187, 1608, 1800, 2221, 2300` — Excessive letter-spacing (`0.06em` to `0.16em`) on small text and titles.
- `src/style.css:2649, 2723` — Fractional font sizes (`11.5px` on `.setting-subhead` and `.about-desc`).
- `src/overlays/marks.ts:184, 311`, `src/overlays/overlayRenderer.ts:201`, `src/overlays/scan.ts:88`, `src/overlays/trackers.ts:76-77` — Hardcoded `"SF Mono", Menlo, Consolas, monospace` and sub-10px canvas text (`8.5px`, `9px`, `10.5px`).

#### A3. Copy & All-Caps Shouting
- `src/style.css:850` — `.drift-slider-label` forces `text-transform: uppercase;` (`START`, `SOFTNESS`).
- `src/style.css:1189` — `.popover-title` forces `text-transform: uppercase;` (`HUD OVERLAYS`).
- `src/ui/settingsDrawer.ts:157, 164, 171` — Quality buttons rendered as `STANDARD`, `HIGH`, `ULTRA` instead of sentence case (`Standard`, `High`, `Ultra`).
- `src/ui/settingsDrawer.ts:401, 702` — Tracker density readout rendered as `SPARSE`, `DENSE`, `BALANCED` instead of sentence case.
- `src/ui/depthDebugModal.ts:136` — `<span class="depth-modal-badge">DEV TOOL</span>` uses all-caps.
- `src/ui/topBar.ts:24-25, 34, 36, 44, 63` — `MODEL / WEBGPU` / `WASM` / `HEURISTIC` all-caps HUD pill.
- `src/ui/titleScreen.ts:131, 147` and `src/ui/loadingOverlay.ts:82` — Unnecessary hype/buzzword phrasing (`instant`, `State-of-the-art` in `src/ui/settingsDrawer.ts:497` and `src/ui/creditsModal.ts:198`).

#### A4. Spacing & 4px Grid
- `src/style.css:264` — `.btn { padding: 10px 20px; }` (10px off 4px grid).
- `src/style.css:423, 443` — `.drop-zone { padding: 38px 24px; }` (38px off grid); `.drop-zone-content { gap: 10px; }` (10px off grid).
- `src/style.css:538, 550, 554, 602` — `3px 6px`, `gap: 5px`, `3px 8px`, `4px 10px`.
- `src/style.css:1149, 1156, 1179, 1180, 1214, 1219` — `calc(100% + 10px)`, `padding: 12px 14px`, `margin-bottom: 10px`, `padding-bottom: 6px`, `gap: 6px`, `padding: 6px 12px`.
- `src/style.css:1361, 1362` — `padding: 0 10px; gap: 6px;`.
- `src/style.css:1550, 1592, 1650-1651, 1726-1729, 1793, 1816` — `20px 24px`, `gap: 14px`, `gap: 10px`, `3px` offsets.
- `src/style.css:2609, 2657, 2658, 2664, 2666, 2704, 2707, 2732` — `padding: 3px`, `gap: 6px`, `margin-top: 6px`, `padding: 0 10px`, `padding: 14px`, `gap: 10px`.

#### A5. Nested Radii & Details
- `src/style.css:1157, 1220` — `.overlays-popover` has `border-radius: var(--radius-dock)` (`14px`) with `12px 14px` padding, yet `.popover-overlay-pill` uses `var(--radius-control)` (`10px`) instead of `14 - 12 = 2px` -> clamped to `6px` (`--radius-sm`).
- `src/style.css:2608, 2617` — `.quality-segmented-control` has `10px` radius + `3px` padding, inner `.quality-seg-btn` uses `calc(var(--radius-control) - 2px)` (`8px` instead of `6px`).
- `src/style.css:2703` — `.about-card` references `var(--radius-card)`, which is **undefined** in `:root` (`src/style.css:51-58` only defines `--radius-control`, `--radius-dock`, `--radius-pill`, `--radius-sm`, `--radius-md`, `--radius-lg`, `--radius-full`), causing sharp `0px` corners on `.about-card`.

---

### Lens B: `web-design-guidelines` (`SKILL.md`)

1. **Contrast & Information Conveyance**:
   - `src/style.css:23` — `--text-dim: rgba(236, 232, 225, 0.40)` on `#050506` / `#0c0c0e` yields ~3.7:1 contrast, below the **4.5:1** WCAG AA minimum for small 11–12px metadata (`.drop-zone-text-secondary`, `.error-subtext`, `.toggle-description`, `.drawer-subtitle`, `.quality-note`, `.license-list li`).
   - `src/style.css:1804` — `.error-badge` (`#ff6b6b` on `rgba(255, 80, 80, 0.15)`) relies on color + text "Notice" without an icon.
2. **Focus & Keyboard**:
   - `src/style.css:864, 1643` — `.drift-slider` and `.range-slider` set `outline: none;` without providing a `:focus-visible` ring on the slider track or thumb!
   - `src/style.css:253-260` — `button` sets `outline: none`, and `button:focus-visible` uses `--accent-cyan` instead of high-contrast `--ink` (`#ECE8E1`).
3. **Touch & Hit Targets**:
   - `src/style.css:1192-1196` — `.popover-close-btn` is `28x28px` (below 40–44px touch target on mobile; `390x844-popover.png` shows it's small).
   - `src/ui/floatingControls.ts:422-448` / `src/style.css:857-897` — `.drift-slider` is only `80px` wide with a `14px` thumb and `4px` track, making touch scrubbing difficult on `390x844`.
4. **Layout & Responsive Overflow**:
   - `src/style.css:780-905` — `.drift-strip` has `white-space` / fixed widths that overflow `390px` viewports (`390x844-loaded.png`: `65%` is clipped at the right edge and `Softness` is off-screen).
   - `src/style.css:930-970` — `.dock-scroll-viewport` clips modes/overlays/swatches on `390x844` without visible scroll affordance or compact mobile layout.
5. **Async State Coverage**:
   - `src/ui/loadingOverlay.ts:65-84` — Error state has Retry + Procedural Fallback (good), but `TitleScreen` remains visible/blurred underneath `LoadingOverlay` during startup model download (`1920x917-empty.png`).

---

### Lens C: `design-critique` (`SKILL.md`)

1. **2-Second First Impression (`1920x917-empty.png`)**:
   - On initial load, `LoadingOverlay` immediately covers `TitleScreen` with a blurred backdrop, obscuring the product's calm opening statement. Letting the user see `TitleScreen` cleanly (or deferring/quieting startup model status to the top-bar pill while empty) would make the first 2 seconds much clearer.
2. **Cognitive Load & Visual Hierarchy (`1920x917-loaded.png`)**:
   - With default overlays (`Trackers` + `Marks` both ON), 40+ cyan `TRK-XX / NODE-XX / EDGE-XX / DEPTH-XX` callouts and `OPTICAL // RETICLE` labels clutter the particle artwork, competing with the 450k stipple particles. Toning overlay ink down to quiet `--ink` hairlines and fewer/quieter labels restores the artwork as the focal point.
3. **Affordance & Usability (`1920x917-drawer.png`)**:
   - The native browser scrollbar in `.drawer-body` (`1920x917-drawer.png` far right) renders as a bright white system bar against `#0e0e12`, breaking the darkroom instrument immersion. Custom thin dark scrollbar styling is needed.
   - Destructive/global `Reset to Defaults` button (`src/ui/settingsDrawer.ts:518`) sits at the bottom of the scroll container with standard `.btn-secondary` styling; keeping it clearly separated from sliders is good, and sentence-casing it (`Reset to defaults`) reduces visual noise.

---

### Lens D: `a11y-debugging` (`SKILL.md`)

1. **ARIA & Roles**:
   - `src/ui/floatingControls.ts:471-475` vs `src/ui/settingsDrawer.ts:359-362` — Overlay toggles use `role="switch"` + `aria-checked` in the popover, but `aria-pressed` in the drawer; standardizing and ensuring `aria-controls` / `aria-expanded` on `.dock-overlays-btn` (`floatingControls.ts:512-513`) is good, though focus trapping / `Escape` handling on `SettingsDrawer`, `CreditsModal`, and `DepthDebugModal` should return focus to the trigger button on close (currently only `FloatingControls.closeOverlaysPopover(true)` returns focus).
   - `src/ui/settingsDrawer.ts:281` — `<label>Depth Map Inspector</label>` has no `for` attribute (orphaned label).
   - `src/ui/settingsDrawer.ts:353` — `<label class="setting-subhead">Toggle Layers</label>` has no `for` attribute (orphaned label; should be a `<span>` or `<h4>` or `aria-labelledby` on `.drawer-overlays-grid`).
   - `src/ui/titleScreen.ts:114` — `.title-close-btn` uses `ICONS.close` with `aria-label="Close dialog"` even though `.title-screen` has `role="region"`.
2. **Keyboard Focus Visibility**:
   - `src/style.css:864, 1643` — Range inputs suppress `outline: none` with no `:focus-visible` indicator.
   - `src/style.css:1705-1709` — `.switch input` is `opacity: 0; width: 0; height: 0;` with no `:focus-visible + .slider-switch` focus ring! Keyboard users tabbing to `Adaptive 60 FPS`, `Centre on subject`, or `Debug Readout HUD` get zero visual focus feedback.
3. **Tap Targets**:
   - `src/style.css:1192-1196` — `.popover-close-btn` (`28x28px`) is below the 44x44px touch guideline.

---

### Lens E: `review-animations` (`SKILL.md`)

1. **Unjustified Looping Animations**:
   - `src/style.css:408-418, 428` — `@keyframes breathingBorder` loops infinitely on `.drop-zone` when idle. Remove.
   - `src/style.css:1363, 1373-1382` — `@keyframes recordPulse` pulses the entire `.btn-record.is-recording` button opacity/border. Replace with a static `--rec` pill and a steady or subtle dot.
   - `src/style.css:616, 619-622` — `@keyframes pulseDot` scales `0.8 -> 1.2` on `.pulse-dot`. Keep subtle or static.
2. **Catch-all Transitions & Hover Scales**:
   - `src/style.css:824` — `.drift-dir-btn` uses `transition: all 120ms ease-out;`. Replace with `transition: background-color 160ms var(--ease-out), border-color 160ms var(--ease-out), color 160ms var(--ease-out);`.
   - `src/style.css:436` — `.drop-zone:hover` uses `transform: scale(1.01)`. Remove hover scale.
   - `src/style.css:881, 896, 1660` — Slider thumbs use `transform: scale(1.15)` / `scale(1.2)` on hover. Remove hover scale.
   - `src/style.css:1135` — `.palette-swatch-btn.active .swatch-circle` uses `transform: scale(1.08)`. Keep ring without jumpy scale, or use clean border ring.
3. **Layout-Triggering Transitions**:
   - `src/style.css:1881` — `.progress-fill` transitions `width 160ms ease-out` (acceptable for a single bar, or prefer `transform: scaleX(...)`).
4. **Missing `prefers-reduced-motion`**:
   - `src/style.css` — **Zero** `@media (prefers-reduced-motion: reduce)` rules exist anywhere in `src/style.css`. Must add a global `@media (prefers-reduced-motion: reduce)` block disabling/shortening transitions and keyframe animations (`.hud-spinner`, `.thumb-spinner`, `.app-header`, `.app-footer`, `.settings-drawer-panel`).
5. **Easing Consistency**:
   - `src/style.css:61-62` defines `160ms ease-out`, while `src/style.css:2574-2575` uses `280ms cubic-bezier(0.16, 1, 0.3, 1)` and `2623, 2674` use `140ms ease`. Standardize on `cubic-bezier(0.22, 1, 0.36, 1)` across UI chrome.

---

## 4. Captured Before-Screenshots (`docs/audit-before/`)

All 18 baseline screenshots were captured via headless Chrome + CDP across 3 viewports and 6 states:
- `1920x917`: `empty`, `loading`, `loaded`, `popover`, `drawer`, `error`
- `1366x768`: `empty`, `loading`, `loaded`, `popover`, `drawer`, `error`
- `390x844`: `empty`, `loading`, `loaded`, `popover`, `drawer`, `error`
