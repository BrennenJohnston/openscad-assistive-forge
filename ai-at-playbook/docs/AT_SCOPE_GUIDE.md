# Assistive Technology Scope Guide

This playbook isn't just about web accessibility. It's for anyone building software
that helps people — whether that's a screen reader-friendly website, a tactile map
generator, or a 3D-printed adaptive grip.

If you're using AI coding tools to build assistive technology, the rules in this
playbook apply to your project. The specific guardrails depend on which category
your project falls into.

## AT use case taxonomy

This playbook serves developers building software across these AT categories:

| Category | Example Projects | Key AI Guardrails |
| --- | --- | --- |
| **Web accessibility tools** | Screen reader-friendly websites, WCAG audit tools | WCAG compliance, semantic HTML, ARIA correctness |
| **3D-printed assistive devices** | Tactile maps, adaptive grips, switch mounts | Parametric accuracy, material safety, user testing |
| **Accessible education** | Tutorial sandboxes, interactive learning tools | Cognitive load management, multi-modal input |
| **Community resource platforms** | AT product databases, maker directories | Data quality, search accessibility, responsive UI |
| **IoT assistive technology** | Smart home controls, environmental sensors | Latency constraints, offline-first, physical safety |
| **Communication aids** | AAC apps, symbol-based interfaces | Symbol standardization, personalization, privacy |
| **Navigation aids** | Wayfinding apps, transit maps | Real-time accuracy, tactile output, multi-sensory |

### How to use this table

Find your project's category (or categories — some projects span multiple). The "Key AI
Guardrails" column tells you which rules matter most for your context. When you set up
your AI rules (`AGENTS.md`, `.cursor/rules/`, etc.), emphasize these guardrails.

## The legacy code perspective

From team discussion: "Even though it's new, legacy code is code where history's been
lost. We've got a lot of ambiguous history in this project."

AI-generated codebases should be treated as legacy code because:

- The AI's decision history is scattered across chat transcripts, not code comments
- Multiple AI sessions produce inconsistent patterns
- The "why" behind architectural choices is lost between sessions
- Tests are often generated after the code, not before

### Recovery strategies for AI-generated "legacy" code

1. Write characterization tests that document current behavior before changing anything
2. Extract interfaces at module boundaries to create testable seams
3. Build monitoring around existing behavior before refactoring
4. Document architectural decisions as ADRs when you discover them
5. Treat the first refactoring pass as discovery, not cleanup

These strategies apply across all seven AT categories. Whether you're recovering a web
app's UI layer or understanding how a 3D model generator's parametric logic works, the
approach is the same: understand first, then change.

## Human-in-the-loop patterns for AT

From team discussion on alt text: "If an alt text hasn't been created for an image, it
has a red border or a voiceover that says unfinished image description."

AI should NEVER autonomously complete these AT-critical tasks:

- Generate alt text for images in AT contexts (false positives create inaccessibility)
- Choose symbol meanings for AAC/communication aids
- Set safety-critical parameters for physical devices (3D print tolerances, grip strength)
- Determine navigation accuracy requirements
- Make WCAG conformance claims without human verification

AI SHOULD:

- Flag incomplete accessibility tasks with "construction underway" indicators
- Generate scaffolding that makes human completion easier (empty alt attributes,
  placeholder descriptions, template structures)
- Run automated checks (axe-core, Lighthouse) and surface results for human review
- Propose options with trade-off analysis, not make the final decision

### When this applies by category

| Category | Human-in-the-loop examples |
| --- | --- |
| **Web accessibility tools** | Alt text authoring, WCAG conformance claims, color contrast overrides |
| **3D-printed assistive devices** | Print tolerances, material selection for skin contact, grip force settings |
| **Accessible education** | Cognitive load assessment, reading level verification |
| **Community resource platforms** | Product safety claims, accessibility ratings |
| **IoT assistive technology** | Safety-critical thresholds, emergency alert parameters |
| **Communication aids** | Symbol meaning assignment, vocabulary selection |
| **Navigation aids** | Accuracy requirements for wayfinding, obstacle detection thresholds |

## "Construction underway" pattern

From team discussion: "It's like a construction underway type of sign."

When a feature is incomplete — especially an accessibility feature — AI should generate
visible indicators rather than leaving a gap. A missing alt text with no indicator looks
like a finished feature. A missing alt text with a "construction underway" marker tells
humans exactly what needs attention.

### For incomplete content (web context)

```html
<!-- Pattern: Construction Underway indicator -->
<div class="feature-wip" role="status" aria-live="polite">
  <span class="wip-indicator" aria-hidden="true">[In Development]</span>
  <span class="sr-only">[CONFIGURE: description of what is being built]</span>
</div>
```

### For disabled controls awaiting implementation

```html
<button disabled aria-describedby="wip-alt-text">
  Generate Alt Text
</button>
<span id="wip-alt-text" class="sr-only">
  This feature is under development and not yet available.
</span>
```

### For non-web contexts

The same pattern applies outside the browser:

- **3D-print projects**: Mark unvalidated models with a metadata flag (`"validated": false`)
  and surface it in the UI
- **IoT projects**: Default to the safest setting when a parameter hasn't been human-reviewed
- **Communication aids**: Use a standard "undefined symbol" placeholder rather than
  guessing meaning

### Project-specific configuration

- **WIP indicator class:** `[CONFIGURE: CSS class for construction underway, e.g., .feature-wip]`
- **WIP announcement pattern:** `[CONFIGURE: how incomplete features are announced to screen readers]`
- **Safety-critical defaults:** `[CONFIGURE: what happens when a safety parameter hasn't been human-reviewed]`
