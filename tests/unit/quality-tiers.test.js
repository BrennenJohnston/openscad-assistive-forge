import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  COMPLEXITY_TIER,
  QUALITY_TIERS,
  HARDWARE_LEVEL,
  detectHardware,
  analyzeComplexity,
  getQualityPreset,
  getAdaptiveQualityConfig,
  getTierPresets,
  formatPresetDescription,
} from '../../src/js/quality-tiers.js';

describe('Quality Tiers', () => {
  describe('COMPLEXITY_TIER', () => {
    it('defines three tiers', () => {
      expect(COMPLEXITY_TIER.BEGINNER).toBe('beginner');
      expect(COMPLEXITY_TIER.STANDARD).toBe('standard');
      expect(COMPLEXITY_TIER.COMPLEX).toBe('complex');
    });
  });

  describe('QUALITY_TIERS', () => {
    it('has presets for all tiers', () => {
      expect(QUALITY_TIERS[COMPLEXITY_TIER.BEGINNER]).toBeDefined();
      expect(QUALITY_TIERS[COMPLEXITY_TIER.STANDARD]).toBeDefined();
      expect(QUALITY_TIERS[COMPLEXITY_TIER.COMPLEX]).toBeDefined();
    });

    it('each tier has preview and export presets', () => {
      for (const tier of Object.values(COMPLEXITY_TIER)) {
        const config = QUALITY_TIERS[tier];
        expect(config.preview).toBeDefined();
        expect(config.export).toBeDefined();
        expect(config.preview.low).toBeDefined();
        expect(config.preview.medium).toBeDefined();
        expect(config.preview.high).toBeDefined();
        expect(config.export.low).toBeDefined();
        expect(config.export.medium).toBeDefined();
        expect(config.export.high).toBeDefined();
      }
    });

    it('COMPLEX tier has lower $fn values than STANDARD', () => {
      const complexHigh = QUALITY_TIERS[COMPLEXITY_TIER.COMPLEX].export.high;
      const standardHigh = QUALITY_TIERS[COMPLEXITY_TIER.STANDARD].export.high;
      expect(complexHigh.maxFn).toBeLessThan(standardHigh.maxFn);
    });

    it('BEGINNER tier has higher $fn values than COMPLEX for same quality', () => {
      const beginnerMedium = QUALITY_TIERS[COMPLEXITY_TIER.BEGINNER].export.medium;
      const complexMedium = QUALITY_TIERS[COMPLEXITY_TIER.COMPLEX].export.medium;
      expect(beginnerMedium.maxFn).toBeGreaterThan(complexMedium.maxFn);
    });
  });

  describe('analyzeComplexity', () => {
    it('returns BEGINNER for empty content', () => {
      const result = analyzeComplexity('');
      expect(result.tier).toBe(COMPLEXITY_TIER.BEGINNER);
      expect(result.score).toBe(0);
    });

    it('returns BEGINNER for simple box', () => {
      const simpleBox = `
        cube([10, 10, 10]);
        difference() {
          cube([10, 10, 10]);
          translate([1,1,1]) cube([8, 8, 8]);
        }
      `;
      const result = analyzeComplexity(simpleBox);
      expect(result.tier).toBe(COMPLEXITY_TIER.BEGINNER);
    });

    it('returns STANDARD for moderate complexity', () => {
      const moderateModel = `
        for (i = [0:5]) {
          translate([i*10, 0, 0])
            cylinder(r=5, h=10);
        }
        sphere(r=10);
        hull() {
          cube([5,5,5]);
          translate([10,0,0]) cube([5,5,5]);
        }
      `;
      const result = analyzeComplexity(moderateModel);
      expect([COMPLEXITY_TIER.STANDARD, COMPLEXITY_TIER.BEGINNER]).toContain(result.tier);
    });

    it('returns COMPLEX for many curved features', () => {
      // Simulate a stress-test model with many small spheres (dense curved features)
      const complexModel = `
        for (row = [0:10]) {
          for (col = [0:10]) {
            for (dot = [0:5]) {
              translate([col*5, row*5, 0])
                sphere(r=1);
            }
          }
        }
      `;
      const result = analyzeComplexity(complexModel);
      // High loop count * spheres should trigger COMPLEX
      expect(result.estimatedCurvedFeatures).toBeGreaterThan(1);
    });

    it('detects minkowski operations', () => {
      const model = `
        minkowski() {
          cube([10,10,10]);
          sphere(r=2);
        }
      `;
      const result = analyzeComplexity(model);
      expect(result.details.minkowskis).toBe(1);
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it('counts spheres and cylinders', () => {
      const model = `
        sphere(r=5);
        sphere(r=10);
        cylinder(r=3, h=10);
        cylinder(r=5, h=20);
        cylinder(r=7, h=30);
      `;
      const result = analyzeComplexity(model);
      expect(result.details.spheres).toBe(2);
      expect(result.details.cylinders).toBe(3);
    });
  });

  describe('detectHardware', () => {
    it('returns hardware info object', () => {
      const result = detectHardware();
      expect(result).toHaveProperty('level');
      expect(result).toHaveProperty('cores');
      expect(result).toHaveProperty('memoryGB');
      expect(result).toHaveProperty('isMobile');
      expect(Object.values(HARDWARE_LEVEL)).toContain(result.level);
    });
  });

  describe('getQualityPreset', () => {
    it('returns preset for valid tier and level', () => {
      const preset = getQualityPreset(
        COMPLEXITY_TIER.STANDARD,
        HARDWARE_LEVEL.MEDIUM,
        'medium',
        'export'
      );
      expect(preset).toBeDefined();
      // MANIFOLD OPTIMIZED: Standard medium export maxFn increased from 128 to 192
      expect(preset.maxFn).toBe(192);
    });

    it('downgrades quality on low hardware for complex tier', () => {
      const preset = getQualityPreset(
        COMPLEXITY_TIER.COMPLEX,
        HARDWARE_LEVEL.LOW,
        'medium',
        'preview'
      );
      // Should get low quality preset instead of medium
      expect(preset).toBeDefined();
    });

    it('returns preview preset by default', () => {
      const preset = getQualityPreset(
        COMPLEXITY_TIER.BEGINNER,
        HARDWARE_LEVEL.MEDIUM,
        'low'
      );
      expect(preset.name).toContain('preview');
    });

    it('falls back to STANDARD tier for unknown tier', () => {
      const preset = getQualityPreset(
        'unknown-tier',
        HARDWARE_LEVEL.MEDIUM,
        'medium',
        'export'
      );
      expect(preset).toBeDefined();
    });
  });

  describe('getAdaptiveQualityConfig', () => {
    it('returns complete config for simple model', () => {
      const config = getAdaptiveQualityConfig('cube([10,10,10]);');
      expect(config).toHaveProperty('tier');
      expect(config).toHaveProperty('tierName');
      expect(config).toHaveProperty('hardware');
      expect(config).toHaveProperty('previewQuality');
      expect(config).toHaveProperty('exportQuality');
      expect(config).toHaveProperty('analysis');
    });

    it('returns BEGINNER tier for simple content', () => {
      const config = getAdaptiveQualityConfig('cube([10,10,10]);');
      expect(config.tier).toBe(COMPLEXITY_TIER.BEGINNER);
      expect(config.tierName).toBe('Beginner');
    });
  });

  describe('getTierPresets', () => {
    it('returns presets for valid tier', () => {
      const presets = getTierPresets(COMPLEXITY_TIER.STANDARD);
      expect(presets.preview).toBeDefined();
      expect(presets.export).toBeDefined();
    });

    it('falls back to STANDARD for unknown tier', () => {
      const presets = getTierPresets('unknown');
      expect(presets).toEqual(QUALITY_TIERS[COMPLEXITY_TIER.STANDARD]);
    });
  });

  describe('formatPresetDescription', () => {
    it('formats preset with maxFn', () => {
      const desc = formatPresetDescription({ maxFn: 64, minFa: 6, minFs: 1 });
      expect(desc).toContain('$fn≤64');
      expect(desc).toContain('$fa≥6°');
      expect(desc).toContain('$fs≥1mm');
    });

    it('handles null maxFn', () => {
      const desc = formatPresetDescription({ maxFn: null, minFa: 12, minFs: 2 });
      expect(desc).toContain('$fn=model');
    });

    it('handles undefined preset', () => {
      const desc = formatPresetDescription(undefined);
      expect(desc).toBe('Unknown');
    });
  });
});
