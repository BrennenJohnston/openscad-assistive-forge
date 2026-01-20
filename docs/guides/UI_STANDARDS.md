## UI Standards (Design + Accessibility)

This project uses a **token-driven UI** (CSS custom properties) and a small set of reusable interaction patterns. When adjusting UI, prefer **reusing existing patterns** over inventing new ones—this keeps behavior and theming consistent across **light/dark/auto**, **high contrast**, and **forced-colors** modes.

### Design tokens (required)

- **Do** use CSS variables from `src/styles/variables.css` (and the imported `color-scales.css` + `semantic-tokens.css`).
- **Don’t** hardcode colors (hex) or sizes except for small, intentional constants (ex: 44px touch target height).
- **Do** use `currentColor` for SVG icons so icon colors follow text color tokens.

### Interactive sizing (required)

- **Touch targets**: interactive controls should be at least **44×44px**.
- **Focus**: all interactive controls must have a visible focus indicator (use `:focus-visible`).
- **Reduced motion**: any transition must be disabled under `prefers-reduced-motion: reduce`.

### Drawer controls (pattern)

This app uses multiple drawer-like controls:

- **Parameters panel**: left panel collapse button (`#collapseParamPanelBtn`)
- **Camera panel**: right-side drawer (`#cameraPanelToggle`)
- **Preview Settings & Info**: overlay drawer (`#previewDrawerToggle`)
- **Actions drawer**: bottom bar expandable actions (`#actionsDrawerToggle`)

When editing drawer UI:

- **Header text** should use token-based typography (generally `var(--font-size-sm)` and `var(--color-text-primary)` for drawer headers/titles).
- **Toggle buttons** should look consistent across drawers:
  - Use `btn btn-sm btn-icon` in markup (plus the drawer-specific class).
  - Use token-driven backgrounds/borders (`--color-bg-secondary/tertiary`, `--color-border`).
- **Icons**
  - Prefer a single chevron style (SVG polyline) at **20×20** with `stroke="currentColor"` and `stroke-width="2"`.
  - Rotate icons via CSS for state, and add `prefers-reduced-motion` fallbacks.

### Theming and contrast (required)

- **Normal themes**: rely on semantic tokens (`--color-text-primary`, `--color-bg-*`, `--color-border`, `--color-focus`, etc.).
- **High contrast (in-app)**: use `:root[data-high-contrast='true']` tokens—do not add one-off overrides unless necessary.
- **Forced colors**: keep controls usable in Windows High Contrast.
  - Prefer using existing forced-colors sections in CSS.
  - If you add a new interactive control with custom background/border, verify it still renders with system colors.

### Where to edit things

- **Layout / panel placement**: `src/styles/layout.css`
- **Components (buttons, headers, drawers, etc.)**: `src/styles/components.css`
- **Theme tokens**: `src/styles/variables.css` (imports `color-scales.css` + `semantic-tokens.css`)

### Quick checklist for UI tweaks

- [ ] Keyboard-only works (Tab order + Enter/Space)
- [ ] Focus ring visible (`:focus-visible`)
- [ ] Minimum 44×44px touch targets
- [ ] `prefers-reduced-motion` respected
- [ ] Looks correct in light/dark/auto
- [ ] Looks correct in app High Contrast
- [ ] Looks correct in Windows forced-colors

