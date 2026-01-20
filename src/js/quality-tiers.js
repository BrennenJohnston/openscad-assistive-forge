/**
 * Adaptive Quality Tier System
 * Automatically selects quality presets based on file complexity and hardware
 * @license GPL-3.0-or-later
 */

/**
 * Complexity tiers for OpenSCAD models
 */
export const COMPLEXITY_TIER = {
  BEGINNER: 'beginner', // Simple models (simple-box level)
  STANDARD: 'standard', // Typical models (community standards)
  COMPLEX: 'complex', // Many curved features (braille-embosser level)
};

/**
 * Quality presets organized by complexity tier
 * Each tier has preview and export quality levels (low, medium, high)
 *
 * Triangle count estimates are approximate and vary by model geometry.
 */
export const QUALITY_TIERS = {
  /**
   * BEGINNER tier - For simple models with few curved features
   * Optimized for: cubes, simple boxes, basic shapes with minimal curves
   * Example: simple_box.scad (4 corner cylinders, basic ventilation holes)
   *
   * These models can handle higher $fn without performance issues.
   */
  [COMPLEXITY_TIER.BEGINNER]: {
    name: 'Beginner',
    description: 'Simple models with few curved features',
    preview: {
      low: {
        name: 'beginner-preview-low',
        maxFn: 24,
        forceFn: false,
        minFa: 15,
        minFs: 3,
        timeoutMs: 15000,
      },
      medium: {
        name: 'beginner-preview-medium',
        maxFn: 32,
        forceFn: false,
        minFa: 12,
        minFs: 2,
        timeoutMs: 20000,
      },
      high: {
        name: 'beginner-preview-high',
        maxFn: 48,
        forceFn: false,
        minFa: 8,
        minFs: 1.5,
        timeoutMs: 30000,
      },
    },
    export: {
      low: {
        name: 'beginner-export-low',
        maxFn: 32,
        forceFn: false,
        minFa: 12,
        minFs: 2,
        timeoutMs: 30000,
        // ~500-2K triangles for simple box
      },
      medium: {
        name: 'beginner-export-medium',
        maxFn: 64,
        forceFn: false,
        minFa: 6,
        minFs: 1,
        timeoutMs: 45000,
        // ~2K-5K triangles for simple box
      },
      high: {
        name: 'beginner-export-high',
        maxFn: 128,
        forceFn: false,
        minFa: 3,
        minFs: 0.5,
        timeoutMs: 60000,
        // ~5K-15K triangles for simple box
      },
    },
  },

  /**
   * STANDARD tier - Community standard for typical OpenSCAD models
   * Optimized for: gear sets, enclosures, mechanical parts, decorative items
   *
   * Based on community-recommended $fn values from OpenSCAD forums/docs:
   * - Low/Draft: $fn=20-32 preview, $fn=64 render
   * - Medium: $fn=50-80 preview, $fn=128 render
   * - High: $fn=100 preview, $fn=256 render
   */
  [COMPLEXITY_TIER.STANDARD]: {
    name: 'Standard',
    description: 'Typical models with moderate complexity',
    preview: {
      low: {
        name: 'standard-preview-low',
        maxFn: 24,
        forceFn: true, // Force for consistent preview
        minFa: 15,
        minFs: 3,
        timeoutMs: 20000,
      },
      medium: {
        name: 'standard-preview-medium',
        maxFn: 48,
        forceFn: false,
        minFa: 12,
        minFs: 2,
        timeoutMs: 30000,
      },
      high: {
        name: 'standard-preview-high',
        maxFn: 80,
        forceFn: false,
        minFa: 6,
        minFs: 1,
        timeoutMs: 45000,
      },
    },
    export: {
      low: {
        name: 'standard-export-low',
        maxFn: 64,
        forceFn: false,
        minFa: 12,
        minFs: 2,
        timeoutMs: 45000,
        // Community low standard
      },
      medium: {
        name: 'standard-export-medium',
        maxFn: 128,
        forceFn: false,
        minFa: 6,
        minFs: 1,
        timeoutMs: 60000,
        // Community medium standard
      },
      high: {
        name: 'standard-export-high',
        maxFn: 256,
        forceFn: false,
        minFa: 2,
        minFs: 0.5,
        timeoutMs: 90000,
        // Community high standard
      },
    },
  },

  /**
   * COMPLEX tier - For models with many small curved features
   * Optimized for: braille embossers, perforated patterns, organic shapes,
   *                models with 100+ spheres/cylinders
   *
   * Based on braille_embosser.scad which has 264+ small curved dots.
   * Using community standards here would produce 500K+ triangles.
   * These conservative values keep STL size manageable.
   */
  [COMPLEXITY_TIER.COMPLEX]: {
    name: 'Complex',
    description: 'Models with many small curved features',
    preview: {
      low: {
        name: 'complex-preview-low',
        maxFn: 8,
        forceFn: true, // Force low for responsiveness
        minFa: 30,
        minFs: 5,
        timeoutMs: 20000,
        // Very coarse for quick feedback
      },
      medium: {
        name: 'complex-preview-medium',
        maxFn: 12,
        forceFn: true,
        minFa: 24,
        minFs: 4,
        timeoutMs: 30000,
      },
      high: {
        name: 'complex-preview-high',
        maxFn: 16,
        forceFn: false,
        minFa: 18,
        minFs: 3,
        timeoutMs: 45000,
      },
    },
    export: {
      low: {
        name: 'complex-export-low',
        maxFn: 12,
        forceFn: false,
        minFa: 24,
        minFs: 4,
        timeoutMs: 45000,
        // ~22K triangles for braille embosser, ~1 MB STL
      },
      medium: {
        name: 'complex-export-medium',
        maxFn: 16,
        forceFn: false,
        minFa: 18,
        minFs: 3,
        timeoutMs: 60000,
        // ~35K triangles for braille embosser, ~1.7 MB STL
      },
      high: {
        name: 'complex-export-high',
        maxFn: 24,
        forceFn: false,
        minFa: 12,
        minFs: 2,
        timeoutMs: 90000,
        // ~80K triangles for braille embosser, ~4 MB STL
      },
    },
  },
};

