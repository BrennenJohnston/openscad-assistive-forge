# Documentation Index

**OpenSCAD Web Customizer Forge** — Complete documentation directory

---

## 🚀 Quick Start

**New to the project?** Start here:

1. [Main README](../README.md) — Project overview and features
2. [Cloudflare Pages Deployment](guides/CLOUDFLARE_PAGES_DEPLOYMENT.md) — Deploy your own instance
3. [Testing Quick Start](guides/TESTING_QUICK_START.md) — Run tests locally

---

## 📦 Deployment & Hosting

### Primary Hosting Platform

- **[Cloudflare Pages Deployment Guide](guides/CLOUDFLARE_PAGES_DEPLOYMENT.md)** ⭐ **Recommended**
  - Complete step-by-step deployment instructions
  - Git integration and Wrangler CLI methods
  - Troubleshooting and verification steps
  - Free tier with unlimited bandwidth

### Alternative Platforms

- [Vercel Deployment Guide](guides/DEPLOYMENT_GUIDE.md) — Legacy hosting option
- [Vercel Legacy Configuration](guides/VERCEL_LEGACY_CONFIG.md) — Rollback instructions for existing Vercel deployments
- [PWA Deployment Guide](guides/PWA_DEPLOYMENT_GUIDE.md) — Progressive Web App setup

### Technical Research & Validation

- [WASM Threading Analysis](research/WASM_THREADING_ANALYSIS.md) — In-depth analysis of `openscad-wasm-prebuilt@1.2.0` threading requirements
- [Comparable Projects Research](research/COMPARABLE_PROJECTS.md) — How similar WASM CAD projects handle hosting
- [Cloudflare Configuration Validation](research/CLOUDFLARE_VALIDATION.md) — Production-ready configuration verification

---

## 🧪 Testing & Quality Assurance

### Getting Started with Testing

- [Testing Quick Start](guides/TESTING_QUICK_START.md) — Run tests in minutes
- [Manual Testing Procedures](guides/MANUAL_TESTING_PROCEDURES.md) — Comprehensive manual testing guide

### Specialized Testing Guides

- [Cross-Browser Testing Guide](guides/CROSS_BROWSER_TESTING_GUIDE.md) — Test across browsers
- [Dark Mode Testing Guide](guides/DARK_MODE_TESTING_GUIDE.md) — Theme and accessibility testing
- [Library Testing Guide](guides/LIBRARY_TESTING_GUIDE.md) — External library integration tests
- [ZIP Upload Testing Guide](guides/ZIP_UPLOAD_TESTING_GUIDE.md) — Multi-file project testing
- [UI Testing Guide](guides/UI_TESTING_GUIDE_v1.11.1.md) — UI component testing (v1.11.1)

### Verification & Checklists

- [Production Verification Checklist](guides/PRODUCTION_VERIFICATION_CHECKLIST.md) — Pre-deployment validation
- [Deployment Verification](guides/DEPLOYMENT_VERIFICATION.md) — Post-deployment checks
- [Test Report](../TEST_REPORT.md) — Comprehensive testing results

---

## 📐 Technical Specifications

- [Parameter Schema Specification](specs/PARAMETER_SCHEMA_SPEC.md) — JSON Schema format for OpenSCAD parameters
- [Testing Documentation](TESTING.md) — Test suite architecture
- [Troubleshooting](TROUBLESHOOTING.md) — Common issues and solutions
- [Performance](PERFORMANCE.md) — Performance optimization guide

---

## 🏗️ Development & Architecture

### Planning Documents

- [Build Plan](BUILD_PLAN_NEW.md) — Current development roadmap
- [Build Plan (Original)](BUILD_PLAN.md) — Historical reference

### User Guidance

- [Choosing Forge vs Playground](guides/CHOOSING_FORGE_VS_PLAYGROUND.md) — Which tool to use and why
- [Mobile Limitations](MOBILE_LIMITATIONS.md) — Known mobile platform constraints

---

## 📚 Version History & Changelogs

### Latest Releases

- [v2.10.1 Changelog](changelogs/CHANGELOG_v2.10.1.md) — Bug fixes and improvements
- [v2.10 Changelog](changelogs/CHANGELOG_v2.10.md) — Enhanced accessibility & layout
- [v2.6 Changelog](changelogs/CHANGELOG_v2.6.md) — WASM progress & mobile enhancements
- [v2.5 Changelog](changelogs/CHANGELOG_v2.5.md) — Panel layout & resizable UI
- [v2.4 Release Notes](v2.4.0-RELEASE_NOTES.md) — Major feature release
- [v2.3 Changelog](changelogs/CHANGELOG_v2.3.md) — Codebase audit & polish
- [v2.2 Changelog](changelogs/CHANGELOG_v2.2.md) — Vue/Svelte templates
- [v2.1 Changelog](changelogs/CHANGELOG_v2.1.md) — Enhanced CLI
- [v2.0 Changelog](changelogs/CHANGELOG_v2.0.md) — Library system

