# Welcome Screen

The Welcome screen provides role-based entry points with guided tutorial sandboxes to help users learn the app. Currently, the main entry point is a single "Getting Started" tutorial that covers both workflow basics and UI orientation.

## Design Philosophy

This role-based approach reduces cognitive load by showing users paths relevant to their needs first, improves discoverability of accessibility features, and provides concrete examples with working demos.

## Role Paths

### 1. Beginners Start Here (Getting Started)

**Target audience:** Anyone new to the app

**Example:** Simple Box

**What you'll learn:**
- Where Parameters, Preview, Actions, and Camera controls are (desktop + mobile)
- Adjusting parameters with live preview
- Saving presets
- Generating and downloading files

**Tutorial:** Guided walkthrough showing panel layout, parameter adjustments, presets, Actions menu, Camera controls, file generation, and Help access.

### 2. Advanced Makers

**Target audience:** Users working with multi-file projects and libraries

**Example:** Library Test

**What you'll learn:**
- Upload ZIP files with dependencies
- Enable MCAD, BOSL2, and other libraries
- Export in multiple formats (STL, OBJ, 3MF)

### 3. Keyboard-Only Users

**Target audience:** Users who cannot use a mouse, switch users

**Example:** Cylinder

**What you'll learn:**
- Tab through parameters logically
- Undo/Redo with Ctrl+Z / Ctrl+Shift+Z
- Skip to main content
- Modal focus trapping (Escape to close)

### 4. Low Vision Users

**Target audience:** Users who need high contrast or larger targets

**Example:** Simple Box

**What you'll learn:**
- Toggle high contrast mode (HC button)
- Switch light/dark theme
- Large touch targets (44×44px minimum)

### 5. Voice Input Users

**Target audience:** Users with Dragon, Voice Control, Voice Access

**Example:** Simple Box

**What you'll learn:**
- Say button labels: "Click Generate STL"
- Navigate: "Click Help", "Click Reset"
- All controls have unique, speakable names

### 6. Screen Reader Users

**Target audience:** Blind users, NVDA, JAWS, VoiceOver, TalkBack users

**Example:** Simple Box

**What you'll learn:**
- Status area announces all changes
- ARIA landmarks for quick navigation
- Plain-language error messages

## Accessibility Spotlights

Below the role cards, key accessibility features are highlighted:

1. Keyboard-first design with logical tab order
2. High contrast and forced colors support
3. Plain-language error messages
4. Full workflow without drag gestures

## Implementation

### Tutorial Sandbox System

Module: `src/js/tutorial-sandbox.js`

All role paths launch a spotlight coachmark tutorial after loading the example.

```mermaid
flowchart TB
    User[User picks role path] --> Load[Load example SCAD]
    Load --> Tutorial[tutorial-sandbox.js]
    Tutorial --> Spotlight[Create SVG spotlight overlay]
    Tutorial --> Panel[Show tutorial panel]
    Tutorial --> Arrow[Position arrow to target]
    
    Panel --> Step[Display current step]
    Step --> Action[User completes action]
    Action --> Check{Action complete?}
    Check -->|Yes| Next[Next step]
    Check -->|No| Wait[Wait for action]
    Wait --> Action
    Next --> Done{Final step?}
    Done -->|No| Step
    Done -->|Yes| Close[Close tutorial]
    
    User2[User presses Escape] --> Close
    User2[User clicks X button] --> Close
```

Features include:

- Step-by-step walkthroughs (4-6 steps per path)
- Floating panel with smart positioning
- SVG spotlight with cutout around target (click-through enabled)
- Arrow pointer from panel to target element
- Keyboard navigation (Arrow keys, Escape, Tab)
- ARIA-friendly with live announcements
- Step gating for "Try this" actions
- Reduced motion and forced-colors support
- Mobile-responsive (panel docks to bottom on small screens)
- Focus restoration on close

### Tutorial Content Structure

Each tutorial follows this pattern:
- **Step 1:** Welcome/overview (what you'll learn, exit hint)
- **Steps 2-N:** Feature spotlights with action prompts
- **Final step:** Completion summary and next steps

Guidelines:
- Keep text short and scannable
- Use `<strong>` for element names
- Use `<kbd>` for keyboard shortcuts
- Completion actions should be simple (one click, one change)

All tutorials use `simple-box` example except Advanced Makers (uses `library-test`).

## Related Documentation

- [Accessibility Guide](ACCESSIBILITY_GUIDE.md) - Comprehensive accessibility features
- [Keyguard Workflow Guide](KEYGUARD_WORKFLOW_GUIDE.md) - Keyboard-first workflow
- [Testing](../TESTING.md) - Test commands
