# Testing Guide

This document describes the testing infrastructure for the OpenSCAD Web Customizer Forge project.

## Overview

The project uses a comprehensive testing strategy with multiple layers:

1. **Unit Tests** - Test individual modules in isolation (Vitest)
2. **E2E Tests** - Test complete user workflows (Playwright)
3. **Accessibility Tests** - Ensure WCAG 2.1 AA compliance (axe-core)
4. **Lint Checks** - Code quality and style (ESLint, Prettier)
5. **Build Tests** - Verify production build succeeds

## Quick Start

```bash
# Run all unit tests
npm test

# Run unit tests with UI
npm run test:ui

# Run unit tests with coverage
npm run test:coverage

# Run E2E tests
npm run test:e2e

# Run E2E tests with UI
npm run test:e2e:ui

# Run E2E tests in headed mode (see browser)
npm run test:e2e:headed

# Run all tests (unit + E2E)
npm run test:all
```

## Unit Testing (Vitest)

### Structure

Unit tests are located in `tests/unit/` and follow the naming convention `*.test.js`.

```
tests/
├── unit/
│   ├── parser.test.js           # Parameter extraction tests
│   ├── state.test.js            # State management tests
│   ├── preset-manager.test.js   # Preset functionality tests
│   ├── theme-manager.test.js    # Theme system tests
│   └── zip-handler.test.js      # ZIP processing tests
├── fixtures/
│   ├── sample.scad              # Test OpenSCAD files
│   └── sample-advanced.scad
└── setup.js                      # Test setup and globals
```

### Writing Unit Tests

```javascript
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { MyModule } from '../../src/js/my-module.js'

describe('MyModule', () => {
  let instance
  
  beforeEach(() => {
    instance = new MyModule()
  })
  
  it('should do something', () => {
    const result = instance.doSomething()
    expect(result).toBe('expected value')
  })
  
  it('should handle errors', () => {
    expect(() => instance.throwError()).toThrow('Error message')
  })
})
```

### Coverage Reports

Coverage reports are generated in the `coverage/` directory:

- `coverage/index.html` - Interactive HTML report
- `coverage/lcov.info` - LCOV format for CI integration

**Coverage Targets (v2.4+)**:

- Core modules (parser, state, presets): **80%+**
- Overall codebase: **50%+**

### Current Coverage

| Module | Coverage | Status |
|--------|----------|--------|
| parser.js | 88.82% | ✅ Excellent |
| preset-manager.js | 70.37% | ✅ Good |
| theme-manager.js | 63.21% | ✅ Good |
| state.js | 22.68% | ⚠️ Needs improvement |
| zip-handler.js | 42.35% | ⚠️ Needs improvement |

## E2E Testing (Playwright)

### Structure

E2E tests are located in `tests/e2e/` and follow the naming convention `*.spec.js`.

```
tests/
└── e2e/
    ├── basic-workflow.spec.js    # Upload → Customize → Download
    └── accessibility.spec.js     # WCAG compliance tests
```

### Writing E2E Tests

```javascript
import { test, expect } from '@playwright/test'

test.describe('Feature Name', () => {
  test('should do something', async ({ page }) => {
    await page.goto('/')
    
    const button = page.locator('button:has-text("Click Me")')
    await button.click()
    
    await expect(page.locator('.result')).toContainText('Success')
  })
})
```

### Browser Configuration

Tests run on three browsers:

- **Chromium** (Chrome, Edge)
- **Firefox**
- **WebKit** (Safari)

To run only one browser:

```bash
npx playwright test --project=chromium
```

### Debugging E2E Tests

```bash
# Open Playwright UI for debugging
npm run test:e2e:ui

# Run tests in headed mode (see browser)
npm run test:e2e:headed

# Run with debugger attached
npm run test:e2e:debug
```

## Accessibility Testing

### Automated Checks

The `tests/e2e/accessibility.spec.js` file uses axe-core to check for:

- WCAG 2.1 Level A and AA violations
- Color contrast issues
- Missing ARIA labels
- Improper heading hierarchy
- Form label associations

### Manual Checks

Automated tools catch ~60% of accessibility issues. Manual testing should include:

1. **Keyboard Navigation**
   - Tab through all interactive elements
   - Verify focus indicators are visible
   - Test all keyboard shortcuts

