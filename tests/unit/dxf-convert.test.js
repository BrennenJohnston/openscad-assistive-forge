import { describe, it, expect, vi } from 'vitest';
import {
  importWrapper,
  mountName,
  parseDxfExtents,
  dxfSize,
  translateConversionError,
  dxfToSvg,
  svgToDxf,
  WRAPPER_MAIN,
  EDITED_SVG_NAME,
  withMetricUnits,
  INSUNITS_MILLIMETERS,
} from '../../src/js/dxf-convert.js';

// The header of the committed fixture, which the engine itself produced from a
// 40 x 25 mm rectangle. Group code on one line, value on the next.
const HEADER = [
  '  0',
  'SECTION',
  '  2',
  'HEADER',
  '  9',
  '$ACADVER',
  '  1',
  'AC1009',
  '  9',
  '$EXTMIN',
  ' 10',
  '0',
  ' 20',
  '0',
  '  9',
  '$EXTMAX',
  ' 10',
  '40',
  ' 20',
  '25',
  '  0',
  'ENDSEC',
].join('\n');

describe('importWrapper', () => {
  it('writes an OpenSCAD import for the mounted name', () => {
    expect(importWrapper('drawing.dxf')).toBe('import("drawing.dxf");\n');
  });

  it('quotes a name that contains a quote, rather than breaking the file', () => {
    expect(importWrapper('od"d.dxf')).toBe('import("od\\"d.dxf");\n');
  });
});

describe('mountName', () => {
  it('keeps a plain name', () => {
    expect(mountName('drawing.dxf', 'x.dxf')).toBe('drawing.dxf');
  });

  it('drops any path in front of it', () => {
    expect(mountName('some/dir/drawing.dxf', 'x.dxf')).toBe('drawing.dxf');
    expect(mountName('some\\dir\\drawing.dxf', 'x.dxf')).toBe('drawing.dxf');
  });

  it('replaces characters the worker filesystem should not see', () => {
    expect(mountName('my drawing (1).dxf', 'x.dxf')).toBe('my-drawing-1-.dxf');
  });

  it('falls back when there is no usable extension left', () => {
    expect(mountName('', 'fallback.dxf')).toBe('fallback.dxf');
    expect(mountName('noextension', 'fallback.dxf')).toBe('fallback.dxf');
  });
});

describe('parseDxfExtents', () => {
  it('reads the declared corners', () => {
    expect(parseDxfExtents(HEADER)).toEqual({ min: [0, 0], max: [40, 25] });
  });

  it('turns them into a size in millimetres', () => {
    expect(dxfSize(HEADER)).toEqual({ width: 40, height: 25 });
  });

  it('handles a drawing that does not start at the origin', () => {
    const shifted = HEADER.replace(
      '  9\n$EXTMIN\n 10\n0\n 20\n0',
      '  9\n$EXTMIN\n 10\n5\n 20\n2.5'
    );
    expect(dxfSize(shifted)).toEqual({ width: 35, height: 22.5 });
  });

  it('says nothing rather than guessing when the header has no extents', () => {
    expect(
      parseDxfExtents('  0\nSECTION\n  2\nENTITIES\n  0\nENDSEC\n')
    ).toBeNull();
    expect(dxfSize('nonsense')).toBeNull();
    expect(parseDxfExtents('')).toBeNull();
  });
});

describe('translateConversionError', () => {
  it('turns the engine 2D complaint into a sentence about the file', () => {
    const engine = new Error(
      'Your model produces 3D geometry, but SVG, DXF and PDF export all require 2D output. Enable "use Laser Cutting best practices" or ensure your model uses projection() to produce 2D geometry.'
    );
    const message = translateConversionError(engine, 'label.dxf').message;
    // Nothing about projection() or 3D models: the person chose a drawing.
    expect(message).not.toMatch(/projection|3D/);
    expect(message).toContain('label.dxf');
    // And it names the real limitation.
    expect(message).toMatch(/text or dimension entities/);
  });

  it('passes anything else through, named', () => {
    const message = translateConversionError(
      new Error('worker crashed'),
      'x.dxf'
    ).message;
    expect(message).toBe('Forge could not read x.dxf: worker crashed');
  });
});

describe('dxfToSvg', () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0"/></svg>';

  it('mounts BOTH the wrapper and the drawing, and names the wrapper as main', async () => {
    // The engine resolves a relative import against the MAIN file's directory,
    // so a wrapper that is not itself mounted cannot find what it imports.
    // Measured: omitting mainFile made the import silently produce nothing.
    const render = vi.fn().mockResolvedValue({ data: svg });
    await dxfToSvg({ dxfText: HEADER, fileName: 'drawing.dxf', render });

    const [scad, params, options] = render.mock.calls[0];
    expect(scad).toBe('import("drawing.dxf");\n');
    expect(params).toEqual({});
    expect(options.outputFormat).toBe('svg');
    expect(options.mainFile).toBe(WRAPPER_MAIN);
    expect([...options.files.keys()].sort()).toEqual(
      [WRAPPER_MAIN, 'drawing.dxf'].sort()
    );
    expect(options.files.get('drawing.dxf')).toBe(HEADER);
  });

  it('refuses a result with no drawing in it, in plain words', async () => {
    const render = vi.fn().mockResolvedValue({ data: '' });
    await expect(
      dxfToSvg({ dxfText: HEADER, fileName: 'empty.dxf', render })
    ).rejects.toThrow(/could not find any shapes in empty\.dxf/);
  });

  it('translates an engine failure rather than passing it on raw', async () => {
    const render = vi
      .fn()
      .mockRejectedValue(
        new Error('SVG, DXF and PDF export all require 2D output')
      );
    await expect(
      dxfToSvg({ dxfText: HEADER, fileName: 'text-only.dxf', render })
    ).rejects.toThrow(/text or dimension entities/);
  });
});

