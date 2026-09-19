/**
 * Re-home CodeMirror's generated CSS so a strict style-src can't discard it.
 *
 * CodeMirror styles itself through style-mod, which uses a constructable
 * stylesheet only when the editor's root has no `head` — in practice, only
 * inside a shadow root. Mounted in the document, as this app mounts it,
 * style-mod fills a <style> element and inserts it into <head>. A policy of
 * `style-src 'self'` refuses that element outright, and the editor loses
 * `white-space: pre`, its monospace font and its gutter layout: the gutter
 * becomes a full-width block and the code paints tens of thousands of pixels
 * below the fold. Line numbers, no code — the shipped defect.
 *
 * Constructable stylesheets are CSSOM rather than markup, so CSP does not
 * govern them. Copying style-mod's rules into document.adoptedStyleSheets
 * restores the editor without touching the policy, which is a documented
 * product feature and must not be weakened.
 *
 * This runs everywhere, not only where the policy bites. Adopted sheets sort
 * after document stylesheets in the cascade, so restricting it to production
 * would leave the dev server resolving `.cm-*` rules in a different order
 * than the deployed app — the exact class of divergence that let this defect
 * ship green.
 *
 * @license GPL-3.0-or-later
 */

// style-mod names every class it generates with this character, so it marks
// the sheets that belong to it and no others.
const STYLE_MOD_MARKER = 'ͼ';

let mirrorSheet = null;
let mirroredCss = '';
let observer = null;

function constructableStyleSheetsAvailable() {
  return (
    typeof CSSStyleSheet === 'function' &&
    typeof CSSStyleSheet.prototype.replaceSync === 'function' &&
    'adoptedStyleSheets' in Document.prototype
  );
}

function collectGeneratedCss() {
  return Array.from(document.querySelectorAll('style'))
    .filter((element) => element.textContent.includes(STYLE_MOD_MARKER))
    .map((element) => element.textContent)
    .join('\n');
}

/** Mirror the current rules. CodeMirror re-mounts styles when a theme is
 *  reconfigured, which rewrites the same element's text in place. */
function sync() {
  const css = collectGeneratedCss();
  if (css && css !== mirroredCss) {
    mirrorSheet.replaceSync(css);
    mirroredCss = css;
    if (!document.adoptedStyleSheets.includes(mirrorSheet)) {
      document.adoptedStyleSheets = [
        ...document.adoptedStyleSheets,
        mirrorSheet,
      ];
    }
  }
  return mirroredCss.length > 0;
}

/**
 * Adopt CodeMirror's styles into the document and keep them in sync.
 * Idempotent: every editor instance shares the one mirrored sheet, as they
 * already share the one style-mod sheet it mirrors.
 *
 * @returns {boolean} whether CodeMirror's rules are adopted
 */
export function adoptCodeMirrorStyles() {
  if (!constructableStyleSheetsAvailable()) {
    console.error(
      '[codemirror-csp-styles] No constructable stylesheet support, so ' +
        "CodeMirror's rules cannot be re-homed. Behind a style-src policy " +
        "without 'unsafe-inline' the editor will render unstyled."
    );
    return false;
  }

  if (!mirrorSheet) mirrorSheet = new CSSStyleSheet();

  const adopted = sync();

  if (!observer) {
    observer = new MutationObserver(sync);
    observer.observe(document.head, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }

  return adopted;
}
