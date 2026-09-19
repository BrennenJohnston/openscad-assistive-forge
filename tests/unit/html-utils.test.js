/**
 * HTML Utility Functions Unit Tests
 * @license GPL-3.0-or-later
 */

import { describe, it, expect } from 'vitest';
import { escapeHtml } from '../../src/js/html-utils.js';

describe('escapeHtml', () => {
  it('returns empty string for null, undefined, and empty input', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
    expect(escapeHtml('')).toBe('');
  });

  it('escapes angle brackets', () => {
    expect(escapeHtml('<script>alert(1)</script>')).toBe(
      '&lt;script&gt;alert(1)&lt;/script&gt;'
    );
  });

  it('escapes ampersands first (no double-escaping)', () => {
    expect(escapeHtml('A & B')).toBe('A &amp; B');
    expect(escapeHtml('&amp;')).toBe('&amp;amp;');
  });

  it('escapes double quotes', () => {
    expect(escapeHtml('say "hi"')).toBe('say &quot;hi&quot;');
  });

  it('escapes single quotes', () => {
    expect(escapeHtml("it's")).toBe('it&#39;s');
  });

  it('leaves attribute-breakout payloads with no raw quotes', () => {
    const escaped = escapeHtml('a" onclick="x');
    expect(escaped).not.toContain('"');
    expect(escaped).toBe('a&quot; onclick=&quot;x');
  });

  it('escapes all five significant characters together', () => {
    expect(escapeHtml(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&#39;');
  });

  it('passes through text without special characters', () => {
    expect(escapeHtml('plain text 123')).toBe('plain text 123');
  });
});
