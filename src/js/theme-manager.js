/**
 * Theme Manager - Handles light/dark mode switching
 * @license GPL-3.0-or-later
 */

import {
  amber,
  amberDark,
  green,
  greenDark,
  red,
  redDark,
  slate,
  slateA,
  slateDark,
  slateDarkA,
  teal,
  tealDark,
  yellow,
  yellowDark,
} from '@radix-ui/colors';

const THEME_KEY = 'openscad-customizer-theme';
const HIGH_CONTRAST_KEY = 'openscad-customizer-high-contrast';
const THEMES = {
  AUTO: 'auto',
  LIGHT: 'light',
  DARK: 'dark',
};

const RADIX_SCALES = {
  light: [yellow, green, teal, slate, red, amber, slateA],
  dark: [
    yellowDark,
    greenDark,
    tealDark,
    slateDark,
    redDark,
    amberDark,
    slateDarkA,
  ],
};

const toCssVarName = (key) => {
  const withHyphen = key.replace(/([a-z])([A-Z])/g, '$1-$2');
  const lower = withHyphen.toLowerCase();
  if (/-a\d+$/i.test(lower)) {
    return `--${lower}`;
  }
  return `--${lower.replace(/(\D)(\d)/g, '$1-$2')}`;
};

const applyRadixScaleSet = (root, scales) => {
  scales.forEach((scale) => {
    Object.entries(scale).forEach(([key, value]) => {
      root.style.setProperty(toCssVarName(key), value);
    });
  });
};

/**
 * Theme Manager Class
 */
export class ThemeManager {
  constructor() {
    this.currentTheme = this.loadTheme();
    this.highContrast = this.loadHighContrast();
    this.listeners = [];
  }

  /**
   * Load theme preference from localStorage
   * @returns {string} Theme preference (auto, light, or dark)
   */
  loadTheme() {
    try {
      const saved = localStorage.getItem(THEME_KEY);
      if (saved && Object.values(THEMES).includes(saved)) {
        return saved;
      }
    } catch (error) {
      console.warn('Failed to load theme preference:', error);
    }
    return THEMES.AUTO; // Default to auto (follow system)
  }

  /**
   * Save theme preference to localStorage
   * @param {string} theme - Theme to save
   */
  saveTheme(theme) {
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch (error) {
      console.warn('Failed to save theme preference:', error);
    }
  }

  /**
   * Load high contrast preference from localStorage
   * @returns {boolean} High contrast enabled
   */
  loadHighContrast() {
    try {
      const saved = localStorage.getItem(HIGH_CONTRAST_KEY);
      return saved === 'true';
    } catch (error) {
      console.warn('Failed to load high contrast preference:', error);
    }
    return false; // Default to off
  }

  /**
   * Save high contrast preference to localStorage
   * @param {boolean} enabled - High contrast enabled
   */
  saveHighContrast(enabled) {
    try {
      localStorage.setItem(HIGH_CONTRAST_KEY, enabled.toString());
    } catch (error) {
      console.warn('Failed to save high contrast preference:', error);
    }
  }

  /**
   * Apply theme to document
   * @param {string} theme - Theme to apply (auto, light, or dark)
   */
  applyTheme(theme) {
    const root = document.documentElement;

    if (theme === THEMES.AUTO) {
      // Remove data-theme attribute to let system preference take over
      root.removeAttribute('data-theme');
    } else {
      // Set explicit theme
      root.setAttribute('data-theme', theme);
    }

    this.currentTheme = theme;
    this.saveTheme(theme);

    // Ensure Radix scales match resolved theme (light/dark)
    this.applyRadixScales(this.getActiveTheme());

    // Notify listeners
    this.notifyListeners();

    console.log(`[Theme] Applied: ${theme}`);
  }

  /**
   * Apply high contrast mode
   * @param {boolean} enabled - Enable high contrast
   */
  applyHighContrast(enabled) {
    const root = document.documentElement;

    if (enabled) {
      root.setAttribute('data-high-contrast', 'true');
    } else {
      root.removeAttribute('data-high-contrast');
    }

    this.highContrast = enabled;
    this.saveHighContrast(enabled);

    // Notify listeners
    this.notifyListeners();

    console.log(`[Theme] High Contrast: ${enabled ? 'ON' : 'OFF'}`);
  }

  /**
   * Toggle high contrast mode
   * @returns {boolean} New high contrast state
   */
  toggleHighContrast() {
    const newState = !this.highContrast;
    this.applyHighContrast(newState);
    return newState;
  }

  /**
   * Get the currently active theme (resolved)
   * @returns {string} 'light' or 'dark'
   */
  getActiveTheme() {
    if (this.currentTheme === THEMES.AUTO) {
      // Check system preference
      return window.matchMedia('(prefers-color-scheme: dark)').matches
        ? THEMES.DARK
        : THEMES.LIGHT;
    }
    return this.currentTheme;
  }

