/**
 * Mobile Drawer Controller
 * Implements off-canvas drawer pattern for parameters panel on mobile devices
 * Based on Bootstrap Offcanvas and WAI-ARIA Dialog practices
 *
 * STATE CONVENTION: Additive open — `drawer-open` class = open.
 * This is the opposite of Actions/Camera/Echo drawers which use
 * additive close (`collapsed` class = closed). See UI_STANDARDS.md.
 * @license GPL-3.0-or-later
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
   * D-70 (UF-38, signed Q-77). The drawer is a modal dialog, and since UF-37
   * the tour card stays on screen over it. Two consequences, both MEASURED at
   * 412x915 on intro step 4 before this change: eight consecutive Tabs never
   * left `#paramPanel`, so Next / Back / minimize / Close were unreachable;
   * and `aria-modal="true"` told assistive technology to ignore everything
   * outside the drawer, so a screen-reader user got no instructions at all on
   * the drawer steps - which is most of the tour.
   *
   * The drawer stays modal for every ordinary use. It only stands its
   * modality down for the one surface that is deliberately outside it.
   *
   * Both surfaces have to stand down together, and that is the one place this
   * goes further than Q-77's wording. The tour card is itself
   * `role="dialog" aria-modal="true"`, so dropping the drawer's claim alone
   * would not open the tour up - it would just swap which surface assistive
   * technology hides, leaving the reader with instructions they cannot act on.
   * While the two are on screen together, neither claims to be the only thing
   * there. The card's own claim is restored the moment the drawer closes;
   * whether a coach mark should ever have been `aria-modal` is a wider
   * question, raised for the owner rather than answered here.
   */
  const tourOverlay = () => document.querySelector('.tutorial-overlay');

  /** Claim modality only when nothing legitimate is sharing the screen. */
  function syncModality() {
    const overlay = tourOverlay();
    const card = overlay?.querySelector('.tutorial-panel');

    if (!isOpen) {
      // The drawer is gone; the card is alone again and may speak for itself.
      card?.setAttribute('aria-modal', 'true');
      return;
    }

    if (overlay) {
      drawer.removeAttribute('aria-modal');
      card?.removeAttribute('aria-modal');
    } else {
      drawer.setAttribute('aria-modal', 'true');
    }
  }

  /**
   * Open the drawer
   */
  function open(trigger) {
    if (isOpen || window.innerWidth >= MOBILE_BREAKPOINT_PX) return;
    // Classic lays the Customizer into its own stacked pane (classic.css
    // resets the off-canvas positioning); engaging the drawer there would
    // trap focus in a panel that is already in the normal document flow.
    if (document.body.dataset.uiMode === 'classic') return;

    triggerEl = trigger || toggleBtn;
    isOpen = true;

    // Save scroll position
    scrollY = window.scrollY;

    // Transform drawer to dialog on mobile
    drawer.setAttribute('role', 'dialog');
    syncModality();
    drawer.setAttribute('aria-labelledby', 'parameters-heading');
    drawer.removeAttribute('aria-label');
    // Ensure the dialog container itself can receive focus (needed for reliable focus trapping)
    drawer.setAttribute('tabindex', '-1');

    // Update toggle button state
    toggleBtn.setAttribute('aria-expanded', 'true');
    toggleBtn.setAttribute('aria-label', 'Close customizer panel');

    // Show backdrop
    backdrop.classList.add('visible');

    // Open drawer
    drawer.classList.add('drawer-open');

    // Show close button on mobile
    if (closeBtn) {
      closeBtn.classList.remove('hidden');
    }

    // Lock body scroll
    document.body.classList.add('drawer-open');
    document.body.style.top = `-${scrollY}px`;

    // Set up focus trap using shared utility (document-level so it works even if focus escapes)
    // ESC should close even if focus isn't inside the drawer (e.g. on toggle button)
    focusTrap = createDocumentFocusTrap(drawer, {
      onEscape: close,
      fallbackFocus: drawer,
      // Re-read on every Tab: a tour can start or finish while the drawer
      // is open, and the card must be reachable exactly while it exists.
      alsoTrap: tourOverlay,
    });
    focusTrap.activate({
      initialFocusDelay: 250, // --motion-slow (240ms) + 10ms buffer
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
    syncModality(); // hands the card back its own modality (D-70)
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
    toggleBtn.setAttribute('aria-label', 'Open customizer panel');

    // Hide backdrop
    backdrop.classList.remove('visible');

    // Close drawer
    drawer.classList.remove('drawer-open');

    // Hide close button
    if (closeBtn) {
      closeBtn.classList.add('hidden');
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

  // Entering Classic while the drawer is open would leave its focus trap
  // and scroll lock active on a panel Classic has re-parented into the
  // normal flow — close cleanly instead. Document event, not a controller
  // import: see the dispatch note in ui-mode-controller.applyMode().
  document.addEventListener('ui-mode-changed', (event) => {
    if (event.detail?.mode === 'classic' && isOpen) {
      close();
    }
  });

  // A tour can start or end while the drawer is already open, so modality is
  // re-decided rather than fixed at open time (D-70).
  document.addEventListener('forge:tutorial-run-change', syncModality);

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
        syncModality(); // D-70, as in close()

        // Deactivate focus trap
        if (focusTrap) {
          focusTrap.deactivate();
          focusTrap = null;
        }
      }
    }, 150);
  });
}
