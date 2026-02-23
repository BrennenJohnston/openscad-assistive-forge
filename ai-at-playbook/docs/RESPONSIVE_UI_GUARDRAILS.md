# Responsive UI Guardrails

A desktop-only mindset produces unusable mobile experiences. Mobile accessibility is not optional for AT projects. Many AT users rely on mobile
devices as their primary computing platform. Touch interaction has different accessibility
requirements than pointer interaction. And system preferences (reduced motion, high
contrast, forced colors) are critical accessibility features, not nice-to-haves.

This guide codifies the responsive UI patterns that any AT web project should follow.

## Why responsive UI is an AT guardrail

Three reasons responsive UI belongs in an accessibility playbook:

- Many AT users rely on mobile devices as their primary computing platform
- Touch interaction has different accessibility requirements than pointer interaction
- System preferences (reduced motion, high contrast, forced colors) are critical
  accessibility features, not nice-to-haves

## Responsive UI checklist

AI agents making UI changes MUST verify every item in this table. A separate
copy-paste checklist is in `checklists/responsive-ui-check.md`.

| Check | Requirement | Detection |
| --- | --- | --- |
| **Mobile layout** | Usable below 768px | Visual test at 375px and 768px widths |
| **Touch targets** | Minimum 44x44px | Token: `--size-touch-target` or equivalent |
| **Pointer density** | Compact layout for `pointer: fine` | `@media (pointer: fine)` rule exists |
| **Dynamic viewport** | Uses `dvh`/`svh` with `vh` fallback | CSS `@supports` progressive enhancement |
| **Safe area insets** | Padding accounts for notches | `env(safe-area-inset-*)` used |
| **System preferences** | All 5 respected | See the system preference media queries section below |
| **Off-canvas drawers** | Keyboard dismissible, focus trapped | WAI-ARIA dialog pattern |
| **Print media** | Non-essential UI hidden | `@media print` rule exists |

## System preference media queries (mandatory)

Every AT web project MUST respect these OS-level preferences. These are not optional
enhancements — they're accessibility requirements.

| Media Query | Effect | Priority |
| --- | --- | --- |
| `prefers-color-scheme: dark` | Dark theme | Required |
| `prefers-reduced-motion: reduce` | Disable animations/transitions | Required (WCAG 2.3.3) |
| `prefers-contrast: more` | Thicken borders, strengthen focus rings | Required (WCAG 1.4.11) |
| `forced-colors: active` | Map to OS system colors | Required (Windows High Contrast) |
| `prefers-reduced-transparency: reduce` | Remove semi-transparent backgrounds | Recommended |

### Implementation pattern

```css
/* Dark theme */
@media (prefers-color-scheme: dark) {
  :root {
    /* [CONFIGURE: dark theme token overrides] */
  }
}

/* Reduced motion */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}

/* High contrast */
@media (prefers-contrast: more) {
  :root {
    /* [CONFIGURE: thicker borders, stronger focus rings] */
  }
}

/* Windows forced colors */
@media (forced-colors: active) {
  /* Let the OS handle colors — override only structural properties */
  /* [CONFIGURE: forced-colors overrides] */
}

/* Reduced transparency */
@media (prefers-reduced-transparency: reduce) {
  :root {
    /* [CONFIGURE: replace semi-transparent values with opaque ones] */
  }
}
```

## Design token approach

A hand-authored CSS approach with CSS custom properties as the design token layer
is recommended over CSS frameworks because:

- Zero framework dependency — no version conflicts or breaking changes
- Full control over accessibility behavior
- Token naming follows intuitive scales (`--space-sm`, `--font-size-xs`, etc.)
- Works with any build tool or none at all

### Recommended token categories

| Category | Example Tokens | Purpose |
| --- | --- | --- |
| **Spacing** | `--space-xs`, `--space-sm`, `--space-md`, `--space-lg` | Consistent padding and margin |
| **Font sizes** | `--font-size-xs`, `--font-size-sm`, `--font-size-base` | Readable text at every viewport |
| **Colors** | `--color-bg`, `--color-text`, `--color-accent` | Theme-aware color palette |
| **Borders** | `--border-width`, `--border-radius` | Consistent visual structure |
| **Touch targets** | `--size-touch-target` (44px), `--size-touch-target-sm` (36px) | Accessible tap areas |
| **Focus** | `--focus-ring-width`, `--focus-ring-color` | Visible focus indicators |
| **Z-index** | `--z-drawer`, `--z-modal`, `--z-toast` | Predictable stacking |

### Project-specific configuration

- **Token file location:** `[CONFIGURE: path to CSS variables file, e.g., src/styles/variables.css]`
- **Semantic token file:** `[CONFIGURE: path to semantic tokens, e.g., src/styles/semantic-tokens.css]`
- **Touch target minimum:** `[CONFIGURE: minimum touch target size, e.g., 44px]`
- **Breakpoints:** `[CONFIGURE: breakpoint values, e.g., 768px, 1024px, 1280px]`
