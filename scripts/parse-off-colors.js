#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

// 148 CSS named colors — RGB values (case-insensitive lookup)
const CSS_NAMED_COLORS = {
  '240,248,255': 'AliceBlue', '250,235,215': 'AntiqueWhite', '0,255,255': 'Aqua',
  '127,255,212': 'Aquamarine', '240,255,255': 'Azure', '245,245,220': 'Beige',
  '255,228,196': 'Bisque', '0,0,0': 'Black', '255,235,205': 'BlanchedAlmond',
  '0,0,255': 'Blue', '138,43,226': 'BlueViolet', '165,42,42': 'Brown',
  '222,184,135': 'BurlyWood', '95,158,160': 'CadetBlue', '127,255,0': 'Chartreuse',
  '210,105,30': 'Chocolate', '255,127,80': 'Coral', '100,149,237': 'CornflowerBlue',
  '255,248,220': 'Cornsilk', '220,20,60': 'Crimson', '0,255,255': 'Cyan',
  '0,0,139': 'DarkBlue', '0,139,139': 'DarkCyan', '184,134,11': 'DarkGoldenRod',
  '169,169,169': 'DarkGray', '0,100,0': 'DarkGreen', '189,183,107': 'DarkKhaki',
  '139,0,139': 'DarkMagenta', '85,107,47': 'DarkOliveGreen', '255,140,0': 'DarkOrange',
  '153,50,204': 'DarkOrchid', '139,0,0': 'DarkRed', '233,150,122': 'DarkSalmon',
  '143,188,143': 'DarkSeaGreen', '72,61,139': 'DarkSlateBlue', '47,79,79': 'DarkSlateGray',
  '0,206,209': 'DarkTurquoise', '148,0,211': 'DarkViolet', '255,20,147': 'DeepPink',
  '0,191,255': 'DeepSkyBlue', '105,105,105': 'DimGray', '30,144,255': 'DodgerBlue',
  '178,34,34': 'FireBrick', '255,250,240': 'FloralWhite', '34,139,34': 'ForestGreen',
  '255,0,255': 'Fuchsia', '220,220,220': 'Gainsboro', '248,248,255': 'GhostWhite',
  '255,215,0': 'Gold', '218,165,32': 'GoldenRod', '128,128,128': 'Gray',
  '0,128,0': 'Green', '173,255,47': 'GreenYellow', '240,255,240': 'HoneyDew',
  '255,105,180': 'HotPink', '205,92,92': 'IndianRed', '75,0,130': 'Indigo',
  '255,255,240': 'Ivory', '240,230,140': 'Khaki', '230,230,250': 'Lavender',
  '255,240,245': 'LavenderBlush', '124,252,0': 'LawnGreen', '255,250,205': 'LemonChiffon',
  '173,216,230': 'LightBlue', '240,128,128': 'LightCoral', '224,255,255': 'LightCyan',
  '250,250,210': 'LightGoldenRodYellow', '211,211,211': 'LightGray',
  '144,238,144': 'LightGreen', '255,182,193': 'LightPink', '255,160,122': 'LightSalmon',
  '32,178,170': 'LightSeaGreen', '135,206,250': 'LightSkyBlue',
  '119,136,153': 'LightSlateGray', '176,196,222': 'LightSteelBlue',
  '255,255,224': 'LightYellow', '0,255,0': 'Lime', '50,205,50': 'LimeGreen',
  '250,240,230': 'Linen', '255,0,255': 'Magenta', '128,0,0': 'Maroon',
  '102,205,170': 'MediumAquaMarine', '0,0,205': 'MediumBlue',
  '186,85,211': 'MediumOrchid', '147,112,219': 'MediumPurple',
  '60,179,113': 'MediumSeaGreen', '123,104,238': 'MediumSlateBlue',
  '0,250,154': 'MediumSpringGreen', '72,209,204': 'MediumTurquoise',
  '199,21,133': 'MediumVioletRed', '25,25,112': 'MidnightBlue',
  '245,255,250': 'MintCream', '255,228,225': 'MistyRose', '255,228,181': 'Moccasin',
  '255,222,173': 'NavajoWhite', '0,0,128': 'Navy', '253,245,230': 'OldLace',
  '128,128,0': 'Olive', '107,142,35': 'OliveDrab', '255,165,0': 'Orange',
  '255,69,0': 'OrangeRed', '218,112,214': 'Orchid', '238,232,170': 'PaleGoldenRod',
  '152,251,152': 'PaleGreen', '175,238,238': 'PaleTurquoise',
  '219,112,147': 'PaleVioletRed', '255,239,213': 'PapayaWhip',
  '255,218,185': 'PeachPuff', '205,133,63': 'Peru', '255,192,203': 'Pink',
  '221,160,221': 'Plum', '176,224,230': 'PowderBlue', '128,0,128': 'Purple',
  '102,51,153': 'RebeccaPurple', '255,0,0': 'Red', '188,143,143': 'RosyBrown',
  '65,105,225': 'RoyalBlue', '139,69,19': 'SaddleBrown', '250,128,114': 'Salmon',
  '244,164,96': 'SandyBrown', '46,139,87': 'SeaGreen', '255,245,238': 'SeaShell',
  '160,82,45': 'Sienna', '192,192,192': 'Silver', '135,206,235': 'SkyBlue',
  '106,90,205': 'SlateBlue', '112,128,144': 'SlateGray', '255,250,250': 'Snow',
  '0,255,127': 'SpringGreen', '70,130,180': 'SteelBlue', '210,180,140': 'Tan',
  '0,128,128': 'Teal', '216,191,216': 'Thistle', '255,99,71': 'Tomato',
  '64,224,208': 'Turquoise', '238,130,238': 'Violet', '245,222,179': 'Wheat',
  '255,255,255': 'White', '245,245,245': 'WhiteSmoke', '255,255,0': 'Yellow',
  '154,205,50': 'YellowGreen'
};

