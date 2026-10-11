/**
 * The `%` shapes of a model, as a model of their own.
 *
 * OpenSCAD leaves a `%` (background) shape out of every render and draws it
 * see-through in its preview. Forge previews from a render, so it draws the
 * `%` shapes from a second render of this tree: the engine's CSG tree export
 * cut down to its `%` branches, with the transforms and colors above them
 * kept and any boolean above them made a plain group, as the desktop preview
 * draws them wherever they sit.
 *
 * @license GPL-3.0-or-later
 */

/** Nodes that only place or color what is inside them. */
const PLACING_NODES = new Set([
  'multmatrix',
  'color',
  'group',
  'render',
  'resize',
]);

const MODIFIER_LINE = /^([%#!*]?)(\t*)(.*)$/;

/**
 * Read the engine's CSG export into a tree. One node per line: a header
 * ending in `{` opens a block, one ending in `;` is a leaf, `}` closes.
 * @param {string} csg
 * @returns {{header: string, modifier: string, children: Array|null}[]}
 */
function parseCsgTree(csg) {
  const root = { children: [] };
  const stack = [root];
  for (const rawLine of csg.split('\n')) {
    const line = rawLine.replace(/\r$/, '');
    if (!line.trim()) continue;
    const [, modifier, , rest] = MODIFIER_LINE.exec(line);
    const content = rest.trim();
    if (content === '}') {
      if (stack.length > 1) stack.pop();
      continue;
    }
    const parent = stack[stack.length - 1];
    if (content.endsWith('{')) {
      const node = {
        header: content.slice(0, -1).trim(),
        modifier,
        children: [],
      };
      parent.children.push(node);
      stack.push(node);
    } else if (content.endsWith(';')) {
      parent.children.push({
        header: content.slice(0, -1).trim(),
        modifier,
        children: null,
      });
    }
  }
  return root.children;
}

function nodeName(header) {
  return header.slice(0, header.indexOf('(')).trim();
}

/** A copy of a kept branch with every `%` mark removed, so all of it renders. */
function unmark(node) {
  return {
    header: node.header,
    modifier: node.modifier === '%' ? '' : node.modifier,
    children: node.children ? node.children.map(unmark) : null,
  };
}

/**
 * The color desktop OpenSCAD draws an uncolored `%` shape in: gray, half
 * see-through. In the engine's colored render an outer color wins over an
 * inner one, so only a branch with no color of its own is wrapped in it.
 */
export const BACKGROUND_DEFAULT_COLOR =
  'color([0.705882, 0.705882, 0.705882, 0.5])';

function hasColor(node) {
  return (
    nodeName(node.header) === 'color' || Boolean(node.children?.some(hasColor))
  );
}

function keepBackground(node) {
  if (node.modifier === '*') return null;
  if (node.modifier === '%') {
    const branch = unmark(node);
    return hasColor(branch)
      ? branch
      : { header: BACKGROUND_DEFAULT_COLOR, modifier: '', children: [branch] };
  }
  if (!node.children) return null;
  const kept = node.children.map(keepBackground).filter(Boolean);
  if (kept.length === 0) return null;
  const header = PLACING_NODES.has(nodeName(node.header))
    ? node.header
    : 'group()';
  return { header, modifier: '', children: kept };
}

function serialize(nodes, depth = 0) {
  const indent = '\t'.repeat(depth);
  return nodes
    .map((node) => {
      const mark = node.modifier === '#' ? '#' : '';
      if (!node.children) return `${indent}${mark}${node.header};`;
      return [
        `${indent}${mark}${node.header} {`,
        serialize(node.children, depth + 1),
        `${indent}}`,
      ]
        .filter(Boolean)
        .join('\n');
    })
    .join('\n');
}

/**
 * The model's `%` shapes alone, as OpenSCAD source, or null when it has none.
 * @param {string} csg - The engine's CSG export of the model
 * @returns {string|null}
 */
export function backgroundTreeFromCsg(csg) {
  if (typeof csg !== 'string' || !/^%/m.test(csg)) return null;
  const kept = parseCsgTree(csg).map(keepBackground).filter(Boolean);
  return kept.length ? `${serialize(kept)}\n` : null;
}

/**
 * Whether source text may use the `%` modifier: a `%` before a module call,
 * a block or a modifier, not the remainder operator between two values.
 * A false match costs only a cheap tree export.
 * @param {string} source
 * @returns {boolean}
 */
export function mayUseBackgroundModifier(source) {
  if (typeof source !== 'string' || !source.includes('%')) return false;
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '')
    .replace(/"(?:[^"\\]|\\.)*"/g, '""');
  return /(^|[;{}):\s])%\s*[A-Za-z_{(%#!*]/m.test(code);
}
