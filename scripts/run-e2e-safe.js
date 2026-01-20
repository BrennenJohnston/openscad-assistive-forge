#!/usr/bin/env node

/**
 * Safe Playwright Test Runner
 * 
 * This script wraps Playwright test execution to prevent terminal hangs/stalls
 * that commonly occur on Windows systems. It includes:
 * - Automatic timeout enforcement
 * - Non-interactive mode forcing
 * - Process cleanup on hang
 * - Clear error reporting
 */

import { spawn } from 'child_process'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const rootDir = join(__dirname, '..')

const isWindows = process.platform === 'win32'

const getEnvNumber = (name, fallback) => {
  const raw = process.env[name]
  if (raw === undefined) return fallback
  const value = Number(raw)
  return Number.isFinite(value) && value >= 0 ? value : fallback
}

// Configuration
const CONFIG = {
  // Maximum time to wait for tests (5 minutes for CI, 2 minutes local)
  GLOBAL_TIMEOUT: getEnvNumber('PW_FAILSAFE_TIMEOUT', process.env.CI ? 300000 : 120000),
  // Kill if no output for this long (0 disables)
  IDLE_TIMEOUT: getEnvNumber('PW_FAILSAFE_IDLE_TIMEOUT', 0),
  // Time to wait before force-killing hung process (10 seconds)
  KILL_TIMEOUT: getEnvNumber('PW_FAILSAFE_KILL_TIMEOUT', 10000),
  // How often to check for stalls
  WATCHDOG_INTERVAL: getEnvNumber('PW_FAILSAFE_WATCHDOG_INTERVAL', 5000),
  // Environment variables to prevent interactive mode
  ENV_OVERRIDES: {
    CI: '1',                          // Force CI mode (non-interactive)
    PWTEST_SKIP_TEST_OUTPUT: '1',    // Reduce output verbosity
    NO_COLOR: '1',                    // Disable color codes that can cause hangs
    PW_REUSE_SERVER: '1',            // Allow reusing existing dev server
  }
}

// Parse command line arguments
const args = process.argv.slice(2)
const isDebug = args.includes('--debug')
const isHeaded = args.includes('--headed')
const isUI = args.includes('--ui')
const enforceTimeouts = !isDebug && !isUI

// Show warning for potentially problematic modes
if (isDebug || isUI) {
  console.warn('\n⚠️  WARNING: Running in interactive mode (--debug or --ui)')
  console.warn('   This may cause terminal hangs on Windows.')
  console.warn('   If the terminal freezes, press Ctrl+C to abort.\n')
}

console.log('🛡️  Starting Playwright with failsafe protection...\n')

// Prepare environment
const env = {
  ...process.env,
  ...CONFIG.ENV_OVERRIDES
}

// Don't force CI mode for interactive commands
if (isDebug || isUI || isHeaded) {
  delete env.CI
  delete env.PWTEST_SKIP_TEST_OUTPUT
}