function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(c => c.toString(16).padStart(2, '0').toUpperCase()).join('');
}

function lookupCssName(r, g, b) {
  return CSS_NAMED_COLORS[`${r},${g},${b}`] || null;
}

function normalizeColorValue(val) {
  const n = parseFloat(val);
  if (isNaN(n)) return null;
  if (n >= 0 && n <= 1.0 && val.includes('.')) {
    return Math.round(n * 255);
  }
  return Math.round(n);
}

function parseOffFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split(/\r?\n/);

  let lineIdx = 0;
  const nextNonCommentLine = () => {
    while (lineIdx < lines.length) {
      const line = lines[lineIdx].trim();
      lineIdx++;
      if (line === '' || line.startsWith('#')) continue;
      return line;
    }
    return null;
  };

  const headerLine = nextNonCommentLine();
  if (!headerLine) {
    throw new Error('Empty or invalid OFF file: no header found');
  }

  let isCoff = false;
  let countsLine;

  if (/^C?OFF\b/i.test(headerLine)) {
    isCoff = headerLine.toUpperCase().startsWith('COFF');
    const headerRemainder = headerLine.replace(/^C?OFF\s*/i, '').trim();
    if (headerRemainder) {
      countsLine = headerRemainder;
    } else {
      countsLine = nextNonCommentLine();
    }
  } else {
    countsLine = headerLine;
  }

  if (!countsLine) {
    throw new Error('Invalid OFF file: missing vertex/face/edge counts');
  }

  const counts = countsLine.split(/\s+/).map(Number);
  if (counts.length < 3 || counts.some(isNaN)) {
    throw new Error(`Invalid OFF counts line: "${countsLine}"`);
  }

  const [numVertices, numFaces] = counts;

  for (let i = 0; i < numVertices; i++) {
    const vLine = nextNonCommentLine();
    if (vLine === null) {
      throw new Error(`Unexpected EOF reading vertex ${i + 1} of ${numVertices}`);
    }
  }

  const colorMap = new Map();
  let hasAnyColor = false;

  for (let i = 0; i < numFaces; i++) {
    const fLine = nextNonCommentLine();
    if (fLine === null) {
      throw new Error(`Unexpected EOF reading face ${i + 1} of ${numFaces}`);
    }

    const parts = fLine.split(/\s+/);
    const n = parseInt(parts[0], 10);
    if (isNaN(n)) {
      throw new Error(`Invalid face line ${i + 1}: "${fLine}"`);
    }

    const colorStartIdx = 1 + n;
    const colorParts = parts.slice(colorStartIdx);

    if (colorParts.length >= 3) {
      hasAnyColor = true;
      const r = normalizeColorValue(colorParts[0]);
      const g = normalizeColorValue(colorParts[1]);
      const b = normalizeColorValue(colorParts[2]);

      if (r !== null && g !== null && b !== null) {
        const key = `${r},${g},${b}`;
        const existing = colorMap.get(key);
        if (existing) {
          existing.face_count++;
        } else {
          colorMap.set(key, {
            rgb: [r, g, b],
            hex: rgbToHex(r, g, b),
            css_name: lookupCssName(r, g, b),
            face_count: 1
          });
        }
      }
    }
  }

  if (hasAnyColor) isCoff = true;

  const uniqueColors = Array.from(colorMap.values())
    .sort((a, b) => b.face_count - a.face_count);

  return {
    file: filePath,
    is_coff: isCoff,
    total_faces: numFaces,
    unique_colors: uniqueColors
  };
}

function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.error('Usage: node parse-off-colors.js <path-to-off-file>');
    console.error('Reads an OFF/COFF file and extracts the unique per-face color palette as JSON.');
    process.exit(args.includes('--help') || args.includes('-h') ? 0 : 1);
  }

  const filePath = args[0];

  if (!fs.existsSync(filePath)) {
    console.error(`Error: File not found: ${filePath}`);
    process.exit(1);
  }

  try {
    const result = parseOffFile(filePath);
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error(`Error parsing OFF file: ${err.message}`);
    process.exit(1);
  }
}

main();
