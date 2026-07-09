// Read the import-graph.json and list any strongly connected components
// (cycles) using Tarjan's algorithm.
import { readFileSync, writeFileSync } from "node:fs";

const data = JSON.parse(
  readFileSync(".audit-scratch/import-graph.json", "utf-8"),
);
const adj = {};
for (const [k, v] of Object.entries(data.graph)) {
  adj[k] = (v.imports || []).filter((x) => !x.startsWith("UNRESOLVED:"));
}

let index = 0;
const stack = [];
const onStack = new Set();
const idx = new Map();
const low = new Map();
const sccs = [];

function strongConnect(v) {
  idx.set(v, index);
  low.set(v, index);
  index++;
  stack.push(v);
  onStack.add(v);

  for (const w of adj[v] || []) {
    if (!idx.has(w)) {
      strongConnect(w);
      low.set(v, Math.min(low.get(v), low.get(w)));
    } else if (onStack.has(w)) {
      low.set(v, Math.min(low.get(v), idx.get(w)));
    }
  }

  if (low.get(v) === idx.get(v)) {
    const comp = [];
    let w;
    do {
      w = stack.pop();
      onStack.delete(w);
      comp.push(w);
    } while (w !== v);
    if (comp.length > 1) sccs.push(comp);
    else if (comp.length === 1 && (adj[v] || []).includes(v)) sccs.push(comp); // self loop
  }
}

for (const v of Object.keys(adj)) if (!idx.has(v)) strongConnect(v);

console.log("Cycles (strongly connected components with size > 1 OR self-loop):");
if (sccs.length === 0) console.log("  none");
else {
  for (const c of sccs) {
    console.log("  " + c.join(" <-> "));
  }
}
writeFileSync(
  ".audit-scratch/cycles.json",
  JSON.stringify(sccs, null, 2),
);
