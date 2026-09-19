#!/usr/bin/env node

/**
 * CSS Variable Audit (DEBT-18)
 *
 * Parses src/styles/semantic-tokens.css for all --color-* and --focus-*
 * custom property definitions, then verifies that each one is overridden in
 * the :root[data-ui-variant='mono'] block of src/styles/variant.css.
 *
 * Purpose: Guard against new semantic tokens being added to the design system
 * without a corresponding override in the mono variant, which would cause
 * Radix color bleed-through in the terminal aesthetic.
 *
 * Usage:
 *   node scripts/css-variable-audit.js
 *   npm run css-variable-audit
 *   pixi run css-variable-audit
 *
 * Exit codes:
 *   0 — all tokens are accounted for (or intentionally exempted)
 *   1 — one or more unexpected tokens are missing from the mono block
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// ---------------------------------------------------------------------------
// Files under audit
// ---------------------------------------------------------------------------

const SEMANTIC_TOKENS_PATH = resolve(ROOT, 'src/styles/semantic-tokens.css');
const VARIANT_CSS_PATH = resolve(ROOT, 'src/styles/variant.css');

// The exact selector that begins the base mono block (green phosphor / dark default).
// NOTE: do NOT include combined selectors like [data-theme='light'] here.
const MONO_SELECTOR = ":root[data-ui-variant='mono'] {";

// ---------------------------------------------------------------------------
// Intentionally-missing tokens
//
// These tokens exist in semantic-tokens.css but are NOT overridden in the mono
// block because they are brand color references used for documentation/reference
// only — they are never directly referenced as foreground or background values
// in component CSS.  Audit failures for these tokens would be false positives.
// ---------------------------------------------------------------------------

const INTENTIONALLY_MISSING = new Set([
  '--color-brand-yellow',
  '--color-brand-green',
  '--color-brand-black',
]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract all unique custom property *definitions* matching `--color-*` or
 * `--focus-*` from a CSS string.  Only captures the left-hand side of
 * declarations (`--foo-bar: value;`) to distinguish definitions from usages
 * inside `var(--foo-bar)`.
 *
 * @param {string} css
 * @returns {Set<string>}
 */
function extractDefinedTokens(css) {
  const regex = /(--(?:color|focus)-[\w-]+)\s*:/g;
  const tokens = new Set();
  let match;
  while ((match = regex.exec(css)) !== null) {
    tokens.add(match[1]);
  }
  return tokens;
}

/**
 * Extract the content of the first CSS block matching `selector` using
 * brace-depth counting.  Returns the text between `{` and the matching `}`.
 *
 * @param {string} css
 * @param {string} selector  Exact string to search for (including trailing ` {`)
 * @returns {string}  Block content (without surrounding braces), or '' if not found
 */
function extractBlock(css, selector) {
  const idx = css.indexOf(selector);
  if (idx === -1) {
    return '';
  }

  const openIdx = css.indexOf('{', idx);
  if (openIdx === -1) {
    return '';
  }

  let depth = 0;
  let i = openIdx;
  for (; i < css.length; i++) {
    if (css[i] === '{') {
      depth++;
    } else if (css[i] === '}') {
      depth--;
      if (depth === 0) {
        break;
      }
    }
  }

  return css.slice(openIdx + 1, i);
}

// ---------------------------------------------------------------------------
// Main audit
// ---------------------------------------------------------------------------

function runAudit() {
  let semanticCss;
  let variantCss;

  try {
    semanticCss = readFileSync(SEMANTIC_TOKENS_PATH, 'utf-8');
  } catch (err) {
    console.error(`[css-variable-audit] ERROR: Cannot read ${SEMANTIC_TOKENS_PATH}`);
    console.error(err.message);
    process.exit(1);
  }

  try {
    variantCss = readFileSync(VARIANT_CSS_PATH, 'utf-8');
  } catch (err) {
    console.error(`[css-variable-audit] ERROR: Cannot read ${VARIANT_CSS_PATH}`);
    console.error(err.message);
    process.exit(1);
  }

  // 1. Collect all --color-* / --focus-* tokens defined anywhere in semantic-tokens.css
  const semanticTokens = extractDefinedTokens(semanticCss);

  if (semanticTokens.size === 0) {
    console.error('[css-variable-audit] ERROR: No --color-* or --focus-* tokens found in semantic-tokens.css.');
    console.error('  Possible cause: incorrect file path or empty file.');
    process.exit(1);
  }

  // 2. Extract only the base mono block from variant.css
  const monoBlock = extractBlock(variantCss, MONO_SELECTOR);

  if (!monoBlock) {
    console.error(
      `[css-variable-audit] ERROR: Could not find selector "${MONO_SELECTOR}" in variant.css`
    );
    process.exit(1);
  }

  // 3. Collect tokens defined within the mono block
  const monoTokens = extractDefinedTokens(monoBlock);

  // 4. Find tokens in semantic-tokens.css that are absent from the mono block
  const missing = [];
  for (const token of semanticTokens) {
    if (!monoTokens.has(token) && !INTENTIONALLY_MISSING.has(token)) {
      missing.push(token);
    }
  }

  // 5. Report
  console.log('[css-variable-audit] Audit: semantic-tokens.css vs variant.css mono block');
  console.log(`  Tokens in semantic-tokens.css : ${semanticTokens.size}`);
  console.log(`  Tokens in mono block          : ${monoTokens.size}`);
  console.log(`  Intentionally missing (exempt): ${INTENTIONALLY_MISSING.size}`);
  console.log('');

  if (missing.length === 0) {
    console.log('  ✓ All tokens are overridden in the mono block (or intentionally exempted).');
    process.exit(0);
  }

  console.error(`  ✗ ${missing.length} token(s) are missing from the mono block:\n`);
  for (const token of missing.sort()) {
    console.error(`      ${token}`);
  }
  console.error('');
  console.error(
    '  Action required: add the missing token(s) to the :root[data-ui-variant=\'mono\'] block'
  );
  console.error(
    "  in src/styles/variant.css, or add them to INTENTIONALLY_MISSING in this script"
  );
  console.error('  if they are brand-reference tokens not used in component rendering.');
  process.exit(1);
}

runAudit();
