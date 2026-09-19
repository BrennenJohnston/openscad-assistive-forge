#!/usr/bin/env node
/**
 * Generate placeholder PWA icons for OpenSCAD Assistive Forge
 *
 * This script creates simple colored square PNG icons for PWA support.
 * For production, replace these with properly designed icons.
 *
 * Usage: node scripts/generate-icons.js
 *
 * Note: This requires no external dependencies - uses inline SVG converted to PNG via data URI
 */

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Icon sizes required by manifest.json
const ICON_SIZES = [16, 32, 72, 96, 128, 144, 152, 192, 384, 512];

// Brand colors
const PRIMARY_COLOR = '#0066cc';
const TEXT_COLOR = '#ffffff';

// Icons directory
const ICONS_DIR = join(__dirname, '..', 'public', 'icons');

/**
 * Generate an SVG icon with "OS" text (OpenSCAD)
 */
function generateSVG(size) {
  const fontSize = Math.floor(size * 0.35);
  const strokeWidth = Math.max(1, Math.floor(size / 50));

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="${PRIMARY_COLOR}" rx="${Math.floor(size * 0.1)}"/>
  <text x="50%" y="55%" dominant-baseline="middle" text-anchor="middle" 
        font-family="Arial, sans-serif" font-weight="bold" font-size="${fontSize}px" 
        fill="${TEXT_COLOR}" stroke="${TEXT_COLOR}" stroke-width="${strokeWidth}">OS</text>
  <rect x="${size * 0.1}" y="${size * 0.75}" width="${size * 0.8}" height="${size * 0.08}" 
        fill="${TEXT_COLOR}" opacity="0.3" rx="${size * 0.02}"/>
</svg>`;
}

/**
 * Main function to generate all icons
 */
async function generateIcons() {
  console.log('🎨 Generating PWA placeholder icons...\n');

  // Ensure icons directory exists
  if (!existsSync(ICONS_DIR)) {
    mkdirSync(ICONS_DIR, { recursive: true });
    console.log(`📁 Created directory: ${ICONS_DIR}`);
  }

  // Generate SVG icons (can be used directly or converted to PNG)
  for (const size of ICON_SIZES) {
    const filename = `icon-${size}x${size}.svg`;
    const filepath = join(ICONS_DIR, filename);
    const svg = generateSVG(size);

    writeFileSync(filepath, svg);
    console.log(`  ✅ Generated: ${filename}`);
  }

  console.log('\n📋 Summary:');
  console.log(`   Generated ${ICON_SIZES.length} SVG icons in ${ICONS_DIR}`);
  console.log('\n⚠️  Note: These are SVG placeholders.');
  console.log('   For production, you should:');
  console.log('   1. Design proper PNG icons');
  console.log('   2. Or convert these SVGs to PNG using a tool like:');
  console.log('      - https://convertio.co/svg-png/');
  console.log('      - ImageMagick: convert icon.svg icon.png');
  console.log('      - Inkscape: inkscape icon.svg -o icon.png');
  console.log('\n   To update manifest.json to use SVG icons, change:');
  console.log('   "type": "image/png" → "type": "image/svg+xml"');
  console.log('   ".png" → ".svg" in icon paths\n');
}

// Run
generateIcons().catch(console.error);