  /**
   * Apply Radix color scales to match active theme.
   * @param {string} activeTheme - Resolved theme (light or dark)
   */
  applyRadixScales(activeTheme) {
    const root = document.documentElement;
    const scaleSet =
      activeTheme === THEMES.DARK ? RADIX_SCALES.dark : RADIX_SCALES.light;
    applyRadixScaleSet(root, scaleSet);
  }

  /**
   * Cycle to next theme: auto → light → dark → auto
   */
  cycleTheme() {
    const sequence = [THEMES.AUTO, THEMES.LIGHT, THEMES.DARK];
    const currentIndex = sequence.indexOf(this.currentTheme);
    const nextIndex = (currentIndex + 1) % sequence.length;
    const nextTheme = sequence[nextIndex];

    this.applyTheme(nextTheme);

    // Return user-friendly message
    const messages = {
      [THEMES.AUTO]: 'Theme: Auto (follows system)',
      [THEMES.LIGHT]: 'Theme: Light',
      [THEMES.DARK]: 'Theme: Dark',
    };

    return messages[nextTheme];
  }

  /**
   * Add listener for theme changes
   * @param {Function} callback - Called with new theme
   * @returns {Function} Unsubscribe function
   */
  addListener(callback) {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter((cb) => cb !== callback);
    };
  }

  /**
   * Remove listener
   * @param {Function} callback - Listener to remove
   */
  removeListener(callback) {
    this.listeners = this.listeners.filter((cb) => cb !== callback);
  }

  /**
   * Notify all listeners of theme/contrast change
   */
  notifyListeners() {
    const activeTheme = this.getActiveTheme();
    this.listeners.forEach((callback) => {
      try {
        callback(this.currentTheme, activeTheme, this.highContrast);
      } catch (error) {
        console.error('[Theme] Listener error:', error);
      }
    });
  }

  /**
   * Initialize theme on page load
   */
  init() {
    this.applyTheme(this.currentTheme);
    this.applyHighContrast(this.highContrast);

    // If something external mutates `data-theme` (e.g. tests, SSR, or manual overrides),
    // ensure Radix scale variables stay in sync with the resolved theme.
    // This keeps semantic tokens like `--slate-1` correct under `:root[data-theme='dark']`.
    try {
      const root = document.documentElement;
      const observer = new MutationObserver((mutations) => {
        for (const m of mutations) {
          if (m.type !== 'attributes') continue;
          if (m.attributeName !== 'data-theme') continue;

          const attr = root.getAttribute('data-theme');
          if (attr === THEMES.DARK || attr === THEMES.LIGHT) {
            this.applyRadixScales(attr);
          } else {
            // Attribute removed or invalid -> fall back to manager's resolved theme
            this.applyRadixScales(this.getActiveTheme());
          }
        }
      });
      observer.observe(root, {
        attributes: true,
        attributeFilter: ['data-theme'],
      });
    } catch (error) {
      // MutationObserver may not exist in some test environments
      console.warn('[Theme] Could not observe data-theme changes:', error);
    }

    // Listen for system theme changes when in auto mode
    window
      .matchMedia('(prefers-color-scheme: dark)')
      .addEventListener('change', (e) => {
        if (this.currentTheme === THEMES.AUTO) {
          console.log(
            `[Theme] System preference changed to ${e.matches ? 'dark' : 'light'}`
          );
          this.applyRadixScales(this.getActiveTheme());
          this.notifyListeners();
        }
      });

    return this;
  }

  /**
   * Get current state (for debugging/status)
   * @returns {Object} Current theme state
   */
  getState() {
    return {
      theme: this.currentTheme,
      activeTheme: this.getActiveTheme(),
      highContrast: this.highContrast,
    };
  }
}

/**
 * Create and export singleton instance
 */
export const themeManager = new ThemeManager();

/**
 * Initialize theme toggle button
 * @param {string} buttonId - ID of the toggle button element
 * @param {Function} onToggle - Optional callback when theme changes
 */
export function initThemeToggle(buttonId, onToggle = null) {
  const button = document.getElementById(buttonId);

  if (!button) {
    console.warn(`[Theme] Toggle button #${buttonId} not found`);
    return;
  }

  // Handle click
  button.addEventListener('click', () => {
    const message = themeManager.cycleTheme();

    // Update ARIA label
    const activeTheme = themeManager.getActiveTheme();
    button.setAttribute(
      'aria-label',
      `Current theme: ${activeTheme}. Click to cycle themes.`
    );

    // Optional callback
    if (onToggle) {
      onToggle(themeManager.currentTheme, activeTheme, message);
    }
  });

  // Handle keyboard (Enter/Space)
  button.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      button.click();
    }
  });

  // Set initial ARIA label
  const activeTheme = themeManager.getActiveTheme();
  button.setAttribute(
    'aria-label',
    `Current theme: ${activeTheme}. Click to cycle themes.`
  );

  console.log('[Theme] Toggle button initialized');
}
