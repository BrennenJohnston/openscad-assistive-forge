/**
 * Mobile Drawer Controller
 * Implements off-canvas drawer pattern for parameters panel on mobile devices
 * Based on Bootstrap Offcanvas and WAI-ARIA Dialog practices
 */

const MOBILE_BREAKPOINT_PX = 768;

/**
 * Initialize the mobile drawer controller
 * Manages drawer state, focus trap, and accessibility attributes
 */
export function initDrawerController() {
  const drawer = document.getElementById('paramPanel');
  const backdrop = document.getElementById('drawerBackdrop');
  const toggleBtn = document.getElementById('mobileDrawerToggle');

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
  let focusTrapHandler = null;

  /**
   * Get all focusable elements within the drawer
   */
  function getFocusableElements() {
    const selectors = [
      'a[href]',
      'button:not([disabled])',
      'input:not([disabled])',
      'select:not([disabled])',
      'textarea:not([disabled])',
      '[tabindex]:not([tabindex="-1"])',
    ].join(',');

    return Array.from(drawer.querySelectorAll(selectors)).filter(
      (el) => el.offsetParent !== null
    );
  }

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

    // Update toggle button state
    toggleBtn.setAttribute('aria-expanded', 'true');
    toggleBtn.setAttribute('aria-label', 'Close parameters panel');

    // Show backdrop
    backdrop.classList.add('visible');

    // Open drawer
    drawer.classList.add('drawer-open');

    // Lock body scroll
    document.body.classList.add('drawer-open');
    document.body.style.top = `-${scrollY}px`;

    // Move focus into drawer
    const focusableElements = getFocusableElements();
    if (focusableElements.length > 0) {
      setTimeout(() => {
        focusableElements[0].focus();
      }, 300); // Wait for transition
    }

    // Set up focus trap
    focusTrapHandler = handleKeydown.bind(null, focusableElements);
    drawer.addEventListener('keydown', focusTrapHandler);
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

    // Update toggle button state
    toggleBtn.setAttribute('aria-expanded', 'false');
    toggleBtn.setAttribute('aria-label', 'Open parameters panel');

    // Hide backdrop
    backdrop.classList.remove('visible');

    // Close drawer
    drawer.classList.remove('drawer-open');

    // Unlock body scroll
    document.body.classList.remove('drawer-open');
    document.body.style.removeProperty('top');
    window.scrollTo(0, scrollY);

    // Remove focus trap
    if (focusTrapHandler) {
      drawer.removeEventListener('keydown', focusTrapHandler);
      focusTrapHandler = null;
    }

    // Return focus to trigger
    if (triggerEl) {
      triggerEl.focus();
      triggerEl = null;
    }
  }

  /**
   * Handle keyboard events for ESC and Tab trap
   */
  function handleKeydown(focusableElements, event) {
    // ESC to close
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }

    // Tab cycling within drawer
    if (event.key === 'Tab') {
      if (focusableElements.length === 0) return;

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (event.shiftKey) {
        // Shift+Tab on first element: cycle to last
        if (document.activeElement === firstElement) {
          event.preventDefault();
          lastElement.focus();
        }
      } else {
        // Tab on last element: cycle to first
        if (document.activeElement === lastElement) {
          event.preventDefault();
          firstElement.focus();
        }
      }
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

  // Event listeners
  toggleBtn.addEventListener('click', toggle);
  backdrop.addEventListener('click', close);

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

        if (focusTrapHandler) {
          drawer.removeEventListener('keydown', focusTrapHandler);
          focusTrapHandler = null;
        }
      }
    }, 150);
  });
}
