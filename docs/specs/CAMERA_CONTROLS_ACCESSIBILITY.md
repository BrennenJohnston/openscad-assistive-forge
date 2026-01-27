# Camera Controls Accessibility Compliance

## Overview

The camera controls provide keyboard-accessible alternatives to mouse-based dragging operations for manipulating the 3D preview camera. Controls are available in two primary locations:

- **Desktop:** Right-side Camera panel
- **Mobile:** Camera drawer in the actions bar

This document details how the implementation meets WCAG 2.2 accessibility guidelines.

## WCAG 2.2 Compliance

### SC 2.5.7 Dragging Movements (Level AA) ✓

**Requirement:** All functionality that uses a dragging movement has a single pointer alternative.

**Implementation:**
- Provides button-based controls for all camera operations:
  - **Rotation:** 4 directional buttons
  - **Pan:** 4 directional buttons
  - **Zoom:** In/Out buttons and Reset
- All drag-based operations are available via buttons and keyboard shortcuts
- Keyboard shortcuts also available (Arrow keys, Shift+Arrow, +/-)

### SC 4.1.2 Name, Role, Value (Level A) ✓

**Requirement:** All UI components have accessible names, roles, and values that can be programmatically determined.

**Implementation:**
- **Semantic HTML:** All controls use `<button type="button">` elements
- **Accessible Names:** Buttons include descriptive text or `aria-label`
- **ARIA Attributes:**
  - `role="group"` on control groups with `aria-label="Camera controls"`
  - `aria-expanded` on panel/drawer toggle buttons (reflects collapsed state)
  - `aria-controls` links toggle buttons to controlled regions
- **State Communication:** Toggle button labels update based on state:
  - Collapsed: "Expand camera controls"
  - Expanded: "Collapse camera controls"

### SC 1.3.1 Info and Relationships (Level A) ✓

**Requirement:** Information, structure, and relationships can be programmatically determined.

**Implementation:**
- Control panel uses `role="group"` to establish relationship between controls
- Toggle button uses `aria-controls="cameraControlsBody"` to link to controlled region
- Collapsed state communicated via `aria-expanded` attribute
- Visual grouping (rotation, pan, zoom) matches semantic structure

### SC 2.1.1 Keyboard (Level A) ✓

**Requirement:** All functionality is available via keyboard.

**Implementation:**
- All buttons are keyboard focusable (native `<button>` elements)
- Toggle and Move buttons can be activated with Enter/Space
- Camera control buttons respond to Enter/Space
- No keyboard traps or inaccessible functionality

### SC 2.4.7 Focus Visible (Level AA) ✓

**Requirement:** Keyboard focus indicator is visible.

**Implementation:**
```css
.camera-btn:focus-visible,
.camera-drawer-btn:focus-visible,
.camera-drawer-toggle-btn:focus-visible {
  outline: 3px solid var(--color-focus);
  outline-offset: 2px;
}
```
- 3px solid outline exceeds minimum 2px requirement
- 2px offset provides clear separation from element
- High contrast color ensures visibility in all themes

### SC 2.5.5 Target Size (Level AAA) ✓

**Requirement:** Touch targets are at least 44×44 CSS pixels.

**Implementation:**
- Camera control buttons: `min-width: 44px; min-height: 44px`
- Zoom/reset buttons: `min-height: 44px` with adequate padding
- Drawer toggle button: `min-height: 44px` with full-width layout on mobile

### SC 1.4.11 Non-text Contrast (Level AA) ✓

**Requirement:** UI components have sufficient contrast (3:1 minimum).

**Implementation:**
- All buttons have 2px solid borders: `border: 2px solid var(--color-border);`
- High contrast mode increases to 3px borders
- Background/border color combinations meet 3:1 contrast ratio
- Hover states use accent color with white text for maximum contrast

### SC 1.4.3 Contrast (Minimum) (Level AA) ✓

**Requirement:** Text has 4.5:1 contrast ratio (3:1 for large text).

**Implementation:**
- Button symbols are 18px font-size with 700 font-weight (qualifies as large text)
- Toggle button text is 14px with 600 font-weight
- All text colors use CSS custom properties that maintain contrast ratios across themes
- High contrast mode available for users who need enhanced contrast

### SC 1.4.13 Content on Hover or Focus (Level AA) ✓

**Requirement:** Content that appears on hover/focus is dismissible, hoverable, and persistent.

**Implementation:**
- Camera controls are persistent (always visible when expanded)
- Collapsible via toggle button (user-controlled dismissal)
- No auto-hiding or timeout behavior
- Position can be moved to different corners to avoid obscuring content

## Additional Accessibility Features

### Screen Reader Support

- Live region announcements for camera actions (via `#srAnnouncer`)
- Descriptive labels include keyboard shortcuts in titles
- Model summary provides dimensions and triangle count for non-visual users

### Keyboard Shortcuts

All camera operations have keyboard alternatives:
- **Arrow keys:** Rotate view
- **Shift + Arrow keys:** Pan view
- **+ / =:** Zoom in
- **-:** Zoom out

### Persistent Preferences

User preferences are saved to localStorage:
- Collapsed/expanded state
- Panel position (bottom-right, bottom-left, top-right, top-left)
- Preferences persist across sessions

### Responsive Design

- Adjusts button sizes on mobile (40×40px minimum)
- Safe area insets respected for notched devices
- Works in portrait and landscape orientations

### Theme Support

- Adapts to light/dark/high-contrast themes
- High contrast mode increases border widths and font weights
- Color contrast maintained across all theme variants

### Reduced Motion

```css
@media (prefers-reduced-motion: reduce) {
  .camera-control-btn {
    transition: none;
  }
  .camera-control-btn:hover {
    transform: none;
  }
  .camera-control-btn:active {
    transform: none;
  }
}
```

## Bug Fix: Hidden Attribute Support

**Issue:** The `[hidden]` attribute was not working because the CSS reset didn't include a rule for it.

**Fix:** Added to `reset.css`:
```css
/* Hidden attribute support (WCAG 2.2 SC 4.1.2) */
[hidden] {
  display: none !important;
}
```

This ensures that when `body.hidden = true` is set in JavaScript, the element is properly hidden visually while remaining in the DOM for proper ARIA state management.

## Testing Recommendations

1. **Keyboard Navigation:** Tab through all controls, verify focus indicators
2. **Screen Reader:** Test with NVDA/JAWS/VoiceOver, verify announcements
3. **Touch Targets:** Test on mobile devices, verify 44×44px minimum
4. **Contrast:** Use browser DevTools or contrast checkers to verify ratios
5. **Reduced Motion:** Enable OS setting, verify no disruptive animations
6. **High Contrast:** Enable high contrast mode, verify enhanced visibility

## References

- [WCAG 2.2 SC 2.5.7 Dragging Movements](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html)
- [WCAG 2.2 SC 4.1.2 Name, Role, Value](https://www.w3.org/WAI/WCAG22/Understanding/name-role-value.html)
- [WCAG 2.2 SC 2.5.5 Target Size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced.html)
- [WCAG 2.2 SC 1.4.11 Non-text Contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html)
