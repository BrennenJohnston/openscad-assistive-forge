#!/usr/bin/env node
// Read-only import graph builder for src/. Writes JSON + textual summary
// under .audit-scratch/. Not imported by any src code.
//
// Output:
//   .audit-scratch/import-graph.json   { node -> [imports], importers -> [...] }
//   .audit-scratch/import-graph.txt    human-readable adjacency list + ranks
//
// Usage:  node .audit-scratch/import-graph.mjs

import { readFileSync, readdirSync, statSync, existsSync, writeFileSync } from "node:fs";
import { join, extname, resolve, dirname, relative, sep, posix } from "node:path";

const ROOT = resolve(new URL("..", import.meta.url).pathname.replace(/^\//, ""));
const SRC = join(ROOT, "src");

const JS_EXTS = new Set([".js", ".mjs", ".cjs"]);
const RESOLVE_EXTS = ["", ".js", ".mjs", ".cjs", "/index.js", "/index.mjs"];
const SKIP = new Set(["node_modules", ".git", "dist", "build", "coverage"]);

function walk(dir, files = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) walk(full, files);
    else if (JS_EXTS.has(extname(e.name).toLowerCase())) files.push(full);
  }
  return files;
}

function strip(content) {
  // strip line + block comments; do not stress over template strings
  return content
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, (m, p1) => p1);
}

function imports(content) {
  const out = [];
  const c = strip(content);
  const patterns = [
    /import\s+[\s\S]*?from\s+["']([^"']+)["']/g,
    /import\s*\(\s*["']([^"']+)["']\s*\)/g,
    /import\s+["']([^"']+)["']/g,
    /require\s*\(\s*["']([^"']+)["']\s*\)/g,
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(c)) !== null) out.push(m[1]);
  }
  return [...new Set(out)];
}

function resolveLocal(spec, fromFile) {
  if (!spec.startsWith(".")) return null;
  const base = resolve(dirname(fromFile), spec);
  for (const ext of RESOLVE_EXTS) {
    const p = base + ext;
    if (existsSync(p) && statSync(p).isFile()) return p;
  }
  return null;
}

function isBareSpec(s) {
  return !s.startsWith(".") && !s.startsWith("/");
}

const files = walk(SRC);
const graph = {};
const externals = {};
const importers = {};

for (const f of files) {
  const rel = relative(ROOT, f).split(sep).join("/");
  graph[rel] = { imports: [], externalImports: [] };
}

for (const f of files) {
  const rel = relative(ROOT, f).split(sep).join("/");
  const content = readFileSync(f, "utf-8");
  for (const spec of imports(content)) {
    if (spec.startsWith(".")) {
      const target = resolveLocal(spec, f);
      if (target) {
        const targetRel = relative(ROOT, target).split(sep).join("/");
        graph[rel].imports.push(targetRel);
        importers[targetRel] = importers[targetRel] || [];
        if (!importers[targetRel].includes(rel)) importers[targetRel].push(rel);
      } else {
        graph[rel].imports.push(`UNRESOLVED:${spec}`);
      }
    } else if (isBareSpec(spec)) {
      graph[rel].externalImports.push(spec);
      externals[spec] = (externals[spec] || 0) + 1;
    }
  }
}

writeFileSync(
  join(ROOT, ".audit-scratch", "import-graph.json"),
  JSON.stringify({ graph, importers, externals }, null, 2),
);

const lines = [];
lines.push("# Import graph (src/) — generated " + new Date().toISOString());
lines.push("");
lines.push("## Files with most importers (god-module candidates)");
lines.push("");
const ranked = Object.entries(importers)
  .map(([f, list]) => [f, list.length])
  .sort((a, b) => b[1] - a[1]);
for (const [f, n] of ranked) lines.push(`${n}\t${f}`);
lines.push("");
lines.push("## Files with most fan-out (most outbound imports)");
lines.push("");
const fanOut = Object.entries(graph)
  .map(([f, g]) => [f, g.imports.length])
  .sort((a, b) => b[1] - a[1]);
for (const [f, n] of fanOut.slice(0, 50)) lines.push(`${n}\t${f}`);
lines.push("");
lines.push("## External package usage frequency");
lines.push("");
const ext = Object.entries(externals).sort((a, b) => b[1] - a[1]);
for (const [p, n] of ext) lines.push(`${n}\t${p}`);
lines.push("");
lines.push("## Orphans (no importers from src/) - candidates for entry/dead-code");
lines.push("");
const allTargets = new Set(Object.keys(importers));
for (const f of Object.keys(graph)) {
  if (!allTargets.has(f)) lines.push(`ORPHAN\t${f}`);
}
lines.push("");
lines.push("## Adjacency list (file -> imports)");
lines.push("");
for (const f of Object.keys(graph).sort()) {
  lines.push(`### ${f}`);
  if (graph[f].imports.length) {
    for (const t of graph[f].imports) lines.push(`  -> ${t}`);
  }
  if (graph[f].externalImports.length) {
    for (const t of graph[f].externalImports) lines.push(`  ext-> ${t}`);
  }
  lines.push("");
}

writeFileSync(join(ROOT, ".audit-scratch", "import-graph.txt"), lines.join("\n"));
console.log("Wrote .audit-scratch/import-graph.json and import-graph.txt");
console.log(`files=${files.length} importer-records=${Object.keys(importers).length} externals=${Object.keys(externals).length}`);
