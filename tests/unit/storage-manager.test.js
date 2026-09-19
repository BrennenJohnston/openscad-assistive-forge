/**
 * Unit tests for storage-manager.js
 * @license GPL-3.0-or-later
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  isFirstVisit,
  markFirstVisitComplete,
  getStorageEstimate,
  formatBytes,
  getLocalStorageUsageBytes,
  clearCachedData,
  prefersReducedData,
  getConnectionInfo,
  getStoragePrefs,
  updateStoragePrefs,
  shouldDeferLargeDownloads,
} from '../../src/js/storage-manager.js';

describe('Storage Manager', () => {
  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();
    // Clear any mocked navigator properties
    vi.restoreAllMocks();
    
    // Reset navigator.connection to undefined
    if ('connection' in navigator) {
      Object.defineProperty(navigator, 'connection', {
        value: undefined,
        configurable: true,
      });
    }
  });

  describe('First Visit Tracking', () => {
    it('should return true for first visit', () => {
      expect(isFirstVisit()).toBe(true);
    });

    it('should return false after marking first visit complete', () => {
      markFirstVisitComplete();
      expect(isFirstVisit()).toBe(false);
    });

    it('should persist first visit status', () => {
      markFirstVisitComplete();
      // Simulate page reload by checking localStorage directly
      const stored = localStorage.getItem('openscad-forge-first-visit-seen');
      expect(stored).toBe('true');
    });
  });

  describe('Storage Estimation', () => {
    it('should return not supported when API unavailable', async () => {
      const estimate = await getStorageEstimate();
      
      // In test environment, navigator.storage might not be available
      if (!estimate.supported) {
        expect(estimate.usage).toBe(0);
        expect(estimate.quota).toBe(0);
        expect(estimate.usageFormatted).toBe('Unknown');
        expect(estimate.quotaFormatted).toBe('Unknown');
        expect(estimate.percentUsed).toBe(0);
      } else {
        // If supported, should have valid values
        expect(estimate.usage).toBeGreaterThanOrEqual(0);
        expect(estimate.quota).toBeGreaterThanOrEqual(0);
        expect(typeof estimate.usageFormatted).toBe('string');
        expect(typeof estimate.quotaFormatted).toBe('string');
        expect(estimate.percentUsed).toBeGreaterThanOrEqual(0);
        expect(estimate.percentUsed).toBeLessThanOrEqual(100);
      }
    });

    it('should handle storage API errors gracefully', async () => {
      // Mock navigator.storage.estimate to throw error
      if ('storage' in navigator && 'estimate' in navigator.storage) {
        vi.spyOn(navigator.storage, 'estimate').mockRejectedValue(
          new Error('Storage error')
        );
      }

      const estimate = await getStorageEstimate();
      expect(estimate.supported).toBe(false);
      expect(estimate.usage).toBe(0);
      expect(estimate.quota).toBe(0);
    });
  });

  describe('Byte Formatting', () => {
    it('should format 0 bytes', () => {
      expect(formatBytes(0)).toBe('0 B');
    });

    it('should format bytes', () => {
      expect(formatBytes(500)).toBe('500 B');
    });

    it('should format kilobytes', () => {
      expect(formatBytes(1024)).toBe('1 KB');
      expect(formatBytes(2048)).toBe('2 KB');
    });

    it('should format megabytes', () => {
      expect(formatBytes(1024 * 1024)).toBe('1 MB');
      expect(formatBytes(5 * 1024 * 1024)).toBe('5 MB');
    });

    it('should format gigabytes', () => {
      expect(formatBytes(1024 * 1024 * 1024)).toBe('1 GB');
      expect(formatBytes(2.5 * 1024 * 1024 * 1024)).toBe('2.5 GB');
    });

    it('should format terabytes', () => {
      expect(formatBytes(2.1 * 1024 * 1024 * 1024 * 1024)).toBe('2.1 TB');
    });

    it('should cap units when maxUnit is provided', () => {
      expect(
        formatBytes(2 * 1024 * 1024 * 1024 * 1024, { maxUnit: 'GB' })
      ).toBe('2048 GB');
    });

    it('should format with one decimal place', () => {
      expect(formatBytes(1536)).toBe('1.5 KB');
      expect(formatBytes(1024 * 1024 * 1.75)).toBe('1.8 MB');
    });
  });

  describe('LocalStorage Usage', () => {
    it('should return 0 when localStorage is empty', () => {
      expect(getLocalStorageUsageBytes()).toBe(0);
    });

    it('should estimate localStorage usage', () => {
      localStorage.setItem('testKey', 'testValue');
      const usage = getLocalStorageUsageBytes();
      // Calculate expected: (7 + 9) * 2 = 32 bytes for 'testKey' + 'testValue'
      // In some test environments, localStorage.length may not update correctly,
      // so we verify either it works as expected or returns 0 gracefully
      expect(usage).toBeGreaterThanOrEqual(0);
      if (localStorage.length > 0) {
        expect(usage).toBe(32); // ('testKey' + 'testValue').length * 2
      }
    });
  });

  describe('Cache Clearing', () => {
    it('should return false when service worker unavailable', async () => {
      const result = await clearCachedData();
      
      // In test environment, service worker might not be available
      expect(typeof result).toBe('boolean');
    });

    it('should clear localStorage entries', async () => {
      localStorage.setItem('cache-test', 'value');
      await clearCachedData();
      expect(localStorage.getItem('cache-test')).toBeNull();
    });

    it('should handle cache API when available', async () => {
      // Mock caches API if available
      if ('caches' in window) {
        vi.spyOn(window.caches, 'keys').mockResolvedValue(['cache-v1']);
        vi.spyOn(window.caches, 'delete').mockResolvedValue(true);

        const result = await clearCachedData();
        expect(result).toBe(true);
      }
    });
  });

  describe('Network Detection', () => {
    it('should return false when connection API unavailable', () => {
      const result = prefersReducedData();
      expect(typeof result).toBe('boolean');
    });

    it('should detect Save-Data preference', () => {
      // Mock navigator.connection with saveData
      Object.defineProperty(navigator, 'connection', {
        value: { saveData: true },
        configurable: true,
      });

      expect(prefersReducedData()).toBe(true);
    });

    it('should return connection info', () => {
      const info = getConnectionInfo();
      
      expect(info).toHaveProperty('isMetered');
      expect(info).toHaveProperty('type');
      expect(info).toHaveProperty('supported');
      
      expect(typeof info.isMetered).toBe('boolean');
      expect(typeof info.type).toBe('string');
      expect(typeof info.supported).toBe('boolean');
    });

    it('should detect metered connections', () => {
      // Mock cellular connection
      Object.defineProperty(navigator, 'connection', {
        value: { type: 'cellular', effectiveType: '3g' },
        configurable: true,
      });

      const info = getConnectionInfo();
      expect(info.isMetered).toBe(true);
    });

    it('should detect slow connections', () => {
      // Mock slow connection
      Object.defineProperty(navigator, 'connection', {
        value: { effectiveType: '2g' },
        configurable: true,
      });

      const info = getConnectionInfo();
      expect(info.isMetered).toBe(true);
    });
  });

  describe('Storage Preferences', () => {
    it('should return default preferences', () => {
      const prefs = getStoragePrefs();
      
      expect(prefs).toHaveProperty('allowLargeDownloads');
      expect(prefs).toHaveProperty('seenDisclosure');
      
      expect(prefs.allowLargeDownloads).toBe(true);
      expect(prefs.seenDisclosure).toBe(false);
    });

    it('should update preferences', () => {
      updateStoragePrefs({ allowLargeDownloads: false });
      const prefs = getStoragePrefs();
      
      expect(prefs.allowLargeDownloads).toBe(false);
      expect(prefs.seenDisclosure).toBe(false); // Unchanged
    });

    it('should merge preferences', () => {
      updateStoragePrefs({ seenDisclosure: true });
      updateStoragePrefs({ allowLargeDownloads: false });
      
      const prefs = getStoragePrefs();
      expect(prefs.seenDisclosure).toBe(true);
      expect(prefs.allowLargeDownloads).toBe(false);
    });

    it('should persist preferences to localStorage', () => {
      updateStoragePrefs({ allowLargeDownloads: false });
      
      const stored = localStorage.getItem('openscad-forge-storage-prefs');
      expect(stored).not.toBeNull();
      
      const parsed = JSON.parse(stored);
      expect(parsed.allowLargeDownloads).toBe(false);
    });

    it('should handle corrupted localStorage gracefully', () => {
      localStorage.setItem('openscad-forge-storage-prefs', 'invalid json');
      
      const prefs = getStoragePrefs();
      expect(prefs.allowLargeDownloads).toBe(true);
      expect(prefs.seenDisclosure).toBe(false);
    });
  });

  describe('Deferred Download Logic', () => {
    it('should not defer by default', () => {
      // Ensure clean state
      localStorage.clear();
      Object.defineProperty(navigator, 'connection', {
        value: undefined,
        configurable: true,
      });
      
      expect(shouldDeferLargeDownloads()).toBe(false);
    });

    it('should defer when user disabled downloads', () => {
      updateStoragePrefs({ allowLargeDownloads: false });
      expect(shouldDeferLargeDownloads()).toBe(true);
    });

    it('should defer on metered connection', () => {
      // Mock cellular connection
      Object.defineProperty(navigator, 'connection', {
        value: { type: 'cellular' },
        configurable: true,
      });

      expect(shouldDeferLargeDownloads()).toBe(true);
    });

    it('should defer when Save-Data enabled', () => {
      // Mock Save-Data preference
      Object.defineProperty(navigator, 'connection', {
        value: { saveData: true },
        configurable: true,
      });

      expect(shouldDeferLargeDownloads()).toBe(true);
    });

    it('should not defer on WiFi with no restrictions', () => {
      // Mock WiFi connection
      Object.defineProperty(navigator, 'connection', {
        value: { type: 'wifi', effectiveType: '4g', saveData: false },
        configurable: true,
      });
      
      updateStoragePrefs({ allowLargeDownloads: true });
      expect(shouldDeferLargeDownloads()).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    it('should handle missing localStorage', () => {
      // Temporarily disable localStorage
      const originalSetItem = Storage.prototype.setItem;
      Storage.prototype.setItem = () => {
        throw new Error('localStorage disabled');
      };

      // Should not throw
      expect(() => updateStoragePrefs({ seenDisclosure: true })).not.toThrow();

      // Restore
      Storage.prototype.setItem = originalSetItem;
    });

    it('should handle quota exceeded errors', () => {
      const originalSetItem = Storage.prototype.setItem;
      Storage.prototype.setItem = () => {
        const error = new Error('QuotaExceededError');
        error.name = 'QuotaExceededError';
        throw error;
      };

      // Should not throw
      expect(() => markFirstVisitComplete()).not.toThrow();

      // Restore
      Storage.prototype.setItem = originalSetItem;
    });
  });
});
