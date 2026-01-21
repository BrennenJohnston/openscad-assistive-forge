# Tutorial Design Research

**Version:** 1.0 (January 2026)  
**Context:** OpenSCAD Assistive Forge - Tutorial and Onboarding System Design

## Overview

This document synthesizes research, standards, and best practices that inform the design of the app's tutorial and onboarding systems, including role-based tutorials and UI orientation.

## Research Foundations

### 1. W3C Cognitive and Learning Disabilities Accessibility (COGA)

**Source:** [W3C COGA Design Patterns](https://www.w3.org/WAI/WCAG2/supplemental/patterns/)

**Key Principles Applied:**

- **Clear Language**: Use plain, concrete language with short sentences and active voice
- **Predictable Controls**: Consistent button placement, labeling, and behavior across tutorials
- **Error Tolerance**: Allow users to exit tutorials at any time (Escape key, close button)
- **Progressive Disclosure**: Teach "where things are" first (UI Orientation), then "how to use them" (role tutorials)
- **Minimize Distractions**: Spotlight overlay dims non-relevant UI, focuses attention

**Implementation in This App:**
- Tutorial steps use plain language with `<kbd>` tags for keyboard shortcuts
- Exit mechanisms are prominently shown ("Press Esc to exit anytime")
- UI Orientation is optional and separate from task-based tutorials
- Spotlight cutouts create visual focus without overwhelming users

**Relation to WCAG:** COGA patterns are supplemental guidance to WCAG 2.2, not normative success criteria. This app uses them as design guidelines for cognitive accessibility.

---

### 2. WCAG 2.2 SC 3.1.5 Reading Level (AAA)

**Source:** [WCAG 2.2 SC 3.1.5](https://www.w3.org/WAI/WCAG22/Understanding/reading-level.html)

**Guideline:** Text requiring more than lower secondary education level reading ability should have a simplified version available.

**Application in This App:**
- Used as a *writing guideline* for tutorial copy, not a compliance target (AAA is aspirational)
- Tutorial content targets a general audience with short sentences, common words, and action-oriented language
- Technical jargon (e.g., "STL", "parameters") is introduced contextually with examples

**Note:** This is an AAA criterion and not required for WCAG 2.1 Level AA compliance. The app treats it as a *copy quality standard* rather than a formal accessibility requirement.

---

### 3. Universal Design for Learning (UDL) 3.0 Guidelines

**Source:** [CAST UDL Guidelines 3.0 (2024)](https://udlguidelines.cast.org/)

**Relevant Principles:**

#### Multiple Means of Engagement
- **Choice and autonomy**: Users self-select role paths; tutorials are skippable
- **Relevance and authenticity**: Role-based tutorials match real-world use cases (educator demos, maker workflows, keyboard-only navigation)
- **Minimize threats and distractions**: Spotlight overlay dims irrelevant UI

#### Multiple Means of Representation
- **Provide options for perception**: Visual spotlight, keyboard navigation, screen reader announcements
- **Provide options for language**: Plain-language copy with visual cues (arrows, highlights)

#### Multiple Means of Action and Expression
- **Provide options for physical action**: Keyboard-only navigation, voice input friendly, no drag-required workflows
- **Provide options for executive functions**: Progress indicators, clear "step N of M" counters

**Implementation:**
- Each role path tutorial addresses a specific learning context (educator facilitation, keyboard-only workflow, screen reader usage)
- Progress indicators show current step and total steps
- Users can minimize tutorials to explore freely, then restore

---

### 4. Assistive Technology Educator Training Frameworks

**Source:** SETT Framework (Student, Environments, Tasks, Tools) - Joy Zabala

**Relevance:** The Educator tutorial applies SETT-style framing:
- **Student context**: Educators guiding learners through 3D customization
- **Environment**: Classroom demonstrations, time-constrained settings
- **Tasks**: Demonstrate parameter changes, save presets for reuse, generate STL files
- **Tools**: Simple Box example, preset system, Features Guide

**Application:**
- Educator tutorial focuses on *classroom tasks* (demonstrate, save, share) rather than exhaustive feature coverage
- Tutorial duration (~2 minutes) aligns with "quick demo" timescales common in training
- Emphasis on reproducibility (presets) matches educator workflow needs

---

### 5. OpenAT / Makers Making Change Documentation Patterns

**Source:** [Makers Making Change](https://www.makersmakingchange.com/) - Open Assistive Technology projects

**Observed Patterns:**
- **Maker Guide + User Guide separation**: Technical details vs. end-user instructions
- **Goal-first structure**: Guides start with "what you'll accomplish" before "how to do it"
- **Reproducibility emphasis**: Clear steps for replicating results

**Application in This App:**
- Role tutorials separate "what you'll learn" (goal bullets) from step-by-step instructions
- UI Orientation is "where things are" (user guide), role tutorials are "how to use them" (task guide)
- Educator tutorial emphasizes saving presets for reproducibility in classroom settings

---

### 6. Open Source Onboarding UX Patterns

These libraries provide implementation references for onboarding patterns (not dependencies):

#### [Shepherd.js](https://github.com/shipshapecode/shepherd) (Onboarding Library)
**Patterns Borrowed:**
- **Step structure**: Each step has title, content, target element, position preference
- **Escape hatches**: Users can exit at any time (Escape key, close button)
- **Conditional progression**: Step gating for "Try this" actions
- **Focus restoration**: Returns focus to trigger element on close

#### [Driver.js](https://github.com/kamranahmedse/driver.js) (Lightweight Tour Library)
**Patterns Borrowed:**
- **Spotlight cutout**: SVG mask creates visual "hole" around target element
- **Minimal cognitive load defaults**: Short text, clear targets, simple navigation
- **Smart positioning**: Panel positions itself near target based on available space

#### [Intro.js](https://github.com/usablica/intro.js) (Step-by-step Guide Library)
**Patterns Borrowed:**
- **Progress indicators**: "Step N of M" visible at all times
- **Keyboard support**: Arrow keys for navigation, Tab for focus control
- **First-run tour conventions**: Welcome screen → feature highlights → completion summary

**Implementation:**
The tutorial sandbox system (`src/js/tutorial-sandbox.js`) synthesizes these patterns into a custom implementation tailored to accessibility needs (screen reader announcements, keyboard-first design, forced-colors mode support).

---

## Design Decisions Based on Research

### Decision 1: Separate UI Orientation from Role Tutorials

**Research Support:**
- **COGA**: Progressive disclosure reduces cognitive load
- **UDL**: Learner agency (users choose when to learn layout vs. features)
- **Onboarding UX**: Short orientation modules outperform long training sessions

**Implementation:**
- UI Orientation (1 minute, 6 steps): "Where things are"
- Role tutorials (2-3 minutes, 4-8 steps): "How to use them"
- No overlap between orientation and role content

---

### Decision 2: Non-Gated UI Orientation

**Research Support:**
- **COGA**: Error tolerance and minimal frustration
- **UDL**: Multiple means of action (recognition vs. performance)
- **Educator training insight**: Time-boxed "awareness" sessions are less stressful than "do this" tasks

**Implementation:**
- UI Orientation has no completion requirements (no `completion` property in steps)
- Users can skip through all steps immediately
- Focus is on *recognizing* controls, not *using* them

---

### Decision 3: Viewport-Aware Selectors

**Research Support:**
- **COGA**: Predictable controls (same tutorial works on mobile and desktop)
- **UDL**: Multiple means of representation (responsive design as a learning support)
- **Accessibility best practices**: One tutorial, multiple input modalities

**Implementation:**
- Comma-separated selectors: `#mobileDrawerToggle, #collapseParamPanelBtn`
- Tutorial system selects first *visible* element from list
- Tutorial copy mentions both mobile and desktop controls: "On mobile: tap 'Params'. On desktop: use the collapse button."

---

### Decision 4: Keep Educator Tutorial Under 10 Steps

**Research Support:**
- **COGA**: Chunking and cognitive load limits (7±2 items in working memory)
- **UDL**: Minimize threats and distractions (long tutorials feel overwhelming)
- **Educator training**: 2-3 minute demos are optimal for initial adoption

**Implementation:**
- Educator tutorial is 8 steps (including welcome and completion)
- UI Orientation is 6 steps (non-gated)
- Total onboarding time: 3-4 minutes maximum

---

## Tutorial System Technical Implementation

### Accessibility Features (ARIA, Keyboard, Screen Reader)

**ARIA Attributes:**
- `role="dialog"` with `aria-modal="true"` on tutorial overlay
- `aria-live="polite"` for step announcements
- `aria-labelledby` and `aria-describedby` for panel content
- `aria-expanded`, `aria-controls` for collapsible elements

**Keyboard Support:**
- **Escape**: Exit tutorial
- **Arrow keys**: Navigate between steps
- **Tab**: Focus within tutorial panel
- **Enter/Space**: Activate buttons

**Screen Reader Announcements:**
- "[Tutorial title] started. Step 1 of [total]."
- "Step [N] of [total]: [Step title]"
- "Action completed. Next enabled."
- "Tutorial closed."

**Forced-Colors Mode Support:**
- Border styles use `currentColor` for Windows High Contrast
- No reliance on background-only color differentiation

---

## Testing Implications

### Manual Testing Required

Based on this research, the following manual tests are critical:

1. **Cognitive Load Test** (COGA):
   - Can a user unfamiliar with the app complete UI Orientation without frustration?
   - Is the language clear enough for non-technical users?

2. **Screen Reader Test** (WCAG + UDL):
   - Are step transitions announced clearly?
   - Can a blind user follow the tutorial without visual cues?

3. **Keyboard-Only Test** (WCAG 2.1.1, UDL):
   - Can the tutorial be navigated entirely with keyboard?
   - Does focus restoration work correctly on exit?

4. **Viewport Responsiveness Test** (UDL, Accessibility):
   - Do mobile selectors highlight correctly on small screens?
   - Do desktop selectors highlight correctly on large screens?
   - Do comma-separated selectors pick the first *visible* element?

5. **Educator Workflow Test** (SETT Framework):
   - Can an educator run through the tutorial in under 3 minutes?
   - Does the preset workflow make sense in a classroom context?

---

## Future Research Areas

### Areas for Further Investigation

1. **Adaptive Tutorials**: Could tutorials adjust based on user behavior (e.g., skip steps the user has already completed)?
2. **Localization**: How do these patterns translate to non-English languages with different reading conventions?
3. **Gamification**: Would progress badges or completion incentives improve engagement without increasing cognitive load?
4. **Analytics**: What metrics would help measure tutorial effectiveness without compromising privacy?

---

## References and Further Reading

### Standards and Guidelines

- **W3C COGA**: [Cognitive Accessibility Guidance](https://www.w3.org/WAI/WCAG2/supplemental/)
- **WCAG 2.2**: [Web Content Accessibility Guidelines](https://www.w3.org/WAI/WCAG22/)
- **UDL 3.0**: [Universal Design for Learning Guidelines](https://udlguidelines.cast.org/)

### Assistive Technology and Education

- **SETT Framework**: Joy Zabala - [Student, Environments, Tasks, Tools](https://www.setbc.org/sett-framework/)
- **Makers Making Change**: [Open AT Project Documentation](https://www.makersmakingchange.com/)

### Open Source UX Libraries (Implementation References)

- **Shepherd.js**: [GitHub - shipshapecode/shepherd](https://github.com/shipshapecode/shepherd)
- **Driver.js**: [GitHub - kamranahmedse/driver.js](https://github.com/kamranahmedse/driver.js)
- **Intro.js**: [GitHub - usablica/intro.js](https://github.com/usablica/intro.js)

### Related Project Documentation

- [Accessibility Guide](../guides/ACCESSIBILITY_GUIDE.md) - Comprehensive accessibility features
- [Keyguard Workflow Guide](../guides/KEYGUARD_WORKFLOW_GUIDE.md) - Keyboard-first workflow details
- [Welcome Screen Feature Paths](../guides/WELCOME_SCREEN_FEATURE_PATHS.md) - Role-based tutorial system
- [Welcome Feature Paths Inventory](../WELCOME_FEATURE_PATHS_INVENTORY.md) - Detailed role mapping

---

## Maintenance Notes

When updating tutorials or onboarding:

1. **Consult this research** to ensure changes align with established principles
2. **Test with real users** from target role groups (educators, makers, keyboard-only users, screen reader users)
3. **Update this document** if new research emerges or design decisions change
4. **Document trade-offs** when research principles conflict (e.g., detailed instructions vs. cognitive load)

---

**Document History:**
- v1.0 (January 2026): Initial research synthesis for v2.4 tutorial enhancements
