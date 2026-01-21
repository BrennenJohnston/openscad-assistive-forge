# Welcome Screen Feature Paths Guide

**Version:** 2.0 (January 2026)

## Overview

The Welcome screen's "Discover Features for Your Needs" section provides **role-based entry points** with **guided tutorial sandboxes** to help users quickly learn the app's most relevant features based on their needs.

### What's New in v2.0

- **Reordered paths**: Educators/Advanced Makers first, Screen Reader last (prioritizing likely audiences)
- **Tutorial sandbox overlays**: Each path launches a 3-6 step guided walkthrough
- **Practical tips**: Cards show "what you'll learn" bullets before starting
- **Removed the old Screen Reader demo**: Screen Reader path now uses Simple Box example
- **Expanded Features Guide**: Updated to include Workflow/Actions and Accessibility tabs
- **New power features surfaced**: Actions menu (Share/Export/Compare/Queue), parameter search/jump, preview & export quality controls

## Design Philosophy

### Accessibility-First Discovery

The traditional "feature list" approach assumes all users want to see all features. This role-based approach:

1. **Reduces cognitive load** - Users see paths relevant to their needs first
2. **Improves discoverability** - Unusual accessibility features are highlighted, not buried
3. **Provides concrete examples** - "Try it" buttons load working examples immediately
4. **Respects user autonomy** - Users self-select their path based on their situation

### COGA-Friendly Language

