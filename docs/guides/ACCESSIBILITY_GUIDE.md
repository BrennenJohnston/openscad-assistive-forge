# Accessibility Guide

**OpenSCAD Web Customizer Forge** is designed to be accessible to all users, including those using assistive technologies, with limited vision, or preferring keyboard-only navigation. This guide provides role-specific information to help you get the most out of the customizer.

## Quick Navigation

- [For Blind and Low Vision Users](#for-blind-and-low-vision-users)
- [For Clinicians and Caregivers](#for-clinicians-and-caregivers)
- [For Novice Makers](#for-novice-makers)
- [For Voice Input Users](#for-voice-input-users)
- [General Accessibility Features](#general-accessibility-features)

---

## For Blind and Low Vision Users

The OpenSCAD Web Customizer Forge is designed with screen reader users in mind and provides multiple ways to access 3D model customization without needing to see the visual preview.

### Keyboard Navigation

#### Essential Keyboard Shortcuts

- **Tab** / **Shift+Tab**: Navigate between interactive elements
- **Arrow Keys**: Rotate 3D preview (when preview has focus)
- **Shift + Arrow Keys**: Pan 3D preview
- **+** / **-**: Zoom in/out on 3D preview
- **Ctrl+Z**: Undo last parameter change
- **Ctrl+Shift+Z**: Redo parameter change
- **Escape**: Close open modals or tooltips

#### Navigating the Interface

1. **Skip to Content**: Press Tab immediately after page load to activate the "Skip to main content" link
2. **Parameters Panel** (Left): All model parameters with their controls
3. **Preview Panel** (Right): 3D preview and action buttons
4. **Status Updates**: Announced automatically via screen reader

### Screen Reader Features

#### Live Region Announcements

The app provides automatic announcements for:

- Parameter value changes (with debouncing to avoid spam)
- Model render status (in progress, complete, error)
- File upload results
- Library loading status
- Camera movement actions
- Preset loading confirmations

#### Helpful Landmarks

- `role="region"` on major sections with labels
- `role="status"` for render status updates
- `role="dialog"` for modal interactions
- `aria-live="polite"` for non-disruptive updates

### Forced Colors Mode (Windows High Contrast)

The app fully supports Windows High Contrast mode and other OS-enforced color schemes:

- All UI elements remain visible with system colors
- Focus indicators use outlines (not suppressed box-shadows)
- Borders are explicitly defined on all interactive elements
- No information is conveyed by color alone

### Enhanced Contrast Mode

Toggle High Contrast mode within the app:

1. Click the "HC" button in the top-right header, or
2. Press Tab until you reach it and press Enter

Features:
- Larger text (12-17% increase)
- Thicker borders (2-3px)
- Stronger focus indicators (4px)
- WCAG AAA contrast ratios (7:1)

### Non-Visual Model Information

When a model is rendered, the following information is available:

- **Render Status**: Success, in progress, or error state
- **Model Dimensions**: X, Y, Z bounding box in millimeters
- **File Size**: Output file size
- **Vertex Count**: Geometric complexity indicator

Access this via the Stats section (below the 3D preview).

### Tips for Screen Reader Users

1. **Start with Examples**: Load an example model to get familiar with the interface
2. **Use Parameter Groups**: Models with many parameters are organized into collapsible groups
3. **Presets Are Your Friend**: Save frequently-used configurations as presets
4. **Undo is Available**: Don't worry about experimenting—Ctrl+Z undoes parameter changes
5. **Help Text**: Each parameter may have a help tooltip (? button)

#### Tested Configurations

- **NVDA + Firefox** (Windows): Fully supported
- **JAWS + Chrome/Edge** (Windows): Fully supported
- **VoiceOver + Safari** (macOS/iOS): Fully supported
- **TalkBack + Chrome** (Android): Supported for basic workflows

---

## For Clinicians and Caregivers

If you're customizing assistive devices (like AAC keyguards) for clients, this section will help you use the customizer efficiently in a clinical setting.

### Keyguard Workflow

See the dedicated [Keyguard Workflow Guide](./KEYGUARD_WORKFLOW_GUIDE.md) for step-by-step instructions on customizing AAC keyguards.

### Preset Sharing for Collaboration

#### Saving Client Configurations

1. Adjust parameters for your client's needs
2. Click "Save Preset" in the Parameters panel
3. Name it descriptively (e.g., "Jane - Grid 4x5 - 15mm holes")
4. Click "Save"

#### Sharing Presets Between Sessions

Presets are saved in your browser's local storage. To share across devices:

1. Open Advanced menu → "View Params JSON"
2. Copy the JSON to clipboard
3. Send via email or paste into client notes
4. On another device, paste JSON and click "Apply"

### Quick Iteration for Trial Fittings

1. Start with a preset closest to your client's device
2. Adjust 1-2 key parameters (e.g., hole size, rail height)
3. Generate and download STL
4. 3D print test piece
5. Note adjustments needed
6. Reload preset and adjust
7. Repeat until perfect fit

### Color Considerations for CVI Users

Some AAC keyguards are used by clients with Cortical Visual Impairment (CVI) who benefit from high-contrast colors:

- Many AAC keyguard models support a `color` parameter
- Black keyguards often provide best contrast against device screens
- Use the "Model Color" picker in Preview Settings to test colors visually

### Multi-Client Management

Best practices for managing multiple client configurations:

- Use clear preset names with client initials and device info
- Document parameter values in client records
- Keep a backup JSON export in each client's file
- Review and update presets after each assessment

---

## For Novice Makers

New to 3D modeling and parametric customization? This section explains the basics.

### What Are Parameters?

Parameters are the adjustable values that control your 3D model. Common examples:

- **Size** (width, height, depth in millimeters)
- **Thickness** (wall thickness, typically 2-5mm)
- **Resolution** (detail level; higher = smoother curves but slower rendering)
- **Quantities** (how many holes, slots, or features)

#### Understanding Units

- Most models use **millimeters (mm)**
- 1 inch = 25.4mm
- Your 3D printer's build volume is typically listed in mm

### Safe Starting Values

If you're unsure what values to use:

1. **Start with defaults**: The model's author chose sensible defaults
2. **Make small changes**: Adjust one parameter at a time
3. **Use the Reset button**: Returns parameter to its default value
4. **Undo if needed**: Ctrl+Z undoes your last change

### Common Parameter Types

- **Slider**: Drag or use arrow keys to adjust numeric values
- **Dropdown**: Select from predefined options
- **Checkbox**: Toggle features on/off
- **Text**: Enter custom text or values

### What If I Break Something?

Don't worry! You can't break anything permanently:

- **Reset All**: Returns everything to defaults
- **Undo**: Reverses your last change (Ctrl+Z)
- **Reload Page**: Worst case, refresh your browser

### Getting Help

- **Parameter Help (?)**: Click the ? button next to parameters for explanations
- **Features Guide**: Click "Help" button for tutorials
- **Error Messages**: Read carefully—they often explain what went wrong
- **Example Models**: Try the built-in examples to learn how parameters work

---

## For Voice Input Users

If you use voice input software (Dragon NaturallySpeaking, Windows Voice Control, macOS Voice Control), this section ensures you can use all features.

### Speakable Interface Elements

All interactive elements have visible text labels or accessible names:

- **Buttons**: Named clearly ("Generate Model", "Save Preset", etc.)
- **Inputs**: Labeled with parameter names
- **Dropdowns**: Labeled with setting names

### Voice Command Tips

#### Common Commands (vary by software)

- "Click Generate Model" - Start rendering
- "Click Save Preset" - Save current configuration  
- "Click Reset" - Reset parameters to defaults
- "Press Tab" - Navigate to next element
- "Press Enter" - Activate focused button

#### Parameter Adjustment

For numeric parameters:

- "Click [parameter name]" to focus
- "Type [number]" to set value
- "Press Enter" or "Press Tab" to apply

### Known Limitations

- **3D Preview Camera**: Voice commands for rotating the camera may be challenging. Use the on-screen camera control buttons instead.
- **Slider Drag**: Use keyboard (+/- or arrow keys) instead of "drag" commands

### Recommended Setup

1. Ensure all buttons and inputs have keyboard focus
2. Use voice commands to navigate via Tab
3. Use keyboard shortcuts for frequent actions (Ctrl+Z, etc.)
4. Enable "Show Keyboard Focus" in your OS accessibility settings

---

## Color System and Visual Accessibility

### Accessible Color Palette

The OpenSCAD Web Customizer uses an accessible color system built on [Radix Colors](https://www.radix-ui.com/colors), designed to meet **WCAG 2.2 AA** standards for normal themes and **WCAG AAA (7:1)** standards for high contrast mode.

#### Color Palette

- **Yellow (Accent)**: Primary brand color for buttons, links, and highlights
- **Green (Success)**: Successful operations and positive states
- **Teal (Info)**: Informational messages and secondary actions
- **Red (Error)**: Errors and destructive actions
- **Amber (Warning)**: Warnings and caution states
- **Neutral (Slate)**: Text, backgrounds, and borders

All colors are carefully selected to:
- Meet WCAG contrast requirements
- Be distinguishable for color blind users
- Work across light, dark, and high contrast themes
- Never convey information by color alone (WCAG 1.4.1)

### Theme Options

#### Light Theme

- Default theme with light backgrounds and dark text
- Optimized for bright environments
- WCAG 2.2 AA compliant (4.5:1 for text, 3:1 for UI elements)

#### Dark Theme

- Dark backgrounds with light text
- Reduces eye strain in low-light conditions
- Same contrast requirements as light theme
- Automatically activates based on system preference (if not manually set)

#### High Contrast Mode

Toggle via the "HC" button in the header.

Features:
- **WCAG AAA** compliant (7:1 contrast for text)
- Larger text sizes (12-17% increase)
- Thicker borders (2-3px instead of 1px)
- Stronger focus indicators (4px instead of 3px)
- Brand-neutral colors for maximum contrast

Available in both light and dark variants.

### Focus Indicators

Focus indicators use **brand-neutral blue** (#0052cc in light mode, #66b3ff in dark mode) for:
- Consistency with OS conventions
- Clear distinction from brand yellow
- Optimal contrast against all backgrounds

All focus indicators meet **WCAG 2.4.13 Focus Appearance** requirements:
- Minimum 3px thickness (4px in high contrast mode)
- 3:1 contrast against adjacent colors
- Visible outline or box-shadow

### Color Blindness Considerations

The palette is designed to be distinguishable for common color vision deficiencies:

- **Deuteranopia/Protanopia (Red-Green)**: Yellow and green have sufficient brightness difference
- **Tritanopia (Blue-Yellow)**: Teal provides clear distinction from yellow
- **All Types**: Icons and text accompany all color-coded states

**Important**: No information is conveyed by color alone (WCAG 1.4.1). All states include:
- ✓ Success states have checkmark icons
- ✗ Error states have X icons
- ⚠ Warning states have warning icons
- ℹ Info states have info icons

### Contrast Testing

The color system includes automated tests:
- WCAG 2.x contrast ratios (4.5:1 for text, 3:1 for UI)
- WCAG AAA ratios for high contrast mode (7:1)
- APCA (future WCAG 3.0) informational checks

Tests run automatically with `npm test`.

### System Preferences

The app respects system-level accessibility preferences:

#### prefers-color-scheme

Automatically switches between light and dark themes based on your OS setting (unless manually overridden).

#### prefers-contrast

When "Increase Contrast" is enabled in your OS:
- Borders become thicker
- Focus indicators are enhanced
- Text contrast is increased
- Colors remain brand-appropriate

#### forced-colors (Windows High Contrast)

When Windows High Contrast or other OS color schemes are active:
- All colors map to system colors (Canvas, CanvasText, LinkText, etc.)
- Focus uses outline instead of box-shadow
- Borders are explicitly visible on all interactive elements
- No information is lost

#### prefers-reduced-motion

When "Reduce Motion" is enabled:
- Animations are disabled or minimized
- Transitions are instant

### Color Resources

For detailed information:
- **System Overview**: See [Color System Guide](./COLOR_SYSTEM_GUIDE.md)
- **Migration Info**: See [Color Migration Guide](./COLOR_MIGRATION_GUIDE.md)
- **Token Reference**: Check `src/styles/semantic-tokens.css`

---

## General Accessibility Features

### Built-in Features

- ✅ **Keyboard navigation**: Full functionality without a mouse
- ✅ **Screen reader support**: Comprehensive ARIA labels and live regions
- ✅ **High contrast mode**: Toggle via HC button (top-right)
- ✅ **Forced colors support**: Works with OS-enforced color schemes
- ✅ **Focus indicators**: Always visible on all interactive elements (WCAG 2.2)
- ✅ **Reduced motion**: Respects `prefers-reduced-motion` setting
- ✅ **Touch targets**: All buttons meet 44×44px minimum size
- ✅ **Undo/Redo**: Parameter history with Ctrl+Z/Ctrl+Shift+Z
- ✅ **Presets**: Save and recall frequently-used configurations
- ✅ **Persistent values**: Parameters remembered between sessions

### Standards Compliance

- **WCAG 2.2 Level AA**: Meets or exceeds all applicable criteria
- **Section 508**: Compliant with U.S. federal accessibility requirements
- **EN 301 549**: Aligned with European accessibility standard
- **W3C COGA**: Implements cognitive accessibility patterns

### Browser Recommendations

For best accessibility experience:

- **Windows**: Firefox + NVDA or Chrome/Edge + JAWS
- **macOS**: Safari + VoiceOver
- **Linux**: Firefox + Orca
- **Mobile**: Safari (iOS) or Chrome (Android) with built-in screen readers

### Reporting Accessibility Issues

If you encounter an accessibility barrier:

1. Check this guide for workarounds
2. Try an alternative browser/AT combination
3. Report the issue on our [GitHub Issues page](https://github.com/BrennenJohnston/openscad-web-customizer-forge/issues)
4. Include:
   - Your OS and browser
   - Assistive technology (if applicable)
   - Steps to reproduce the issue

---

## Additional Resources

- [Keyguard Workflow Guide](./KEYGUARD_WORKFLOW_GUIDE.md) - Detailed AAC keyguard customization
- [Manual Testing Procedures](./MANUAL_TESTING_PROCEDURES.md) - For contributors testing accessibility
- [Features Guide](../../README.md#features) - Overview of all features
- [Deployment Guide](./DEPLOYMENT_GUIDE.md) - For developers

---

**Last Updated**: 2026-01-18  
**Version**: 2.4.0+
