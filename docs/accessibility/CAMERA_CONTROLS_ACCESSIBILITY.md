# Camera Controls Accessibility Compliance

## Overview

The camera controls provide keyboard-accessible alternatives to mouse-based dragging operations for manipulating the 3D preview camera. Controls are available in two primary locations:

- **Desktop (768px and above):** the Camera panel, `#cameraPanel`
- **Below 768px:** the Camera drawer in the bar at the foot of the screen, `#cameraDrawer`

This document details how the implementation meets WCAG 2.2 accessibility guidelines. Where each layout puts the controls, screen by screen, is set down once in `docs/specs/UI_STANDARDS.md` ("Drawers, sheets and menus: the schema", rule S5).

> **Scope note, 2026-08-16.** This document also used to describe a third,
> floating set of controls with a corner-position preference, keyed on
> `#cameraControlsBody` and `.camera-control-btn`. **That widget is not in the
> shipped app.** MEASURED: those selectors appear in JavaScript and CSS but in
> zero places in `index.html`, because `setupCameraControls()` in `preview.js`
> returns early whenever `#cameraPanel` exists at 768px and above, and again
> whenever `#cameraDrawer` exists below that — and both ids are in the markup.
> Everything after those two guards is unreachable, including a second
> `.camera-view-btn` binding and a `#cameraResetView` binding.
>
> The passages about it have been removed rather than left to read as if they
> described something a user could reach. Removing the dead code itself is a
> separate change, reported to the owner rather than made here.

## The Camera panel

Open, the panel is one column, 180px wide, in this order:

1. **Rotate View:** a D-pad of four arrows with **Reset View** in its center.
2. **Pan View:** a D-pad of four arrows with **View All** in its center.
3. **Zoom:** Zoom In and Zoom Out side by side.
4. **Standard Views:** Top, Front, Right, Left, Back and Bottom, two to a row. Each button is a small cube with that face shaded; Left and Bottom show the cube mirrored so their face is in view, and Back draws its hidden edges dashed.
5. **Tools:** the projection button and the keyboard shortcuts button.

Every button is a picture with a name and a tooltip that carries its keyboard shortcut, for example "Top view (Ctrl+4)". The projection button keeps one name, "Toggle perspective/orthographic projection (P)", and shows its state by being pressed (`aria-pressed="true"`) in orthographic. Its picture shows the projection on screen, edges meeting in the distance or running parallel, and it follows a change made from the View menu, the P key or Classic.

The keyboard shortcuts button opens a small pop-out above itself, inside the panel, listing the camera's keys. The button carries `aria-expanded` and `aria-controls`. The pop-out closes with the button, with Escape (focus stays on the button), or with a press anywhere else.

Closed, the panel is a strip with its toggle and its title, and nothing else.

Auto-rotate is not in the camera controls: it is a switch in Preview Settings & Info, under Automatic preview, with its speed slider under it, and View > Auto-rotate turns it on and off.

## WCAG 2.2 Compliance

### SC 2.5.7 Dragging Movements (Level AA) ✓

**Requirement:** All functionality that uses a dragging movement has a single pointer alternative.

**Implementation:**
- Provides button-based controls for all camera operations:
  - **Rotation:** 4 directional buttons, with Reset View in their center
  - **Pan:** 4 directional buttons, with View All in their center
  - **Zoom:** In and Out buttons
  - **Standard views:** six buttons, one per face
- All drag-based operations are available via buttons and keyboard shortcuts
- Keyboard shortcuts also available (Arrow keys, Shift+Arrow, +/-)

### SC 4.1.2 Name, Role, Value (Level A) ✓

**Requirement:** All UI components have accessible names, roles, and values that can be programmatically determined.

**Implementation:**
- **Semantic HTML:** All controls use `<button type="button">` elements
- **Accessible Names:** Buttons include descriptive text or `aria-label`
- **ARIA Attributes:**
  - The panel is a region named by its heading, "Camera"; the phone drawer is a region named "Camera controls"
  - `role="group"` on the D-pads and the views, named "Rotation controls", "Pan controls" and "Standard camera views" (and "Zoom controls" in the phone drawer)
  - `aria-expanded` on panel/drawer toggle buttons (reflects collapsed state) and on the keyboard shortcuts button
  - `aria-controls` links toggle buttons to controlled regions
  - `aria-pressed` on the projection button
