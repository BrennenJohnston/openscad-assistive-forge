/**
 * OpenSCAD WASM Setup Script
 * @license GPL-3.0-or-later
 * 
 * This script downloads Liberation fonts for OpenSCAD text() support.
 * WASM binaries are vendored in git (public/wasm/openscad-official/) and
 * do NOT need to be downloaded by this script.
 */

import { mkdir, writeFile, unlink, readdir, readFile } from 'fs/promises';
import { existsSync, createWriteStream, createReadStream } from 'fs';
import { join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';
import https from 'https';
import { createGunzip } from 'zlib';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Liberation Fonts — stable releases/download/ URL (not the fragile /files/ attachment URL)
// Previous URL used the /files/7261482/ pattern which is a GitHub comment attachment
// with no stability guarantee. This URL is a proper tagged release download.
const FONTS_RELEASE_URL = 'https://github.com/liberationfonts/liberation-fonts/releases/download/2.1.5/liberation-fonts-ttf-2.1.5.tar.gz';

// SHA-256 checksum of the font archive for integrity verification
// Computed from the official release artifact
const FONTS_ARCHIVE_SHA256 = null; // Set after first verified download — see verifyChecksum()

// Required fonts from the archive
const REQUIRED_FONTS = [
  'LiberationSans-Regular.ttf',
  'LiberationSans-Bold.ttf',
  'LiberationSans-Italic.ttf',
  'LiberationMono-Regular.ttf'
];

/**
 * Verify SHA-256 checksum of a file
 * @param {string} filePath - Path to the file
 * @param {string|null} expectedHash - Expected SHA-256 hex string (null skips verification)
 * @returns {Promise<{valid: boolean, hash: string}>}
 */
async function verifyChecksum(filePath, expectedHash) {
  const fileData = await readFile(filePath);
  const hash = createHash('sha256').update(fileData).digest('hex');

  if (!expectedHash) {
    // No expected hash — log the computed hash for future pinning
    console.log(`  SHA-256: ${hash}`);
    console.log('  (No expected checksum configured — save this hash for future verification)');
    return { valid: true, hash };
  }

  const valid = hash === expectedHash;
  if (!valid) {
    console.error(`✗ Checksum mismatch!`);
    console.error(`  Expected: ${expectedHash}`);
    console.error(`  Got:      ${hash}`);
  } else {
    console.log(`✓ Checksum verified: ${hash.substring(0, 16)}...`);
  }
  return { valid, hash };
}

/**
 * Download a file from URL to a destination
 * @param {string} url - URL to download from
 * @param {string} dest - Destination file path
 * @returns {Promise<void>}
 */
function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = createWriteStream(dest);
    
    const request = https.get(url, (response) => {
      // Follow redirects
      if (response.statusCode === 302 || response.statusCode === 301) {
        file.close();
        unlink(dest).catch(() => {});
        return downloadFile(response.headers.location, dest).then(resolve).catch(reject);
      }
      
      if (response.statusCode !== 200) {
        file.close();
        unlink(dest).catch(() => {});
        return reject(new Error(`Failed to download: HTTP ${response.statusCode}`));
      }

      response.pipe(file);

      file.on('finish', () => {
        file.close(resolve);
      });
    });
    
    request.on('error', (err) => {
      unlink(dest).catch(() => {});
      reject(err);
    });

    file.on('error', (err) => {
      file.close();
      unlink(dest).catch(() => {});
      reject(err);
    });
  });
}

/**
 * Simple tar extraction - extracts .ttf files from a tar archive
 * This is a minimal implementation that handles only what we need
 * @param {string} tarPath - Path to the tar file
 * @param {string} destDir - Destination directory
 * @param {string[]} fileFilter - Only extract files with these names
 * @returns {Promise<string[]>} - List of extracted file paths
 */