describe('svgToDxf', () => {
  it('mounts the edited drawing under a known name and asks for DXF', async () => {
    const render = vi.fn().mockResolvedValue({ data: HEADER });
    const { dxf } = await svgToDxf({
      svgText: '<svg/>',
      fileName: 'drawing.dxf',
      render,
    });
    // DP-13: what comes back is the engine's drawing PLUS a declaration of
    // its units, which OpenSCAD does not write. Everything the engine
    // produced is still there, in order.
    expect(dxf).not.toBe(HEADER);
    expect(dxf).toContain('$INSUNITS');
    // Everything the engine produced is still there.
    for (const line of HEADER.split(String.fromCharCode(10))) {
      expect(dxf).toContain(line.trim());
    }

    const [scad, , options] = render.mock.calls[0];
    expect(scad).toBe(`import("${EDITED_SVG_NAME}");\n`);
    expect(options.outputFormat).toBe('dxf');
    expect(options.mainFile).toBe(WRAPPER_MAIN);
    expect(options.files.get(EDITED_SVG_NAME)).toBe('<svg/>');
  });

  it('refuses a result that is not a DXF', async () => {
    const render = vi.fn().mockResolvedValue({ data: 'not a dxf' });
    await expect(
      svgToDxf({ svgText: '<svg/>', fileName: 'x.dxf', render })
    ).rejects.toThrow(/nothing in the drawing to save/);
  });
});

// ── DP-13: the drawing says what unit it is in ──────────────────────────────

describe('withMetricUnits', () => {
  // Built without backslash escapes so the fixture is exactly what it looks
  // like: DXF is line-oriented and OpenSCAD writes CRLF.
  const CR = String.fromCharCode(13);
  const LF = String.fromCharCode(10);
  const CRLF = CR + LF;
  const HEADER = [
    '999',
    'DXF from OpenSCAD',
    '  0',
    'SECTION',
    '  2',
    'HEADER',
    '  9',
    '$ACADVER',
    '  1',
    'AC1006',
    '  9',
    '$INSBASE',
    ' 10',
    '0.0',
    '  0',
    'ENDSEC',
  ].join(CRLF);

  it('★ declares millimetres, which OpenSCAD does not', () => {
    // MEASURED on our own export: correct millimetre COORDINATES and no
    // $INSUNITS at all, so the file says nothing about what its numbers mean.
    // Laser software configured for inches reads 50 as fifty INCHES - a 25.4x
    // error that looks perfectly fine on screen and ruins a sheet of material.
    expect(HEADER).not.toContain('$INSUNITS');
    const out = withMetricUnits(HEADER);
    expect(out).toContain('$INSUNITS');
    expect(out).toContain('$MEASUREMENT');
    expect(INSUNITS_MILLIMETERS).toBe(4);
  });

  it('puts them straight after $ACADVER, where a reader looks', () => {
    const lines = withMetricUnits(HEADER).split(CRLF);
    const i = lines.indexOf('$ACADVER');
    expect(lines[i + 1].trim()).toBe('1');
    expect(lines[i + 2]).toBe('AC1006');
    expect(lines[i + 3].trim()).toBe('9');
    expect(lines[i + 4]).toBe('$INSUNITS');
    expect(lines[i + 6].trim()).toBe(String(INSUNITS_MILLIMETERS));
  });

  it('keeps the line ending the file already used', () => {
    expect(withMetricUnits(HEADER)).toContain(CRLF);
    const lf = HEADER.split(CRLF).join(LF);
    const out = withMetricUnits(lf);
    expect(out).toContain('$INSUNITS');
    expect(out).not.toContain(CR);
  });

  it('does nothing twice', () => {
    const once = withMetricUnits(HEADER);
    expect(withMetricUnits(once)).toBe(once);
  });

  it('falls back to the top of the header when there is no $ACADVER', () => {
    const noVer = ['  0', 'SECTION', '  2', 'HEADER', '  0', 'ENDSEC'].join(
      CRLF
    );
    const lines = withMetricUnits(noVer).split(CRLF);
    expect(lines[lines.indexOf('HEADER') + 2]).toBe('$INSUNITS');
  });

  it('leaves the entities alone', () => {
    const withBody =
      HEADER +
      CRLF +
      [
        '  0',
        'SECTION',
        '  2',
        'ENTITIES',
        '  0',
        'LWPOLYLINE',
        '  0',
        'ENDSEC',
      ].join(CRLF);
    const out = withMetricUnits(withBody);
    expect((out.match(/LWPOLYLINE/g) || []).length).toBe(1);
  });

  it('leaves something that is not a DXF alone', () => {
    expect(withMetricUnits('not a dxf')).toBe('not a dxf');
    expect(withMetricUnits(null)).toBeNull();
    expect(withMetricUnits(undefined)).toBeUndefined();
  });
});
