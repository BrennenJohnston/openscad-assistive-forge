# Color System Migration Guide

## Overview

This guide helps you migrate from the old custom color system to the new Radix Colors-based accessible color system.

## Breaking Changes

### 1. Color Variable Names Changed

Some color tokens have been renamed or reorganized for better semantics.

### 2. Focus Indicators Use Brand-Neutral Blue

Previously, focus indicators used the brand yellow color. Now they use brand-neutral blue (#0052cc / #66b3ff) for better consistency with OS conventions and accessibility.

### 3. Warning Color Changed from Yellow to Amber

The warning state now uses Radix Amber instead of Yellow for better contrast in warning messages. Yellow remains the primary accent/brand color.

## Token Migration Map

### Background Colors

| Old Token | New Token | Notes |
|-----------|-----------|-------|
| `--color-bg-primary` | `--color-bg-primary` | ✅ No change (but uses Radix slate-1) |
| `--color-bg-secondary` | `--color-bg-secondary` | ✅ No change (but uses Radix slate-2) |
| `--color-bg-tertiary` | `--color-bg-tertiary` | ✅ No change (but uses Radix slate-3) |
| *(new)* | `--color-bg-elevated` | 🆕 Alias for elevated surfaces |

### Text Colors

| Old Token | New Token | Notes |
|-----------|-----------|-------|
| `--color-text-primary` | `--color-text-primary` | ✅ No change (but uses Radix slate-12) |
| `--color-text-secondary` | `--color-text-secondary` | ✅ No change (but uses Radix slate-11) |
| `--color-text-tertiary` | `--color-text-tertiary` | ✅ No change (but uses Radix slate-10) |
| *(new)* | `--color-text-muted` | 🆕 Alias for muted text |

### Brand Colors

| Old Token | New Token | Notes |
|-----------|-----------|-------|
| `--color-brand-yellow` | `--color-brand-yellow` | ✅ Reference only (use semantic tokens) |
| `--color-brand-green` | `--color-brand-green` | ✅ Reference only (use semantic tokens) |
| `--color-brand-black` | `--color-brand-black` | ✅ Reference only (use semantic tokens) |

### Accent Colors (Yellow)

| Old Token | New Token | Notes |
|-----------|-----------|-------|
| `--color-accent` | `--color-accent` | ✅ No change (but uses Radix yellow-9) |
| `--color-accent-hover` | `--color-accent-hover` | ✅ No change (but uses Radix yellow-10) |
| `--color-accent-text` | `--color-accent-text` | ✅ No change |
| *(new)* | `--color-accent-subtle` | 🆕 Subtle accent backgrounds (yellow-4) |

### Success Colors (Green)

| Old Token | New Token | Notes |
|-----------|-----------|-------|
| `--color-success` | `--color-success` | ✅ No change (but uses Radix green-9) |
| `--color-success-bg` | `--color-success-bg` | ✅ No change (but uses Radix green-3) |
| *(new)* | `--color-success-hover` | 🆕 Success hover state (green-10) |
| *(new)* | `--color-success-text` | 🆕 Success text color (green-11) |

### Info Colors (Teal) - NEW

| Old Token | New Token | Notes |
|-----------|-----------|-------|
| *(none)* | `--color-info` | 🆕 Info button backgrounds (teal-9) |
| *(none)* | `--color-info-hover` | 🆕 Info hover state (teal-10) |
| *(none)* | `--color-info-text` | 🆕 Info text color (teal-11) |
| *(none)* | `--color-info-bg` | 🆕 Info message backgrounds (teal-3) |

### Error Colors (Red)

| Old Token | New Token | Notes |
|-----------|-----------|-------|
| `--color-error` | `--color-error` | ✅ No change (but uses Radix red-9) |
| `--color-error-bg` | `--color-error-bg` | ✅ No change (but uses Radix red-3) |
| *(new)* | `--color-error-hover` | 🆕 Error hover state (red-10) |
| *(new)* | `--color-error-text` | 🆕 Error text color (red-11) |

### Warning Colors (Amber)

| Old Token | New Token | Notes |
|-----------|-----------|-------|
| `--color-warning` | `--color-warning` | ⚠️ Now uses Amber instead of Yellow |
| `--color-warning-bg` | `--color-warning-bg` | ⚠️ Now uses Amber instead of Yellow |
| *(new)* | `--color-warning-hover` | 🆕 Warning hover state (amber-10) |
| *(new)* | `--color-warning-text` | 🆕 Warning text color (amber-11) |

### Border Colors

| Old Token | New Token | Notes |
|-----------|-----------|-------|
| `--color-border` | `--color-border` | ✅ No change (but uses Radix slate-7) |
| `--color-border-light` | `--color-border-light` | ✅ No change (but uses Radix slate-6) |
| *(new)* | `--color-border-hover` | 🆕 Border hover states (yellow-8) |

### Input Colors

| Old Token | New Token | Notes |
|-----------|-----------|-------|
| `--color-input-bg` | `--color-input-bg` | ✅ No change (but uses Radix slate-1/2) |
| *(new)* | `--color-input-border` | 🆕 Input borders (slate-7) |
| *(new)* | `--color-input-border-focus` | 🆕 Input focus borders (yellow-8) |

### Interactive States

| Old Token | New Token | Notes |
|-----------|-----------|-------|
| `--color-hover-bg` | `--color-hover-bg` | ✅ No change (but uses Radix slate-3) |

### Focus Indicators

| Old Token | New Token | Notes |
|-----------|-----------|-------|
| `--focus-ring` | `--focus-ring` | ⚠️ Now uses brand-neutral blue instead of yellow |
| *(new)* | `--color-focus` | 🆕 Focus indicator color (#0052cc / #66b3ff) |

## Migration Steps

### Step 1: Update Focus Styles

Replace all focus styles that used accent colors with `--color-focus`:

**Before:**
```css
.btn:focus-visible {
  outline: 3px solid var(--color-accent);
  box-shadow: 0 0 0 3px rgba(244, 196, 0, 0.35);
}
```

**After:**
```css
.btn:focus-visible {
  outline: 3px solid var(--color-focus);
  box-shadow: var(--focus-ring);
}
```

### Step 2: Add Hover States

Use the new hover tokens for interactive elements:

**Before:**
```css
.btn-success:hover {
  background-color: #218838; /* Hard-coded */
}
```

**After:**
```css
.btn-success:hover {
  background-color: var(--color-success-hover);
}
```

### Step 3: Add Info Color Option

If you have secondary/informational actions, use the new teal tokens:

**New:**
```css
.btn-info {
  background-color: var(--color-info);
  color: white;
}

.btn-info:hover {
  background-color: var(--color-info-hover);
}
```

### Step 4: Update Warning States

Warning states now use amber for better contrast:

**Before:**
```css
.alert-warning {
  background-color: #fff3c2; /* Yellow background */
  color: #856404;
}
```

**After:**
```css
.alert-warning {
  background-color: var(--color-warning-bg); /* Amber background */
  color: var(--color-warning-text);
}
```

**Note**: Yellow is still the brand/accent color. Only warning states use amber.

### Step 5: Replace Hard-Coded Colors

Replace all hard-coded hex/rgba colors with semantic tokens:

**Before:**
```css
.my-component {
  background-color: #ffffff;
  color: #0b0b0b;
  border: 1px solid #d1d1d1;
}

.my-component:hover {
  background-color: #f0f0f0;
}
```

**After:**
```css
.my-component {
  background-color: var(--color-bg-primary);
  color: var(--color-text-primary);
  border: 1px solid var(--color-border);
}

.my-component:hover {
  background-color: var(--color-hover-bg);
}
```

### Step 6: Add Icons to State Indicators (WCAG 1.4.1)

Ensure all success/error/warning/info states include icons, not just color:

**Before:**
```html
<div class="alert-success" style="background: var(--color-success-bg)">
  Operation completed!
</div>
```

**After:**
```html
<div class="alert-success" style="background: var(--color-success-bg)">
  <span class="icon" aria-hidden="true">✓</span>
  <span>Operation completed!</span>
</div>
```

## Common Patterns

### Pattern 1: Colored Buttons

```css
/* Primary Button (Yellow) */
.btn-primary {
  background-color: var(--color-accent);
  color: var(--color-accent-text);
}

.btn-primary:hover {
  background-color: var(--color-accent-hover);
}

/* Success Button (Green) */
.btn-success {
  background-color: var(--color-success);
  color: white;
}

.btn-success:hover {
  background-color: var(--color-success-hover);
}

/* Info Button (Teal) - NEW */
.btn-info {
  background-color: var(--color-info);
  color: white;
}

.btn-info:hover {
  background-color: var(--color-info-hover);
}

/* Error Button (Red) */
.btn-error {
  background-color: var(--color-error);
  color: white;
}

.btn-error:hover {
  background-color: var(--color-error-hover);
}
```

### Pattern 2: Alert/Message Components

```css
/* Success Alert */
.alert-success {
  background-color: var(--color-success-bg);
  color: var(--color-success-text);
  border-left: 4px solid var(--color-success);
}

/* Info Alert - NEW */
.alert-info {
  background-color: var(--color-info-bg);
  color: var(--color-info-text);
  border-left: 4px solid var(--color-info);
}

/* Warning Alert */
.alert-warning {
  background-color: var(--color-warning-bg);
  color: var(--color-warning-text);
  border-left: 4px solid var(--color-warning);
}

/* Error Alert */
.alert-error {
  background-color: var(--color-error-bg);
  color: var(--color-error-text);
  border-left: 4px solid var(--color-error);
}
```

### Pattern 3: Focus States

```css
/* Standard Focus */
.interactive-element:focus {
  outline: 3px solid var(--color-focus);
  outline-offset: 2px;
}

/* Hide outline for mouse users */
.interactive-element:focus:not(:focus-visible) {
  outline: none;
}

/* Enhanced Focus Appearance */
.interactive-element:focus-visible {
  outline: 3px solid var(--color-focus);
  outline-offset: 2px;
  box-shadow: var(--focus-ring);
}
```

## Testing Your Migration

### 1. Visual Inspection

Check all themes:

- Light mode (`data-theme="light"`)
- Dark mode (`data-theme="dark"`)
- High contrast light (`data-theme="light" data-high-contrast="true"`)
- High contrast dark (`data-theme="dark" data-high-contrast="true"`)

### 2. Run Automated Tests

```bash
npm test                  # Unit tests (including contrast tests)
npm run test:e2e          # E2E accessibility tests
```

### 3. Manual Contrast Checks

Use the [WebAIM Contrast Checker](https://webaim.org/resources/contrastchecker/) to verify:

- Normal text: 4.5:1 minimum
- Large text: 3:1 minimum
- UI components: 3:1 minimum
- High contrast mode: 7:1 for text

### 4. Color Blindness Simulation

Test with:

- Chrome DevTools: Rendering → Emulate vision deficiencies
- Colorblindly browser extension
- Coblis online simulator

### 5. Keyboard Navigation

Press Tab through all interactive elements and verify:

- Focus indicators are visible (2px+ thick)
- Focus has 3:1 contrast against adjacent colors
- Focus order is logical

## Troubleshooting

### Issue: Focus indicators not visible

**Solution**: Make sure you're using `--color-focus` instead of `--color-accent`:

```css
/* ❌ Old way */
outline: 3px solid var(--color-accent);

/* ✅ New way */
outline: 3px solid var(--color-focus);
```

### Issue: Warning colors look too dark/light

**Solution**: Warning states now use amber. If you want the yellow accent, use `--color-accent` instead:

```css
/* For warnings (amber) */
background-color: var(--color-warning);

/* For brand/accent (yellow) */
background-color: var(--color-accent);
```

### Issue: Colors don't change in dark mode

**Solution**: Make sure you're using semantic tokens, not raw Radix scales:

```css
/* ❌ Bad - doesn't adapt to themes */
background-color: var(--slate-1);

/* ✅ Good - adapts automatically */
background-color: var(--color-bg-primary);
```

### Issue: Colors don't work in forced-colors mode

**Solution**: Semantic tokens automatically map to system colors. If you have custom components, ensure they use semantic tokens, not hard-coded colors.

## Support

If you encounter issues during migration:

1. Review the [Color System Guide](./COLOR_SYSTEM_GUIDE.md)
2. Check the [Accessibility Guide](./ACCESSIBILITY_GUIDE.md)
3. Look at updated component examples in `src/styles/components.css`
4. File an issue on GitHub

## Checklist

Use this checklist to verify your migration is complete:

- [ ] All hard-coded colors replaced with semantic tokens
- [ ] Focus styles updated to use `--color-focus`
- [ ] Hover states use new `-hover` tokens
- [ ] Warning states reviewed (amber vs yellow)
- [ ] Info color used for informational actions (if applicable)
- [ ] Icons added to all state indicators (success/error/warning/info)
- [ ] All themes tested (light/dark/HC light/HC dark)
- [ ] Automated tests passing
- [ ] Manual contrast checks completed
- [ ] Color blindness simulation tested
- [ ] Keyboard navigation verified

## Additional Resources

- [Color System Guide](./COLOR_SYSTEM_GUIDE.md)
- [Accessibility Guide](./ACCESSIBILITY_GUIDE.md)
- [Radix Colors Documentation](https://www.radix-ui.com/colors)
- [WCAG 2.2 Quick Reference](https://www.w3.org/WAI/WCAG22/quickref/)