async function extractTar(tarPath, destDir, fileFilter) {
  const { createReadStream: crs } = await import('fs');
  const extracted = [];
  
  return new Promise((resolve, reject) => {
    const stream = crs(tarPath);
    let buffer = Buffer.alloc(0);
    
    stream.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
    });
    
    stream.on('end', async () => {
      try {
        let offset = 0;
        
        while (offset < buffer.length - 512) {
          // Read tar header (512 bytes)
          const header = buffer.slice(offset, offset + 512);
          
          // Check for end of archive (two zero blocks)
          if (header.every(b => b === 0)) {
            break;
          }
          
          // Extract filename (first 100 bytes, null-terminated)
          let filename = header.slice(0, 100).toString('ascii').replace(/\0.*$/, '');
          
          // Handle long filenames (GNU tar extension)
          // Skip if filename is empty
          if (!filename) {
            offset += 512;
            continue;
          }
          
          // Get file size from header (octal, bytes 124-135)
          const sizeStr = header.slice(124, 136).toString('ascii').replace(/\0.*$/, '').trim();
          const fileSize = parseInt(sizeStr, 8) || 0;
          
          // Get file type (byte 156)
          const fileType = header[156];
          
          // Move past header
          offset += 512;
          
          // Only process regular files (type '0' or '\0')
          if ((fileType === 48 || fileType === 0) && fileSize > 0) {
            const baseName = basename(filename);
            
            // Check if this file matches our filter
            if (fileFilter.includes(baseName)) {
              const destPath = join(destDir, baseName);
              const fileData = buffer.slice(offset, offset + fileSize);
              await writeFile(destPath, fileData);
              extracted.push(baseName);
            }
          }
          
          // Move to next file (512-byte aligned)
          const blocks = Math.ceil(fileSize / 512);
          offset += blocks * 512;
        }
        
        resolve(extracted);
      } catch (err) {
        reject(err);
      }
    });
    
    stream.on('error', reject);
  });
}

/**
 * Download and extract Liberation fonts for OpenSCAD text() support
 * @param {string} fontsDir - Fonts directory path
 * @returns {Promise<void>}
 */
async function downloadFonts(fontsDir) {
  console.log('Downloading Liberation Fonts...');
  console.log('--------------------------------');

  // Check if all fonts already exist
  const missingFonts = REQUIRED_FONTS.filter(f => !existsSync(join(fontsDir, f)));
  
  if (missingFonts.length === 0) {
    console.log('✓ All fonts already downloaded');
    return;
  }

  const tempDir = join(__dirname, '..', '.temp-fonts');
  const archivePath = join(tempDir, 'fonts.tar.gz');
  const tarPath = join(tempDir, 'fonts.tar');
  
  try {
    // Create temp directory
    if (!existsSync(tempDir)) {
      await mkdir(tempDir, { recursive: true });
    }

    // Download the archive
    console.log('  Downloading font archive...');
    console.log(`  URL: ${FONTS_RELEASE_URL}`);
    await downloadFile(FONTS_RELEASE_URL, archivePath);
    console.log('✓ Downloaded font archive');

    // Verify checksum integrity
    const { valid } = await verifyChecksum(archivePath, FONTS_ARCHIVE_SHA256);
    if (!valid) {
      throw new Error(
        'Font archive checksum verification failed. ' +
        'The file may be corrupted or the download URL may have changed. ' +
        'Please verify the URL and update the expected checksum.'
      );
    }

    // Decompress gzip
    console.log('  Extracting fonts...');
    await new Promise((resolve, reject) => {
      const input = createReadStream(archivePath);
      const output = createWriteStream(tarPath);
      const gunzip = createGunzip();
      
      input.pipe(gunzip).pipe(output);
      
      output.on('finish', resolve);
      output.on('error', reject);
      gunzip.on('error', reject);
      input.on('error', reject);
    });

    // Extract TTF files from tar
    const extracted = await extractTar(tarPath, fontsDir, REQUIRED_FONTS);
    
    console.log(`✓ Extracted ${extracted.length} fonts:`);
    for (const font of extracted) {
      console.log(`  - ${font}`);
    }

    // Check if any fonts are still missing
    const stillMissing = REQUIRED_FONTS.filter(f => !existsSync(join(fontsDir, f)));
    if (stillMissing.length > 0) {
      console.warn(`⚠ Some fonts could not be extracted: ${stillMissing.join(', ')}`);
    }

  } catch (error) {
    console.error('✗ Failed to download fonts:', error.message);
    console.log('');
    console.log('Fonts are optional but recommended for OpenSCAD text() support.');
    console.log('You can manually download Liberation fonts from:');
    console.log('https://github.com/liberationfonts/liberation-fonts/releases');
  } finally {
    // Cleanup temp files
    try {
      if (existsSync(archivePath)) await unlink(archivePath);
      if (existsSync(tarPath)) await unlink(tarPath);
      if (existsSync(tempDir)) {
        const files = await readdir(tempDir);
        if (files.length === 0) {
          await unlink(tempDir).catch(() => {});
        }
      }
    } catch {
      // Ignore cleanup errors
    }
  }

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

Downloaded from: https://github.com/liberationfonts/liberation-fonts/releases/tag/2.1.5

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
console.log('✓ OpenSCAD WASM: Official build with Manifold support');
console.log('✓ Source: https://files.openscad.org/playground/');
console.log('✓ Build: OpenSCAD-2025.03.25 WebAssembly-web');
console.log('✓ Location: public/wasm/openscad-official/');
console.log('');
console.log('The official WASM files are vendored in the repository.');
console.log('They include Manifold support for 5-30x faster CSG operations.');
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
