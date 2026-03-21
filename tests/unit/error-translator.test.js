/**
 * Error Translator Unit Tests
 * Tests COGA-compliant error translation functionality
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  translateError,
  createFriendlyErrorDisplay,
  showErrorModal,
  showErrorToast,
} from '../../src/js/error-translator.js';

describe('Error Translator', () => {
  describe('translateError', () => {
    test('should translate syntax errors', () => {
      const result = translateError('syntax error at line 42');
      
      expect(result.title).toBe('Code Problem Found');
      expect(result.explanation).toBeTruthy();
      expect(result.suggestion).toBeTruthy();
      expect(result.technical).toBe('syntax error at line 42');
    });

    test('should translate undefined variable errors', () => {
      const result = translateError('undefined variable: my_variable');
      
      expect(result.title).toBe('Missing Variable');
      expect(result.explanation).toContain('my_variable');
      expect(result.suggestion).toBeTruthy();
    });

    test('should translate unknown function errors', () => {
      const result = translateError('unknown function: custom_func');
      
      expect(result.title).toBe('Unknown Function');
      expect(result.explanation).toContain('custom_func');
      expect(result.suggestion).toContain('library');
    });

    test('should translate memory errors', () => {
      const result = translateError('out of memory during render');
      
      expect(result.title).toBe('Model Too Complex');
      expect(result.suggestion).toContain('complexity');
    });

    test('should translate timeout errors', () => {
      const result = translateError('render timed out after 60 seconds');
      
      expect(result.title).toBe('Taking Too Long');
      expect(result.suggestion).toBeTruthy();
    });

    test('should translate file not found errors', () => {
      const result = translateError('file not found: missing_file.scad');
      
      expect(result.title).toBe('Missing File');
      expect(result.explanation).toContain('missing_file.scad');
    });

    test('should translate CGAL errors', () => {
      const result = translateError('CGAL error: invalid geometry');
      
      expect(result.title).toBe('Complex Geometry Issue');
      expect(result.suggestion).toBeTruthy();
    });

    test('should translate degenerate geometry errors', () => {
      const result = translateError('degenerate polygon detected');
      
      expect(result.title).toBe('Invalid Shape');
      expect(result.suggestion).toContain('dimension');
    });

    test('should provide default translation for unknown errors', () => {
      const result = translateError('some unknown error message xyz123');
      
      expect(result.title).toBe('Something Went Wrong');
      expect(result.explanation).toBeTruthy();
      expect(result.suggestion).toBeTruthy();
      expect(result.technical).toBe('some unknown error message xyz123');
    });

    test('should handle null/undefined input', () => {
      const resultNull = translateError(null);
      const resultUndefined = translateError(undefined);
      const resultEmpty = translateError('');
      
      expect(resultNull.title).toBe('Something Went Wrong');
      expect(resultUndefined.title).toBe('Something Went Wrong');
      expect(resultEmpty.title).toBe('Something Went Wrong');
    });

    test('should handle non-string input', () => {
      const result = translateError(12345);
      
      expect(result.title).toBe('Something Went Wrong');
    });
  });

  describe('createFriendlyErrorDisplay', () => {
    test('should create accessible error element', () => {
      const element = createFriendlyErrorDisplay('syntax error');
      
      expect(element).toBeInstanceOf(HTMLElement);
      expect(element.className).toBe('error-message-friendly');
      expect(element.getAttribute('role')).toBe('alert');
      expect(element.getAttribute('aria-live')).toBe('assertive');
    });

    test('should include title, explanation, and suggestion', () => {
      const element = createFriendlyErrorDisplay('undefined variable: test');
      
      const title = element.querySelector('.error-title');
      const explanation = element.querySelector('.error-explanation');
      const suggestion = element.querySelector('.error-suggestion');
      
      expect(title).toBeTruthy();
      expect(explanation).toBeTruthy();
      expect(suggestion).toBeTruthy();
    });

    test('should include collapsible technical details', () => {
      const element = createFriendlyErrorDisplay('technical error message');
      
      const details = element.querySelector('.error-details-toggle');
      expect(details).toBeTruthy();
      
      const summary = details.querySelector('summary');
      expect(summary.textContent).toContain('technical');
      
      const technical = details.querySelector('.error-technical');
      expect(technical.textContent).toBe('technical error message');
    });
  });

  describe('showErrorModal', () => {
    beforeEach(() => {
      document.body.innerHTML = '';
      const assertiveRegion = document.createElement('div');
      assertiveRegion.id = 'srAnnouncerAssertive';
      assertiveRegion.setAttribute('aria-live', 'assertive');
      document.body.appendChild(assertiveRegion);
    });

    afterEach(() => {
      document.body.innerHTML = '';
    });

    test('should create a modal with role="alertdialog"', () => {
      showErrorModal({
        title: 'Test Error',
        message: 'Something went wrong',
      });

      const modal = document.querySelector('[data-testid="friendly-error-modal"]');
      expect(modal).toBeTruthy();
      expect(modal.getAttribute('role')).toBe('alertdialog');
      expect(modal.getAttribute('aria-modal')).toBe('true');
    });

    test('should set aria-labelledby and aria-describedby', () => {
      showErrorModal({
        title: 'Test Error',
        message: 'Description text',
      });

      const modal = document.querySelector('[data-testid="friendly-error-modal"]');
      const labelId = modal.getAttribute('aria-labelledby');
      const descId = modal.getAttribute('aria-describedby');

      expect(document.getElementById(labelId)).toBeTruthy();
      expect(document.getElementById(descId)).toBeTruthy();
      expect(document.getElementById(labelId).textContent).toContain('Test Error');
      expect(document.getElementById(descId).textContent).toContain('Description text');
    });

    test('should include suggestion when provided', () => {
      showErrorModal({
        title: 'Error',
        message: 'Problem',
        suggestion: 'Try this fix',
      });

      const suggestion = document.querySelector('.error-suggestion');
      expect(suggestion).toBeTruthy();
      expect(suggestion.textContent).toContain('Try this fix');
    });

    test('should include collapsible technical details when provided', () => {
      showErrorModal({
        title: 'Error',
        message: 'Problem',
        technical: 'stack trace here',
      });

      const details = document.querySelector('.error-details-toggle');
      expect(details).toBeTruthy();
      const pre = details.querySelector('.error-technical');
      expect(pre.textContent).toBe('stack trace here');
    });

    test('should resolve when OK button is clicked', async () => {
      const promise = showErrorModal({
        title: 'Error',
        message: 'Problem',
      });

      const okBtn = document.querySelector('.friendly-error-modal-footer .btn-primary');
      expect(okBtn).toBeTruthy();
      okBtn.click();

      await promise;
      expect(document.querySelector('[data-testid="friendly-error-modal"]')).toBeNull();
    });

    test('should resolve when close button is clicked', async () => {
      const promise = showErrorModal({
        title: 'Error',
        message: 'Problem',
      });

      const closeBtn = document.querySelector('.friendly-error-modal-close');
      closeBtn.click();

      await promise;
      expect(document.querySelector('[data-testid="friendly-error-modal"]')).toBeNull();
    });

    test('should resolve on Escape key', async () => {
      const promise = showErrorModal({
        title: 'Error',
        message: 'Problem',
      });

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

      await promise;
      expect(document.querySelector('[data-testid="friendly-error-modal"]')).toBeNull();
    });

    test('should resolve when clicking the overlay backdrop', async () => {
      const promise = showErrorModal({
        title: 'Error',
        message: 'Problem',
      });

      const overlay = document.querySelector('[data-testid="friendly-error-modal"]');
      overlay.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      await promise;
      expect(document.querySelector('[data-testid="friendly-error-modal"]')).toBeNull();
    });
  });

  describe('showErrorToast', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      document.body.innerHTML = '';
      const assertiveRegion = document.createElement('div');
      assertiveRegion.id = 'srAnnouncerAssertive';
      assertiveRegion.setAttribute('aria-live', 'assertive');
      document.body.appendChild(assertiveRegion);
    });

    afterEach(() => {
      vi.useRealTimers();
      document.body.innerHTML = '';
    });

    test('should create a toast with role="alert"', () => {
      showErrorToast({ title: 'Info', message: 'Something happened' });

      const toast = document.querySelector('.error-toast');
      expect(toast).toBeTruthy();
      expect(toast.getAttribute('role')).toBe('alert');
    });

    test('should create a toast container if absent', () => {
      expect(document.getElementById('error-toast-container')).toBeNull();
      showErrorToast({ title: 'Info', message: 'Test' });
      expect(document.getElementById('error-toast-container')).toBeTruthy();
    });

    test('should display title and message', () => {
      showErrorToast({ title: 'My Title', message: 'My message text' });

      const titleEl = document.querySelector('.error-toast-title');
      const msgEl = document.querySelector('.error-toast-message');
      expect(titleEl.textContent).toBe('My Title');
      expect(msgEl.textContent).toBe('My message text');
    });

    test('should auto-dismiss after duration', () => {
      showErrorToast({ title: 'Info', message: 'Bye', duration: 5000 });

      expect(document.querySelector('.error-toast')).toBeTruthy();
      vi.advanceTimersByTime(5000);
      const toast = document.querySelector('.error-toast');
      expect(toast.classList.contains('error-toast-exit')).toBe(true);
    });

    test('should dismiss when dismiss button clicked', () => {
      showErrorToast({ title: 'Info', message: 'Click me', duration: 0 });

      const dismissBtn = document.querySelector('.error-toast-dismiss');
      dismissBtn.click();

      const toast = document.querySelector('.error-toast');
      expect(toast.classList.contains('error-toast-exit')).toBe(true);
    });

    test('should stack multiple toasts', () => {
      showErrorToast({ title: 'First', message: 'A' });
      showErrorToast({ title: 'Second', message: 'B' });

      const toasts = document.querySelectorAll('.error-toast');
      expect(toasts.length).toBe(2);
    });
  });
});
