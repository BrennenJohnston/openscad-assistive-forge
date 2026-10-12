/**
 * Help > Library info: the OpenSCAD libraries that come with this app, each
 * with its license, the date of the copy bundled, and whether it is on now.
 * Desktop OpenSCAD's dialog lists library folders; a browser has none, so
 * this keeps the part that still means something here.
 *
 * @license GPL-3.0-or-later
 */

import { createModal } from './modal-manager.js';
import { escapeHtml } from './html-utils.js';
import {
  LIBRARY_DEFINITIONS,
  libraryManager as defaultLibraryManager,
} from './library-manager.js';

/**
 * Open the Library Info dialog.
 * @param {Object} [manager] - Anything with `getManifest()` and `isEnabled(id)`
 * @returns {Promise<string|null>} Resolves when the dialog closes
 */
export async function showLibraryInfoDialog(manager = defaultLibraryManager) {
  const manifest = await manager.getManifest();
  const rows = Object.values(LIBRARY_DEFINITIONS)
    .map((lib) => {
      const bundled = manifest?.libraries?.[lib.id];
      return `<tr>
          <th scope="row">${escapeHtml(lib.name)}</th>
          <td>${escapeHtml(bundled?.license || lib.license)}</td>
          <td>${escapeHtml(bundled?.date || 'Not recorded')}</td>
          <td>${manager.isEnabled(lib.id) ? 'Yes' : 'No'}</td>
        </tr>`;
    })
    .join('');

  const { modal, promise } = createModal({
    className: 'preset-modal library-info-modal',
    titleId: 'libraryInfoTitle',
    title: 'Library Info',
    content: `
      <p id="libraryInfoIntro" class="library-info-intro">
        The OpenSCAD libraries that come with this app. Turn one on or off in
        the Customizer's Libraries section.
      </p>
      <div class="library-info-scroll">
        <table class="library-info-table">
          <thead>
            <tr>
              <th scope="col">Library</th>
              <th scope="col">License</th>
              <th scope="col">Bundled copy from</th>
              <th scope="col">On now</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`,
    buttons: [
      { label: 'Close', className: 'btn btn-primary', action: 'close' },
    ],
  });
  modal.setAttribute('aria-describedby', 'libraryInfoIntro');
  return promise;
}