const quoteForCmd = (value) => {
  if (typeof value !== 'string') return ''
  if (/[\s"]/u.test(value)) {
    return `"${value.replace(/"/g, '\\"')}"`
  }
  return value
}

// Spawn Playwright process
const playwrightArgs = ['playwright', 'test', ...args]
let child

if (isWindows) {
  const cmdLine = ['npx', ...playwrightArgs].map(quoteForCmd).join(' ')
  child = spawn('cmd.exe', ['/d', '/s', '/c', cmdLine], {
    cwd: rootDir,
    env,
    stdio: ['inherit', 'pipe', 'pipe'],
    shell: false,
    detached: false,
    windowsHide: true
  })
} else {
  child = spawn('npx', playwrightArgs, {
    cwd: rootDir,
    env,
    stdio: ['inherit', 'pipe', 'pipe'],
    shell: false,
    detached: true,
    windowsHide: true
  })
}

let isCleaningUp = false
let timeoutHandle = null
let killTimeoutHandle = null
let idleWatchdogHandle = null
let lastOutputAt = Date.now()

const bumpOutputTimer = () => {
  lastOutputAt = Date.now()
}

if (child.stdout) {
  child.stdout.on('data', (chunk) => {
    bumpOutputTimer()
    process.stdout.write(chunk)
  })
}

if (child.stderr) {
  child.stderr.on('data', (chunk) => {
    bumpOutputTimer()
    process.stderr.write(chunk)
  })
}

// Set up timeout handler
if (enforceTimeouts && CONFIG.GLOBAL_TIMEOUT > 0) {
  timeoutHandle = setTimeout(() => {
    if (isCleaningUp) return
    
    console.error('\n\n❌ ERROR: Test execution exceeded timeout limit')
    console.error(`   Tests did not complete within ${CONFIG.GLOBAL_TIMEOUT / 1000}s`)
    console.error('   This usually indicates a terminal hang or stuck test.')
    console.error('\n   Attempting graceful shutdown...\n')
    
    cleanup('timeout')
  }, CONFIG.GLOBAL_TIMEOUT)
}

if (enforceTimeouts && CONFIG.IDLE_TIMEOUT > 0) {
  idleWatchdogHandle = setInterval(() => {
    if (isCleaningUp) return

    const idleFor = Date.now() - lastOutputAt
    if (idleFor < CONFIG.IDLE_TIMEOUT) return

    console.error('\n\n❌ ERROR: No Playwright output detected')
    console.error(`   No output for ${Math.round(idleFor / 1000)}s (idle limit: ${Math.round(CONFIG.IDLE_TIMEOUT / 1000)}s)`)
    console.error('   This usually indicates a stuck test runner or terminal hang.')
    console.error('\n   Attempting graceful shutdown...\n')

    cleanup('idle')
  }, CONFIG.WATCHDOG_INTERVAL)
}

// Handle successful completion
child.on('exit', (code, signal) => {
  if (isCleaningUp) return
  
  clearTimeout(timeoutHandle)
  clearTimeout(killTimeoutHandle)
  clearInterval(idleWatchdogHandle)
  
  if (code === 0) {
    console.log('\n✅ Tests completed successfully\n')
  } else if (signal) {
    console.error(`\n⚠️  Tests terminated by signal: ${signal}\n`)
  } else {
    console.error(`\n❌ Tests failed with exit code: ${code}\n`)
  }
  
  process.exit(code || 0)
})

// Handle errors
child.on('error', (error) => {
  if (isCleaningUp) return
  
  console.error('\n❌ ERROR: Failed to start Playwright')
  console.error(`   ${error.message}\n`)
  
  if (error.message.includes('ENOENT')) {
    console.error('   Make sure Playwright is installed:')
    console.error('   npm install --save-dev @playwright/test')
    console.error('   npx playwright install\n')
  }
  
  cleanup('error')
})

// Handle Ctrl+C
process.on('SIGINT', () => {
  console.log('\n\n⚠️  Received interrupt signal (Ctrl+C)')
  cleanup('interrupt')
})

process.on('SIGTERM', () => {
  console.log('\n\n⚠️  Received termination signal')
  cleanup('terminate')
})

process.on('uncaughtException', (error) => {
  console.error('\n❌ Uncaught exception:', error)
  cleanup('crash')
})

process.on('unhandledRejection', (reason) => {
  console.error('\n❌ Unhandled promise rejection:', reason)
  cleanup('crash')
})

// Cleanup function
function cleanup(reason) {
  if (isCleaningUp) return
  isCleaningUp = true
  
  clearTimeout(timeoutHandle)
  clearInterval(idleWatchdogHandle)
  
  console.log('   Stopping test process...')
  
  // Try graceful shutdown first
  requestShutdown()
  
  // Force kill after timeout
  killTimeoutHandle = setTimeout(() => {
    console.log('   Graceful shutdown failed, forcing termination...')
    forceKillProcessTree()
    
    const exitCode = reason === 'timeout' ? 124 : 1
    process.exit(exitCode)
  }, CONFIG.KILL_TIMEOUT)
}

function requestShutdown() {
  if (!child?.pid) return

  try {
    child.kill('SIGTERM')
  } catch (err) {
    console.error('   Failed to send SIGTERM:', err.message)
  }

  if (!isWindows) {
    try {
      process.kill(-child.pid, 'SIGTERM')
    } catch (err) {
      if (err.code !== 'ESRCH') {
        console.error('   Failed to signal process group:', err.message)
      }
    }
  }
}

function forceKillProcessTree() {
  if (!child?.pid) return

  if (isWindows) {
    try {
      spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
        stdio: 'ignore',
        windowsHide: true,
        shell: false
      })
    } catch (err) {
      console.error('   Failed to force kill process tree:', err.message)
    }
    return
  }

  try {
    process.kill(-child.pid, 'SIGKILL')
  } catch (err) {
    if (err.code !== 'ESRCH') {
      console.error('   Failed to SIGKILL process group:', err.message)
    }
  }

  try {
    child.kill('SIGKILL')
  } catch (err) {
    console.error('   Failed to force kill:', err.message)
  }
}

// Show helpful tips
console.log('💡 Tips:')
console.log('   - Tests running too long? Adjust timeouts via env or script')
console.log('   - Need to debug? Use: npm run test:e2e:debug (may hang - Ctrl+C to abort)')
console.log('   - Interactive UI? Use: npm run test:e2e:ui (may hang - Ctrl+C to abort)')
console.log('   - This script automatically prevents most hangs in headless mode')
console.log('')
