/**
 * OpenSCAD WASM Setup Script
 * @license GPL-3.0-or-later
 * 
 * This script sets up WASM and downloads Liberation fonts for OpenSCAD text() support.
 * We use the 'openscad-wasm-prebuilt' npm package for WASM.
 */

import { mkdir, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import https from 'https';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Liberation Fonts - Required for OpenSCAD text() function
const FONTS_TO_DOWNLOAD = [
  {
    name: 'LiberationSans-Regular.ttf',
    url: 'https://github.com/liberationfonts/liberation-fonts/raw/devel/liberation-fonts-ttf-2.1.5/LiberationSans-Regular.ttf'
  },
  {
    name: 'LiberationSans-Bold.ttf',
    url: 'https://github.com/liberationfonts/liberation-fonts/raw/devel/liberation-fonts-ttf-2.1.5/LiberationSans-Bold.ttf'
  },
  {
    name: 'LiberationSans-Italic.ttf',
    url: 'https://github.com/liberationfonts/liberation-fonts/raw/devel/liberation-fonts-ttf-2.1.5/LiberationSans-Italic.ttf'
  },
  {
    name: 'LiberationMono-Regular.ttf',
    url: 'https://github.com/liberationfonts/liberation-fonts/raw/devel/liberation-fonts-ttf-2.1.5/LiberationMono-Regular.ttf'
  }
];

/**
 * Download a file from URL
 * @param {string} url - URL to download from
 * @param {string} dest - Destination file path
 * @returns {Promise<void>}
 */
function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = require('fs').createWriteStream(dest);
    
    https.get(url, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        // Follow redirect
        file.close();
        require('fs').unlinkSync(dest);
        return downloadFile(response.headers.location, dest).then(resolve).catch(reject);
      }
      
      if (response.statusCode !== 200) {
        file.close();
        require('fs').unlinkSync(dest);
        return reject(new Error(`Failed to download: ${response.statusCode}`));
      }

      response.pipe(file);

      file.on('finish', () => {
        file.close(resolve);
      });
    }).on('error', (err) => {
      require('fs').unlinkSync(dest);
      reject(err);
    });

    file.on('error', (err) => {
      file.close();
      require('fs').unlinkSync(dest);
      reject(err);
    });
  });
}

/**
 * Download Liberation fonts for OpenSCAD text() support
 * @param {string} fontsDir - Fonts directory path
 * @returns {Promise<void>}
 */
async function downloadFonts(fontsDir) {
  console.log('Downloading Liberation Fonts...');
  console.log('--------------------------------');

  let downloaded = 0;
  let skipped = 0;

  for (const font of FONTS_TO_DOWNLOAD) {
    const fontPath = join(fontsDir, font.name);

    if (existsSync(fontPath)) {
      console.log(`✓ ${font.name} already exists`);
      skipped++;
      continue;
    }

    try {
      console.log(`  Downloading ${font.name}...`);
      await downloadFile(font.url, fontPath);
      console.log(`✓ Downloaded ${font.name}`);
      downloaded++;
    } catch (error) {
      console.error(`✗ Failed to download ${font.name}:`, error.message);
    }
  }

  console.log('');
  console.log(`Font download complete: ${downloaded} downloaded, ${skipped} skipped`);
  
  // Create README in fonts directory
  const readmePath = join(fontsDir, 'README.md');
  if (!existsSync(readmePath)) {
    const readmeContent = `# OpenSCAD Fonts

This directory contains Liberation fonts required for OpenSCAD's \`text()\` function.

## Fonts

- **LiberationSans-Regular.ttf** - Default sans-serif font
- **LiberationSans-Bold.ttf** - Bold variant
- **LiberationSans-Italic.ttf** - Italic variant
- **LiberationMono-Regular.ttf** - Monospace font

## License

Liberation Fonts are licensed under the SIL Open Font License 1.1, which is compatible with GPL-3.0-or-later.

## Source

Downloaded from: https://github.com/liberationfonts/liberation-fonts

## Regeneration

Run \`npm run setup-wasm\` to re-download fonts if they are missing.
`;
    await writeFile(readmePath, readmeContent, 'utf8');
    console.log('✓ Created fonts/README.md');
  }
}

console.log('OpenSCAD WASM Setup');
console.log('===================');
console.log('');
console.log('✓ OpenSCAD WASM is now provided via npm package');
console.log('✓ Package: openscad-wasm-prebuilt');
console.log('');
console.log('The WASM files are included in node_modules and');
console.log('will be loaded dynamically by the Web Worker.');
console.log('');

// Create directories and download fonts
async function setup() {
  const publicWasmDir = join(__dirname, '..', 'public', 'wasm');
  const fontsDir = join(__dirname, '..', 'public', 'fonts');

  if (!existsSync(publicWasmDir)) {
    await mkdir(publicWasmDir, { recursive: true });
    console.log('✓ Created public/wasm/ directory');
  }

  if (!existsSync(fontsDir)) {
    await mkdir(fontsDir, { recursive: true });
    console.log('✓ Created public/fonts/ directory');
  }

  console.log('');
  
  // Download fonts
  await downloadFonts(fontsDir);

  console.log('');
  console.log('Setup complete! Run "npm run dev" to start the application.');
}

setup().catch(console.error);
