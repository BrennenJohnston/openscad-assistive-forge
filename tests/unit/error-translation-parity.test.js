/**
 * Error-translation parity corpus (BR-5 safety net).
 *
 * The render worker classifies raw stderr into { message, code, raw } via
 * ERROR_TRANSLATIONS (src/worker/error-translations.js); the main thread
 * turns errors into rich UI content via error-translator.js. This corpus
 * freezes the classification of representative raw stderr strings on BOTH
 * paths so the BR-5 consolidation (code-based lookup) cannot silently
 * change what users see.
 *
 * @license GPL-3.0-or-later
 */

import { describe, it, expect } from 'vitest';
import { translateWorkerError } from '../../src/worker/error-translations.js';
import {
  translateError,
  TRANSLATIONS_BY_CODE,
} from '../../src/js/error-translator.js';

/**
 * Corpus of representative raw stderr strings.
 * - workerCode: what the worker's classifier must return
 * - legacyTitle: what the main thread's regex path must return when given
 *   the RAW string (this is the pre-BR-5 behavior for raw text and must
 *   never regress)
 */
const CORPUS = [
  {
    raw: 'ERROR: Parser error: syntax error in file input.scad, line 12',
    workerCode: 'SYNTAX_ERROR',
    legacyTitle: 'Code Problem Found',
  },
  {
    raw: 'Rendering cancelled: render timeout after 30000ms',
    workerCode: 'TIMEOUT',
    legacyTitle: 'Taking Too Long',
  },
  {
    raw: 'std::bad_alloc: out of memory',
    workerCode: 'OUT_OF_MEMORY',
    legacyTitle: 'Model Too Complex',
  },
  {
    raw: "WARNING: Unknown module 'bosl_shape'.",
    workerCode: 'UNKNOWN_MODULE',
    legacyTitle: 'Something Went Wrong',
  },
  {
    raw: "WARNING: Unknown function 'quantize'.",
    workerCode: 'UNKNOWN_FUNCTION',
    legacyTitle: 'Something Went Wrong',
  },
  {
    raw: 'WARNING: Undefined variable: wall_thickness',
    workerCode: 'UNDEFINED_VARIABLE',
    legacyTitle: 'Missing Variable',
  },
  {
    raw: 'WARNING: Object may not be a valid 2-manifold and may need repair!',
    workerCode: 'NON_MANIFOLD_WARNING',
    legacyTitle: 'Something Went Wrong',
  },
  {
    raw: 'ERROR: No top level geometry to render',
    workerCode: 'NO_GEOMETRY',
    legacyTitle: 'Something Went Wrong',
  },
  {
    raw: 'Current top level object is empty.',
    workerCode: 'EMPTY_GEOMETRY',
    legacyTitle: 'Something Went Wrong',
  },
  {
    raw: 'ERROR: Current top level object is not a 2D object.',
    workerCode: 'MODEL_NOT_2D',
    legacyTitle: 'Something Went Wrong',
  },
  {
    raw: 'ECHO: "a hinged case is not supported for laser cutting"',
    workerCode: 'UNSUPPORTED_CONFIG',
    legacyTitle: 'Something Went Wrong',
  },
  {
    raw: "ERROR: Cannot open file 'openings_and_additions.txt'.",
    workerCode: 'FILE_NOT_FOUND',
    legacyTitle: 'File Access Problem',
  },
  {
    raw: "ERROR: Recursion detected calling module 'branch'",
    workerCode: 'RECURSION',
    legacyTitle: 'Something Went Wrong',
  },
  {
    raw: 'CGAL error: assertion violation! Expr: e->incident_sface() != SFace_const_handle()',
    workerCode: 'CGAL_ASSERTION',
    legacyTitle: 'Complex Geometry Issue',
  },
  {
    raw: 'Aborted(native code called abort())',
    workerCode: 'WASM_ABORT',
    legacyTitle: 'Rendering Engine Crashed',
  },
  {
    raw: 'RuntimeError: unreachable',
    workerCode: 'WASM_UNREACHABLE',
    legacyTitle: 'Rendering Engine Error',
  },
  {
    raw: 'RuntimeError: memory access out of bounds',
    workerCode: 'WASM_OOB',
    legacyTitle: 'Memory Access Error',
  },
  {
    raw: '1101176',
    workerCode: 'INTERNAL_ERROR',
    legacyTitle: 'Something Went Wrong',
  },
  {
    raw: 'exit code 1 from callMain during export pipeline processing',
    workerCode: 'RENDER_FAILED',
    legacyTitle: 'Something Went Wrong',
  },
];

