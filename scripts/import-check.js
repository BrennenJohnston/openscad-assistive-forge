#!/usr/bin/env node

/**
 * Hallucinated Import Detector — adapted from ai-at-playbook/scripts/import-check.js
 *
 * Checks that every import/require statement in JavaScript/TypeScript files
 * resolves to an actual file or installed package. AI coding tools sometimes
 * generate import statements for modules that don't exist.
 *
 * Usage:
 *   node scripts/import-check.js [path...]
 *   node scripts/import-check.js src/
 *
 * Exit codes:
 *   0 — all imports resolve
 *   1 — unresolved imports found
 */

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, extname, resolve, dirname } from "node:path";

const JS_EXTENSIONS = new Set([".js", ".ts", ".jsx", ".tsx", ".mjs", ".cjs"]);

const RESOLVE_EXTENSIONS = [
  "",
  ".js",
  ".ts",
  ".jsx",
  ".tsx",
  ".mjs",
  ".cjs",
  ".json",
  "/index.js",
  "/index.ts",
  "/index.jsx",
  "/index.tsx",
  "/index.mjs",
];

const BUILTIN_MODULES = new Set([
  "assert",
  "buffer",
  "child_process",
  "cluster",
  "console",
  "constants",
  "crypto",
  "dgram",
  "dns",
  "domain",
  "events",
  "fs",
  "http",
  "http2",
  "https",
  "module",
  "net",
  "os",
  "path",
  "perf_hooks",
  "process",
  "punycode",
  "querystring",
  "readline",
  "repl",
  "stream",
  "string_decoder",
  "timers",
  "tls",
  "tty",
  "url",
  "util",
  "v8",
  "vm",
  "wasi",
  "worker_threads",
  "zlib",
]);

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "coverage",
  "ai-at-playbook",
  "playwright-report",
  "test-results",
]);

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
    if (stat.isFile() && JS_EXTENSIONS.has(extname(resolved).toLowerCase())) {
      files.push(resolved);
    } else if (stat.isDirectory()) {
      walkDir(resolved, files);
    }
  }
  return files;
}

function walkDir(dir, files) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") && entry.isDirectory()) continue;
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      walkDir(full, files);
    } else if (
      entry.isFile() &&
      JS_EXTENSIONS.has(extname(entry.name).toLowerCase())
    ) {
      files.push(full);
    }
  }
}

function findProjectRoot(startDir) {
  let dir = startDir;
  while (dir !== dirname(dir)) {
    if (existsSync(join(dir, "package.json"))) return dir;
    dir = dirname(dir);
  }
  return startDir;
}

function stripComments(content) {
  // Remove single-line comments but preserve strings
  let result = "";
  let inString = false;
  let stringChar = "";
  let inTemplate = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    const next = content[i + 1];

    if (inLineComment) {
      if (ch === "\n") {
        inLineComment = false;
        result += ch;
      }
      continue;
    }

    if (inBlockComment) {
      if (ch === "*" && next === "/") {
        inBlockComment = false;
        i++;
      } else if (ch === "\n") {
        result += ch;
      }
      continue;
    }

    if (inString) {
      result += ch;
      if (ch === "\\" && i + 1 < content.length) {
        result += next;
        i++;
        continue;
      }
      if (inTemplate && ch === "`") {
        inString = false;
        inTemplate = false;
      } else if (!inTemplate && ch === stringChar) {
        inString = false;
      }
      continue;
    }

    if (ch === '"' || ch === "'") {
      inString = true;
      stringChar = ch;
      result += ch;
      continue;
    }
    if (ch === "`") {
      inString = true;
      inTemplate = true;
      result += ch;
      continue;
    }

    if (ch === "/" && next === "/") {
      inLineComment = true;
      continue;
    }
    if (ch === "/" && next === "*") {
      inBlockComment = true;
      i++;
      continue;
    }

    result += ch;
  }

  return result;
}