- **State Communication:** Toggle button labels update based on state:
  - Collapsed: "Expand camera controls panel" (the phone drawer: "Expand camera controls")
  - Expanded: "Collapse camera controls panel" (the phone drawer: "Collapse camera controls")

### SC 1.3.1 Info and Relationships (Level A) ✓

**Requirement:** Information, structure, and relationships can be programmatically determined.

**Implementation:**
- Control panel uses `role="group"` to establish relationship between controls
- The toggle links to its region with `aria-controls`: `#cameraPanelToggle` to `cameraPanelBody`, `#cameraDrawerToggle` to `cameraDrawerBody`
- Collapsed state communicated via `aria-expanded` attribute
- Visual grouping (rotation, pan, zoom) matches semantic structure

### SC 2.1.1 Keyboard (Level A) ✓

**Requirement:** All functionality is available via keyboard.

**Implementation:**
- All buttons are keyboard focusable (native `<button>` elements)
- The toggle button can be activated with Enter or Space
- Camera control buttons respond to Enter/Space
- Escape closes the keyboard shortcuts pop-out and leaves focus on its button
- No keyboard traps or inaccessible functionality

### SC 2.4.7 Focus Visible (Level AA) ✓

**Requirement:** Keyboard focus indicator is visible.

**Implementation:**
- The panel's buttons (`.camera-btn`, `.camera-btn-wide`) and the phone drawer's (`.camera-drawer-btn`) draw `outline: 3px solid var(--color-focus)` with a 2px offset on `:focus-visible` (`src/styles/layout.css`)
- 3px solid outline exceeds minimum 2px requirement
- 2px offset provides clear separation from element
- High contrast color ensures visibility in all themes

### SC 2.5.8 Target Size (Minimum) (Level AA) ✓

**Requirement:** Targets are at least 24×24 CSS pixels.

**Implementation:** every camera button takes its size from the touch target token, `--size-touch-target`:
- On touch screens and in high contrast the token is 44px, so the buttons meet SC 2.5.5 Target Size (Level AAA) as well
- With a mouse or trackpad on screens 768px and wider the token is 36px: the D-pads and tools are 36×36px, Zoom and the views about 82×36px
- Drawer toggle button: full-width on phones, 44px tall

One phone button falls short of 44px today: the drawer's projection button is 36px tall.

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
- The keyboard shortcuts pop-out opens only when its button is pressed, stays until closed, and closes with Escape
- No auto-hiding or timeout behavior

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
- **Home:** Reset view
- **Ctrl+Shift+V:** View All
- **Ctrl+4, Ctrl+8, Ctrl+7, Ctrl+6, Ctrl+9, Ctrl+5:** Top, Front, Right, Left, Back and Bottom views
- **P:** Switch between perspective and orthographic

The mouse wheel zooms toward the center of the view. Preferences > 3D View > "Zoom toward the mouse pointer" makes it zoom toward the pointer instead.

### Persistent Preferences

The panel's collapsed or expanded state is saved and restored across sessions.

There is no corner-position preference. That belonged to the floating widget
described in the scope note at the top of this document, which the app does not
build.

### Responsive Design

- The Camera panel is used at 768px and above; below that the same controls
  appear in the Camera drawer
- Safe area insets respected for notched devices
- Works in portrait and landscape orientations

### Theme Support

- Adapts to light/dark/high-contrast themes
- High contrast mode increases border widths and font weights
- Color contrast maintained across all theme variants

### Reduced Motion

Handled globally rather than per component, in `src/styles/variables.css`:

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

That covers the camera buttons along with everything else. The buttons' only
transitions are color changes, and the `scale(0.95)` on press has no transition
of its own, so it is instant either way.

Auto-rotate will not start while the system asks for reduced motion: the
switch stays off and the app says "Auto-rotation is disabled because you
prefer reduced motion".

(There is also a per-component `@media (prefers-reduced-motion: reduce)` block
in `components.css` naming `.camera-control-btn`. That class belongs to the
floating widget described in the scope note above and styles nothing the app
renders.)

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
