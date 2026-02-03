/**
 * Mobile Drawer Controller
 * Implements off-canvas drawer pattern for parameters panel on mobile devices
 * Based on Bootstrap Offcanvas and WAI-ARIA Dialog practices
 */

import { createDocumentFocusTrap } from './focus-trap.js';

const MOBILE_BREAKPOINT_PX = 768;

/**
 * Initialize the mobile drawer controller
 * Manages drawer state, focus trap, and accessibility attributes
 */
export function initDrawerController() {
  const drawer = document.getElementById('paramPanel');
  const backdrop = document.getElementById('drawerBackdrop');
  const toggleBtn = document.getElementById('mobileDrawerToggle');
  const closeBtn = document.getElementById('drawerCloseBtn');

  if (!drawer || !backdrop || !toggleBtn) {
    return;
  }

  // Preserve original semantics (desktop sidebar is a region, not a dialog)
  const originalAttrs = {
    role: drawer.getAttribute('role'),
    ariaLabel: drawer.getAttribute('aria-label'),
    ariaLabelledBy: drawer.getAttribute('aria-labelledby'),
    tabIndex: drawer.getAttribute('tabindex'),
  };

  let isOpen = false;
  let triggerEl = null;
  let scrollY = 0;
  let focusTrap = null;

  /**
   * Open the drawer
   */
  function open(trigger) {
    if (isOpen || window.innerWidth >= MOBILE_BREAKPOINT_PX) return;

    triggerEl = trigger || toggleBtn;
    isOpen = true;

    // Save scroll position
    scrollY = window.scrollY;

    // Transform drawer to dialog on mobile
    drawer.setAttribute('role', 'dialog');
    drawer.setAttribute('aria-modal', 'true');
    drawer.setAttribute('aria-labelledby', 'parameters-heading');
    drawer.removeAttribute('aria-label');
    // Ensure the dialog container itself can receive focus (needed for robust focus trapping)
    drawer.setAttribute('tabindex', '-1');

    // Update toggle button state
    toggleBtn.setAttribute('aria-expanded', 'true');
    toggleBtn.setAttribute('aria-label', 'Close parameters panel');

    // Show backdrop
    backdrop.classList.add('visible');

    // Open drawer
    drawer.classList.add('drawer-open');

    // Show close button on mobile
    if (closeBtn) {
      closeBtn.style.display = 'flex';
    }

    // Lock body scroll
    document.body.classList.add('drawer-open');
    document.body.style.top = `-${scrollY}px`;

    // Set up focus trap using shared utility (document-level so it works even if focus escapes)
    // ESC should close even if focus isn't inside the drawer (e.g. on toggle button)
    focusTrap = createDocumentFocusTrap(drawer, {
      onEscape: close,
      fallbackFocus: drawer,
    });
    focusTrap.activate({
      initialFocusDelay: 300, // Wait for transition
    });
  }

  /**
   * Close the drawer
   */
  function close() {
    if (!isOpen) return;

    isOpen = false;

    // Restore original ARIA attributes
    if (originalAttrs.role) {
      drawer.setAttribute('role', originalAttrs.role);
    }
    drawer.removeAttribute('aria-modal');
    drawer.removeAttribute('aria-labelledby');
    if (originalAttrs.ariaLabel) {
      drawer.setAttribute('aria-label', originalAttrs.ariaLabel);
    }
    // Restore original tabindex (or remove if none)
    if (originalAttrs.tabIndex !== null) {
      drawer.setAttribute('tabindex', originalAttrs.tabIndex);
    } else {
      drawer.removeAttribute('tabindex');
    }

    // Update toggle button state
    toggleBtn.setAttribute('aria-expanded', 'false');
    toggleBtn.setAttribute('aria-label', 'Open parameters panel');

    // Hide backdrop
    backdrop.classList.remove('visible');

    // Close drawer
    drawer.classList.remove('drawer-open');

    // Hide close button
    if (closeBtn) {
      closeBtn.style.display = 'none';
    }

    // Unlock body scroll
    document.body.classList.remove('drawer-open');
    document.body.style.removeProperty('top');
    window.scrollTo(0, scrollY);

    // Deactivate focus trap
    if (focusTrap) {
      focusTrap.deactivate();
      focusTrap = null;
    }

    // Return focus to trigger
    if (triggerEl) {
      triggerEl.focus();
      triggerEl = null;
    }
  }

  /**
   * Toggle drawer open/close
   */
  function toggle(event) {
    event.preventDefault();
    if (isOpen) {
      close();
    } else {
      open(event.currentTarget);
    }
  }

  // Guard backdrop closes during parameter interaction
  let backdropPointerStarted = false;
  let ignoreBackdropClose = false;
  let activeIgnorePointerId = null;

  /**
   * Track pointerdown on backdrop - only allow close if pointer started here
   */
  backdrop.addEventListener('pointerdown', (event) => {
    // Only track if the event target is the backdrop itself
    if (event.target === backdrop && !ignoreBackdropClose) {
      backdropPointerStarted = true;
    }
  });

  /**
   * Close drawer only if pointer started AND ended on backdrop
   */
  backdrop.addEventListener('pointerup', (event) => {
    if (
      event.target === backdrop &&
      backdropPointerStarted &&
      !ignoreBackdropClose
    ) {
      close();
    }
    backdropPointerStarted = false;
  });

  /**
   * Reset pointer tracking if pointer leaves backdrop
   */
  backdrop.addEventListener('pointerleave', () => {
    backdropPointerStarted = false;
  });

  /**
   * Track pointerdown inside drawer - set ignore flag to prevent
   * accidental backdrop closes when user drags from inside drawer
   */
  drawer.addEventListener('pointerdown', (event) => {
    // While a pointer is down that started inside the drawer, never allow a backdrop-close.
    // This prevents "drag a slider then lift finger on backdrop" from closing the drawer.
    ignoreBackdropClose = true;
    activeIgnorePointerId = event.pointerId ?? null;
    backdropPointerStarted = false;

    const clearIgnore = (e) => {
      if (
        activeIgnorePointerId !== null &&
        e?.pointerId !== undefined &&
        e.pointerId !== activeIgnorePointerId
      ) {
        return;
      }
      ignoreBackdropClose = false;
      activeIgnorePointerId = null;
      window.removeEventListener('pointerup', clearIgnore, true);
      window.removeEventListener('pointercancel', clearIgnore, true);
    };

    window.addEventListener('pointerup', clearIgnore, true);
    window.addEventListener('pointercancel', clearIgnore, true);
  });

  // Event listeners
  toggleBtn.addEventListener('click', toggle);

  // Wire up close button
  if (closeBtn) {
    closeBtn.addEventListener('click', close);
  }

  // Close drawer on resize to desktop breakpoint
  let resizeTimeout;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      if (window.innerWidth >= MOBILE_BREAKPOINT_PX && isOpen) {
        // Ensure drawer is not in modal mode on desktop
        if (originalAttrs.role) {
          drawer.setAttribute('role', originalAttrs.role);
        }
        drawer.removeAttribute('aria-modal');
        drawer.removeAttribute('aria-labelledby');
        if (originalAttrs.ariaLabel) {
          drawer.setAttribute('aria-label', originalAttrs.ariaLabel);
        }
        drawer.classList.remove('drawer-open');
        backdrop.classList.remove('visible');
        document.body.classList.remove('drawer-open');
        document.body.style.removeProperty('top');
        isOpen = false;

        // Deactivate focus trap
        if (focusTrap) {
          focusTrap.deactivate();
          focusTrap = null;
        }
      }
    }, 150);
  });
}