2. **Screen Reader Testing**
   - Test with NVDA (Windows) or VoiceOver (Mac)
   - Verify all content is announced
   - Check that dynamic updates are announced

3. **Visual Checks**
   - Test with high contrast mode
   - Verify 200% zoom works properly
   - Check with Windows High Contrast themes

## Continuous Integration

### GitHub Actions

The project uses GitHub Actions for automated testing:

- **Unit Tests** - Run on every push and PR
- **E2E Tests** - Run on every push and PR
- **Build Check** - Verify production build succeeds
- **Coverage Upload** - Upload coverage to Codecov

### Workflow Files

- `.github/workflows/test.yml` - Main test workflow

### CI Status

Check CI status at: `https://github.com/your-org/openscad-web-customizer-forge/actions`

## Test Fixtures

Test fixtures are located in `tests/fixtures/`:

### Available Fixtures

| File | Description | Parameters |
|------|-------------|------------|
| `sample.scad` | Basic test model | width, height, depth |
| `sample-advanced.scad` | Complex model | Multiple groups, enums, ranges |

### Adding New Fixtures

1. Create `.scad` file in `tests/fixtures/`
2. Include Customizer annotations
3. Keep file size under 10KB
4. Add comprehensive parameter examples

## Best Practices

### Unit Tests

- ✅ Test one thing per test case
- ✅ Use descriptive test names
- ✅ Mock external dependencies
- ✅ Test error conditions
- ✅ Aim for 80%+ coverage on core modules
- ❌ Don't test implementation details
- ❌ Don't make tests dependent on each other

### E2E Tests

- ✅ Test complete user workflows
- ✅ Use data-testid attributes for stable selectors
- ✅ Wait for elements properly (avoid fixed timeouts)
- ✅ Test across multiple browsers
- ✅ Include accessibility checks
- ❌ Don't test every edge case (use unit tests)
- ❌ Don't make tests too long (split into scenarios)

### Accessibility Tests

- ✅ Run axe-core on every major page
- ✅ Test keyboard navigation
- ✅ Verify focus indicators
- ✅ Check ARIA labels
- ✅ Test with screen readers manually
- ❌ Don't rely solely on automated tools

## Troubleshooting

### Common Issues

**Issue**: Tests timeout

```bash
# Increase timeout in vitest.config.js
export default defineConfig({
  test: {
    testTimeout: 30000, // 30 seconds
  }
})
```

**Issue**: E2E tests fail in CI but pass locally

- Check browser versions match
- Verify environment variables are set
- Check for timing issues (use waitFor properly)
- Review CI logs for specific errors

**Issue**: Coverage is lower than expected

- Check if source files are being included
- Verify coverage thresholds in vitest.config.js
- Run coverage locally: `npm run test:coverage`

**Issue**: Playwright can't find browsers

```bash
# Reinstall browsers
npx playwright install
npx playwright install --with-deps
```

## Performance Testing

### Bundle Size

Monitor bundle size to avoid regressions:

```bash
npm run build
du -sh dist/
```

**Target**: Main bundle < 200KB gzipped

### Lighthouse Checks

Run Lighthouse for performance scores:

```bash
# Start dev server
npm run dev

# In another terminal
npm run check-a11y
```

**Targets**:
- Performance: 80+
- Accessibility: 100
- Best Practices: 90+

## Contributing

When adding new features:

1. **Write tests first** (TDD approach preferred)
2. **Aim for 80%+ coverage** on new code
3. **Include E2E tests** for user-facing features
4. **Run full test suite** before submitting PR
5. **Check coverage report** to find gaps

### Pre-commit Checklist

- [ ] All unit tests pass: `npm test`
- [ ] All E2E tests pass: `npm run test:e2e`
- [ ] Coverage meets thresholds: `npm run test:coverage`
- [ ] Linter passes: `npm run lint`
- [ ] Build succeeds: `npm run build`

## Resources

- [Vitest Documentation](https://vitest.dev/)
- [Playwright Documentation](https://playwright.dev/)
- [axe-core Rules](https://github.com/dequelabs/axe-core/blob/develop/doc/rule-descriptions.md)
- [WCAG 2.1 Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)
- [Testing Best Practices](https://testingjavascript.com/)

## Version History

- **v2.4.0** - Added Playwright E2E tests, expanded unit test coverage
- **v2.3.0** - Initial testing infrastructure with Vitest
