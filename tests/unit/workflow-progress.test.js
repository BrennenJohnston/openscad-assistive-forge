/**
 * Workflow Progress Container Unit Tests
 * Tests visibility management of the #workflowProgress toolbar container.
 */

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import {
  initWorkflowProgress,
  showWorkflowProgress,
  hideWorkflowProgress,
} from '../../src/js/workflow-progress.js';

describe('Workflow Progress', () => {
  let workflowElement;

  beforeEach(() => {
    workflowElement = document.createElement('div');
    workflowElement.id = 'workflowProgress';
    workflowElement.className = 'hidden';
    document.body.appendChild(workflowElement);
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  describe('initWorkflowProgress', () => {
    test('should initialize with hidden state by default', () => {
      initWorkflowProgress();
      expect(workflowElement.classList.contains('hidden')).toBe(true);
    });

    test('should show container when visible=true', () => {
      initWorkflowProgress(true);
      expect(workflowElement.classList.contains('hidden')).toBe(false);
    });
  });

  describe('showWorkflowProgress / hideWorkflowProgress', () => {
    test('should show the container', () => {
      initWorkflowProgress();
      showWorkflowProgress();
      expect(workflowElement.classList.contains('hidden')).toBe(false);
    });

    test('should hide the container', () => {
      initWorkflowProgress(true);
      hideWorkflowProgress();
      expect(workflowElement.classList.contains('hidden')).toBe(true);
    });

    test('should be a no-op when element is missing', () => {
      document.body.innerHTML = '';
      expect(() => showWorkflowProgress()).not.toThrow();
      expect(() => hideWorkflowProgress()).not.toThrow();
    });
  });
});
