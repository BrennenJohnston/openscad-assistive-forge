# Color System Guide

## Overview

The OpenSCAD Web Customizer uses an accessible color system built on [Radix Colors](https://www.radix-ui.com/colors), designed to meet **WCAG 2.2 AA** standards for normal themes and **WCAG AAA (7:1)** standards for high contrast mode.

## Core Principles

1. **Accessibility First**: All color combinations meet or exceed WCAG requirements
2. **Semantic Naming**: Use purpose-based tokens, not raw color values
3. **Theme Consistency**: Colors adapt automatically across light/dark/high contrast themes
4. **No Information by Color Alone**: All states include icons/text (WCAG 1.4.1)

## Color Palette

### Primary Colors

| Purpose | Light Mode | Dark Mode | Usage |
|---------|------------|-----------|-------|
| **Accent** (Yellow) | `--yellow-9` | `--yellow-9` | Primary actions, highlights, branding |
| **Success** (Green) | `--green-9` | `--green-9` | Successful operations, positive states |
| **Info** (Teal) | `--teal-9` | `--teal-9` | Informational messages, secondary actions |
| **Error** (Red) | `--red-9` | `--red-9` | Errors, destructive actions |
| **Warning** (Amber) | `--amber-9` | `--amber-9` | Warnings, caution states |
| **Neutral** (Slate) | `--slate-1` to `--slate-12` | `--slate-1` to `--slate-12` | Text, backgrounds, borders |

## Semantic Tokens

Always use semantic tokens instead of raw Radix scales. Semantic tokens automatically adapt to themes.

### Background Tokens

```css
--color-bg-primary      /* Main background */
--color-bg-secondary    /* Subtle secondary background */
--color-bg-tertiary     /* More prominent secondary background */
--color-bg-elevated     /* Floating elements (cards, popovers) */
```

### Text Tokens

```css
--color-text-primary    /* Primary text (high contrast) */
--color-text-secondary  /* Secondary text (medium contrast) */
--color-text-tertiary   /* Tertiary text (lower contrast) */
--color-text-muted      /* Muted/subtle text */
```

### Accent Tokens (Yellow)

```css
--color-accent          /* Primary accent (buttons, links) */
--color-accent-hover    /* Hover state */
--color-accent-text     /* Text on accent backgrounds */
--color-accent-subtle   /* Subtle accent backgrounds */
```

### Success Tokens (Green)

```css
--color-success         /* Success button backgrounds */
--color-success-hover   /* Success hover state */
--color-success-text    /* Success text */
--color-success-bg      /* Success message backgrounds */
```

### Info Tokens (Teal)

```css
--color-info            /* Info button backgrounds */
--color-info-hover      /* Info hover state */
--color-info-text       /* Info text */
--color-info-bg         /* Info message backgrounds */
```

### Error Tokens (Red)

```css
--color-error           /* Error button backgrounds */
--color-error-hover     /* Error hover state */
--color-error-text      /* Error text */
--color-error-bg        /* Error message backgrounds */
```

### Warning Tokens (Amber)

```css
--color-warning         /* Warning button backgrounds */
--color-warning-hover   /* Warning hover state */
--color-warning-text    /* Warning text */
--color-warning-bg      /* Warning message backgrounds */
```

### Border Tokens

```css
--color-border          /* Standard borders */
--color-border-light    /* Subtle borders */
--color-border-hover    /* Border hover states */
```

### Input Tokens

```css
--color-input-bg        /* Input backgrounds */
--color-input-border    /* Input borders */
--color-input-border-focus /* Input focus borders */
```

### Interactive Tokens

```css
--color-hover-bg        /* Hover background overlays */
```

### Focus Tokens

```css
--color-focus           /* Focus indicator color (brand-neutral blue) */
--focus-ring            /* Complete focus ring (box-shadow) */
```

## Theme System

### Normal Themes

#### Light Mode

Activated by:
- Default state (no theme set)
- `data-theme="light"` on `:root`

Uses Radix light scales with slate backgrounds and dark text.

#### Dark Mode

Activated by:
- `data-theme="dark"` on `:root`
- OR `prefers-color-scheme: dark` when no manual theme is set

Uses Radix dark scales with dark backgrounds and light text.

### High Contrast Mode

Activated by `data-high-contrast="true"` on `:root` (works with any theme).

Features:
- **7:1 contrast ratios** for all text
- **Thicker borders** (2-3px)
- **Stronger focus indicators** (4px)
- **Enhanced typography** (larger font sizes)
- **Brand-neutral colors** for maximum contrast

## Usage Examples

### Creating a Success Message

```html
<div class="alert" style="background-color: var(--color-success-bg); 
                          color: var(--color-success-text); 
                          border: 1px solid var(--color-success)">
  <span class="icon">✓</span>
  <span>Operation completed successfully!</span>
</div>
```

**Note**: Always include an icon/symbol, not just color (WCAG 1.4.1).

### Creating an Info Button

```css
.btn-info {
  background-color: var(--color-info);
  color: white;
  border: none;
}

.btn-info:hover {
  background-color: var(--color-info-hover);
}

.btn-info:focus-visible {
  outline: 3px solid var(--color-focus);
  outline-offset: 2px;
}
```

### Creating a Custom Component

```css
.my-component {
  background-color: var(--color-bg-elevated);
  color: var(--color-text-primary);
  border: 1px solid var(--color-border);
}

.my-component:hover {
  background-color: var(--color-hover-bg);
  border-color: var(--color-border-hover);
}
```

## Focus Indicators

The system uses **brand-neutral blue** for focus indicators to maintain consistency with OS conventions:

- **Light Mode**: `#0052cc` (darker blue)
- **Dark Mode**: `#66b3ff` (lighter blue)
- **Minimum Size**: 3px outline (4px in high contrast mode)
- **Minimum Contrast**: 3:1 against adjacent colors

### Focus Best Practices

```css
/* Always provide both :focus and :focus-visible */
.btn:focus {
  outline: 3px solid var(--color-focus);
  outline-offset: 2px;
}

.btn:focus:not(:focus-visible) {
  outline: none; /* Hide outline for mouse users */
}

.btn:focus-visible {
  outline: 3px solid var(--color-focus);
  outline-offset: 2px;
  /* Optional: add box-shadow for increased perimeter */
  box-shadow: 0 0 0 1px var(--color-bg-primary), 
              0 0 0 4px var(--color-focus);
}
```

## Special Features

### Forced Colors Mode

Automatically adapts to Windows High Contrast and other OS-enforced color schemes:

- All semantic tokens map to system colors (Canvas, CanvasText, LinkText, etc.)
- Focus uses `outline` instead of `box-shadow`
- Borders become visible on all interactive elements
- Background images are removed

### Enhanced Contrast Preference

Responds to `prefers-contrast: more`:

- Increases text contrast
- Thickens borders
- Enhances focus indicators
- Preserves color identity

### Reduced Motion

Respects `prefers-reduced-motion: reduce`:

- Disables animations
- Reduces transition durations

## Contrast Requirements

### Normal Themes (WCAG AA)

- **Normal text** (< 18px): 4.5:1
- **Large text** (≥ 18px or ≥ 14px bold): 3:1
- **UI components** (borders, icons, states): 3:1

### High Contrast Mode (WCAG AAA)

- **Normal text**: 7:1
- **Large text**: 4.5:1
- **UI components**: 3:1 (same as AA)

## Color Blindness Considerations

The palette is designed to be distinguishable for common color vision deficiencies:

- **Yellow vs Green**: Sufficient brightness difference
- **Teal vs Green**: Distinct hues
- **Error vs Warning**: Different saturation and brightness
- **Icons Required**: Never rely on color alone (WCAG 1.4.1)

### Testing Tools

- **Browser DevTools**: Chrome/Edge → Rendering → Emulate vision deficiencies
- **Colorblindly Extension**: [Chrome Web Store](https://chrome.google.com/webstore/detail/colorblindly)
- **Coblis Simulator**: [color-blindness.com/coblis](https://www.color-blindness.com/coblis-color-blindness-simulator/)

## Migration from Old System

If you're updating existing components, see the [Color Migration Guide](./COLOR_MIGRATION_GUIDE.md) for token mapping.

## Automated Testing

The color system includes automated tests:

- **Unit Tests**: `tests/unit/color-contrast.test.js` (WCAG 2.x + APCA)
- **E2E Tests**: `tests/e2e/accessibility.spec.js` (theme matrix, forced-colors, prefers-contrast)

Run tests:

```bash
npm test                  # Unit tests
npm run test:e2e          # E2E tests
```

## Resources

### Official Documentation

- [Radix Colors](https://www.radix-ui.com/colors)
- [WCAG 2.2 Guidelines](https://www.w3.org/WAI/WCAG22/quickref/)
- [MDN: CSS Color](https://developer.mozilla.org/en-US/docs/Web/CSS/color_value)

### Contrast Checking Tools

- [WebAIM Contrast Checker](https://webaim.org/resources/contrastchecker/)
- [Colour Contrast Analyser](https://www.tpgi.com/color-contrast-checker/)
- [APCA Contrast Calculator](https://www.myndex.com/APCA/)

### Color Accessibility

- [WCAG 1.4.1 Use of Color](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html)
- [WCAG 1.4.3 Contrast (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)
- [WCAG 1.4.11 Non-text Contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html)
- [WCAG 2.4.13 Focus Appearance](https://www.w3.org/WAI/WCAG22/Understanding/focus-appearance.html)

## Support

For questions or issues with the color system:

1. Check the [Migration Guide](./COLOR_MIGRATION_GUIDE.md)
2. Review [Accessibility Guide](./ACCESSIBILITY_GUIDE.md)
3. File an issue on GitHub

## License

The color system implementation is part of the OpenSCAD Web Customizer project.

Radix Colors is licensed under MIT. See [Radix UI License](https://github.com/radix-ui/colors/blob/main/LICENSE).
