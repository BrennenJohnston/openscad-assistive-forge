#!/usr/bin/env node
// Read-only CSS section scanner. Finds banner-style comments and reports
// the line range each section occupies (start to next banner -1).
//
// Usage: node .audit-scratch/css-anatomy.mjs <file.css> [<file.css> ...]

import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { basename } from "node:path";

const args = process.argv.slice(2);
if (args.length === 0) { console.error("usage: css-anatomy.mjs <file.css> [...]"); process.exit(1); }

mkdirSync(".audit-scratch/anatomy", { recursive: true });

for (const path of args) {
  const lines = readFileSync(path, "utf-8").split(/\r?\n/);

  // A "banner" is any line with /* and the next 1-3 lines containing a content
  // line (not just stars or equals), then closing */ within 6 lines.
  // We capture the title from the line that contains alphabetic content.
  const banners = [];
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*\/\*/.test(lines[i])) {
      // peek for title within next 6 lines
      let title = null;
      const blockLines = [];
      for (let j = i; j < Math.min(i + 8, lines.length); j++) {
        blockLines.push(lines[j]);
        const stripped = lines[j].replace(/[\/\*\s=\-]+/g, " ").trim();
        if (!title && stripped.length > 2 && !/^[*\s\/=\-]+$/.test(stripped)) {
          title = stripped;
        }
        if (/\*\//.test(lines[j])) break;
      }
      // Only count as a "section banner" if the comment block has a divider line OR is unusually long (>= 4 lines)
      const isBanner = blockLines.some((l) => /={5,}|-{5,}/.test(l)) || blockLines.length >= 4;
      if (isBanner && title) {
        banners.push({ line: i + 1, title: title.slice(0, 100) });
      }
    }
  }

  // Compute line ranges per banner
  for (let i = 0; i < banners.length; i++) {
    const next = banners[i + 1] ? banners[i + 1].line - 1 : lines.length;
    banners[i].endLine = next;
    banners[i].locSpan = next - banners[i].line + 1;
  }

  const out = [];
  out.push(`# CSS anatomy: ${path}`);
  out.push("");
  out.push(`- Total lines: ${lines.length}`);
  out.push(`- Section banners: ${banners.length}`);
  out.push("");
  out.push("## Sections (sorted by size descending)");
  out.push("");
  out.push("| Lines | Span | Banner title |");
  out.push("|---:|---|---|");
  for (const b of [...banners].sort((a, b) => b.locSpan - a.locSpan)) {
    out.push(`| ${b.locSpan} | ${b.line}-${b.endLine} | ${b.title.replace(/\|/g, "\\|")} |`);
  }
  out.push("");
  out.push("## Sections in source order");
  out.push("");
  out.push("| Start | End | LOC | Title |");
  out.push("|---:|---:|---:|---|");
  for (const b of banners) {
    out.push(`| ${b.line} | ${b.endLine} | ${b.locSpan} | ${b.title.replace(/\|/g, "\\|")} |`);
  }

  const target = `.audit-scratch/anatomy/${basename(path)}.md`;
  writeFileSync(target, out.join("\n"));
  console.log(`wrote ${target}: ${banners.length} banners across ${lines.length} lines`);
}
