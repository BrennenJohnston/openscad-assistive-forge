# Manual Color System Testing Checklist

## Overview

This checklist guides manual testing of the accessible color system across themes, contrast modes, and color vision deficiencies.

## Pre-Testing Setup

### Required Tools

- [ ] **Chrome or Edge Browser** (DevTools vision deficiency emulation)
- [ ] **Colorblindly Extension** ([Chrome Web Store](https://chrome.google.com/webstore/detail/colorblindly/floniaahmccleoclneebhhmnjgdfijgg))
- [ ] **WebAIM Contrast Checker** ([webaim.org/resources/contrastchecker](https://webaim.org/resources/contrastchecker/))
- [ ] **Screen Recording Tool** (for documenting issues)

### Test Environment

- [ ] Local development server running (`npm run dev`)
- [ ] Sample SCAD files loaded for testing (`tests/fixtures/sample.scad`)
- [ ] Browser zoom at 100%
- [ ] No browser extensions interfering with colors (except Colorblindly)

## Theme Testing Matrix

Test ALL interactive elements in each theme combination:

### Light Mode (Normal)

**How to Activate**: `data-theme="light"`, `data-high-contrast` not set

- [ ] Text contrast meets 4.5:1 (primary text)
- [ ] Text contrast meets 3:1 (large text)
- [ ] UI elements contrast meets 3:1 (borders, icons, buttons)
- [ ] Yellow accent buttons are readable
- [ ] Green success states are visible
- [ ] Teal info elements are distinct
- [ ] Red error states are prominent
- [ ] Amber warning states are clear
- [ ] Focus indicators are visible (brand-neutral blue)
- [ ] Hover states provide clear feedback

### Dark Mode (Normal)

**How to Activate**: `data-theme="dark"`, `data-high-contrast` not set

- [ ] Text contrast meets 4.5:1 (primary text)
- [ ] Text contrast meets 3:1 (large text)
- [ ] UI elements contrast meets 3:1
- [ ] Yellow accent buttons are readable
- [ ] Green success states are visible
- [ ] Teal info elements are distinct
- [ ] Red error states are prominent
- [ ] Amber warning states are clear
- [ ] Focus indicators are visible (lighter brand-neutral blue)
- [ ] Hover states provide clear feedback
- [ ] No harsh bright colors causing eye strain

### High Contrast Light Mode

**How to Activate**: `data-theme="light"`, `data-high-contrast="true"`

- [ ] Text contrast meets 7:1 (AAA standard)
- [ ] Borders are thicker (2-3px)
- [ ] Focus indicators are 4px thick
- [ ] Font sizes are larger (12-17% increase)
- [ ] All UI elements remain clearly visible
- [ ] Focus indicators have maximum contrast
- [ ] Success/error/warning/info states are distinct

### High Contrast Dark Mode

**How to Activate**: `data-theme="dark"`, `data-high-contrast="true"`

- [ ] Text contrast meets 7:1 (AAA standard)
- [ ] Borders are thicker (2-3px)
- [ ] Focus indicators are 4px thick
- [ ] Font sizes are larger
- [ ] All UI elements remain clearly visible
- [ ] Focus indicators have maximum contrast
- [ ] Success/error/warning/info states are distinct
- [ ] Pure black backgrounds for maximum contrast

### Auto Mode (System Preference)

**How to Activate**: Remove `data-theme` attribute, rely on system

- [ ] Light mode activates when OS is in light mode
- [ ] Dark mode activates when OS is in dark mode
- [ ] Theme switches when OS setting changes
- [ ] No visual glitches during theme transition

## Color Blindness Testing

### Deuteranopia (Red-Green, Most Common)

**How to Test**: Chrome DevTools → Rendering → Emulate vision deficiencies → Deuteranopia

- [ ] Yellow (accent) vs Green (success) are distinguishable
- [ ] Error (red) vs Warning (amber) are distinguishable
- [ ] All buttons have clear visual separation
- [ ] Focus indicators remain visible
- [ ] States have icons/text, not just color

### Protanopia (Red-Green)

**How to Test**: Chrome DevTools → Rendering → Emulate vision deficiencies → Protanopia

- [ ] Yellow (accent) vs Green (success) are distinguishable
- [ ] Error (red) vs Warning (amber) are distinguishable
- [ ] All buttons have clear visual separation
- [ ] Focus indicators remain visible
- [ ] States have icons/text, not just color

### Tritanopia (Blue-Yellow)

**How to Test**: Chrome DevTools → Rendering → Emulate vision deficiencies → Tritanopia

- [ ] Yellow (accent) vs Teal (info) are distinguishable
- [ ] Yellow (accent) vs Neutral (slate) are distinguishable
- [ ] Focus indicators (blue) remain visible
- [ ] All buttons have clear visual separation
- [ ] States have icons/text, not just color

### Achromatopsia (Total Color Blindness)

**How to Test**: Chrome DevTools → Rendering → Emulate vision deficiencies → Achromatopsia

- [ ] All semantic states are distinguishable by brightness/shape
- [ ] Icons are present for success/error/warning/info
- [ ] Focus indicators are clearly visible
- [ ] Buttons have clear text labels
- [ ] No information is conveyed by color alone

### Colorblindly Extension Test

**How to Test**: Enable Colorblindly extension, cycle through all types

- [ ] Deuteranopia: All critical UI elements distinguishable
- [ ] Protanopia: All critical UI elements distinguishable
- [ ] Tritanopia: All critical UI elements distinguishable
- [ ] Achromatopsia: All critical UI elements distinguishable
- [ ] No information loss in any simulation

## Component-Specific Tests

### Buttons

**Test Each Theme (Light, Dark, HC Light, HC Dark)**

- [ ] Primary buttons (yellow) are readable
- [ ] Success buttons (green) are readable
- [ ] Info buttons (teal) are readable
- [ ] Error buttons (red) are readable
- [ ] Secondary buttons have sufficient contrast
- [ ] Disabled buttons are clearly distinguished
- [ ] Hover states provide clear feedback
- [ ] Focus indicators are visible on all button types

### State Indicators

**Check ALL themes and color blind simulations**

- [ ] Success states have ✓ icon + green color
- [ ] Error states have ✗ icon + red color
- [ ] Warning states have ⚠ icon + amber color
- [ ] Info states have ℹ icon + teal color
- [ ] Icons are visible even without color
- [ ] Text labels accompany all icons
- [ ] States are distinguishable in all color blind simulations

### Forms and Inputs

**Test Each Theme**

- [ ] Input borders are visible (3:1 contrast)
- [ ] Focus borders are clearly distinct
- [ ] Placeholder text meets contrast requirements
- [ ] Error states have red border + error message + icon
- [ ] Required field indicators are visible
- [ ] Labels are clearly associated with inputs

### Text and Typography

**Test Each Theme**

- [ ] Primary text: 4.5:1 minimum (7:1 in HC)
- [ ] Secondary text: 4.5:1 minimum (7:1 in HC)
- [ ] Tertiary text: 3:1 minimum (for large text only)
- [ ] Links are underlined (not just colored)
- [ ] Visited links are distinguishable
- [ ] Text on colored backgrounds meets requirements

### 3D Preview Panel

**Test Each Theme**

- [ ] Preview canvas background is distinct from UI
- [ ] Status indicators are visible
- [ ] Camera controls have sufficient contrast
- [ ] Stats text is readable
- [ ] Error messages in preview are clear

## Keyboard Navigation Testing

**Test Each Theme**

- [ ] Tab order is logical
- [ ] Focus indicators are always visible (never hidden)
- [ ] Focus indicators meet 2px minimum thickness (3px normal, 4px HC)
- [ ] Focus indicators have 3:1 contrast against adjacent colors
- [ ] Focus doesn't get trapped
- [ ] All interactive elements are keyboard accessible

## System Preference Testing

### prefers-contrast: more

**How to Test**: 
- **macOS**: System Preferences → Accessibility → Display → Increase Contrast
- **Windows**: Settings → Ease of Access → Display → Show scrollbars
- **Linux**: Varies by desktop environment

- [ ] Borders become thicker (2px minimum)
- [ ] Focus indicators are enhanced (4px)
- [ ] Text contrast increases
- [ ] No visual regression
- [ ] App remains usable

### forced-colors: active (Windows High Contrast)

**How to Test**: Windows Settings → Ease of Access → High Contrast → Choose theme

- [ ] All semantic tokens map to system colors
- [ ] Focus uses outline (not box-shadow)
- [ ] Borders are visible on all interactive elements
- [ ] No information is lost
- [ ] Text remains readable
- [ ] Icons remain visible

### prefers-reduced-motion: reduce

**How to Test**: 
- **macOS**: System Preferences → Accessibility → Display → Reduce motion
- **Windows**: Settings → Ease of Access → Display → Show animations

- [ ] Animations are disabled or minimized
- [ ] Transitions are instant
- [ ] No motion-based feedback
- [ ] Functionality remains intact

## Manual Contrast Verification

Use WebAIM Contrast Checker for spot checks:

### Light Mode Combinations to Verify

- [ ] Primary text (#11181c) on primary background (#fcfcfd): ≥ 4.5:1
- [ ] Accent button text on yellow background: ≥ 3:1
- [ ] Success text on success background: ≥ 4.5:1
- [ ] Error text on error background: ≥ 4.5:1
- [ ] Warning text on warning background: ≥ 4.5:1
- [ ] Info text on info background: ≥ 4.5:1
- [ ] Border (#d3d6db) on background: ≥ 3:1
- [ ] Focus indicator (#0052cc) on background: ≥ 3:1

### Dark Mode Combinations to Verify

- [ ] Primary text (#edeef0) on primary background (#111113): ≥ 4.5:1
- [ ] Accent button text on yellow background: ≥ 3:1
- [ ] Success text on success background: ≥ 4.5:1
- [ ] Error text on error background: ≥ 4.5:1
- [ ] Warning text on warning background: ≥ 4.5:1
- [ ] Info text on info background: ≥ 4.5:1
- [ ] Border (#43444e) on background: ≥ 3:1
- [ ] Focus indicator (#66b3ff) on background: ≥ 3:1

### High Contrast Mode (Both Light and Dark)

- [ ] All text meets 7:1 (AAA standard)
- [ ] UI elements meet 3:1
- [ ] Focus indicators meet 3:1

## Real-World User Testing

### Scenarios to Test

1. **Upload and Customize Workflow**
   - [ ] All steps are visually clear in all themes
   - [ ] Status updates are readable
   - [ ] Success/error states are obvious

2. **Parameter Adjustment**
   - [ ] Sliders are easy to see
   - [ ] Input fields have clear focus
   - [ ] Help tooltips are readable
   - [ ] Default value hints are visible

3. **Error Handling**
   - [ ] Error messages stand out
   - [ ] Icons accompany all errors
   - [ ] Error states are clear in color blind simulations

4. **Download Action**
   - [ ] Download button is prominent
   - [ ] Format selection is clear
   - [ ] Success confirmation is visible

## Documentation Review

- [ ] All color-related docs are updated
- [ ] Screenshots reflect new color system
- [ ] Code examples use semantic tokens
- [ ] Migration guide is accurate
- [ ] Accessibility guide mentions new features

## Issue Reporting Template

If you find issues, document them with:

- **Theme**: Light/Dark/HC Light/HC Dark
- **Color Blind Simulation**: Type (if applicable)
- **Component**: Button/Form/Text/etc.
- **Issue**: What's wrong (contrast, visibility, etc.)
- **Screenshot**: Visual evidence
- **Expected**: What should happen
- **Actual**: What actually happens

## Sign-Off

**Tester**: ________________

**Date**: ________________

**Themes Tested**: [ ] Light [ ] Dark [ ] HC Light [ ] HC Dark [ ] Auto

**Color Blind Simulations**: [ ] Deuteranopia [ ] Protanopia [ ] Tritanopia [ ] Achromatopsia

**Issues Found**: ________ (link to issue tracker)

**Overall Status**: [ ] Pass [ ] Pass with Minor Issues [ ] Fail

**Notes**:
