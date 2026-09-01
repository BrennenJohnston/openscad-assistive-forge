/**
 * A command stack for the drawing editor (DP-20).
 *
 * Every change a person makes in the editor is a command with a `do` and an
 * `undo`, so Undo puts back exactly what was there and says what came back.
 * Bounded, because a stack that grew without limit through a long session
 * would be a memory leak with a keyboard shortcut; session only, because a
 * stack that rode into the saved project would grow the 2 MB localStorage
 * lane without bound (the same reason the old delete-undo was one level).
 *
 * @license GPL-3.0-or-later
 */

/** How many steps back a person can go. */
export const UNDO_LIMIT = 200;

/**
 * @typedef {object} Command
 * @property {string} label - What it did, in words a person hears on undo
 * @property {Function} do - Apply it
 * @property {Function} undo - Take it back exactly
 */

/**
 * @param {{limit?: number, onChange?: Function}} [options]
 * @returns {{
 *   run: (cmd: Command) => Command,
 *   undo: () => Command|null,
 *   redo: () => Command|null,
 *   canUndo: () => boolean,
 *   canRedo: () => boolean,
 *   clear: () => void,
 *   size: () => number,
 * }}
 */
export function createCommandStack({ limit = UNDO_LIMIT, onChange } = {}) {
  const done = [];
  const undone = [];
  const changed = () => {
    if (typeof onChange === 'function') onChange();
  };

  return {
    /** Do it, remember it, and forget any redo that no longer applies. */
    run(cmd) {
      cmd.do();
      done.push(cmd);
      if (done.length > limit) done.shift();
      undone.length = 0;
      changed();
      return cmd;
    },
    undo() {
      const cmd = done.pop();
      if (!cmd) return null;
      cmd.undo();
      undone.push(cmd);
      changed();
      return cmd;
    },
    redo() {
      const cmd = undone.pop();
      if (!cmd) return null;
      cmd.do();
      done.push(cmd);
      changed();
      return cmd;
    },
    canUndo: () => done.length > 0,
    canRedo: () => undone.length > 0,
    clear() {
      done.length = 0;
      undone.length = 0;
      changed();
    },
    size: () => done.length,
  };
}
