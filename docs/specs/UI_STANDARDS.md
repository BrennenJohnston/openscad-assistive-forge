# UI Standards

This document defines design tokens, component patterns, layout rules, and accessibility requirements. All UI work must follow these standards.

---

## Table of Contents

1. [Design Tokens Reference](#design-tokens-reference)
2. [Component Patterns](#component-patterns)
3. [Layout Patterns](#layout-patterns)
4. [Spacing Guidelines](#spacing-guidelines)
5. [Typography Guidelines](#typography-guidelines)
6. [Interaction & Behavior Guidelines](#interaction--behavior-guidelines)
7. [Drawers, sheets and menus: the schema](#drawers-sheets-and-menus-the-schema)
8. [Accessibility Requirements](#accessibility-requirements)
9. [Contribution & Review Rules](#contribution--review-rules)
10. [Research & Conventions](#research--conventions)

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
| `--radius-sm` | 6px | **DEPRECATED** alias — use `--border-radius-sm` instead |
| `--radius-md` | 10px | **DEPRECATED** alias — use `--border-radius-md` instead |

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
| Input Field | (native) | `<label>` or `aria-label` | N/A | ✓ |
| Modal | `.modal` | `role="dialog"`, `aria-modal`, `aria-labelledby` | N/A | Focus trap |

---

## Layout Patterns

### Desktop Layout (≥768px)

**Structure:**
- **Left panel**: Parameters drawer (collapsible, left-aligned)
- **Center**: Canvas/preview area
- **Right panel**: Camera controls drawer (collapsible, right-aligned)
- **Bottom bar**: Generate, with Cancel, the last file's download and Save to folder beside it

**Drawer Direction Rules:**
- **Side panels** (Parameters, Camera): Collapse **outward** (left panel collapses left, right panel collapses right)
- **Preview Settings & Info**: Drops **down** over the preview from its toggle at the top of the preview (never sideways)

**Critical:** Preview Settings & Info must overlay the side panels with proper z-index so it is never hidden when Parameters/Camera are open.

### Mobile Layout (≤767px)

**Portrait Mode:**
- **Stacked vertical layout** with bottom actions bar
- **Drawers expand upward** from bottom bar
- **Header**: Title abbreviates to "OpenSCAD AF" at ≤480px portrait
- **Header controls**: GitHub/HC/theme buttons **right-aligned**

**Landscape Mode:**
- A touch screen held sideways has its own layout (S5 and S6 in the schema below)

### Drawer Behavior Matrix

| Drawer | Desktop Direction | Mobile Direction | z-index |
|--------|------------------|------------------|---------|
| Parameters (left) | Collapse left | In from the left over the preview, see-through, its width dragged and kept (a column beside the preview, held sideways) | `--z-index-base` |
| Camera (right) | Collapse right | Expand up from bottom | `--z-index-base` |
| Preview Settings | Drop down (overlay) | Drop down in the page's flow, the preview below it (overlay, held sideways) | `calc(var(--z-index-drawer) + 20)` |

**Rule:** Preview Settings & Info, which drops over the preview, MUST use `z-index` higher than side panels to remain visible.

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

**On a phone** the Customizer's width is set by the grip on its right edge, a separator the arrow keys move as they move the desktop divider (Shift for bigger steps, Home and End for the ends). The width is saved as a share of the screen's width and restored every time the Customizer opens, never rebuilt from the page's size when it loaded.

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

## Drawers, sheets and menus: the schema

A drawer's toggle tells a person two things before they press it: which way the drawer will move, and whether it is open. People learn that without thinking about it, so the toggles have to say it the same way everywhere, or the arrow stops meaning anything. These rules hold for the Forge layouts; Classic keeps the desktop's own docks. They are the reasons behind choices that can look small, so please keep them when you change a panel.

**S1 Direction.** A drawer toggle shows one arrow. While the drawer is closed, the arrow points the way the drawer's leading edge travels when it opens; while it is open, the arrow points the way that edge travels when it closes. The direction lives in one attribute on the toggle, `data-travel-open="left"`, `"right"`, `"up"` or `"down"`, and one stylesheet rule turns the one arrow glyph to match. No drawer draws an arrow of its own.

**S2 One axis.** Between its closed and open states, a toggle moves only along its drawer's travel axis. Its center keeps the other coordinate within 2 px, so the button that closes a drawer is where the eye expects it.

**S3 The open state shows.** While a drawer, sheet, pop-out or menu is open, its toggle is drawn pressed: the accent background and the accent text color, in every theme, look and contrast setting. The style keys on `aria-expanded="true"`, the same state a screen reader announces.

**S4 One header row.** A panel's title sits beside its toggle on one row, with the toggle at the edge the panel opens from. Action buttons keep their own row below it.

**S5 The camera controls, by screen.** Each kind of screen has its own camera layout, and where one layout gives way to the next is part of the rule. The input decides as well as the width: a phone turned sideways can be wider than a small desktop window and still needs the touch layout.

- **Desktop windows (a mouse and keyboard, 768 px wide and up):** a panel on the right, one column, 180 px wide, in this order: Rotate View above Pan View, then Zoom, then the six standard views two to a row, then the projection and keyboard shortcuts buttons on one row. Reset View sits in the center of the Rotate pad and View All in the center of the Pan pad. Closed, the panel is a strip holding its toggle and title and nothing else. In a window of 1280 x 720 px or larger it shows every button without scrolling; where the targets are 44 px (high contrast, a touch screen, or a browser that reports no mouse), the last rows may sit below the fold in a window shorter than 935 px. It never scrolls sideways. Sliders that only the Alt View adds may sit below the fold.
- **Phones held upright:** a drawer at the bottom, with Rotate and Pan side by side, left and right, Zoom between them, Reset View and View All in the pads' centers, and the six views with the projection and keyboard shortcuts buttons on one row, so the drawer stays short (S6). In the Alt View its four sliders (Edges, Focus, Glow and Surfaces) have a drawer of their own, Lens, whose toggle sits at the left of the bar with Camera at the right; it opens where the camera drawer opens, at its own height.
- **Phones turned sideways** (a touch screen in landscape at a phone's height, whatever its width): the controls stack in one column as on the desktop (Rotate, Pan, Zoom, the views, the tools), over the preview's right edge, see-through, at most a quarter of the screen's width, scrolling inside; under 768 px wide that column is the camera drawer (and in the Alt View the Lens drawer), from 768 px the camera panel, whose closed strip keeps its place.

**S6 Phones: the preview stays in view.** Nearly everything here is a change you check by looking at the model, so on a phone the model stays in view while you make it. Held upright, the Customizer slides in from the left over the preview, the way it opens beside the preview on a desktop. It is see-through, so the model shows behind it and in the strip it leaves at the right, and the preview keeps its full size behind it. Drag its right edge to make it wider or narrower (or use the arrow keys on that edge); the width you choose is kept. How solid it is can be set in Preferences. It is not a dialog: nothing dims the preview, which stays usable, and Escape or its button closes it; it opens at the parameters, and closed it is out of the way of Tab and of a screen reader. Every other phone drawer (Preview Settings & Info, the camera drawer and, in the Alt View, the Lens drawer) is as tall as its controls and never more than half the screen, so it leaves no empty band and the preview has the rest. Keeping half the screen for the preview is a goal, not a measure. The camera and Lens drawers are see-through. Full Screen with the camera or Lens drawer open gives the drawer its controls' height above the bottom bar and the preview everything above it. High contrast and a request for reduced transparency keep every surface solid. One drawer is open at a time: opening the Customizer, Preview Settings & Info, the camera drawer or the Lens drawer first closes whichever is open. On a desktop window the panels sit side by side and stay open together. Held sideways, the screen is short: the header keeps to one row, the menu bar shares the Preview Settings row, under 768 px the bottom bar keeps to one row and the Customizer is a column at the left, at most half the width, with the preview beside it, from 768 px the Customizer column starts closed until it is opened, and with nothing open the preview shows on at least 40 percent of the screen.

**S7 Menus.** A menu-bar menu opens directly under its own button, and the button stays pressed while the menu is open. The page behind it is neither tinted nor blurred. On a desktop the menu has no title bar and no close button: Escape, a click outside it, or its button closes it. On a phone the menu is a sheet and keeps its close button.

**S8 Tetris.** A new control joins an existing row before it gets a row of its own. A row is added only when the measured width of the existing rows is spent.

`tests/e2e/ui-schema.spec.js` checks S1 to S5 and S7 at 1280 x 720 and 1910 x 935 px, in the dark and light themes, high contrast and the Alt View, and the desktop camera panel's order and closed strip on their own. On phones it checks the upright camera drawer at 412 x 915 and 412 x 810 in the four looks (S5's upright clause, the drawer's see-through surface, S8's rows), each drawer's height against its controls in and out of Full Screen (S6), the Lens drawer's four sliders in the Alt View, the Customizer at the same sizes and looks (S6: in from the left over the preview, the strip it leaves, the preview's size kept behind it, see-through and blurred with a solid header, its width grip, the width kept across a close and a reload, the one-row bar, focus and Escape), Preview Settings & Info dropping from its row, and one drawer at a time; and phones held sideways at 667 x 375, 740 x 360, 844 x 390 and 915 x 412 (S5's sideways clause and S6's sideways rows and share), with the Customizer's sideways column at 667 x 375 and 740 x 360. A rule the page does not meet yet is listed at the top of that file, and its case is expected to fail until the page meets it; then the entry comes out. `tests/e2e/mobile-toolbar.spec.js` keeps S8's row budgets on phones. A change to a rule is a change to this section and to those tests together, in the same pull request.

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
- **[ACCESSIBILITY_GUIDE.md](../guides/ACCESSIBILITY_GUIDE.md)** - Keyboard navigation, screen reader patterns, live regions
- **[CAMERA_CONTROLS_ACCESSIBILITY.md](../accessibility/CAMERA_CONTROLS_ACCESSIBILITY.md)** - Camera-specific accessibility patterns

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

---

## Shared UI Contracts

### `.forge-control` — Shared Button/Control Contract

All toolbar buttons, drawer toggles, panel collapse buttons, and modal close buttons must use the `.forge-control` base class (or its `.forge-control--sm` variant) alongside their existing semantic class. This ensures uniform sizing, border-radius, and transition timing from design tokens.

**Properties enforced:** `min-height`, `min-width`, `border-radius`, `padding`, `transition`

### `.forge-disclosure` — Shared Disclosure Contract

All collapsible `<details>` sections (Presets, Console Output, Reference Image, Libraries, Companion Files, Advanced) must use the `.forge-disclosure` class on the `<details>` element. This provides a uniform `<summary>` layout with consistent chevron animation via `::after`, spacing, font weight, touch target sizing, and `prefers-reduced-motion` support.

**Chevron:** CSS border-based via `::after`, rotates from -45deg (closed) to 45deg (open).

### Drawer State Class Convention

| Drawer | State Convention | Open Means | Closed Means |
|--------|-----------------|------------|--------------|
| Parameters | Additive open | `drawer-open` class present | `drawer-open` class absent |
| Camera | Additive close | `collapsed` class absent | `collapsed` class present |
| Echo | Additive close | `collapsed` class absent | `collapsed` class present |

Do NOT refactor this convention without updating all three controller files (`drawer-controller.js`, `camera-panel-controller.js`, and the inline echo controller in `main.js`) plus their corresponding test suites.

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
| Contributing Guide | `.github/CONTRIBUTING.md` |
| Accessibility Guide | `docs/guides/ACCESSIBILITY_GUIDE.md` |

