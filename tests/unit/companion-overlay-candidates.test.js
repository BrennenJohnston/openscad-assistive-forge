/**
 * The reference picture a project starts with: a picture the project names
 * in a variable may be laid over the preview, but never a file the model
 * itself reads, such as the tactile map tile's map file.
 *
 * @license GPL-3.0-or-later
 */
import { describe, it, expect } from 'vitest';
import {
  detectRequiredCompanionFiles,
  overlayCandidates,
} from '../../src/js/companion-files-controller.js';

describe('the reference picture a project starts with', () => {
  it("never takes a file the model itself reads: the tactile map tile's map file", () => {
    const found = detectRequiredCompanionFiles(
      'map_file = "sample_station.svg"; // [file:svg]\n'
    );
    expect(overlayCandidates(found, ['map_file'])).toEqual([]);
  });

  it('still takes a screenshot file, and any other picture a project names', () => {
    const found = detectRequiredCompanionFiles(
      'screenshot_file = "screen.png";\nlogo_file = "logo.svg";\n'
    );
    expect(overlayCandidates(found, []).map((f) => f.variableName)).toEqual([
      'screenshot_file',
      'logo_file',
    ]);
    expect(
      overlayCandidates(found, ['logo_file']).map((f) => f.variableName)
    ).toEqual(['screenshot_file']);
  });
});