### Full Changelog Archive

All version changelogs are available in [changelogs/](changelogs/)

**Major versions:**
- v2.x - v3.x (2026): Accessibility, CLI tooling, templates, library system, Cloudflare deployment
- v1.x (2026): Core features, ZIP upload, auto-preview, examples, preset management

---

## 🗂️ Archive

Historical documents and legacy content: [archive/](archive/)

---

## 🔍 Finding What You Need

### By Topic

| Topic | Documents |
|-------|-----------|
| **Deployment** | [Cloudflare Guide](guides/CLOUDFLARE_PAGES_DEPLOYMENT.md), [Vercel Guide](guides/DEPLOYMENT_GUIDE.md), [PWA Guide](guides/PWA_DEPLOYMENT_GUIDE.md) |
| **Testing** | [Quick Start](guides/TESTING_QUICK_START.md), [Manual Procedures](guides/MANUAL_TESTING_PROCEDURES.md), [Test Report](../TEST_REPORT.md) |
| **Troubleshooting** | [Troubleshooting Guide](TROUBLESHOOTING.md), [Deployment Verification](guides/DEPLOYMENT_VERIFICATION.md) |
| **Development** | [Build Plan](BUILD_PLAN_NEW.md), [Parameter Schema](specs/PARAMETER_SCHEMA_SPEC.md), [Performance](PERFORMANCE.md) |
| **Research** | [WASM Analysis](research/WASM_THREADING_ANALYSIS.md), [Comparable Projects](research/COMPARABLE_PROJECTS.md) |

### By User Role

**For End Users:**
- [Main README](../README.md) — Features and getting started
- [Choosing Forge vs Playground](guides/CHOOSING_FORGE_VS_PLAYGROUND.md)
- [Mobile Limitations](MOBILE_LIMITATIONS.md)

**For Deployers:**
- [Cloudflare Pages Deployment](guides/CLOUDFLARE_PAGES_DEPLOYMENT.md) ⭐
- [Production Verification Checklist](guides/PRODUCTION_VERIFICATION_CHECKLIST.md)
- [Cloudflare Configuration Validation](research/CLOUDFLARE_VALIDATION.md)

**For Developers:**
- [Build Plan](BUILD_PLAN_NEW.md)
- [Parameter Schema Spec](specs/PARAMETER_SCHEMA_SPEC.md)
- [Testing Documentation](TESTING.md)
- [Performance Guide](PERFORMANCE.md)

**For Researchers:**
- [WASM Threading Analysis](research/WASM_THREADING_ANALYSIS.md)
- [Comparable Projects Research](research/COMPARABLE_PROJECTS.md)
- [Test Report](../TEST_REPORT.md)

---

## 📝 Contributing to Documentation

When adding new documentation:

1. **Place in appropriate directory**:
   - `guides/` — User-facing how-to guides
   - `specs/` — Technical specifications
   - `research/` — Technical research and analysis
   - `changelogs/` — Version release notes
   - `archive/` — Historical/deprecated docs

2. **Update this index** (`docs/README.md`)

3. **Add cross-references** in related documents

4. **Follow naming conventions**:
   - Guides: `TOPIC_GUIDE.md`
   - Specs: `TOPIC_SPEC.md`
   - Changelogs: `CHANGELOG_vX.Y.Z.md`

5. **Include metadata**:
   - Date created/updated
   - Author/maintainer
   - Status (Draft, Complete, Deprecated)

---

## 🔗 External Resources

### OpenSCAD
- [OpenSCAD Official](https://openscad.org/)
- [OpenSCAD Documentation](https://openscad.org/documentation.html)
- [OpenSCAD Customizer](https://en.wikibooks.org/wiki/OpenSCAD_User_Manual/Customizer)

### Hosting Platforms
- [Cloudflare Pages Docs](https://developers.cloudflare.com/pages/)
- [Vercel Documentation](https://vercel.com/docs)
- [Netlify Documentation](https://docs.netlify.com/)

### Web Standards
- [WCAG 2.1 Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)
- [Progressive Web Apps](https://web.dev/progressive-web-apps/)
- [Cross-Origin Isolation](https://web.dev/cross-origin-isolation-guide/)

---

**Last Updated**: January 17, 2026  
**Documentation Version**: 3.0.0
