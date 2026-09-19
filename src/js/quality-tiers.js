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
 * MANIFOLD OPTIMIZED: These values have been recalibrated for the Manifold
 * rendering backend, which is 10-100x faster than CGAL for boolean operations.
 * Manifold enables higher $fn values with much shorter timeouts.
 *
 * Triangle count estimates are approximate and vary by model geometry.
 */
export const QUALITY_TIERS = {
  /**
   * BEGINNER tier - For simple models with few curved features
   * Optimized for: cubes, simple boxes, basic shapes with minimal curves
   * Example: simple_box.scad (4 corner cylinders, basic ventilation holes)
   *
   * With Manifold, these models render nearly instantly even at high quality.
   */
  [COMPLEXITY_TIER.BEGINNER]: {
    name: 'Beginner',
    description: 'Simple models with few curved features',
    preview: {
      low: {
        name: 'beginner-preview-low',
        maxFn: 32,
        forceFn: false,
        minFa: 12,
        minFs: 2,
        timeoutMs: 5000, // Reduced from 15s - Manifold is fast
      },
      medium: {
        name: 'beginner-preview-medium',
        maxFn: 48,
        forceFn: false,
        minFa: 8,
        minFs: 1.5,
        timeoutMs: 8000, // Reduced from 20s
      },
      high: {
        name: 'beginner-preview-high',
        maxFn: 64,
        forceFn: false,
        minFa: 6,
        minFs: 1,
        timeoutMs: 15000, // Reduced from 30s
      },
    },
    export: {
      low: {
        name: 'beginner-export-low',
        maxFn: 48,
        forceFn: false,
        minFa: 8,
        minFs: 1.5,
        timeoutMs: 10000, // Reduced from 30s
        // ~1K-3K triangles for simple box
      },
      medium: {
        name: 'beginner-export-medium',
        maxFn: 96,
        forceFn: false,
        minFa: 4,
        minFs: 0.75,
        timeoutMs: 20000, // Reduced from 45s
        // ~3K-8K triangles for simple box
      },
      high: {
        name: 'beginner-export-high',
        maxFn: 192,
        forceFn: false,
        minFa: 2,
        minFs: 0.3,
        timeoutMs: 30000, // Reduced from 60s
        // ~8K-20K triangles for simple box
      },
    },
  },

  /**
   * STANDARD tier - Community standard for typical OpenSCAD models
   * Optimized for: gear sets, enclosures, mechanical parts, decorative items
   *
   * With Manifold, standard models can use native OpenSCAD defaults:
   * - Low/Draft: $fn=32-48 preview, $fn=96 render
   * - Medium: $fn=64-96 preview, $fn=192 render
   * - High: $fn=128 preview, $fn=360 render (smooth circles)
   */
  [COMPLEXITY_TIER.STANDARD]: {
    name: 'Standard',
    description: 'Typical models with moderate complexity',
    preview: {
      low: {
        name: 'standard-preview-low',
        maxFn: 32,
        forceFn: false, // No need to force with Manifold speed
        minFa: 12,
        minFs: 2,
        timeoutMs: 8000, // Reduced from 20s
      },
      medium: {
        name: 'standard-preview-medium',
        maxFn: 64,
        forceFn: false,
        minFa: 8,
        minFs: 1.5,
        timeoutMs: 15000, // Reduced from 30s
      },
      high: {
        name: 'standard-preview-high',
        maxFn: 96,
        forceFn: false,
        minFa: 4,
        minFs: 1,
        timeoutMs: 25000, // Reduced from 45s
      },
    },
    export: {
      low: {
        name: 'standard-export-low',
        maxFn: 96,
        forceFn: false,
        minFa: 8,
        minFs: 1.5,
        timeoutMs: 20000, // Reduced from 45s
        // Good quality with Manifold
      },
      medium: {
        name: 'standard-export-medium',
        maxFn: 192,
        forceFn: false,
        minFa: 4,
        minFs: 0.75,
        timeoutMs: 30000, // Reduced from 60s
        // High quality - matches OpenSCAD defaults
      },
      high: {
        name: 'standard-export-high',
        maxFn: 360,
        forceFn: false,
        minFa: 1,
        minFs: 0.25,
        timeoutMs: 45000, // Reduced from 90s
        // Professional quality - smooth circles
      },
    },
  },

  /**
   * COMPLEX tier - For models with many small curved features
   * Optimized for: braille embossers, perforated patterns, organic shapes,
   *                models with 100+ spheres/cylinders
   *
   * MANIFOLD RECALIBRATED: Previously very conservative due to CGAL slowness.
   * With Manifold, we can significantly increase quality while maintaining
   * reasonable render times. The keyguard (complex model) renders in ~1s.
   *
   * GEOMETRY THRESHOLD ANALYSIS:
   * - $fn determines segments per circle. For a quarter-circle (rounded corner),
   *   segments = $fn/4. Minimum to avoid "right angle" appearance:
   *   - $fn=8: 2 segments/corner = octagonal (borderline angular)
   *   - $fn=10: 2.5 segments/corner = minimum "rounded" appearance
   *   - $fn=12: 3 segments/corner = clearly rounded
   * - Triangle count scales linearly with $fn, so $fn=10 gives ~30% of full quality
   */
  [COMPLEXITY_TIER.COMPLEX]: {
    name: 'Complex',
    description: 'Models with many small curved features',
    preview: {
      low: {
        name: 'complex-preview-low',
        maxFn: 10,
        forceFn: true, // Force for very complex models
        minFa: 36, // 360/10 = 36° per segment
        minFs: 5,
        timeoutMs: 8000,
        // MINIMUM SAFE: ~30% triangles, rounded corners preserved
        // Going below $fn=10 risks corners becoming visually angular
      },
      medium: {
        name: 'complex-preview-medium',
        maxFn: 16,
        forceFn: true,
        minFa: 24,
        minFs: 4,
        timeoutMs: 12000,
        // ~50% triangles, clearly rounded curves
      },
      high: {
        name: 'complex-preview-high',
        maxFn: 24,
        forceFn: false,
        minFa: 18,
        minFs: 3,
        timeoutMs: 18000,
        // ~75% triangles, smooth preview
      },
    },
    export: {
      low: {
        name: 'complex-export-low',
        maxFn: 24,
        forceFn: false,
        minFa: 18,
        minFs: 3,
        timeoutMs: 20000, // Reduced from 45s
        // ~40K triangles for braille embosser
      },
      medium: {
        name: 'complex-export-medium',
        maxFn: 32,
        forceFn: false,
        minFa: 12,
        minFs: 2,
        timeoutMs: 30000, // Reduced from 60s
        // ~80K triangles for braille embosser
      },
      high: {
        name: 'complex-export-high',
        maxFn: 48,
        forceFn: false,
        minFa: 8,
        minFs: 1.5,
        timeoutMs: 45000, // Reduced from 90s
        // ~150K triangles for braille embosser - still manageable
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

    // Expensive boolean operations
    hulls: (scadContent.match(/hull\s*\(/g) || []).length,
    minkowskis: (scadContent.match(/minkowski\s*\(/g) || []).length,
    intersections: (scadContent.match(/intersection\s*\(/g) || []).length,
    differences: (scadContent.match(/difference\s*\(/g) || []).length,

    // Additional expensive operations (keyguards, complex models)
    offsets: (scadContent.match(/offset\s*\(/g) || []).length,
    surfaces: (scadContent.match(/surface\s*\(/g) || []).length,
    polyhedrons: (scadContent.match(/polyhedron\s*\(/g) || []).length,
    imports: (scadContent.match(/import\s*\(/g) || []).length,
    projections: (scadContent.match(/projection\s*\(/g) || []).length,

    // Extrusions
    linearExtrudes: (scadContent.match(/linear_extrude\s*\(/g) || []).length,
    rotateExtrudes: (scadContent.match(/rotate_extrude\s*\(/g) || []).length,

    // Text (can generate many triangles)
    textCalls: (scadContent.match(/text\s*\(/g) || []).length,

    // File size (large files often indicate complex models)
    fileSize: scadContent.length,
  };

  // Estimate curved feature count (spheres and cylinders in loops multiply)
  const loopMultiplier = Math.max(1, counts.forLoops * 3); // Estimate 3x per loop level
  const estimatedCurvedFeatures =
    (counts.spheres + counts.cylinders + counts.circles) * loopMultiplier;

  // Calculate complexity score
  let score = 0;

  // Curved features are the main driver
  score += estimatedCurvedFeatures * 10;

  // Expensive boolean operations - weight more heavily when repeated
  score += counts.hulls * 30;
  score += counts.minkowskis * 50;
  // Multiple intersections/differences are exponentially expensive
  score +=
    counts.intersections > 5
      ? counts.intersections * 30
      : counts.intersections * 20;
  score +=
    counts.differences > 10 ? counts.differences * 20 : counts.differences * 15;

  // Additional expensive operations
  score += counts.offsets * 25; // offset() is computationally expensive
  score += counts.surfaces * 40; // surface() imports heightmaps
  score += counts.polyhedrons * 15; // polyhedron() can be complex
  score += counts.imports * 20; // import() external geometry
  score += counts.projections * 35; // projection() is expensive

  // Extrusions
  score += counts.linearExtrudes * 8;
  score += counts.rotateExtrudes * 12;

  // Text
  score += counts.textCalls * 25;

  // File size penalty (large SCAD files often correlate with complexity)
  // Add 10 points per 5KB over 10KB
  if (counts.fileSize > 10000) {
    const extraKB = Math.floor((counts.fileSize - 10000) / 5000);
    score += extraKB * 10;
    if (counts.fileSize > 30000) {
      warnings.push(
        `Large file (${Math.round(counts.fileSize / 1024)}KB) - may indicate complex model`
      );
    }
  }

  // Check for high $fn in parameters
  const fn = parameters.$fn || parameters.fn;
  if (fn !== undefined && fn > 64) {
    score += fn * 0.5;
    warnings.push(`High $fn value (${fn}) detected`);
  }

  // Determine tier based on score and curved feature count
  let tier;

  // Lowered thresholds to be more conservative
  if (estimatedCurvedFeatures >= 40 || score >= 400) {
    tier = COMPLEXITY_TIER.COMPLEX;
    if (estimatedCurvedFeatures >= 80) {
      warnings.push(
        `Model has ~${estimatedCurvedFeatures} curved features - using conservative quality settings`
      );
    }
  } else if (estimatedCurvedFeatures >= 8 || score >= 80) {
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
  if (counts.spheres > 15) {
    warnings.push(`${counts.spheres} spheres detected - may produce large STL`);
  }
  if (counts.differences > 20) {
    warnings.push(
      `${counts.differences} difference() operations - heavy boolean workload`
    );
  }
  if (counts.offsets > 5) {
    warnings.push(
      `${counts.offsets} offset() operations - computationally expensive`
    );
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

/** STANDARD-tier presets that several RENDER_QUALITY entries mirror. */
const STANDARD_TIER = QUALITY_TIERS[COMPLEXITY_TIER.STANDARD];

/**
 * Legacy render quality presets (for backwards compatibility)
 *
 * Single source of truth for tessellation defaults — moved here verbatim
 * from render-controller.js so the same numbers cannot drift between files
 * (cross-file default drift is this project's #1 historical bug source).
 * render-controller.js re-exports this for its existing import sites.
 *
 * NOTE: New code should use the adaptive quality tier system above.
 * These presets are based on community standards for STANDARD complexity models.
 *
 * MANIFOLD OPTIMIZED: These values have been recalibrated for the Manifold
 * rendering backend, which is 10-100x faster than CGAL for boolean operations.
 *
 * For adaptive quality based on model complexity and hardware, use:
 * - getAdaptiveQualityConfig(scadContent, parameters)
 * - getQualityPreset(tier, hardwareLevel, qualityLevel, mode)
 */
export const RENDER_QUALITY = {
  /**
   * Draft quality - very fast preview for any model.
   * Numbers mirror STANDARD preview-low exactly, so derive them.
   */
  DRAFT: {
    ...STANDARD_TIER.preview.low,
    name: 'draft',
  },
  /**
   * Low quality - fast exports, coarse tessellation.
   * No exact QUALITY_TIERS counterpart (minFa 10 / 15s timeout are unique
   * to this preset) — keep literal.
   */
  LOW: {
    name: 'low',
    maxFn: 48,
    forceFn: false,
    minFa: 10,
    minFs: 2,
    timeoutMs: 15000, // Reduced from 45s
  },
  /**
   * Preview quality - balanced for interactive use (~50% of full quality)
   * Targets approximately 50% triangle count vs full render:
   * - For STANDARD models (export-medium $fn=192): $fn=96 gives ~50%
   * - For COMPLEX models: $fn=96 capped by their lower limits, still rounded
   * Close to STANDARD export-low but with a tighter 12s timeout — keep literal.
   */
  PREVIEW: {
    name: 'preview',
    maxFn: 96, // ~50% of STANDARD export-medium ($fn=192)
    forceFn: false,
    minFa: 8,
    minFs: 1.5,
    timeoutMs: 12000,
  },
  /**
   * Medium quality - community standard (STANDARD tier export-medium).
   */
  MEDIUM: {
    ...STANDARD_TIER.export.medium,
    name: 'medium',
  },
  /**
   * High quality - community high standard (STANDARD tier export-high).
   */
  HIGH: {
    ...STANDARD_TIER.export.high,
    name: 'high',
  },
  /**
   * Desktop-equivalent - respects model's settings (OpenSCAD defaults)
   * Matches native OpenSCAD behavior: $fn, $fa, $fs from model.
   * maxFn: null has no QUALITY_TIERS counterpart — keep literal.
   */
  DESKTOP_DEFAULT: {
    name: 'desktop',
    maxFn: null,
    forceFn: false,
    minFa: 12,
    minFs: 2,
    timeoutMs: 30000, // Reduced from 60s
  },
  /**
   * Full quality - for final export (respects model's settings)
   */
  FULL: {
    name: 'full',
    maxFn: null,
    forceFn: false,
    minFa: 12,
    minFs: 2,
    timeoutMs: 30000, // Reduced from 60s
  },
};

/**
 * Default preview-quality mode for the UI select (#previewQualitySelect).
 *
 * Single source of truth (index.html's `selected` attribute only covers
 * pre-JS paint; main.js re-asserts this on boot).
 *
 * 'fidelity' maps to RENDER_QUALITY.DESKTOP_DEFAULT (maxFn: null): the
 * model's own $fn/$fa/$fs are honored exactly like desktop OpenSCAD's F5,
 * with OpenSCAD's stock $fa=12/$fs=2 only when the model declares neither.
 * The previous 'auto' default silently downgraded complex models to
 * complex-preview-low (forced $fn=10), which rendered curved designs as
 * faceted blocks on first load — owner-reported against the keyguard.
 * 'auto' remains available as the opt-in performance mode.
 */
export const PREVIEW_QUALITY_DEFAULT = 'fidelity';

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
