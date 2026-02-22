# Responsive UI Check

Run this after every UI change. It's a quick-reference version of the full
`docs/RESPONSIVE_UI_GUARDRAILS.md` guide.

## Checklist

| Check | Requirement | Detection |
| --- | --- | --- |
| **Mobile layout** | Usable below 768px | Visual test at 375px and 768px widths |
| **Touch targets** | Minimum 44x44px | Token: `--size-touch-target` or equivalent |
| **Pointer density** | Compact layout for `pointer: fine` | `@media (pointer: fine)` rule exists |
| **Dynamic viewport** | Uses `dvh`/`svh` with `vh` fallback | CSS `@supports` progressive enhancement |
| **Safe area insets** | Padding accounts for notches | `env(safe-area-inset-*)` used |
| **System preferences** | All 5 respected (see below) | Media query check |
| **Off-canvas drawers** | Keyboard dismissible, focus trapped | WAI-ARIA dialog pattern |
| **Print media** | Non-essential UI hidden | `@media print` rule exists |

## System preference media queries (all 5 required)

| Media Query | Effect | Priority |
| --- | --- | --- |
| `prefers-color-scheme: dark` | Dark theme | Required |
| `prefers-reduced-motion: reduce` | Disable animations/transitions | Required (WCAG 2.3.3) |
| `prefers-contrast: more` | Thicken borders, strengthen focus rings | Required (WCAG 1.4.11) |
| `forced-colors: active` | Map to OS system colors | Required (Windows High Contrast) |
| `prefers-reduced-transparency: reduce` | Remove semi-transparent backgrounds | Recommended |

## Copy-paste version (for PR descriptions)

```markdown
### Responsive UI check

- [ ] Mobile layout works at 375px and 768px
- [ ] Touch targets are at least 44x44px
- [ ] Pointer density: compact layout for `pointer: fine`
- [ ] Dynamic viewport: `dvh`/`svh` with `vh` fallback
- [ ] Safe area insets: `env(safe-area-inset-*)` used
- [ ] `prefers-color-scheme: dark` respected
- [ ] `prefers-reduced-motion: reduce` respected
- [ ] `prefers-contrast: more` respected
- [ ] `forced-colors: active` respected
- [ ] `prefers-reduced-transparency: reduce` respected
- [ ] Off-canvas drawers: keyboard dismissible, focus trapped
- [ ] Print media: non-essential UI hidden
```
