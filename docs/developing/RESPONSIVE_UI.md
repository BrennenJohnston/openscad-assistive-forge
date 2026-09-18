# Responsive UI Architecture

OpenSCAD Assistive Forge uses a fully custom responsive layout system built with vanilla CSS — no UI framework is installed. The design draws conceptual patterns from well-known open source projects but all implementation is original.

---

## How the Responsive System Works

### Breakpoints

Four breakpoints are defined as CSS custom properties in `src/styles/variables.css`:

| Token | Value | Description |
|---|---|---|
| `--breakpoint-mobile` | 480px | Small phones, portrait |
| `--breakpoint-tablet` | 768px | The primary layout switch point |
| `--breakpoint-desktop` | 1024px | Wide desktop content |
| `--breakpoint-wide` | 1440px | Extra-wide screens |

> Note: CSS custom properties cannot be used inside `@media` queries. The token values are documented for reference; the actual media queries use the raw pixel values.

The **768px breakpoint** is the most important. Below it the app switches from a side-by-side desktop layout to a stacked mobile layout with off-canvas drawers.

---

### Layout Modes

#### Mobile (< 768px) — Stacked + Off-Canvas Drawers

- The parameters panel becomes a **slide-in off-canvas drawer** triggered by a button tap
- The preview panel takes the full screen height
- A **bottom actions bar** provides access to Camera, Preview Settings, and other panels as collapsible drawers
- Touch targets are kept at the full **44px minimum** (WCAG 2.2 SC 2.5.5)
- The header collapses to icon-only on very small screens (< 480px portrait)

#### Tablet and Up (≥ 768px) — Side-by-Side

- The parameters panel and preview panel sit **side by side** in a flex row
- The parameters panel is resizable via a drag handle (Split.js)
- The parameters panel can be **collapsed** to a narrow strip with a toggle button
- The bottom actions bar is replaced by a **right-side panel** for camera controls

#### Desktop Density Mode (pointer: fine + ≥ 768px)

On devices with a precise pointer (mouse or trackpad), spacing and touch targets are compacted:

- Spacing tokens (`--space-sm`, `--space-md`, `--space-lg`) are reduced
- Touch targets shrink from 44px to 36px (still above WCAG 2.2 SC 2.5.8 minimum of 24px)
- Drawer dimensions are reduced for a denser layout

This is applied via `@media (pointer: fine) and (min-width: 768px)` — a technique that distinguishes touch devices from mouse devices regardless of screen size.

---

### System Preference Media Queries

Beyond screen size, the layout responds to five OS-level preferences:

| Media Query | Effect |
|---|---|
| `prefers-color-scheme: dark` | Switches to dark theme automatically |
| `prefers-reduced-motion: reduce` | Disables all CSS transitions and animations |
| `prefers-contrast: more` | Thickens borders and strengthens focus indicators |
| `forced-colors: active` | Maps all colors to OS system colors (Windows High Contrast) |
| `prefers-reduced-transparency: reduce` | Removes semi-transparent backgrounds |

There is also a `print` media query that hides non-essential UI chrome for printing.

---

### Dynamic Viewport Height

Mobile browsers have a variable viewport height because the browser chrome (address bar) appears and disappears while scrolling. The app handles this with progressive enhancement:

```css
/* Fallback */
height: 100vh;

/* Static small viewport (Safari iOS) */
@supports (height: 100svh) { height: 100svh; }

/* Dynamic viewport (modern browsers) */
@supports (height: 100dvh) { height: 100dvh; }
```

---

### Safe Area Insets

The header and welcome screen padding accounts for device notches and rounded corners using CSS environment variables:

```css
padding-top: calc(var(--space-md) + env(safe-area-inset-top, 0px));
padding-left: calc(var(--space-lg) + env(safe-area-inset-left, 0px));
padding-right: calc(var(--space-lg) + env(safe-area-inset-right, 0px));
```

---

## Open Source Projects This Approach Is Most Similar To

The custom system was designed by studying these well-known open source responsive UI projects. No code was copied from any of them.

---

### Bootstrap

- **Repo**: https://github.com/twbs/bootstrap
- **License**: MIT
- **Similarity**: The off-canvas drawer pattern used on mobile is directly modeled on Bootstrap's Offcanvas component. Bootstrap's breakpoint scale (576 / 768 / 992 / 1200px) also informed the choice of 768px as the primary layout switch point. The comment in `src/styles/layout.css` and `src/js/drawer-controller.js` explicitly credits this pattern.

---

### Tailwind CSS

- **Repo**: https://github.com/tailwindlabs/tailwindcss
- **License**: MIT
- **Similarity**: The design token approach — defining spacing, typography, border radius, shadows, and z-index as named CSS custom properties in `src/styles/variables.css` — closely mirrors Tailwind's design token philosophy. The token naming convention (`--space-sm`, `--space-md`, `--font-size-xs`, `--border-radius-md`) follows the same scale-based pattern Tailwind popularized.

---

### Radix UI (Primitives + Colors)

- **Repo**: https://github.com/radix-ui/primitives
- **License**: MIT
- **Similarity**: The semantic color token layer (`src/styles/semantic-tokens.css`) maps Radix color scales to role-based tokens (`--color-bg-primary`, `--color-text-secondary`, etc.) — the same pattern Radix UI Themes uses internally. The project uses `@radix-ui/colors` directly as a runtime dependency for the color scales themselves.

---

### WAI-ARIA Authoring Practices Guide (APG)

- **Repo**: https://github.com/w3c/aria-practices
- **License**: W3C Document License
- **Similarity**: The drawer and modal patterns follow WAI-ARIA APG specifications for dialog and disclosure widgets — focus trapping, `aria-expanded`, `aria-controls`, `role="dialog"`, and keyboard dismiss via Escape. This is referenced directly in `src/js/drawer-controller.js`.

---

## What Makes This System Different

Unlike Bootstrap or Tailwind, this project:

- Has **zero CSS framework dependencies** — the entire system is ~4,000 lines of hand-authored CSS
- Uses **CSS custom properties** (not Sass variables or utility classes) as the design token layer
- Applies a **pointer-type density mode** (`pointer: fine`) that most frameworks do not implement — giving mouse users a compact layout while preserving full touch targets on mobile
- Integrates **accessibility media queries** (`forced-colors`, `prefers-contrast`, `prefers-reduced-transparency`) that most frameworks handle poorly or not at all
- Uses **Split.js** (https://github.com/nathancahill/split) for the resizable panel gutter on desktop — the one third-party UI behavior library in the layout system

---

## Related Files

| File | Purpose |
|---|---|
| `src/styles/variables.css` | All design tokens and breakpoint definitions |
| `src/styles/layout.css` | App shell, breakpoint rules, off-canvas drawer |
| `src/styles/components.css` | Component-level responsive rules |
| `src/styles/variant.css` | Theme variant overrides (high contrast, etc.) |
| `src/js/drawer-controller.js` | Mobile drawer open/close logic and focus trap |
| `docs/specs/UI_STANDARDS.md` | Internal standards for drawer state conventions |
