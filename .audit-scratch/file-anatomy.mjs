#!/usr/bin/env node
// Read-only scanner that extracts top-level structure from a JS file:
//   - section banners (multi-line block comments at column 0)
//   - top-level function / const / let / var / class declarations
//   - top-level export names
//   - module-level state assignments (let foo = ...)
// Output: a markdown anatomy table per file under .audit-scratch/anatomy/<basename>.md
//
// Usage:  node .audit-scratch/file-anatomy.mjs <path-to-js> [<path-to-js> ...]

import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { basename } from "node:path";

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("usage: file-anatomy.mjs <file1.js> [file2.js ...]");
  process.exit(1);
}

mkdirSync(".audit-scratch/anatomy", { recursive: true });

for (const path of args) {
  const lines = readFileSync(path, "utf-8").split(/\r?\n/);
  const sections = [];
  const decls = [];
  const exports = [];
  const stateAssignments = [];
  const eventListeners = [];

  // Find banner-style comments: /** ... */ at column 0 with at least one === or --- inside
  let inBlockComment = false;
  let blockStart = 0;
  let blockBuf = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!inBlockComment) {
      if (/^\/\*\*?/.test(line)) {
        inBlockComment = true;
        blockStart = i + 1;
        blockBuf = [line];
      }
    } else {
      blockBuf.push(line);
      if (/\*\//.test(line)) {
        inBlockComment = false;
        const blob = blockBuf.join("\n");
        // section banner = line/star comment with === / --- / ###
        if (
          /={3,}|-{3,}|#{2,}|SECTION/i.test(blob) ||
          /^\/\*+\s*\n[\s\S]+?\n\s*\*+\//.test(blob) // multi-line block
        ) {
          // Treat as a section marker only when explicit divider present
          if (/={3,}|-{3,}|SECTION/i.test(blob)) {
            sections.push({ line: blockStart, text: blob.slice(0, 200).replace(/\s+/g, " ") });
          }
        }
        blockBuf = [];
      }
    }
  }

  // Top-level declarations: regex-based, only catch lines that start at column 0 (no indentation).
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    if (/^export\s+(?:async\s+)?function\s+(\w+)/.test(ln)) {
      const m = ln.match(/^export\s+(?:async\s+)?function\s+(\w+)/);
      decls.push({ line: i + 1, kind: "exported function", name: m[1] });
      exports.push(m[1]);
    } else if (/^export\s+(?:const|let|var)\s+(\w+)/.test(ln)) {
      const m = ln.match(/^export\s+(?:const|let|var)\s+(\w+)/);
      decls.push({ line: i + 1, kind: "exported const", name: m[1] });
      exports.push(m[1]);
    } else if (/^export\s+class\s+(\w+)/.test(ln)) {
      const m = ln.match(/^export\s+class\s+(\w+)/);
      decls.push({ line: i + 1, kind: "exported class", name: m[1] });
      exports.push(m[1]);
    } else if (/^export\s*\{/.test(ln)) {
      const m = ln.match(/^export\s*\{([^}]*)\}/);
      if (m) {
        for (const name of m[1].split(",").map(s => s.trim().split(/\s+as\s+/)[0]).filter(Boolean)) {
          exports.push(name);
        }
      }
    } else if (/^(?:async\s+)?function\s+(\w+)/.test(ln)) {
      const m = ln.match(/^(?:async\s+)?function\s+(\w+)/);
      decls.push({ line: i + 1, kind: "function", name: m[1] });
    } else if (/^class\s+(\w+)/.test(ln)) {
      const m = ln.match(/^class\s+(\w+)/);
      decls.push({ line: i + 1, kind: "class", name: m[1] });
    } else if (/^(?:const|let|var)\s+(\w+)\s*=/.test(ln)) {
      const m = ln.match(/^(?:const|let|var)\s+(\w+)/);
      decls.push({ line: i + 1, kind: "module-level", name: m[1] });
      if (/^let\s|^var\s/.test(ln)) {
        stateAssignments.push({ line: i + 1, name: m[1], snippet: ln.slice(0, 120) });
      }
    }
    if (/addEventListener\(/.test(ln)) {
      const m = ln.match(/addEventListener\(['"](\w+)['"]/);
      if (m) eventListeners.push({ line: i + 1, event: m[1], snippet: ln.trim().slice(0, 120) });
    }
  }

  // Build the anatomy markdown
  const out = [];
  out.push(`# Anatomy: ${path}`);
  out.push("");
  out.push(`- Total lines: ${lines.length}`);
  out.push(`- Top-level declarations: ${decls.length}`);
  out.push(`- Exports: ${exports.length}`);
  out.push(`- Module-level mutable state (let/var): ${stateAssignments.length}`);
  out.push(`- Section banners: ${sections.length}`);
  out.push("");

  if (sections.length) {
    out.push("## Section banners");
    out.push("");
    out.push("| Line | Banner |");
    out.push("|---:|---|");
    for (const s of sections) out.push(`| ${s.line} | ${s.text.replace(/\|/g, "\\|").slice(0, 120)} |`);
    out.push("");
  }

  if (exports.length) {
    out.push("## Exports");
    out.push("");
    for (const e of exports) out.push(`- ${e}`);
    out.push("");
  }

  if (stateAssignments.length) {
    out.push("## Module-level mutable state");
    out.push("");
    out.push("| Line | Name | Snippet |");
    out.push("|---:|---|---|");
    for (const s of stateAssignments) out.push(`| ${s.line} | ${s.name} | \`${s.snippet.replace(/\|/g, "\\|").replace(/`/g, "")}\` |`);
    out.push("");
  }

  out.push("## Top-level declarations");
  out.push("");
  out.push("| Line | Kind | Name |");
  out.push("|---:|---|---|");
  for (const d of decls) out.push(`| ${d.line} | ${d.kind} | ${d.name} |`);
  out.push("");

  out.push("## Event listeners attached at module scope");
  out.push("");
  if (!eventListeners.length) {
    out.push("(none — addEventListener calls are inside functions only)");
  } else {
    out.push("| Line | Event | Snippet |");
    out.push("|---:|---|---|");
    for (const e of eventListeners.slice(0, 30)) out.push(`| ${e.line} | ${e.event} | \`${e.snippet.replace(/\|/g, "\\|").replace(/`/g, "")}\` |`);
    if (eventListeners.length > 30) out.push(`| ... | ... | ${eventListeners.length - 30} more |`);
  }

  const target = `.audit-scratch/anatomy/${basename(path)}.md`;
  writeFileSync(target, out.join("\n"));
  console.log(`wrote ${target}: ${decls.length} decls, ${exports.length} exports, ${eventListeners.length} listeners`);
}