describe('BR-5 parity corpus — worker classification of raw stderr', () => {
  for (const { raw, workerCode } of CORPUS) {
    it(`classifies ${JSON.stringify(raw.slice(0, 50))} as ${workerCode}`, () => {
      const result = translateWorkerError(raw);
      expect(result.code).toBe(workerCode);
      expect(result.raw).toBe(raw);
    });
  }
});

describe('BR-5 parity corpus — main-thread legacy regex path on raw stderr', () => {
  for (const { raw, legacyTitle } of CORPUS) {
    it(`translates ${JSON.stringify(raw.slice(0, 50))} to "${legacyTitle}"`, () => {
      const result = translateError(raw);
      expect(result.title).toBe(legacyTitle);
      expect(result.technical).toBe(raw);
    });
  }
});

describe('BR-5 — code-first translation honors the worker classification', () => {
  it('resolves every corpus entry with a coded translation (no generic fallback)', () => {
    for (const { raw, workerCode } of CORPUS) {
      const result = translateError(raw, { code: workerCode });
      if (TRANSLATIONS_BY_CODE[workerCode]) {
        expect(result.title, `code ${workerCode}`).toBe(
          TRANSLATIONS_BY_CODE[workerCode].title
        );
        expect(result.title).not.toBe('Something Went Wrong');
      } else {
        // Catch-all codes (INTERNAL_ERROR, RENDER_FAILED) fall back to the
        // legacy regex path over the message text
        expect(['INTERNAL_ERROR', 'RENDER_FAILED']).toContain(workerCode);
      }
      expect(result.technical).toBe(raw);
    }
  });

  it('a worker-classified Parser error no longer renders as the generic fallback', () => {
    // The exact BR-5 symptom from the audit: worker says SYNTAX_ERROR but
    // the UI used to say "Something Went Wrong" when the prose didn't
    // happen to match a legacy regex.
    const result = translateError('opaque worker text', {
      code: 'SYNTAX_ERROR',
    });
    expect(result.title).toBe('Code Problem Found');
  });

  it('unknown codes fall back to the legacy regex path', () => {
    const result = translateError('CGAL error: assertion violation!', {
      code: 'SOME_FUTURE_CODE',
    });
    expect(result.title).toBe('Complex Geometry Issue');
  });

  it('every TRANSLATIONS_BY_CODE entry has complete content', () => {
    for (const [code, entry] of Object.entries(TRANSLATIONS_BY_CODE)) {
      expect(entry.title, code).toBeTruthy();
      expect(entry.explanation, code).toBeTruthy();
      expect(entry.suggestion, code).toBeTruthy();
    }
  });
});

describe('T2-B1 — the MODEL_NOT_2D message names every 2D export format', () => {
  // PDF is a real 2D export (File ▸ Export ▸ Export as PDF…; OUTPUT_FORMATS
  // marks it is2D) and it refuses a 3D-only model like SVG and DXF do. The
  // guidance named only SVG and DXF, so a user who chose PDF was told about
  // two formats they had not picked.
  const FORMATS = ['SVG', 'DXF', 'PDF'];

  it('names all three formats on the worker path', () => {
    const { message } = translateWorkerError(
      'ERROR: Current top level object is not a 2D object.'
    );
    for (const format of FORMATS) {
      expect(message, format).toContain(format);
    }
  });

  it('names all three formats on the main-thread path', () => {
    const { explanation } = TRANSLATIONS_BY_CODE.MODEL_NOT_2D;
    for (const format of FORMATS) {
      expect(explanation, format).toContain(format);
    }
  });

  it('both paths share one explanation sentence, so the copies cannot drift', () => {
    const { message } = translateWorkerError(
      'ERROR: Current top level object is not a 2D object.'
    );
    const { explanation } = TRANSLATIONS_BY_CODE.MODEL_NOT_2D;
    expect(message.startsWith(explanation)).toBe(true);
  });
});
