# UI Standards & Design System

**Living Style Guide for OpenSCAD Assistive Forge**

This document establishes the UI consistency framework for the project, including design tokens, component patterns, layout rules, and accessibility requirements. All UI work must follow these standards to maintain consistency across themes, viewports, and user preferences.

---

## Table of Contents

1. [Design Tokens Reference](#design-tokens-reference)
2. [Component Patterns](#component-patterns)
3. [Layout Patterns](#layout-patterns)
4. [Spacing Guidelines](#spacing-guidelines)
5. [Typography Guidelines](#typography-guidelines)
6. [Interaction & Behavior Guidelines](#interaction--behavior-guidelines)
7. [Accessibility Requirements](#accessibility-requirements)
8. [Contribution & Review Rules](#contribution--review-rules)
9. [Research & Conventions](#research--conventions)

---

## Design Tokens Reference

All visual properties must use tokens from `src/styles/variables.css` (never hardcode values unless absolutely necessary).

### Spacing Tokens

| Token | Value | Usage |
|-------|-------|-------|
| `--space-2xs` | 2px | Micro spacing for compact UI |
| `--space-xs` | 4px | Minimal gaps, tight spacing |
| `--space-sm` | 8px | Default padding, small gaps |
| `--space-md` | 16px | Section padding, medium gaps |
| `--space-lg` | 24px | Large gaps, component separation |
| `--space-xl` | 32px | Page-level spacing |

**Rule:** Use spacing tokens for all `padding`, `margin`, and `gap` properties. Never use arbitrary pixel values.

### Typography Tokens

| Token | Value | Usage |
|-------|-------|-------|
| `--font-size-2xs` | 0.75rem (12px) | Micro labels |
| `--font-size-xs` | 0.8125rem (13px) | Status text, small labels |
| `--font-size-sm` | 0.875rem (14px) | Drawer titles, button labels |
| `--font-size-base` | 1rem (16px) | Body text, inputs |
| `--font-size-lg` | 1.125rem (18px) | Section headings |
| `--font-size-xl` | 1.5rem (24px) | Page headings |
| `--font-size-2xl` | 2rem (32px) | Hero text |
| `--font-size-3xl` | 2.5rem (40px) | Display text |

**Font Families:**
- `--font-family-base`: System UI font stack
- `--font-family-mono`: Monospace for code

### Touch Targets & Interactive Sizing

| Token | Value | Usage |
|-------|-------|-------|
| `--size-touch-target` | 44px | Minimum touch target (WCAG AAA) |
| `--size-touch-target-sm` | 36px | Small buttons (use sparingly) |
| `--size-icon-sm` | 16px | Small icons |
| `--size-icon-md` | 20px | Standard icons |
| `--size-icon-lg` | 24px | Large icons |
| `--size-icon-xl` | 32px | Hero icons |

**Rule:** All interactive controls (buttons, toggles, links) must meet minimum touch target size of 44×44px. Use `--size-touch-target` as the standard.

### Border & Radius Tokens

| Token | Value | Usage |
|-------|-------|-------|
| `--border-width-thin` | 1px | Subtle borders |
| `--border-width-base` | 2px | Standard borders |
| `--border-width-thick` | 3px | Emphasis borders |
| `--border-radius-xs` | 3px | Minimal rounding |
| `--border-radius-sm` | 4px | Small components |
| `--border-radius-md` | 8px | Standard components |
| `--border-radius-lg` | 12px | Large panels |
| `--border-radius-pill` | 999px | Pill buttons and toggles |
| `--radius-sm` | 6px | Alternative small radius |
| `--radius-md` | 10px | Alternative medium radius |

### Focus Ring Tokens

| Token | Value | Usage |
|-------|-------|-------|
| `--focus-ring-width` | 3px | Focus indicator thickness |
| `--focus-ring-offset` | 2px | Space between element and focus ring |

**Rule:** All interactive elements must have a visible focus indicator using `:focus-visible`.

### Shadow Tokens

| Token | Value | Usage |
|-------|-------|-------|
| `--shadow-sm` | 0 1px 2px rgba(0,0,0,0.12) | Subtle elevation |
| `--shadow-md` | 0 6px 16px rgba(0,0,0,0.18) | Drawers, dropdowns |
| `--shadow-lg` | 0 8px 24px rgba(0,0,0,0.24) | Modals, overlays |

### Motion Tokens

| Token | Value | Usage |
|-------|-------|-------|
| `--motion-fast` | 120ms | Quick transitions (hover) |
| `--motion-base` | 180ms | Standard transitions |
| `--motion-slow` | 240ms | Drawer open/close |

**Rule:** All animations/transitions must respect `prefers-reduced-motion: reduce` and be disabled or set to 0.01ms.

### Z-Index Scale

| Token | Value | Usage |
|-------|-------|-------|
| `--z-index-base` | 1 | Base layer |
| `--z-index-sticky` | 10 | Sticky elements |
| `--z-index-dropdown` | 100 | Dropdowns, menus |
| `--z-index-drawer` | 900 | Side & bottom drawers |
| `--z-index-modal-backdrop` | 950 | Modal backdrop |
| `--z-index-modal` | 1000 | Modal content |
| `--z-index-skip-link` | 9999 | Skip to main link |

**Layering Rules:**
- Parameters panel (left): `z-index: var(--z-index-base)`
- Camera panel (right): `z-index: var(--z-index-base)`
- Actions drawer (bottom sheet when expanded): `z-index: calc(var(--z-index-drawer) + 10)` (overlays side panels)
- Preview Settings drawer: `z-index: calc(var(--z-index-drawer) + 20)` (highest priority)

### Drawer Dimensions

| Token | Value | Usage |
|-------|-------|-------|
| `--drawer-collapsed-width` | 48px | Collapsed side drawer width |
| `--drawer-header-height` | 44px | Drawer header minimum height |
| `--drawer-padding` | var(--space-sm) | Internal drawer padding |
| `--drawer-handle-size` | 24px | Resize handle size |
| `--drawer-max-height` | 75vh | Maximum height for bottom sheets |
| `--actions-bar-height` | 52px | Bottom actions bar height |
| `--actions-bar-collapsed-offset` | calc(var(--actions-bar-height) + var(--space-xs)) | Mobile preview padding when actions bar is docked |
| `--actions-bar-expanded-offset` | 220px | Mobile preview padding when camera drawer is expanded |
| `--actions-bar-expanded-padding` | 130px | Drawer body padding to clear expanded actions bar |

### Color Tokens

**Rule:** Always use semantic color tokens, never direct color values.

**Text Colors:**
- `--color-text-primary`: Primary text
- `--color-text-secondary`: Secondary text
- `--color-text-tertiary`: Tertiary text
- `--color-text-muted`: Muted text

**Background Colors:**
- `--color-bg-primary`: Main background
- `--color-bg-secondary`: Secondary background
- `--color-bg-tertiary`: Tertiary background
- `--color-bg-elevated`: Elevated surfaces

**Semantic Colors:**
- `--color-accent`, `--color-accent-hover`, `--color-accent-text`
- `--color-success`, `--color-success-hover`, `--color-success-text`, `--color-success-bg`
- `--color-info`, `--color-info-hover`, `--color-info-text`, `--color-info-bg`
- `--color-error`, `--color-error-hover`, `--color-error-text`, `--color-error-bg`
- `--color-warning`, `--color-warning-hover`, `--color-warning-text`, `--color-warning-bg`

**Borders & Interactive:**
- `--color-border`, `--color-border-light`, `--color-border-hover`
- `--color-input-bg`, `--color-input-border`, `--color-input-border-focus`
- `--color-hover-bg`
- `--color-focus`

---

## Component Patterns

### Standard Drawer Component

**Required Classes:**
- `.drawer` - Base drawer container
- `.drawer-header` - Header with title and toggle
- `.drawer-body` - Content area
- `.drawer-toggle` - Toggle button
- `.collapsed` - State modifier

**Required ARIA:**
- `aria-expanded` on toggle button (true/false)
- `aria-controls` on toggle button (points to drawer ID)
- `aria-label` or `aria-labelledby` on drawer

**Standard Structure:**

```html
<div class="drawer" id="example-drawer" aria-labelledby="example-title">
  <div class="drawer-header">
    <button 
      class="drawer-toggle btn-icon"
      aria-expanded="true"
      aria-controls="example-drawer"
      aria-label="Toggle example drawer">
      <svg><!-- chevron icon --></svg>
    </button>
    <h2 id="example-title">Example</h2>
  </div>
  <div class="drawer-body">
    <!-- content -->
  </div>
</div>
```

**CSS Requirements:**

```css
.drawer-toggle {
  width: var(--size-touch-target);
  height: var(--size-touch-target);
  flex-shrink: 0;
  overflow: visible; /* prevent icon clipping */
}

.drawer-header {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  min-height: var(--drawer-header-height);
  padding: 0 var(--space-sm);
}

.drawer-header h2 {
  font-size: var(--font-size-sm);
  font-weight: 600;
  margin: 0;
}
```

**localStorage Naming Convention:**
- `openscad-drawer-{name}-state` (e.g., "openscad-drawer-parameters-state")
- `openscad-drawer-{name}-width` or `-height` for resizable drawers

### Button Component Variants

**Base Classes:**
- `.btn` - Base button styles
- `.btn-icon` - Icon-only button (requires `aria-label`)

**Variant Classes:**
- `.btn-primary` - Primary action
- `.btn-secondary` - Secondary action
- `.btn-outline` - Outlined style

**Size Classes:**
- `.btn-sm` - Small button (use sparingly)
- `.btn-lg` - Large button

**Specialized:**
- `.btn-collapse-panel` - Standardized drawer toggle (use across ALL drawers)

**CSS Requirements:**

```css
.btn {
  min-height: var(--size-touch-target);
  min-width: var(--size-touch-target);
  padding: var(--space-sm) var(--space-md);
  font-size: var(--font-size-sm);
  border-radius: var(--border-radius-md);
  cursor: pointer;
}

.btn-icon {
  width: var(--size-touch-target);
  height: var(--size-touch-target);
  padding: var(--space-xs);
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

/* Icon-only buttons MUST have aria-label */
.btn-icon:not([aria-label]):not([aria-labelledby]) {
  outline: 2px solid red; /* Development aid */
}
```

**Rule:** Never create new button classes. Extend existing button patterns or update this style guide if a new variant is genuinely needed.

### Icon System

**Standard Icon Sizes:**
- Small: `--size-icon-sm` (16px)
- Medium: `--size-icon-md` (20px) - **DEFAULT**
- Large: `--size-icon-lg` (24px)
- Extra Large: `--size-icon-xl` (32px)

**Icon Color Rule:**

```css
svg {
  stroke: currentColor;
  fill: currentColor;
  color: var(--color-text-primary);
}
```

**Rule:** Always use `currentColor` for SVG icons so they adapt to text color tokens and theme changes.

### Component Checklist Table

| Component | Required Classes | ARIA Requirements | Touch Target | Focus Visible |
|-----------|-----------------|-------------------|--------------|---------------|
| Drawer | `.drawer`, `.collapsed` | `aria-expanded`, `aria-controls` | 44×44px toggle | ✓ |
| Toggle Button | `.btn-collapse-panel` | `aria-expanded`, `aria-label` | 44×44px | ✓ |
| Icon Button | `.btn`, `.btn-icon` | `aria-label` required | 44×44px | ✓ |
| Primary Button | `.btn`, `.btn-primary` | Text or `aria-label` | 44×44px min height | ✓ |
| Input Field | (native) | `<label>` or `aria-label` | — | ✓ |
| Modal | `.modal` | `role="dialog"`, `aria-modal`, `aria-labelledby` | — | Focus trap |

---

## Layout Patterns

### Desktop Layout (≥768px)

**Structure:**
- **Left panel**: Parameters drawer (collapsible, left-aligned)
- **Center**: Canvas/preview area
- **Right panel**: Camera controls drawer (collapsible, right-aligned)
- **Bottom bar**: Actions drawer (expands upward as bottom sheet)

**Drawer Direction Rules:**
- **Side panels** (Parameters, Camera): Collapse **outward** (left panel collapses left, right panel collapses right)
- **Bottom drawers** (Actions, Preview Settings): Always expand **upward** (never sideways)

**Critical:** Bottom drawers must overlay side panels with proper z-index so Actions drawer is never hidden when Parameters/Camera are open.

### Mobile Layout (≤767px)

**Portrait Mode:**
- **Stacked vertical layout** with bottom actions bar
- **Drawers expand upward** from bottom bar
- **Header**: Title abbreviates to "OpenSCAD AF" at ≤480px portrait
- **Header controls**: GitHub/HC/theme buttons **right-aligned**

**Landscape Mode:**
- Similar to desktop but with reduced drawer widths
- Actions drawer still opens upward (bottom sheet pattern)

### Drawer Behavior Matrix

| Drawer | Desktop Direction | Mobile Direction | z-index |
|--------|------------------|------------------|---------|
| Parameters (left) | Collapse left | Expand up from bottom | `--z-index-base` |
| Camera (right) | Collapse right | Expand up from bottom | `--z-index-base` |
| Actions (bottom) | Expand up | Expand up | `calc(var(--z-index-drawer) + 10)` |
| Preview Settings | Expand up (overlay) | Expand up (overlay) | `calc(var(--z-index-drawer) + 20)` |

**Rule:** Bottom-expanding drawers (Actions, Preview Settings) MUST use `z-index` higher than side panels to remain visible.

### Responsive Breakpoints

**Note:** CSS custom properties cannot be used in media queries. Use these pixel values directly:

| Breakpoint | Value | Usage |
|------------|-------|-------|
| Mobile | 480px | Portrait phones |
| Tablet | 768px | Tablets, landscape phones |
| Desktop | 1024px | Desktops, laptops |
| Wide | 1440px | Large screens |

**Media Query Examples:**

```css
/* Mobile portrait */
@media (max-width: 480px) and (orientation: portrait) {
  /* Abbreviate title, stack controls */
}

/* Mobile general */
@media (max-width: 767px) {
  /* Switch to mobile drawer patterns */
}

/* Desktop */
@media (min-width: 768px) {
  /* Side-by-side layout */
}
```

---

## Spacing Guidelines

### Padding & Margin Rules

**Rule:** Always use spacing tokens, never arbitrary pixel values.

**Common Patterns:**
- **Drawer header padding**: `padding: 0 var(--space-sm);` (horizontal) + vertical centering
- **Drawer body padding**: `padding: var(--space-sm);`
- **Button padding**: `padding: var(--space-sm) var(--space-md);` (vertical, horizontal)
- **Section gaps**: `gap: var(--space-md);` in flexbox/grid
- **Tight spacing**: `gap: var(--space-xs);` for closely related items

### Touch Target Spacing

**Rule:** Interactive elements must have **minimum 44×44px** touch targets with adequate spacing between them.

**Spacing Between Buttons:**
- Minimum gap: `var(--space-sm)` (8px)
- Preferred gap: `var(--space-md)` (16px) for grouped buttons

**Example:**

```css
.button-group {
  display: flex;
  gap: var(--space-md);
}
```

---

## Typography Guidelines

### Hierarchy & Usage

| Element | Font Size Token | Font Weight | Usage |
|---------|----------------|-------------|-------|
| Page Title | `--font-size-xl` | 700 | Main app title |
| Section Heading | `--font-size-lg` | 600 | Panel headings |
| Drawer Title | `--font-size-sm` | 600 | Drawer headers |
| Body Text | `--font-size-base` | 400 | Main content |
| Button Label | `--font-size-sm` | 500 | Button text |
| Status Text | `--font-size-xs` | 400 | Secondary info |
| Micro Label | `--font-size-2xs` | 400 | Tiny labels |

### Line Height

**Default:** `1.5` for readability

**Tight:** `1.2` for headings and compact UI

**Example:**

```css
.drawer-header h2 {
  font-size: var(--font-size-sm);
  font-weight: 600;
  line-height: 1.2;
}

.body-text {
  font-size: var(--font-size-base);
  line-height: 1.5;
}
```

---

## Interaction & Behavior Guidelines

### Drawer Toggle Behavior

**Consistent Behavior Across All Drawers:**
1. **Toggle button** uses `aria-expanded` (true/false) to indicate state
2. **Focus retention**: After toggle, focus returns to toggle button
3. **Keyboard access**: Toggle with Enter or Space key
4. **State persistence**: Save open/closed state to localStorage
5. **Animation timing**: Use `--motion-slow` (240ms) for open/close transitions

**Example JavaScript Pattern:**

```javascript
// Consistent drawer toggle pattern
function toggleDrawer(drawer, toggle) {
  const isExpanded = toggle.getAttribute('aria-expanded') === 'true';
  const newState = !isExpanded;
  
  toggle.setAttribute('aria-expanded', String(newState));
  drawer.classList.toggle('collapsed', !newState);
  
  // Save state
  localStorage.setItem(`openscad-drawer-${drawer.id}-state`, String(newState));
  
  // Retain focus
  toggle.focus();
}
```

### Drawer Resize Persistence

**Shared Save/Load Helpers** (to keep behavior consistent with Parameters drawer):

```javascript
// Standardized persistence pattern
const STORAGE_KEY_PREFIX = 'openscad-drawer-';
const MIN_DRAWER_SIZE = 100; // Minimum width/height

function saveDrawerSize(drawerName, size) {
  if (size >= MIN_DRAWER_SIZE) {
    localStorage.setItem(`${STORAGE_KEY_PREFIX}${drawerName}-size`, String(size));
  }
}

function loadDrawerSize(drawerName, defaultSize) {
  const saved = localStorage.getItem(`${STORAGE_KEY_PREFIX}${drawerName}-size`);
  if (saved) {
    const size = parseInt(saved, 10);
    if (!isNaN(size) && size >= MIN_DRAWER_SIZE) {
      return size;
    }
  }
  return defaultSize;
}
```

**Rule:** Always save resize positions immediately when user drags (don't wait for threshold). Always restore saved size on page load.

### Motion & Animation

**Required:** All animations must respect reduced motion preference:

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

**Transition Patterns:**

```css
/* Standard transition */
.drawer {
  transition: width var(--motion-slow) ease-in-out;
}

/* Hover state */
.btn:hover {
  transition: background-color var(--motion-fast) ease;
}
```

### Focus Management

**Rule:** All interactive elements must have visible focus indicators.

**Standard Focus Style:**

```css
.btn:focus-visible,
.drawer-toggle:focus-visible {
  outline: var(--focus-ring-width) solid var(--color-focus);
  outline-offset: var(--focus-ring-offset);
}
```

**Focus Trap for Modals:**
- Trap focus within modal when open
- Return focus to trigger element when closed
- Allow Escape key to close

---

## Accessibility Requirements

### WCAG Compliance

**Target:** WCAG 2.2 AA minimum, AAA for high contrast mode

**Color Contrast Requirements:**
- **Normal text** (14px+): Minimum 4.5:1 contrast ratio
- **Large text** (18px+ or 14px+ bold): Minimum 3:1 contrast ratio
- **UI components** (borders, icons): Minimum 3:1 contrast ratio
- **High contrast mode**: 7:1 contrast ratio (AAA)

**Testing:** Use color picker tools to verify contrast ratios in all themes (light, dark, high contrast).

### Keyboard Navigation

**Required:**
- All interactive elements reachable by Tab key
- Logical tab order (left-to-right, top-to-bottom)
- Enter/Space keys activate buttons
- Escape key closes modals and drawers
- Arrow keys for slider controls

**Example:**

```html
<button 
  class="btn-icon"
  aria-label="Close drawer"
  tabindex="0">
  <!-- icon -->
</button>
```

### Screen Reader Support

**Required ARIA Patterns:**
- `aria-label` for icon-only buttons
- `aria-expanded` for toggle controls
- `aria-controls` to link toggle to target
- `role="dialog"` and `aria-modal="true"` for modals
- `aria-live="polite"` for status updates

**Example:**

```html
<button 
  aria-label="Open Parameters drawer"
  aria-expanded="false"
  aria-controls="parameters-drawer">
  <svg aria-hidden="true"><!-- icon --></svg>
</button>

<div id="parameters-drawer" role="region" aria-labelledby="param-title">
  <h2 id="param-title">Parameters</h2>
  <!-- content -->
</div>
```

### Touch & Mobile Considerations

**Touch Target Minimums:**
- Standard: 44×44px (WCAG AAA)
- Small (avoid): 36×36px (WCAG AA)

**Mobile-Specific Rules:**
- Bottom drawers expand upward (easier to reach)
- Header controls stay right-aligned (consistent with desktop)
- Title abbreviates in portrait mode without losing accessibility

**Example:**

```html
<h1>
  <span class="title-full">OpenSCAD Assistive Forge</span>
  <span class="title-short" aria-hidden="true">OpenSCAD AF</span>
</h1>
```

```css
.title-short { display: none; }

@media (max-width: 480px) and (orientation: portrait) {
  .title-full { display: none; }
  .title-short { display: inline; }
}
```

### Integration with Existing Accessibility Guides

**Related Documentation:**
- **[ACCESSIBILITY_GUIDE.md](ACCESSIBILITY_GUIDE.md)** - Comprehensive keyboard navigation, screen reader patterns, live regions
- **[CAMERA_CONTROLS_ACCESSIBILITY.md](../CAMERA_CONTROLS_ACCESSIBILITY.md)** - Camera-specific accessibility patterns

**Rule:** All new UI components must follow patterns documented in these guides.

---

## Contribution & Review Rules

### "Use Tokens, Not Magic Numbers"

**✓ DO:**
```css
.drawer-header {
  padding: var(--space-sm);
  height: var(--drawer-header-height);
}
```

**✗ DON'T:**
```css
.drawer-header {
  padding: 8px; /* Hardcoded */
  height: 44px; /* Hardcoded */
}
```

**Exceptions Allowed:**
- Well-known standards (e.g., 44px touch target in comments)
- Mathematical calculations that reference tokens

### "No New One-Off Implementations"

**Rule:** When adding a new drawer, button, or interactive component:

1. **First**, check if an existing pattern can be reused
2. **Second**, extend the standardized pattern (e.g., add a variant class)
3. **Last resort**, create a new pattern and document it in this guide

**Example - Adding a New Drawer:**

```html
<!-- ✓ CORRECT: Uses standard drawer pattern -->
<div class="drawer" id="new-drawer" aria-labelledby="new-title">
  <div class="drawer-header">
    <button class="drawer-toggle btn-icon btn-collapse-panel"
      aria-expanded="true" aria-controls="new-drawer" aria-label="Toggle new drawer">
      <svg><!-- chevron --></svg>
    </button>
    <h2 id="new-title">New Feature</h2>
  </div>
  <div class="drawer-body">
    <!-- content -->
  </div>
</div>
```

```html
<!-- ✗ INCORRECT: Custom implementation -->
<div class="my-custom-panel">
  <div class="my-header">
    <button class="my-toggle">Toggle</button>
    <span>New Feature</span>
  </div>
  <div class="my-content">
    <!-- content -->
  </div>
</div>
```

### Pull Request Checklist

**Before submitting a PR with UI changes, verify:**

- [ ] All new UI components use design tokens (no hardcoded colors/sizes)
- [ ] Drawer patterns follow documented orientation rules:
  - Side panels collapse outward
  - Bottom drawers open upward
- [ ] Tested in mobile portrait mode:
  - Title abbreviation works
  - Header buttons right-aligned
  - Drawers don't overlap incorrectly
- [ ] All themes tested (light, dark, AND high contrast):
  - Visual elements visible in each theme
  - Contrast ratios meet WCAG requirements
- [ ] Keyboard-only navigation works
- [ ] Focus indicators visible on all interactive elements
- [ ] Touch targets ≥44×44px
- [ ] `prefers-reduced-motion` respected
- [ ] ARIA attributes present and correct
- [ ] No new button/drawer classes without style guide update

**See also:** `.github/pull_request_template.md` for full PR checklist

### Code Review Focus Areas

**Reviewers should check:**

1. **Token usage**: No hardcoded colors/sizes
2. **Pattern consistency**: Follows documented component patterns
3. **Accessibility**: ARIA, keyboard, contrast, touch targets
4. **Theme testing**: Works in all themes (light/dark/HC)
5. **Mobile testing**: Portrait/landscape, drawer behavior
6. **Documentation**: Style guide updated if new patterns added

---

## Research & Conventions

### Industry Best Practices Adopted

This design system is based on research into leading open-source design systems and accessibility guidelines:

**Design Systems Studied:**
- **U.S. Web Design System (USWDS)** - Government accessibility standards
- **GOV.UK Design System** - Public sector design patterns
- **Carbon Design System (IBM)** - Enterprise UI patterns
- **Material Design** - Component behavior patterns
- **Radix UI** - Headless component patterns
- **Shoelace** - Web component library

**Similar Web-Based Tools:**
- **Tinkercad** - Drawer systems and responsive layouts
- **OnShape** - 3D CAD tool UI patterns

**Accessibility Resources:**
- **UK Government Digital Service (GDS)** - Accessibility patterns
- **The A11y Project** - Practical accessibility guidelines
- **WCAG 2.2** - W3C accessibility standards

### Conventions We Adopted

1. **Design Tokens as Single Source of Truth**
   - All visual properties (spacing, color, typography) defined as CSS custom properties
   - Semantic token layers (raw → semantic → component)
   - Reduces inconsistency and enables global theme changes

2. **Component Contracts**
   - Each component has documented:
     - Required HTML structure
     - Required CSS classes
     - Required ARIA attributes
     - Required JavaScript behavior (if interactive)
   - Prevents implementation drift over time

3. **Accessibility by Default**
   - 44×44px minimum touch targets (WCAG AAA)
   - Visible focus rings on all interactive elements
   - Keyboard navigation for all actions
   - Color contrast ratios meet or exceed WCAG AA (4.5:1 text, 3:1 UI)
   - High contrast mode achieves WCAG AAA (7:1)
   - `prefers-reduced-motion` support

4. **Responsive Drawer Conventions**
   - Side panels collapse outward (toward their edge)
   - Bottom drawers expand upward (easier thumb reach on mobile)
   - Z-index layering prevents visibility conflicts
   - Consistent resize and state persistence patterns

5. **Enforcement Mechanisms**
   - PR checklist includes UI-specific items
   - Contributing guidelines reference this style guide
   - Color contrast tests in test suite
   - Visual regression tests (future enhancement)

### Why These Conventions?

**Consistency:** Tokens and patterns ensure all features look and behave the same way.

**Accessibility:** Following WCAG and GDS patterns makes the app usable by everyone.

**Maintainability:** Clear rules prevent ad-hoc implementations that accumulate technical debt.

**Scalability:** New features can be built faster by reusing documented patterns.

---

## Quick Reference Checklist

**For every UI change, verify:**

- [ ] Uses design tokens from `variables.css`
- [ ] Follows documented component pattern
- [ ] Has correct ARIA attributes
- [ ] Keyboard-only navigation works (Tab, Enter/Space, Escape)
- [ ] Focus indicator visible (`:focus-visible`)
- [ ] Touch targets ≥44×44px
- [ ] Works in light mode
- [ ] Works in dark mode
- [ ] Works in high contrast mode
- [ ] Works in forced-colors mode (Windows HC)
- [ ] Respects `prefers-reduced-motion`
- [ ] Mobile portrait tested (≤480px)
- [ ] Mobile landscape tested (≤767px)
- [ ] Contrast ratios meet WCAG (4.5:1 text, 3:1 UI)

---

## File Locations

| Type | File Path |
|------|-----------|
| Design Tokens | `src/styles/variables.css` |
| Color Scales | `src/styles/color-scales.css` |
| Semantic Tokens | `src/styles/semantic-tokens.css` |
| Layout | `src/styles/layout.css` |
| Components | `src/styles/components.css` |
| Main JavaScript | `src/main.js` |
| PR Template | `.github/pull_request_template.md` |
| Contributing Guide | `CONTRIBUTING.md` |
| Accessibility Guide | `docs/guides/ACCESSIBILITY_GUIDE.md` |

---

## Questions?

If you need to add a new component pattern or are unsure whether a design decision follows these standards, ask during PR review or open a discussion issue before implementing.

**Remember:** Consistency benefits everyone—users, developers, and future contributors.