function extractImports(content) {
  const cleaned = stripComments(content);
  const imports = [];

  const patterns = [
    /import\s+.*?\s+from\s+["']([^"']+)["']/g,
    /import\s*\(\s*["']([^"']+)["']\s*\)/g,
    /import\s+["']([^"']+)["']/g,
    /require\s*\(\s*["']([^"']+)["']\s*\)/g,
  ];

  for (const pattern of patterns) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match;
    while ((match = regex.exec(cleaned)) !== null) {
      imports.push(match[1]);
    }
  }

  return [...new Set(imports)];
}

function isBuiltinModule(specifier) {
  if (BUILTIN_MODULES.has(specifier)) return true;
  if (specifier.startsWith("node:")) return true;
  return false;
}

function isRelativeImport(specifier) {
  return specifier.startsWith("./") || specifier.startsWith("../");
}

function resolveRelativeImport(specifier, fromFile) {
  const dir = dirname(fromFile);
  const base = resolve(dir, specifier);
  for (const ext of RESOLVE_EXTENSIONS) {
    if (existsSync(base + ext)) return true;
  }
  return false;
}

function resolvePackageImport(specifier, projectRoot) {
  const parts = specifier.split("/");
  const packageName = specifier.startsWith("@")
    ? parts.slice(0, 2).join("/")
    : parts[0];

  const nodeModulesPath = join(projectRoot, "node_modules", packageName);
  if (existsSync(nodeModulesPath)) return true;

  const packageJsonPath = join(projectRoot, "package.json");
  if (existsSync(packageJsonPath)) {
    try {
      const pkg = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
      const allDeps = {
        ...pkg.dependencies,
        ...pkg.devDependencies,
        ...pkg.peerDependencies,
        ...pkg.optionalDependencies,
      };
      if (packageName in allDeps) return true;
    } catch {
      // package.json parse error — fall through
    }
  }

  return false;
}

function checkFile(filepath, projectRoot) {
  let content;
  try {
    content = readFileSync(filepath, "utf-8");
  } catch {
    return [];
  }

  const imports = extractImports(content);
  const unresolved = [];

  for (const specifier of imports) {
    if (isBuiltinModule(specifier)) continue;
    if (isRelativeImport(specifier)) {
      if (!resolveRelativeImport(specifier, filepath)) {
        unresolved.push(specifier);
      }
    } else {
      if (!resolvePackageImport(specifier, projectRoot)) {
        unresolved.push(specifier);
      }
    }
  }

  return unresolved;
}

function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log("Usage: node scripts/import-check.js [path...]");
    console.log(
      "  Checks that all import/require statements resolve to actual files or packages.",
    );
    console.log("");
    console.log("Examples:");
    console.log("  node scripts/import-check.js src/");
    console.log("  node scripts/import-check.js src/js/main.js");
    process.exit(0);
  }

  const files = collectFiles(args);
  const projectRoot = findProjectRoot(resolve(args[0]));
  let totalUnresolved = 0;

  console.log(`Checking imports in ${files.length} file(s)...`);
  console.log(`Project root: ${projectRoot}\n`);

  for (const filepath of files) {
    const unresolved = checkFile(filepath, projectRoot);
    if (unresolved.length > 0) {
      console.log(`  ${filepath}:`);
      for (const spec of unresolved) {
        console.log(`    UNRESOLVED: ${spec}`);
      }
      totalUnresolved += unresolved.length;
    }
  }

  console.log("\nImport Check Results");
  console.log("====================");
  console.log(`  Files checked:      ${files.length}`);
  console.log(`  Unresolved imports: ${totalUnresolved}`);

  if (totalUnresolved > 0) {
    console.log(
      `\nFAILED: ${totalUnresolved} unresolved import(s). These may be hallucinated by AI.\n`,
    );
    console.log("Possible causes:");
    console.log("  - AI generated an import for a package that isn't installed");
    console.log("  - AI generated an import for a file that doesn't exist");
    console.log("  - A dependency was removed but imports weren't updated");
    console.log(
      "\nFix: Install the package, create the file, or remove the import.\n",
    );
    process.exit(1);
  }

  console.log("\nPASSED: All imports resolve.\n");
  process.exit(0);
}

main();