All copy follows [WCAG 2.2 SC 3.1.5 Reading Level](https://www.w3.org/WAI/WCAG22/Understanding/reading-level.html) guidelines:

- **Clear**: Short sentences, active voice, concrete terms
- **Consistent**: Same button labels ("Try", "Learn More") across all cards
- **Actionable**: Buttons describe what will happen ("Try Simple Box", not "Click here")

## Role Paths (Reordered v2.0)

### 1. Educators / Facilitators (MOVED TO FIRST)

**Target audience:** Teachers, workshop facilitators, mentors

**Example:** Simple Box
- Perfect for teaching basic customization
- Clear cause-and-effect with parameters
- Fast preview rendering

**What you'll learn (~2 min):**
- Change Width/Height → watch Preview update
- Save presets for classroom reuse
- Guide students through full workflow

**Tutorial:** 8-step guided walkthrough showing:
- How to customize parameters
- Saving presets for reuse
- Generating and downloading STL files
- Where to find Help and Examples

### 2. Advanced Makers (MOVED TO SECOND)

**Target audience:** Users working with multi-file projects, libraries, and advanced OpenSCAD features

**Example:** Library Test
- Demonstrates MCAD library usage
- Shows library detection and enabling

**What you'll learn:**
- Upload ZIP files with dependencies
- Enable MCAD, BOSL2, and other libraries
- Export in multiple formats (STL, OBJ, 3MF)

**Tutorial:** 4-step guided walkthrough showing:
- Libraries panel and enabling bundles
- Multi-file ZIP project workflow
- Output format selection

### 3. Keyboard-Only Users (MOVED TO THIRD)

**Target audience:** Users who cannot use a mouse, switch users, users with motor disabilities

**Example:** Cylinder (Parametric Cylinder)
- Multiple parameter types (sliders, dropdowns, numbers)
- Demonstrates keyboard control variety

**What you'll learn:**
- Tab through parameters logically
- Undo/Redo with Ctrl+Z / Ctrl+Shift+Z
- Skip to main content (screen top)

**Tutorial:** 4-step guided walkthrough showing:
- Skip to content link
- Parameter navigation with Tab/Arrow keys
- Modal focus trapping (Escape to close)

### 4. Low Vision Users (MOVED TO FOURTH)

**Target audience:** Users with low vision, users who need high contrast, users with photophobia

**Example:** Simple Box
- Beginner-friendly parameters
- Clear visual hierarchy
- Good for testing contrast and focus visibility

**What you'll learn:**
- Toggle HC button (high contrast mode)
- Switch light/dark theme
- All buttons meet 44×44px touch target

**Tutorial:** 4-step guided walkthrough showing:
- How to toggle high contrast mode (HC button)
- Theme switching (light/dark)
- Large touch targets and visible focus indicators

### 5. Voice Input Users (MOVED TO FIFTH)

**Target audience:** Users who control devices with voice commands (Dragon, Voice Control, Voice Access)

**Example:** Simple Box
- Clear button labels without ambiguity
- Minimal icon-only actions

**What you'll learn:**
- Say button labels: "Click Generate STL"
- Navigate: "Click Help", "Click Reset"
- All controls have unique, speakable names

**Tutorial:** 4-step guided walkthrough showing:
- Best voice commands to use (button labels)
- Parameter control with voice
- Common navigation commands

### 6. Screen Reader Users (MOVED TO LAST)

**Target audience:** Blind users, users who rely on screen readers (NVDA, JAWS, VoiceOver, TalkBack)

**Example:** Simple Box
- Demonstrates accessible parameter customization
- Uses descriptive labels and help text
- Simple, beginner-friendly example for learning the workflow

**What you'll learn:**
- Status area announces all changes
- ARIA landmarks for quick navigation
- Plain-language error messages

**Tutorial:** 5-step guided walkthrough showing:
- Where status updates appear (Status area + screen reader announcer)
- How to navigate with ARIA landmarks
- How to access Help (📖 Help button in consistent location)
- Where to find Clear button to restart

## UI Orientation (New in v2.4)

**Placement:** Below Accessibility Spotlights section
**Style:** Subtle call-to-action, not a card

**Target audience:** All new users who need to understand the app layout before diving into customization

**Example:** Simple Box
- Loads a working example so drawers/panels are visible
- Non-blocking, optional orientation

**What you'll learn (~1 min):**
- Where Parameters, Preview, and Actions areas are
- How to open/close each drawer/panel
- Mobile vs. desktop control differences

**Tutorial:** 6-step non-gated walkthrough showing:
1. **App Layout** - Overview of three main areas
2. **Parameters Panel** - Mobile (tap "Params") vs. Desktop (collapse button)
3. **Preview Settings & Info** - Expandable drawer with status/dimensions/quality
4. **Actions Menu** - Share Link, Export Params, Compare, Queue
5. **Camera Controls** (Optional) - Desktop panel vs. mobile drawer
6. **Ready to Explore** - Return to Welcome or start customizing

**Key Design Decisions:**
- **Non-gated**: No completion requirements (recognition-focused, not task-based)
- **Fast**: Under 1 minute, skippable at any time
- **Viewport-aware**: Uses comma-separated selectors to highlight mobile OR desktop controls based on viewport
- **Progressive disclosure**: Teaches "where things are" first, lets role tutorials teach "how to use them"
- **COGA-friendly**: Keeps cognitive load low by separating layout orientation from feature training

## Accessibility Spotlights

Below the role cards, 4 key accessibility features are highlighted with links:

1. **Keyboard-first design with logical tab order** → Links to Accessibility Guide
2. **High contrast & forced colors support** → Links to Accessibility Guide
3. **Plain-language error messages** → Links to Accessibility Guide
4. **Full workflow without drag gestures** → Links to Keyguard Workflow Guide

## Implementation Notes (Updated v2.1)

### Tutorial Sandbox System - Spotlight Coachmarks

All role paths now launch a **modern spotlight coachmark tutorial** after loading the example. The design follows best practices from Shepherd.js, Driver.js, and modern onboarding UX research.

**Module:** `src/js/tutorial-sandbox.js`

**Key Design Principles:**
- **Spotlight cutout**: SVG mask creates a visual "hole" around the target element
- **Floating coachmark**: Panel positions itself near the target (not centered over the UI)
- **Arrow pointer**: Visual arrow connects the panel to the highlighted element
- **Non-blocking**: Users can interact with highlighted elements through the spotlight
- **Streamlined content**: Short, scannable text focused on actions

**Features:**
- Step-by-step walkthroughs (4-6 steps per path)
- Floating panel with smart positioning (top, bottom, left, right based on space)
- Arrow pointer from panel to target element
- SVG spotlight with cutout around target (click-through enabled)
- Pulsing highlight ring on target element
- Minimize/restore toggle (collapses to floating pill button)
- Keyboard navigation (Arrow keys, Escape, Tab)
- ARIA-friendly (tutorial region with live announcements)
- Step gating for "Try this" actions (Next enables after completing action)
- Auto-scroll to bring target elements into view
- Reduced motion support (disables animations)
- Forced-colors mode support (Windows High Contrast)
- Mobile-responsive (panel docks to bottom on small screens)
- Focus restoration to trigger button on close

**User Flow:**
1. User clicks "Start Tutorial" button on Welcome card
2. Example loads via `loadExampleByKey()`
3. Screen reader announces: "[Example name] loaded and ready to customize"
4. Tutorial overlay opens automatically after 500ms delay
5. Spotlight cutout highlights relevant UI element
6. Panel positions itself near target with arrow pointing to it
7. User can interact with highlighted element directly (no "Focus" button needed)
8. User steps through tutorial or presses Escape to exit
9. Focus returns to "Start Tutorial" button on close

### Tutorial Content Structure

Each tutorial follows this streamlined pattern:
- **Step 1**: Welcome/overview (what you'll learn, ~3 bullets, exit hint)
- **Steps 2-N**: Feature spotlights with `highlightSelector` and action prompts
- **Final step**: Completion summary and next steps

**Content Guidelines:**
- Keep text short and scannable
- Use `<strong>` for element names (e.g., "Click **Generate STL**")
- Use `<kbd>` for keyboard shortcuts (e.g., "Press <kbd>Esc</kbd>")
- Add `.tutorial-hint` class for secondary tips
- Completion actions should be simple (one click, one change)

All tutorials use `simple-box` example except Advanced Makers (uses `library-test`).

### Documentation Links

"Learn More" buttons use `data-doc` attribute to reference internal guides:
- `ACCESSIBILITY_GUIDE` → `/docs/guides/ACCESSIBILITY_GUIDE.md`
- `KEYGUARD_WORKFLOW_GUIDE` → `/docs/guides/KEYGUARD_WORKFLOW_GUIDE.md`

Currently, these links open the Features Guide modal. Future enhancement: display doc content in a modal or navigate to a docs page.

## Testing Checklist

✅ Automated (Playwright):
- Role path cards are visible and keyboard accessible
- "Try" buttons trigger example loading
- "Learn More" buttons open Features Guide
- Touch targets meet 44×44px minimum
- Focus indicators meet WCAG 2.4.13 (3px outline)

Manual (Screen Reader):
- [ ] Role card labels are announced clearly
- [ ] Example loading announcement is heard
- [ ] Focus order is logical (top to bottom, left to right in grid)
- [ ] Guided tours (when implemented) are screen reader friendly

Manual (Visual):
- [ ] High-contrast mode: cards have clear borders
- [ ] Forced-colors mode: cards are distinguishable
- [ ] Mobile: cards stack vertically and are easy to tap

## Related Documentation

- [Welcome Feature Paths Inventory](../WELCOME_FEATURE_PATHS_INVENTORY.md) - Detailed role mapping
- [Accessibility Guide](ACCESSIBILITY_GUIDE.md) - Comprehensive accessibility features
- [Keyguard Workflow Guide](KEYGUARD_WORKFLOW_GUIDE.md) - Keyboard-first workflow
- [Manual Testing Procedures](MANUAL_TESTING_PROCEDURES.md) - Screen reader testing matrix

## Maintenance

When adding new accessibility features:
1. Update relevant role card descriptions if the feature is primary
2. Consider adding to Accessibility Spotlights if the feature is major
3. Update the inventory document with new examples or docs
4. Test with assistive technologies after changes