/**
 * Hardware capability levels
 */
export const HARDWARE_LEVEL = {
  LOW: 'low', // Mobile, low-end devices
  MEDIUM: 'medium', // Average laptop/desktop
  HIGH: 'high', // High-end workstation
};

/**
 * Detect hardware capabilities
 * @returns {Object} Hardware info { level, cores, memory, isMobile }
 */
export function detectHardware() {
  const cores = navigator.hardwareConcurrency || 2;
  const isMobile =
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent
    );

  // Estimate available memory (not always accurate)
  let memoryGB = 4; // Default assumption
  if (navigator.deviceMemory) {
    memoryGB = navigator.deviceMemory;
  }

  // Determine hardware level
  let level;
  if (isMobile || cores <= 2 || memoryGB <= 2) {
    level = HARDWARE_LEVEL.LOW;
  } else if (cores >= 8 && memoryGB >= 16) {
    level = HARDWARE_LEVEL.HIGH;
  } else {
    level = HARDWARE_LEVEL.MEDIUM;
  }

  return {
    level,
    cores,
    memoryGB,
    isMobile,
  };
}

/**
 * Analyze SCAD content to determine complexity tier
 * @param {string} scadContent - OpenSCAD source code
 * @param {Object} parameters - Current parameter values (optional)
 * @returns {Object} Complexity analysis { tier, score, details, warnings }
 */
