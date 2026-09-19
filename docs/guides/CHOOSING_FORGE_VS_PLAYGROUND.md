# Choosing Between OpenSCAD Assistive Forge and OpenSCAD Playground

This page helps you decide whether to use **OpenSCAD Assistive Forge** (this project) or the official **OpenSCAD Playground**.

If you’re deciding what to link users to, what to embed, or which tool to build on, start here.

## Quick Summary

- **Choose OpenSCAD Playground** if you want an **official, editor-first** place to write OpenSCAD and run it in the browser.
- **Choose OpenSCAD Assistive Forge** if you want a **Customizer-first** experience: upload a Customizer-enabled `.scad`, get an auto-generated UI, share parameter links/presets, and download outputs.

## What Each Tool Is Optimized For

### OpenSCAD Playground (openscad/openscad-playground)

Best fit when you want:

- **Editor-centric workflow**: write/iterate on OpenSCAD code directly in the browser.
- **Official reference experience**: a widely recognized “canonical” OpenSCAD web app.
- **Upstream alignment**: patterns and runtime decisions closer to how OpenSCAD is typically showcased.

Tradeoffs:

- **Not Customizer-first**: if your goal is “parameter UI → download”, you may need extra work to build a guided non-coder UX.
- **Less generator/toolchain focus**: it’s primarily an app, not a CLI-driven system for scaffolding many dedicated customizers.

### OpenSCAD Assistive Forge (this project)

Best fit when you want:

- **A parameter UI without writing one**: open a Customizer-enabled `.scad` and the sliders, dropdowns and checkboxes are built for you.
- **Accessibility as the point, not a feature**: keyboard-first interaction, screen-reader support, high contrast, and 44px touch targets throughout.
- **A desktop-style option**: the Classic interface reproduces the OpenSCAD desktop window for people following tutorials written for it.
- Things an editor-first playground does not set out to do:
  - Share a configuration as a link, or save it as a named preset
  - Multi-file projects from a ZIP or a folder
  - Four bundled libraries (MCAD, BOSL2, NopSCADlib, dotSCAD) that switch on when your model asks for them
  - Install as a desktop app and work offline

Tradeoffs:

- **More to go wrong**: more features means more edge cases, and one maintainer.
- **Not the official one**: if you need the canonical OpenSCAD web app, that is the Playground.

## Decision Guide

Use this as a quick checklist:

- **I want people to write OpenSCAD code in a browser editor** → OpenSCAD Playground
- **I want non-coders to customize a model via controls** → OpenSCAD Assistive Forge
- **Someone in my group uses a screen reader, a keyboard only, or needs high contrast** → OpenSCAD Assistive Forge
- **I want the most “official” upstream-aligned web app** → OpenSCAD Playground

## Links

- **OpenSCAD Playground**: `https://github.com/openscad/openscad-playground`
- **OpenSCAD Assistive Forge**: see the repository `README.md`

