/**
 * Welcome spotlight (U-23, UF-16) — a passive attention affordance on the
 * "Beginners Start Here" welcome card while the intro tutorial family was
 * never opened, never completed, and never dismissed.
 *
 * Deliberately NOT a tour: no veil, no focus trap, no scroll change, no
 * step machinery. The whole treatment is a halo on the existing card plus
 * a tag strip holding a dismiss button, and one polite announcement. The
 * same card serves both interfaces' welcome surfaces, so decorating it
 * once covers Forge and Classic.
 *
 * Sequencing: the caller hands in the first-visit gate's wait function —
 * inside the inert, aria-hidden #app a spotlight would be unreachable and
 * its announcement silenced.
 *
 * @license GPL-3.0-or-later
 */

import {
  getTutorialFamilyState,
  recordTutorialSpotlightDismissed,
  TUTORIAL_STATE_EVENT,
} from './tutorial-sandbox.js';
import { announce } from './announcer.js';

const SPOTLIGHT_FAMILY = 'intro';

// D-35: all three strings owner-approved verbatim 2026-08-13 (UF-16 Q-43).
const TAG_TEXT = 'New here? Start with this tour';
const DISMISS_LABEL = 'Dismiss tip';
const ANNOUNCEMENT =
  'Tip: the Beginners Start Here card on the welcome screen offers a guided three-minute tour.';

function isSpotlightCleared() {
  const state = getTutorialFamilyState(SPOTLIGHT_FAMILY);
  return Boolean(state.opened || state.completed || state.dismissed);
}

/**
 * Decorate the Beginners card once the first-visit gate has resolved, and
 * keep the decoration truthful: any registry write for the intro family
 * (opened, completed, or dismissed) removes it live.
 *
 * @param {Object} options
 * @param {() => Promise<void>} options.waitForFirstVisitAcceptance - The
 *   main.js gate; resolves immediately on ordinary boots.
 */
export async function initWelcomeSpotlight({ waitForFirstVisitAcceptance }) {
  if (isSpotlightCleared()) return;

  await waitForFirstVisitAcceptance();
  if (isSpotlightCleared()) return;

  const startBtn = document.querySelector('button[data-tutorial="intro"]');
  const card = startBtn?.closest('.role-path-card');
  if (!card || card.querySelector('.welcome-spotlight-tag')) return;

  const strip = document.createElement('div');
  strip.className = 'welcome-spotlight-tag';

  const text = document.createElement('span');
  text.className = 'welcome-spotlight-tag-text';
  text.textContent = TAG_TEXT;

  const dismissBtn = document.createElement('button');
  dismissBtn.type = 'button';
  dismissBtn.className = 'welcome-spotlight-dismiss';
  dismissBtn.textContent = DISMISS_LABEL;

  strip.append(text, dismissBtn);
  card.classList.add('welcome-spotlight');
  card.prepend(strip);

  const removeSpotlight = () => {
    document.removeEventListener(TUTORIAL_STATE_EVENT, onStateChange);
    card.classList.remove('welcome-spotlight');
    strip.remove();
  };

  const onStateChange = (event) => {
    if (event.detail?.familyId === SPOTLIGHT_FAMILY) {
      removeSpotlight();
    }
  };
  document.addEventListener(TUTORIAL_STATE_EVENT, onStateChange);

  dismissBtn.addEventListener('click', () => {
    // The registry write fires TUTORIAL_STATE_EVENT, which removes the
    // strip synchronously — focus must land before the button is gone.
    startBtn.focus();
    recordTutorialSpotlightDismissed(SPOTLIGHT_FAMILY);
  });

  // One polite tip, and only when the welcome surface is what's on screen —
  // a deep-link boot straight into a project keeps the decoration for a
  // later return to welcome but says nothing about an invisible card.
  if (document.body.dataset.appSurface !== 'project') {
    announce(ANNOUNCEMENT);
  }
}