export function analyzeComplexity(scadContent, parameters = {}) {
  if (!scadContent) {
    return {
      tier: COMPLEXITY_TIER.BEGINNER,
      score: 0,
      details: {},
      warnings: [],
    };
  }

  const warnings = [];

  // Count operations that affect complexity
  const counts = {
    // Curved primitives (each generates many triangles)
    spheres: (scadContent.match(/sphere\s*\(/g) || []).length,
    cylinders: (scadContent.match(/cylinder\s*\(/g) || []).length,
    circles: (scadContent.match(/circle\s*\(/g) || []).length,

    // Loops that multiply curved features
    forLoops: (scadContent.match(/for\s*\(/g) || []).length,

    // Expensive operations
    hulls: (scadContent.match(/hull\s*\(/g) || []).length,
    minkowskis: (scadContent.match(/minkowski\s*\(/g) || []).length,
    intersections: (scadContent.match(/intersection\s*\(/g) || []).length,
    differences: (scadContent.match(/difference\s*\(/g) || []).length,

    // Extrusions
    linearExtrudes: (scadContent.match(/linear_extrude\s*\(/g) || []).length,
    rotateExtrudes: (scadContent.match(/rotate_extrude\s*\(/g) || []).length,

    // Text (can generate many triangles)
    textCalls: (scadContent.match(/text\s*\(/g) || []).length,
  };

  // Estimate curved feature count (spheres and cylinders in loops multiply)
  const loopMultiplier = Math.max(1, counts.forLoops * 3); // Estimate 3x per loop level
  const estimatedCurvedFeatures =
    (counts.spheres + counts.cylinders + counts.circles) * loopMultiplier;

  // Calculate complexity score
  let score = 0;

  // Curved features are the main driver
  score += estimatedCurvedFeatures * 10;

  // Expensive operations
  score += counts.hulls * 30;
  score += counts.minkowskis * 50;
  score += counts.intersections * 20;
  score += counts.differences * 15;

  // Extrusions
  score += counts.linearExtrudes * 8;
  score += counts.rotateExtrudes * 12;

  // Text
  score += counts.textCalls * 25;

  // Check for high $fn in parameters
  const fn = parameters.$fn || parameters.fn;
  if (fn !== undefined && fn > 64) {
    score += fn * 0.5;
    warnings.push(`High $fn value (${fn}) detected`);
  }

  // Determine tier based on score and curved feature count
  let tier;

  if (estimatedCurvedFeatures >= 50 || score >= 500) {
    tier = COMPLEXITY_TIER.COMPLEX;
    if (estimatedCurvedFeatures >= 100) {
      warnings.push(
        `Model has ~${estimatedCurvedFeatures} curved features - using conservative quality settings`
      );
    }
  } else if (estimatedCurvedFeatures >= 10 || score >= 100) {
    tier = COMPLEXITY_TIER.STANDARD;
  } else {
    tier = COMPLEXITY_TIER.BEGINNER;
  }

  // Detect specific patterns
  if (counts.minkowskis > 0) {
    warnings.push(
      `${counts.minkowskis} minkowski() operations - these are very expensive`
    );
  }
  if (counts.spheres > 20) {
    warnings.push(`${counts.spheres} spheres detected - may produce large STL`);
  }

  return {
    tier,
    score,
    estimatedCurvedFeatures,
    details: counts,
    warnings,
  };
}

/**
 * Get recommended quality preset based on complexity and hardware
 * @param {string} tier - Complexity tier (COMPLEXITY_TIER value)
 * @param {string} hardwareLevel - Hardware level (HARDWARE_LEVEL value)
 * @param {string} qualityLevel - Desired quality (low, medium, high)
 * @param {string} mode - preview or export
 * @returns {Object} Quality preset
 */
export function getQualityPreset(
  tier,
  hardwareLevel,
  qualityLevel = 'medium',
  mode = 'preview'
) {
  const tierConfig =
    QUALITY_TIERS[tier] || QUALITY_TIERS[COMPLEXITY_TIER.STANDARD];
  const modePresets = tierConfig[mode] || tierConfig.preview;

  // Adjust quality level based on hardware
  let effectiveLevel = qualityLevel;

  if (hardwareLevel === HARDWARE_LEVEL.LOW) {
    // Downgrade quality on low-end hardware
    if (qualityLevel === 'high') effectiveLevel = 'medium';
    if (qualityLevel === 'medium' && tier === COMPLEXITY_TIER.COMPLEX)
      effectiveLevel = 'low';
  } else if (hardwareLevel === HARDWARE_LEVEL.HIGH && mode === 'export') {
    // High-end hardware can handle better export quality
    // But don't upgrade automatically - let user choose
  }

  return modePresets[effectiveLevel] || modePresets.medium;
}

/**
 * Get adaptive quality configuration for a model
 * @param {string} scadContent - OpenSCAD source code
 * @param {Object} parameters - Current parameter values
 * @returns {Object} Adaptive config { tier, hardware, previewQuality, exportQuality, analysis }
 */
export function getAdaptiveQualityConfig(scadContent, parameters = {}) {
  const hardware = detectHardware();
  const analysis = analyzeComplexity(scadContent, parameters);

  // Determine default quality levels based on hardware
  let defaultPreviewLevel = 'medium';
  let defaultExportLevel = 'medium';

  if (hardware.level === HARDWARE_LEVEL.LOW) {
    defaultPreviewLevel = 'low';
    defaultExportLevel = 'low';
  } else if (hardware.level === HARDWARE_LEVEL.HIGH) {
    defaultPreviewLevel = 'medium';
    defaultExportLevel = 'high';
  }

  // For complex models, be more conservative
  if (analysis.tier === COMPLEXITY_TIER.COMPLEX) {
    if (defaultPreviewLevel === 'high') defaultPreviewLevel = 'medium';
    if (defaultExportLevel === 'high') defaultExportLevel = 'medium';
  }

  return {
    tier: analysis.tier,
    tierName: QUALITY_TIERS[analysis.tier].name,
    tierDescription: QUALITY_TIERS[analysis.tier].description,
    hardware,
    defaultPreviewLevel,
    defaultExportLevel,
    previewQuality: getQualityPreset(
      analysis.tier,
      hardware.level,
      defaultPreviewLevel,
      'preview'
    ),
    exportQuality: getQualityPreset(
      analysis.tier,
      hardware.level,
      defaultExportLevel,
      'export'
    ),
    analysis,
  };
}

/**
 * Get all available quality presets for a tier
 * @param {string} tier - Complexity tier
 * @returns {Object} { preview: {low, medium, high}, export: {low, medium, high} }
 */
export function getTierPresets(tier) {
  return QUALITY_TIERS[tier] || QUALITY_TIERS[COMPLEXITY_TIER.STANDARD];
}

/**
 * Format quality preset for display
 * @param {Object} preset - Quality preset
 * @returns {string} Human-readable description
 */
export function formatPresetDescription(preset) {
  if (!preset) return 'Unknown';

  const fnInfo = preset.maxFn ? `$fn≤${preset.maxFn}` : '$fn=model';
  const faInfo = preset.minFa ? `$fa≥${preset.minFa}°` : '';
  const fsInfo = preset.minFs ? `$fs≥${preset.minFs}mm` : '';

  return [fnInfo, faInfo, fsInfo].filter(Boolean).join(', ');
}
