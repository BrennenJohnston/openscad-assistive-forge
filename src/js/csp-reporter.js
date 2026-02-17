/**
 * CSP Violation Reporter
 *
 * Listens for Content Security Policy violations and logs them
 * for debugging during the report-only phase.
 *
 * @license GPL-3.0-or-later
 */

import { isEnabled } from './feature-flags.js';

/**
 * Violation log entry
 * @typedef {Object} CSPViolation
 * @property {string} directive - The violated directive
 * @property {string} blockedURI - The blocked resource URI
 * @property {string} sourceFile - Source file where violation occurred
 * @property {number} lineNumber - Line number in source file
 * @property {number} columnNumber - Column number in source file
 * @property {string} originalPolicy - The original policy string
 * @property {number} timestamp - When the violation occurred
 */

// In-memory violation log (for debugging)
const violationLog = [];
const MAX_LOG_SIZE = 100;

/**
 * Handle a CSP violation event
 * @param {SecurityPolicyViolationEvent} event - The violation event
 */
function handleViolation(event) {
  const violation = {
    directive: event.violatedDirective,
    blockedURI: event.blockedURI,
    sourceFile: event.sourceFile,
    lineNumber: event.lineNumber,
    columnNumber: event.columnNumber,
    originalPolicy: event.originalPolicy,
    timestamp: Date.now(),
  };

  // Add to log
  violationLog.push(violation);
  if (violationLog.length > MAX_LOG_SIZE) {
    violationLog.shift();
  }

  // Log to console with clear formatting
  console.group('🔒 CSP Violation Detected');
  console.warn('Directive:', violation.directive);
  console.warn('Blocked URI:', violation.blockedURI);
  if (violation.sourceFile) {
    console.warn(
      'Source:',
      `${violation.sourceFile}:${violation.lineNumber}:${violation.columnNumber}`
    );
  }
  console.groupEnd();

  // Dispatch custom event for monitoring
  document.dispatchEvent(
    new CustomEvent('csp-violation', {
      detail: violation,
    })
  );
}

/**
 * Initialize CSP violation monitoring
 * Only activates if the csp_reporting feature flag is enabled
 */
export function initCSPReporter() {
  if (!isEnabled('csp_reporting')) {
    console.log('[CSP] Reporting disabled via feature flag');
    return;
  }

  // Add violation listener
  document.addEventListener('securitypolicyviolation', handleViolation);

  console.log('[CSP] Violation reporter initialized (report-only mode)');
}

/**
 * Get all logged violations
 * @returns {CSPViolation[]} Array of violations
 */
export function getViolations() {
  return [...violationLog];
}

/**
 * Get violation count by directive
 * @returns {Object} Map of directive -> count
 */
export function getViolationStats() {
  const stats = {};
  for (const v of violationLog) {
    stats[v.directive] = (stats[v.directive] || 0) + 1;
  }
  return stats;
}

/**
 * Clear violation log
 */
export function clearViolations() {
  violationLog.length = 0;
}

/**
 * Check if any violations have occurred
 * @returns {boolean}
 */
export function hasViolations() {
  return violationLog.length > 0;
}

/**
 * Log summary of violations to console
 */
export function logViolationSummary() {
  if (violationLog.length === 0) {
    console.log('[CSP] No violations recorded');
    return;
  }

  console.group(`[CSP] Violation Summary (${violationLog.length} total)`);
  const stats = getViolationStats();
  for (const [directive, count] of Object.entries(stats)) {
    console.log(`  ${directive}: ${count}`);
  }
  console.groupEnd();
}

// Export for testing
export const _internal = {
  violationLog,
  handleViolation,
  MAX_LOG_SIZE,
};
