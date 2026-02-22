#!/usr/bin/env node

/**
 * AI Bloat Scanner
 *
 * Detects AI-specific code and documentation anti-patterns.
 * Based on the 10 code-bloat patterns and 6 doc-bloat patterns
 * defined in checklists/ai-code-bloat-scan.md and ai-doc-bloat-scan.md.
 *
 * Usage:
 *   node scripts/bloat-scanner.js [path...]
 *   node scripts/bloat-scanner.js src/
 *   node scripts/bloat-scanner.js src/js/parser.js src/js/ui.js
 *
 * Exit codes:
 *   0 — no blocking issues found
 *   1 — blocking issues found
 *
 * License: MIT
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname, resolve } from "node:path";

const CODE_EXTENSIONS = new Set([
  ".js",
  ".ts",
  ".jsx",
  ".tsx",
  ".mjs",
  ".cjs",
  ".py",
  ".rs",
  ".go",
  ".java",
]);
const DOC_EXTENSIONS = new Set([".md", ".mdx", ".txt", ".rst"]);

const NARRATING_COMMENT_PATTERNS = [
  /\/\/\s*(Get|Set|Create|Initialize|Return|Handle|Update|Check|Import|Define|Declare|Increment|Decrement|Loop|Iterate|Call|Assign|Add|Remove|Delete|Fetch|Send|Receive|Parse|Convert|Transform|Validate|Verify)\s+/,
  /#\s*(Get|Set|Create|Initialize|Return|Handle|Update|Check|Import|Define|Declare|Increment|Decrement|Loop|Iterate|Call|Assign|Add|Remove|Delete|Fetch|Send|Receive|Parse|Convert|Transform|Validate|Verify)\s+/,
];

const CORPORATE_WORDS_IN_CODE =
  /\b(ensure|utilize|leverage|facilitate|streamline|comprehensive|robust|seamless|harness|empower)\b/i;

const EMOJI_IN_CODE = /[\u{1F300}-\u{1F9FF}]/u;

const ZOMBIE_CATCH_PATTERNS = [
  /catch\s*\([^)]*\)\s*\{\s*\}/,
  /catch\s*\([^)]*\)\s*\{\s*console\.(log|error)\s*\(\s*["'`][^"'`]*["'`]\s*\)\s*;?\s*\}/,
];

const DOC_CORPORATE_WORDS =
  /\b(leverage|utilize|ensure|facilitate|streamline|comprehensive|robust|seamless|harness|empower)\b/i;

const DOC_DISCLAIMERS = [
  /please note that/i,
  /it is important to understand/i,
  /it should be noted/i,
  /keep in mind that/i,
  /it's worth mentioning/i,
  /it is worth noting/i,
];

const DOC_STALE_METRICS = /\b\d{3,}\s*(tests?|lines?|modules?|files?|functions?)\b/i;

const Severity = {
  BLOCKING: "BLOCKING",
  WARNING: "WARNING",
  INFO: "INFO",
};

function collectFiles(paths) {
  const files = [];

  for (const p of paths) {
    const resolved = resolve(p);
    let stat;
    try {
      stat = statSync(resolved);
    } catch {
      console.error(`Skipping: ${p} (not found)`);
      continue;
    }

    if (stat.isFile()) {
      files.push(resolved);
    } else if (stat.isDirectory()) {
      walkDir(resolved, files);
    }
  }

  return files;
}

function walkDir(dir, files) {
  const skipDirs = new Set([
    "node_modules",
    ".git",
    "dist",
    "build",
    ".next",
    "coverage",
    "__pycache__",
    "target",
  ]);

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") && entry.isDirectory()) continue;
    if (skipDirs.has(entry.name)) continue;

    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      walkDir(full, files);
    } else if (entry.isFile()) {
      files.push(full);
    }
  }
}

function scanCodeFile(filepath, content) {
  const findings = [];
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    for (const pattern of NARRATING_COMMENT_PATTERNS) {
      if (pattern.test(line)) {
        findings.push({
          file: filepath,
          line: lineNum,
          pattern: "Narrating comment",
          severity: Severity.BLOCKING,
          text: line.trim(),
        });
        break;
      }
    }

    if (
      (line.includes("//") || line.includes("#")) &&
      CORPORATE_WORDS_IN_CODE.test(line)
    ) {
      findings.push({
        file: filepath,
        line: lineNum,
        pattern: "Corporate vocabulary in code comment",
        severity: Severity.WARNING,
        text: line.trim(),
      });
    }

    if (
      (line.includes("//") || line.includes("#")) &&
      EMOJI_IN_CODE.test(line)
    ) {
      findings.push({
        file: filepath,
        line: lineNum,
        pattern: "Emoji in code comment",
        severity: Severity.WARNING,
        text: line.trim(),
      });
    }

    for (const pattern of ZOMBIE_CATCH_PATTERNS) {
      const context = lines.slice(Math.max(0, i - 1), i + 3).join("\n");
      if (pattern.test(context) && i === Math.max(0, i)) {
        findings.push({
          file: filepath,
          line: lineNum,
          pattern: "Zombie error handling",
          severity: Severity.WARNING,
          text: line.trim(),
        });
        break;
      }
    }
  }

  return findings;
}

function scanDocFile(filepath, content) {
  const findings = [];
  const lines = content.split("\n");

  let headingDepth = 0;
  let paragraphsUnderHeading = 0;
  let deepHeadingLine = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    const headingMatch = line.match(/^(#{1,6})\s/);
    if (headingMatch) {
      const depth = headingMatch[1].length;

      if (headingDepth >= 4 && paragraphsUnderHeading < 3) {
        findings.push({
          file: filepath,
          line: deepHeadingLine,
          pattern: "Heading proliferation",
          severity: Severity.WARNING,
          text: `H${headingDepth} heading with only ${paragraphsUnderHeading} paragraph(s) beneath`,
        });
      }

      headingDepth = depth;
      paragraphsUnderHeading = 0;
      deepHeadingLine = lineNum;
    } else if (line.trim().length > 0 && !line.startsWith("|") && !line.startsWith("-") && !line.startsWith("```")) {
      paragraphsUnderHeading++;
    }

    if (DOC_CORPORATE_WORDS.test(line)) {
      const match = line.match(DOC_CORPORATE_WORDS);
      findings.push({
        file: filepath,
        line: lineNum,
        pattern: "Corporate vocabulary",
        severity: Severity.WARNING,
        text: `Found "${match[0]}": ${line.trim().substring(0, 80)}`,
      });
    }

    for (const pattern of DOC_DISCLAIMERS) {
      if (pattern.test(line)) {
        findings.push({
          file: filepath,
          line: lineNum,
          pattern: "Excessive disclaimer",
          severity: Severity.WARNING,
          text: line.trim().substring(0, 80),
        });
        break;
      }
    }

    if (DOC_STALE_METRICS.test(line)) {
      findings.push({
        file: filepath,
        line: lineNum,
        pattern: "Stale metric (hardcoded count)",
        severity: Severity.INFO,
        text: line.trim().substring(0, 80),
      });
    }
  }

  return findings;
}

function formatFindings(findings) {
  if (findings.length === 0) {
    console.log("\n  No AI bloat patterns detected.\n");
    return;
  }

  const grouped = {};
  for (const f of findings) {
    if (!grouped[f.severity]) grouped[f.severity] = [];
    grouped[f.severity].push(f);
  }

  for (const severity of [Severity.BLOCKING, Severity.WARNING, Severity.INFO]) {
    const items = grouped[severity];
    if (!items || items.length === 0) continue;

    console.log(`\n  ${severity} (${items.length}):`);
    for (const f of items) {
      console.log(`    ${f.file}:${f.line} — ${f.pattern}`);
      console.log(`      ${f.text}`);
    }
  }
}

function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log("Usage: node scripts/bloat-scanner.js [path...]");
    console.log("  Scans files for AI-specific code and documentation bloat patterns.");
    console.log("");
    console.log("Examples:");
    console.log("  node scripts/bloat-scanner.js src/");
    console.log("  node scripts/bloat-scanner.js src/js/parser.js docs/");
    process.exit(0);
  }

  const files = collectFiles(args);
  console.log(`Scanning ${files.length} file(s)...\n`);

  let allFindings = [];

  for (const filepath of files) {
    const ext = extname(filepath).toLowerCase();
    let content;
    try {
      content = readFileSync(filepath, "utf-8");
    } catch {
      continue;
    }

    if (CODE_EXTENSIONS.has(ext)) {
      allFindings = allFindings.concat(scanCodeFile(filepath, content));
    } else if (DOC_EXTENSIONS.has(ext)) {
      allFindings = allFindings.concat(scanDocFile(filepath, content));
    }
  }

  const blocking = allFindings.filter((f) => f.severity === Severity.BLOCKING);
  const warnings = allFindings.filter((f) => f.severity === Severity.WARNING);
  const infos = allFindings.filter((f) => f.severity === Severity.INFO);

  console.log("AI Bloat Scan Results");
  console.log("=====================");
  console.log(`  Files scanned: ${files.length}`);
  console.log(`  Blocking:      ${blocking.length}`);
  console.log(`  Warning:       ${warnings.length}`);
  console.log(`  Info:          ${infos.length}`);

  formatFindings(allFindings);

  if (blocking.length > 0) {
    console.log(
      `\nFAILED: ${blocking.length} blocking issue(s) found. Fix before committing.\n`
    );
    process.exit(1);
  }

  if (warnings.length > 0) {
    console.log(
      `\nPASSED with ${warnings.length} warning(s). Review before merging.\n`
    );
  } else {
    console.log("\nPASSED: No AI bloat patterns detected.\n");
  }

  process.exit(0);
}

main();
