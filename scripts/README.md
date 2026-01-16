# Scripts Directory

This directory contains utility scripts for development and testing.

## Available Scripts

### `download-wasm.js`

Downloads OpenSCAD WASM binaries from the official repository.

**Usage**:
```bash
npm run setup-wasm
```

**What it does**:
- Downloads `openscad.wasm`, `openscad.js`, and `openscad.worker.js`
- Places files in `public/wasm/`
- Verifies download integrity
- ~15-30MB download

### `setup-libraries.js`

Sets up OpenSCAD libraries (MCAD, BOSL2, etc.) for use in the web app.

**Usage**:
```bash
npm run setup-libraries
```

**What it does**:
- Downloads library bundles
- Extracts to `public/libraries/`
- Creates library manifests
- Sets up file mappings

### `run-e2e-safe.js` ⭐

**Safe wrapper for Playwright E2E tests that prevents terminal hangs.**

This is the most important script for Windows users experiencing terminal freezes with Playwright.

**Usage**:
```bash
# Recommended - use npm scripts
npm run test:e2e           # Headless tests (safe)
npm run test:e2e:headed    # Headed tests (safe)
npm run test:e2e:ui        # UI mode (safer, may still hang)
npm run test:e2e:debug     # Debug mode (safer, may still hang)

# Direct usage
node scripts/run-e2e-safe.js [playwright-args]
```

**Features**:
- ✅ **Automatic timeout enforcement** (2 minutes by default)
- ✅ **Force-kill hung process trees** (after 10 second grace period)
- ✅ **Optional idle-output watchdog** (detects stuck runners)
- ✅ **CI mode forcing** (prevents interactive prompts)
- ✅ **Non-shell spawn** (avoids terminal lock-ups on Windows)
- ✅ **Ctrl+C handling** (graceful shutdown)
- ✅ **Clear error messages** (explains what went wrong)
- ✅ **Environment variable overrides** (NO_COLOR, CI flags)

**Why this exists**:

Playwright has known issues on Windows PowerShell/CMD that cause terminal hangs:
- Interactive UI mode can freeze the terminal
- Debug mode may not respond to interrupts
- Long-running tests can cause stdio buffer issues
- Process cleanup may fail leaving orphaned browsers

This wrapper implements multiple layers of protection:

1. **Environment sanitization**: Forces non-interactive mode
2. **Timeout guards**: Kills tests that run too long
3. **Signal handling**: Properly responds to Ctrl+C
4. **Process cleanup**: Ensures child processes are killed
5. **Clear feedback**: Shows progress and issues

**Configuration**:

Edit the `CONFIG` object in the script to adjust:

```javascript
const CONFIG = {
  GLOBAL_TIMEOUT: 120000,    // Max total runtime (ms)
  IDLE_TIMEOUT: 0,           // Kill if no output (0 disables)
  KILL_TIMEOUT: 10000,       // Grace period before force kill (ms)
  WATCHDOG_INTERVAL: 5000,   // Idle check interval (ms)
  ENV_OVERRIDES: {           // Environment variables
    CI: '1',
    NO_COLOR: '1',
    // ... etc
  }
}
```

You can also override timeouts with environment variables:

```bash
# Override runtime limits (milliseconds)
PW_FAILSAFE_TIMEOUT=300000 node scripts/run-e2e-safe.js
PW_FAILSAFE_IDLE_TIMEOUT=90000 node scripts/run-e2e-safe.js
PW_FAILSAFE_KILL_TIMEOUT=15000 node scripts/run-e2e-safe.js
PW_FAILSAFE_WATCHDOG_INTERVAL=3000 node scripts/run-e2e-safe.js
```

**Exit codes**:
- `0`: Tests passed
- `1`: Tests failed or error occurred
- `124`: Timeout exceeded (tests took too long)

**When NOT to use**:

This wrapper is **automatically used** by npm scripts. You only need to bypass it if:
- You're debugging wrapper behavior itself
- You need raw Playwright output
- You're on Linux/macOS where hangs are rare

To bypass:
```bash
npm run test:e2e:direct  # Runs: playwright test (no wrapper)
```

**Troubleshooting**:

If tests still hang:
1. Check Task Manager for orphaned node.exe/chrome.exe processes
2. Kill all related processes manually
3. Clear test artifacts: `rm -rf test-results playwright-report`
4. Try running in Git Bash or WSL instead of PowerShell
5. See `docs/TROUBLESHOOTING.md` for detailed recovery steps

---

## Adding New Scripts

When adding new scripts to this directory:

1. **Use ES modules** (`.js` with `"type": "module"` in package.json)
2. **Add shebang**: `#!/usr/bin/env node` at top of file
3. **Make executable** (Linux/Mac): `chmod +x scripts/your-script.js`
4. **Add npm script** in `package.json`:
   ```json
   {
     "scripts": {
       "your-command": "node scripts/your-script.js"
     }
   }
   ```
5. **Document in this README**
6. **Add error handling** and clear error messages
7. **Use `chalk`** for colored output (already installed)
8. **Test on Windows AND Unix** systems if cross-platform

## Script Best Practices

### Error Handling

```javascript
import { spawn } from 'child_process'

const child = spawn('some-command', args)

child.on('error', (error) => {
  console.error(`Failed to start: ${error.message}`)
  process.exit(1)
})

child.on('exit', (code) => {
  if (code !== 0) {
    console.error(`Command failed with exit code: ${code}`)
    process.exit(code)
  }
})
```

### Timeout Enforcement

```javascript
const timeout = setTimeout(() => {
  console.error('Command timed out')
  child.kill('SIGTERM')
  
  setTimeout(() => child.kill('SIGKILL'), 5000)
}, 60000)

child.on('exit', () => clearTimeout(timeout))
```

### User Feedback

```javascript
import chalk from 'chalk'

console.log(chalk.blue('ℹ️  Starting process...'))
console.log(chalk.green('✅ Success!'))
console.error(chalk.red('❌ Error occurred'))
console.warn(chalk.yellow('⚠️  Warning'))
```

### Cross-Platform Paths

```javascript
import { join } from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const rootDir = join(__dirname, '..')  // Project root

// Good: Uses path.join (works on Windows and Unix)
const filePath = join(rootDir, 'public', 'wasm', 'openscad.wasm')

// Bad: Hard-coded slashes (breaks on Windows)
const badPath = rootDir + '/public/wasm/openscad.wasm'
```

## Debugging Scripts

### Enable verbose output:

```bash
# Show all spawned commands
NODE_DEBUG=child_process node scripts/your-script.js

# Show all environment variables
node -p process.env
```

### Test in different shells:

```bash
# PowerShell (Windows)
node scripts/your-script.js

# CMD (Windows)
node scripts\your-script.js

# Git Bash (Windows)
node scripts/your-script.js

# WSL/Linux/Mac
node scripts/your-script.js
```

---

## Related Documentation

- [TROUBLESHOOTING.md](../docs/TROUBLESHOOTING.md) - Common issues and solutions
- [BUILD_PLAN_NEW.md](../docs/BUILD_PLAN_NEW.md) - Complete build and test plan
- [TESTING.md](../docs/TESTING.md) - Testing strategy and guidelines
