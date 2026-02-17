/**
 * Memory Monitor Unit Tests
 * @license GPL-3.0-or-later
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  MemoryMonitor,
  MemoryState,
  MemoryRecovery,
  getMemoryMonitor,
  _internal,
} from '../../src/js/memory-monitor.js';

// Mock feature flags module
vi.mock('../../src/js/feature-flags.js', () => ({
  isEnabled: vi.fn(() => true),
}));

describe('MemoryMonitor', () => {
  let monitor;

  beforeEach(() => {
    // Reset singleton
    _internal.resetSingleton();

    // Create fresh monitor for each test
    monitor = new MemoryMonitor({
      warningMB: 100,
      criticalMB: 200,
      emergencyMB: 300,
    });
  });

  afterEach(() => {
    monitor?.stopPolling();
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with default thresholds', () => {
      const defaultMonitor = new MemoryMonitor();

      expect(defaultMonitor.thresholds.warning).toBe(400);
      expect(defaultMonitor.thresholds.critical).toBe(800);
      expect(defaultMonitor.thresholds.emergency).toBe(1200);
    });

    it('should accept custom thresholds', () => {
      expect(monitor.thresholds.warning).toBe(100);
      expect(monitor.thresholds.critical).toBe(200);
      expect(monitor.thresholds.emergency).toBe(300);
    });

    it('should start in normal state', () => {
      expect(monitor.getState()).toBe(MemoryState.NORMAL);
    });

    it('should have empty history initially', () => {
      expect(monitor.history).toHaveLength(0);
    });
  });

  describe('evaluateState', () => {
    it('should return NORMAL for low memory', () => {
      const state = monitor.evaluateState({ heapMB: 50 });
      expect(state).toBe(MemoryState.NORMAL);
    });

    it('should return WARNING at warning threshold', () => {
      const state = monitor.evaluateState({ heapMB: 100 });
      expect(state).toBe(MemoryState.WARNING);
    });

    it('should return CRITICAL at critical threshold', () => {
      const state = monitor.evaluateState({ heapMB: 200 });
      expect(state).toBe(MemoryState.CRITICAL);
    });

    it('should return EMERGENCY at emergency threshold', () => {
      const state = monitor.evaluateState({ heapMB: 300 });
      expect(state).toBe(MemoryState.EMERGENCY);
    });

    it('should trigger callback on state change', () => {
      const onWarning = vi.fn();
      monitor.callbacks.onWarning = onWarning;

      monitor.evaluateState({ heapMB: 150 });

      expect(onWarning).toHaveBeenCalled();
    });

    it('should not trigger callback if state unchanged', () => {
      const onWarning = vi.fn();
      monitor.callbacks.onWarning = onWarning;

      // Enter warning state
      monitor.evaluateState({ heapMB: 150 });
      onWarning.mockClear();

      // Stay in warning state
      monitor.evaluateState({ heapMB: 160 });

      expect(onWarning).not.toHaveBeenCalled();
    });
  });

  describe('state transitions', () => {
    it('should trigger onRecovery when returning to normal', () => {
      const onRecovery = vi.fn();
      monitor.callbacks.onRecovery = onRecovery;

      // Go to warning
      monitor.evaluateState({ heapMB: 150 });

      // Return to normal
      monitor.evaluateState({ heapMB: 50 });

      expect(onRecovery).toHaveBeenCalled();
    });

    it('should dispatch custom event on state change', () => {
      const eventHandler = vi.fn();
      document.addEventListener('memory-state-change', eventHandler);

      monitor.evaluateState({ heapMB: 150 });

      expect(eventHandler).toHaveBeenCalled();
      const event = eventHandler.mock.calls[0][0];
      expect(event.detail.to).toBe(MemoryState.WARNING);

      document.removeEventListener('memory-state-change', eventHandler);
    });
  });

  describe('history management', () => {
    it('should add samples to history', () => {
      monitor.addSample({ timestamp: Date.now(), heapMB: 100 });
      monitor.addSample({ timestamp: Date.now(), heapMB: 110 });

      expect(monitor.history).toHaveLength(2);
    });

    it('should trim history at max size', () => {
      // Add more than maxHistorySize samples
      for (let i = 0; i < 150; i++) {
        monitor.addSample({ timestamp: Date.now(), heapMB: i });
      }

      expect(monitor.history.length).toBeLessThanOrEqual(100);
    });

    it('should return latest sample', () => {
      monitor.addSample({ timestamp: 1000, heapMB: 100 });
      monitor.addSample({ timestamp: 2000, heapMB: 200 });

      const latest = monitor.getLatestSample();
      expect(latest.heapMB).toBe(200);
    });

    it('should return null for empty history', () => {
      expect(monitor.getLatestSample()).toBe(null);
    });
  });

  describe('growth rate calculation', () => {
    it('should return 0 for empty history', () => {
      expect(monitor.getGrowthRate()).toBe(0);
    });

    it('should return 0 for single sample', () => {
      monitor.addSample({ timestamp: Date.now(), heapMB: 100 });
      expect(monitor.getGrowthRate()).toBe(0);
    });

    it('should calculate positive growth rate', () => {
      monitor.history = [
        { timestamp: 0, heapMB: 100 },
        { timestamp: 1000, heapMB: 150 },
      ];

      expect(monitor.getGrowthRate()).toBe(50); // 50 MB per second
    });

    it('should calculate negative growth rate', () => {
      monitor.history = [
        { timestamp: 0, heapMB: 200 },
        { timestamp: 1000, heapMB: 150 },
      ];

      expect(monitor.getGrowthRate()).toBe(-50);
    });

    it('should handle zero time delta', () => {
      monitor.history = [
        { timestamp: 1000, heapMB: 100 },
        { timestamp: 1000, heapMB: 150 },
      ];

      expect(monitor.getGrowthRate()).toBe(0);
    });
  });

  describe('updateFromWorker', () => {
    it('should handle null input gracefully', () => {
      expect(() => monitor.updateFromWorker(null)).not.toThrow();
    });

    it('should add sample from worker memory info', () => {
      monitor.updateFromWorker({
        used: 150 * 1024 * 1024, // 150MB
        limit: 1024 * 1024 * 1024, // 1GB
        percent: 15,
      });

      expect(monitor.history).toHaveLength(1);
      expect(monitor.history[0].heapMB).toBe(150);
    });

    it('should evaluate state after update', () => {
      const onWarning = vi.fn();
      monitor.callbacks.onWarning = onWarning;

      monitor.updateFromWorker({
        used: 150 * 1024 * 1024, // 150MB (above warning threshold of 100)
        limit: 1024 * 1024 * 1024,
        percent: 15,
      });

      expect(onWarning).toHaveBeenCalled();
    });
  });

  describe('getStats', () => {
    it('should return complete stats object', () => {
      monitor.addSample({ timestamp: Date.now(), heapMB: 75, heapPercent: 8 });

      const stats = monitor.getStats();

      expect(stats.state).toBe(MemoryState.NORMAL);
      expect(stats.currentMB).toBe(75);
      expect(stats.thresholds).toEqual({
        warning: 100,
        critical: 200,
        emergency: 300,
      });
      expect(typeof stats.growthRate).toBe('number');
      expect(stats.samplesCount).toBe(1);
    });

    it('should return defaults for empty history', () => {
      const stats = monitor.getStats();

      expect(stats.currentMB).toBe(0);
      expect(stats.samplesCount).toBe(0);
    });
  });

  describe('polling', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should start polling at specified interval', () => {
      const checkSpy = vi.spyOn(monitor, 'check');

      monitor.startPolling(1000);
      vi.advanceTimersByTime(3000);

      expect(checkSpy).toHaveBeenCalledTimes(3);
    });

    it('should stop polling when requested', () => {
      const checkSpy = vi.spyOn(monitor, 'check');

      monitor.startPolling(1000);
      vi.advanceTimersByTime(2000);

      monitor.stopPolling();
      vi.advanceTimersByTime(2000);

      expect(checkSpy).toHaveBeenCalledTimes(2);
    });

    it('should not start multiple polling intervals', () => {
      monitor.startPolling(1000);
      const interval = monitor.pollInterval;

      monitor.startPolling(500);

      // Should have stopped old interval and started new one
      expect(monitor.pollInterval).not.toBe(interval);
    });
  });

  describe('reset', () => {
    it('should clear history and reset state', () => {
      monitor.addSample({ timestamp: Date.now(), heapMB: 150 });
      monitor.evaluateState({ heapMB: 150 });

      monitor.reset();

      expect(monitor.history).toHaveLength(0);
      expect(monitor.getState()).toBe(MemoryState.NORMAL);
    });
  });
});

describe('MemoryRecovery', () => {
  describe('getSuggestions', () => {
    it('should return suggestions for warning state', () => {
      const suggestions = MemoryRecovery.getSuggestions(MemoryState.WARNING);

      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions.some((s) => s.id === 'reduce-fn')).toBe(true);
    });

    it('should return more suggestions for critical state', () => {
      const warningSuggestions = MemoryRecovery.getSuggestions(
        MemoryState.WARNING
      );
      const criticalSuggestions = MemoryRecovery.getSuggestions(
        MemoryState.CRITICAL
      );

      expect(criticalSuggestions.length).toBeGreaterThanOrEqual(
        warningSuggestions.length
      );
      expect(criticalSuggestions.some((s) => s.id === 'save-work')).toBe(true);
    });

    it('should include refresh suggestion for emergency state', () => {
      const suggestions = MemoryRecovery.getSuggestions(MemoryState.EMERGENCY);

      expect(suggestions.some((s) => s.id === 'refresh')).toBe(true);
      expect(
        suggestions.find((s) => s.id === 'refresh').priority
      ).toBe('critical');
    });

    it('should return empty array for normal state', () => {
      const suggestions = MemoryRecovery.getSuggestions(MemoryState.NORMAL);
      expect(suggestions).toHaveLength(0);
    });
  });
});

describe('getMemoryMonitor (singleton)', () => {
  beforeEach(() => {
    _internal.resetSingleton();
  });

  afterEach(() => {
    _internal.resetSingleton();
  });

  it('should return same instance on multiple calls', () => {
    const monitor1 = getMemoryMonitor();
    const monitor2 = getMemoryMonitor();

    expect(monitor1).toBe(monitor2);
  });

  it('should accept options on first call', () => {
    const monitor = getMemoryMonitor({ warningMB: 500 });

    expect(monitor.thresholds.warning).toBe(500);
  });

  it('should ignore options on subsequent calls', () => {
    const monitor1 = getMemoryMonitor({ warningMB: 500 });
    const monitor2 = getMemoryMonitor({ warningMB: 600 });

    expect(monitor2.thresholds.warning).toBe(500);
  });
});

describe('MemoryState enum', () => {
  it('should have all expected states', () => {
    expect(MemoryState.NORMAL).toBe('normal');
    expect(MemoryState.WARNING).toBe('warning');
    expect(MemoryState.CRITICAL).toBe('critical');
    expect(MemoryState.EMERGENCY).toBe('emergency');
  });
});
