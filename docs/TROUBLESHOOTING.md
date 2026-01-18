# Troubleshooting Guide

This document covers common issues and their solutions when developing or testing the OpenSCAD Web Customizer Forge.

## Table of Contents

- [Playwright Terminal Hangs (Windows)](#playwright-terminal-hangs-windows)
- [WASM Loading Issues](#wasm-loading-issues)
- [Build Failures](#build-failures)
- [Test Failures](#test-failures)
- [Performance Issues](#performance-issues)

---

## Playwright Terminal Hangs (Windows)

### Problem

When running Playwright E2E tests on Windows, the terminal may freeze or hang indefinitely, especially when using:
- `npx playwright test`
- `npm run test:e2e:ui`
- `npm run test:e2e:debug`

This is a known issue with Playwright on Windows PowerShell/CMD terminals, particularly with:
- Interactive UI mode (`--ui`)
- Debug mode (`--debug`)
- Video recording
- Long-running tests

### Symptoms

- Terminal becomes unresponsive
- No output or progress updates
- CPU usage may be low (indicating the process is waiting)
- Ctrl+C may not work immediately
- Process continues running in background

### Solutions

#### ✅ Solution 1: Use the Safe Wrapper Script (Recommended)

We've created a failsafe wrapper that automatically prevents most hangs:

```bash
# Use these commands - they include automatic protection:
npm run test:e2e           # Safe headless testing
npm run test:e2e:headed    # Safe headed mode
npm run test:e2e:ui        # Safe UI mode (still may hang)
npm run test:e2e:debug     # Safe debug mode (still may hang)
```

The wrapper (`scripts/run-e2e-safe.js`) provides:
- Automatic 2-minute global timeout
- Force-kill process trees after 10 seconds if graceful shutdown fails
- Optional idle-output watchdog (disable/adjust via env vars)
- CI mode forcing (non-interactive)
- Clear error messages
- Ctrl+C handling

#### ✅ Solution 2: Direct Command with Environment Variables

If you need to bypass the wrapper, force CI mode:

```powershell
# PowerShell
$env:CI=1; npx playwright test

# CMD
set CI=1 && npx playwright test
```

#### ✅ Solution 3: Use Git Bash or WSL

Playwright is more stable in Unix-like shells:

```bash
# Git Bash or WSL
CI=1 npx playwright test
```

#### ✅ Solution 4: Emergency Recovery

If your terminal is frozen:

1. **Try Ctrl+C multiple times** (may take 10-30 seconds to respond)
2. **Open Task Manager** (Ctrl+Shift+Esc) and kill:
   - `node.exe` processes
   - `pwsh.exe` if stuck
   - `chromium.exe` or `chrome.exe` test browsers
3. **Open a new terminal** and verify no orphaned processes:
   ```powershell
   # Check for running Playwright/Node processes
   Get-Process | Where-Object {$_.Name -like "*node*" -or $_.Name -like "*chrome*"}
   
   # Kill specific process by ID
   Stop-Process -Id <PID> -Force
   ```
4. **Clear test artifacts** before retrying:
   ```bash
   rm -rf test-results playwright-report
   ```

### Configuration Changes

The following configuration changes help prevent hangs:

**`playwright.config.js`** (already applied):
```javascript
export default defineConfig({
  timeout: 60000,              // Max 60s per test
  globalTimeout: 600000,       // Max 10 minutes total
  
  use: {
    actionTimeout: 10000,      // Max 10s per action
    navigationTimeout: 30000,  // Max 30s per navigation
  },
  
  // Reduce resource usage
  workers: process.env.CI || process.platform === 'win32' ? 1 : undefined,
})
```

### Prevention Tips

1. **Always use `npm run test:e2e`** instead of direct `playwright test`
2. **Avoid `--ui` and `--debug` modes** unless necessary
3. **Close other applications** before running tests to reduce resource contention
4. **Run tests in WSL or Git Bash** if available
5. **Keep browser count low** (we only use Chromium by default)
6. **Monitor Task Manager** during first test run

### Reporting Issues

If you encounter a new hang scenario not covered here:

1. Note the exact command that caused the hang
2. Check Task Manager for process details
3. Try the emergency recovery steps
4. Update this document with the new scenario

---

## WASM Loading Issues

### Problem: WASM Files Not Found

**Error**: `Failed to load WASM module` or 404 errors for `.wasm` files

**Solution**:
```bash
# Download WASM files
npm run setup-wasm

# Verify files exist
ls public/wasm/
# Should see: openscad.wasm, openscad.js, openscad.worker.js
```

### Problem: WASM Loading Timeout

**Error**: WASM download times out or takes very long

**Causes**:
- Large WASM files (~15-30MB)
- Slow internet connection
- Vite dev server caching issues

**Solutions**:
1. Check network tab in DevTools for actual download progress
2. Clear browser cache: Ctrl+Shift+Delete
3. Restart Vite dev server: `npm run dev`
4. Check if antivirus is scanning files

---

## Build Failures

### Problem: Vite Build Fails

**Common errors**:
- `Cannot find module`
- `Export not found`
- `Syntax error`

**Solutions**:

1. **Clean and reinstall dependencies**:
   ```bash
   rm -rf node_modules package-lock.json
   npm install
   ```

2. **Clear Vite cache**:
   ```bash
   rm -rf node_modules/.vite
   npm run build
   ```

3. **Check Node version** (requires 18+):
   ```bash
   node --version
   # Should be v18.0.0 or higher
   ```

### Problem: ESLint Errors

**Error**: `Parsing error` or `Unexpected token`

**Solution**:
```bash
# Fix auto-fixable issues
npm run format

# Check remaining issues
npm run lint
```

---

## Test Failures

### Problem: Unit Tests Fail

**Common causes**:
- LocalStorage mocking issues (jsdom)
- Async timing issues
- Module import errors

**Solutions**:

1. **Run single test file** to isolate issue:
   ```bash
   npx vitest run tests/unit/parser.test.js
   ```

2. **Enable verbose output**:
   ```bash
   npx vitest run --reporter=verbose
   ```

3. **Check for timing issues** - add delays if needed:
   ```javascript
   await new Promise(resolve => setTimeout(resolve, 100))
   ```

### Problem: E2E Tests Fail

**Common causes**:
- Dev server not ready
- Timing issues (element not found)
- WASM loading timeout

**Solutions**:

1. **Increase timeouts** in test:
   ```javascript
   test('my test', async ({ page }) => {
     await page.goto('/', { timeout: 60000 })
     await page.waitForSelector('#app', { timeout: 30000 })
   })
   ```

2. **Check if dev server is running**:
   ```bash
   # In separate terminal
   npm run dev
   
   # Then run tests
   npm run test:e2e
   ```

3. **Review test artifacts**:
   ```bash
   # Open HTML report
   npm run test:e2e:report
   
   # Check screenshots/videos
   ls test-results/
   ```

---

## Performance Issues

### Problem: Slow Development Server

**Symptoms**: Vite dev server takes long to start or reload

**Solutions**:

1. **Check file watchers limit** (Linux/WSL):
   ```bash
   echo fs.inotify.max_user_watches=524288 | sudo tee -a /etc/sysctl.conf
   sudo sysctl -p
   ```

2. **Disable browser extensions** that inject code

3. **Reduce open files** in editor

### Problem: Slow Test Execution

**Solution**:
```bash
# Run tests in parallel (unit tests)
npm run test -- --pool=threads --poolOptions.threads.maxThreads=4

# Run single test file
npx vitest run tests/unit/parser.test.js
```

---

## Getting Help

If none of these solutions work:

1. **Check existing issues** in your repository host’s issue tracker
2. **Ask in discussions** (if enabled for the repo)
3. **Provide details**:
   - OS and version (e.g., Windows 11, macOS 14)
   - Node version (`node --version`)
   - Shell (PowerShell, CMD, Git Bash, WSL)
   - Exact command that failed
   - Full error message
   - Steps to reproduce

---

## Quick Reference

### Safe Commands

```bash
# Development
npm run dev              # Start dev server
npm run build           # Production build
npm run preview         # Preview build

# Testing (SAFE - includes failsafes)
npm run test            # Unit tests (watch mode)
npm run test:run        # Unit tests (run once)
npm run test:coverage   # Unit tests with coverage
npm run test:e2e        # E2E tests (SAFE wrapper)
npm run test:all        # All tests

# Debugging (may hang - use Ctrl+C if frozen)
npm run test:e2e:debug  # Debug E2E tests
npm run test:e2e:ui     # Playwright UI

# Emergency (if hung)
Ctrl+C (multiple times)
Task Manager → Kill node.exe processes
```

### File Cleanup

```bash
# Clean test artifacts
rm -rf test-results playwright-report coverage

# Clean build artifacts
rm -rf dist

# Clean dependencies (nuclear option)
rm -rf node_modules package-lock.json
npm install
```
