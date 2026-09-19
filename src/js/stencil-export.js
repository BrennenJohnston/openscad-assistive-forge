/**
 * Every plate of a stencil, and the jig, in one download.
 *
 * A six-colour stencil is seven printed parts. Exporting them one at a time
 * means setting a parameter, rendering, downloading, and remembering which
 * file was which, seven times over, and the one thing that must not go wrong
 * is which plate is which. So this renders the set in order and hands back a
 * zip whose names say what each file is, with the paint order written beside
 * them in a text file.
 *
 * ★ THE RENDERS ARE SEQUENTIAL ON PURPOSE. The engine is one worker; asking
 * it for seven models at once queues them anyway and takes the progress
 * reporting away from the person waiting. One at a time, each announced, is
 * slower to write and the same speed to run.
 *
 * Nothing here knows about the DOM. It takes a render function and gives back
 * a Blob, so it can be tested without a browser and moved without being
 * rewritten - DP-19 puts the button somewhere else.
 *
 * @license GPL-3.0-or-later
 */

import { paintSequence } from './stencil-plates.js';
import { sanitizeFilename } from './download.js';

/** File extension per output format the set can be exported in. */
const EXTENSION = {
  stl: 'stl',
  obj: 'obj',
  off: 'off',
  amf: 'amf',
  svg: 'svg',
  dxf: 'dxf',
};

/**
 * What has to be rendered, in what order, and what each file is called.
 *
 * @param {object} args
 * @param {Object} args.parameters - The tile's current values
 * @param {number} args.plateCount - How many plates the design makes
 * @param {Array<string>} [args.colourNames] - In paint order, for the names
 * @param {boolean} [args.includeJig] - Add the jig base as a final part
 * @param {string} [args.format]
 * @returns {Array<{label: string, filename: string, parameters: Object}>}
 */
export function stencilSetJobs({
  parameters,
  plateCount,
  colourNames = [],
  includeJig = false,
  format = 'stl',
}) {
  const ext = EXTENSION[format] || 'stl';
  const jobs = [];
  for (let n = 1; n <= plateCount; n++) {
    const colour = colourNames[n - 1];
    const slug = colour ? `-${sanitizeFilename(colour).toLowerCase()}` : '';
    jobs.push({
      // STRINGS: owner review pending (DP-R2 text pack).
      label: colour ? `Plate ${n}, ${colour}` : `Plate ${n}`,
      filename: `plate-${n}${slug}.${ext}`,
      parameters: {
        ...parameters,
        output_part: 'plate',
        stencil_mode: 'layered',
        plate_number: n,
      },
    });
  }
  if (includeJig) {
    jobs.push({
      label: 'Jig base',
      filename: `jig-base.${ext}`,
      parameters: { ...parameters, output_part: 'jig_base' },
    });
  }
  return jobs;
}

/**
 * The paint order, as a file that goes in the zip beside the parts.
 *
 * @param {Array<string>} colourNames - In paint order
 * @param {string} designName
 * @returns {string}
 */
export function paintOrderText(colourNames, designName = 'this design') {
  const lines = [
    `Paint order for ${designName}`,
    '',
    ...paintSequence(colourNames.length > 0 ? colourNames : 1),
    '',
    'Print one of each plate, and the jig base if the set has one. Let each',
    'coat dry before the next plate goes on.',
  ];
  return lines.join('\n');
}

/**
 * Render the whole set and zip it.
 *
 * @param {object} args
 * @param {Array<object>} args.jobs - From `stencilSetJobs`
 * @param {Function} args.render - `(parameters) => Promise<{data: ArrayBuffer}>`
 * @param {string} args.designName - For the zip's own name
 * @param {Array<string>} [args.colourNames]
 * @param {Function} [args.onProgress] - `(done, total, label)` per part
 * @param {Function} [args.JSZipClass] - Injected for tests
 * @returns {Promise<{blob: Blob, filename: string, files: Array<string>}>}
 */
export async function exportStencilSet({
  jobs,
  render,
  designName,
  colourNames = [],
  onProgress = null,
  JSZipClass = null,
}) {
  if (!Array.isArray(jobs) || jobs.length === 0) {
    throw new Error('There are no plates to export yet.');
  }
  const JSZip = JSZipClass || (await import('jszip')).default;
  const zip = new JSZip();
  const files = [];
  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i];
    if (onProgress) onProgress(i, jobs.length, job.label);
    const result = await render(job.parameters);
    const data = result?.data ?? result;
    if (!data) {
      // Not swallowed: a set with a part missing is not the set, and the
      // person has to know WHICH part, so the message names it.
      throw new Error(
        `${job.label} did not render, so the set is not complete.`
      );
    }
    zip.file(job.filename, data);
    files.push(job.filename);
  }
  zip.file('paint-order.txt', paintOrderText(colourNames, designName));
  files.push('paint-order.txt');
  if (onProgress) onProgress(jobs.length, jobs.length, null);
  const blob = await zip.generateAsync({ type: 'blob' });
  return {
    blob,
    filename: `${sanitizeFilename(designName || 'stencil')}-plates.zip`,
    files,
  };
}

/**
 * What to say while it is happening, in one place.
 *
 * STRINGS: owner review pending (DP-R2 text pack). The count is spoken every
 * time because a person who cannot see the progress bar has only the sentence.
 */
export const EXPORT_STRINGS = Object.freeze({
  start: (n) => `Exporting ${n} parts. This renders each one in turn.`,
  step: (done, total, label) => `${label}. Part ${done + 1} of ${total}.`,
  done: (n, filename) => `Exported ${n} files as ${filename}.`,
  failed: (reason) => `The export stopped. ${reason}`,
  button: 'Export all plates',
  busy: 'Exporting...',
});
