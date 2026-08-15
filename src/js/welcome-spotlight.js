/**
 * Welcome spotlight (U-23 UF-16, U-24 UF-17) — a passive attention
 * affordance on ONE welcome card at a time, while its tutorial family was
 * never opened, never completed, and never dismissed.
 *
 * Precedence (Q-44a): the Welcome Page Tour card wears the tip first.
 * Completing that tour hands the spotlight to the Beginners Start Here
 * card immediately (the U-24 chain, once); opening it without finishing
 * or dismissing the tip hands over on the next visit instead. Once the
 * welcome family carries any record, the Beginners card wears the tip
 * while the intro family is untouched.
 *
 * REVISED by Q-52c (UF-22): while the tour nudge is on screen the welcome
 * card wears no tip, because the dialog is already asking the same question
 * over the top of it. The tip appears when the dialog is answered. Q-44a's
 * "the welcome card wears the tip first" is superseded to that extent and
 * holds unchanged everywhere else, including the completion chain.
 *
 * Deliberately NOT a tour: no veil, no focus trap, no scroll change, no
 * step machinery. The whole treatment is a halo on the existing card plus
 * a tag strip holding a dismiss button, and one polite announcement. The
 * same cards serve both interfaces' welcome surfaces, so decorating one
 * covers Forge and Classic.
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

const WELCOME_FAMILY = 'welcome';
const INTRO_FAMILY = 'intro';

// D-35: tag, dismiss and the Beginners announcement owner-approved
// verbatim 2026-08-13 (UF-16 Q-43); the welcome announcement approved
// 2026-08-13 (UF-17 Q-44). The tag is shared — only one card wears it
// at a time.
const TAG_TEXT = 'New here? Start with this tour';
const DISMISS_LABEL = 'Dismiss tip';
const ANNOUNCEMENT_WELCOME =
  'Tip: the Welcome Page Tour card explains this screen in about two minutes.';
const ANNOUNCEMENT_INTRO =
  'Tip: the Beginners Start Here card on the welcome screen offers a guided three-minute tour.';

function isFamilyCleared(familyId) {
  const state = getTutorialFamilyState(familyId);
  return Boolean(state.opened || state.completed || state.dismissed);
}

/**
 * Decorate one card and keep the decoration truthful: any registry write
 * for its family (opened, completed, or dismissed) removes it live.
 *
 * @param {string} familyId - Registry family the decoration answers to
 * @param {string} tutorialId - data-tutorial value locating the card
 * @param {string} announcement - Polite tip text (suppressed in-project)
 */
function decorateCard(familyId, tutorialId, announcement) {
  const startBtn = document.querySelector(
    `button[data-tutorial="${tutorialId}"]`
  );
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
    if (event.detail?.familyId === familyId) {
      removeSpotlight();
    }
  };
  document.addEventListener(TUTORIAL_STATE_EVENT, onStateChange);

  dismissBtn.addEventListener('click', () => {
    // The registry write fires TUTORIAL_STATE_EVENT, which removes the
    // strip synchronously — focus must land before the button is gone.
    startBtn.focus();
    recordTutorialSpotlightDismissed(familyId);
  });

  // One polite tip, and only when the welcome surface is what's on screen —
  // a deep-link boot straight into a project keeps the decoration for a
  // later return to welcome but says nothing about an invisible card.
  if (document.body.dataset.appSurface !== 'project') {
    announce(announcement);
  }
}

/**
 * Decorate the right card once the first-visit gate has resolved, and arm
 * the U-24 completion chain.
 *
 * @param {Object} options
 * @param {() => Promise<void>} options.waitForFirstVisitAcceptance - The
 *   main.js gate; resolves immediately on ordinary boots.
 * @param {() => Promise<{startedTour: boolean}|void>} [options.waitForTourNudge]
 *   Q-52c: resolves once the UF-22 nudge has been answered, or immediately
 *   when it never showed. Optional so the module still stands alone.
 */
export async function initWelcomeSpotlight({
  waitForFirstVisitAcceptance,
  waitForTourNudge,
}) {
  if (isFamilyCleared(WELCOME_FAMILY) && isFamilyCleared(INTRO_FAMILY)) return;

  await waitForFirstVisitAcceptance();
  const nudge = waitForTourNudge ? await waitForTourNudge() : null;

  // Q-44a still says a tour merely OPENED hands the tip over on the next
  // visit, not on this one. Starting the tour from the nudge opens it during
  // this very load, so neither card is decorated underneath the running tour.
  // The chain below is armed either way, so finishing still hands over.
  if (!nudge?.startedTour) {
    if (!isFamilyCleared(WELCOME_FAMILY)) {
      decorateCard(WELCOME_FAMILY, 'welcome', ANNOUNCEMENT_WELCOME);
    } else if (!isFamilyCleared(INTRO_FAMILY)) {
      decorateCard(INTRO_FAMILY, 'intro', ANNOUNCEMENT_INTRO);
    }
  }

  // The U-24 chain, armed independently of the decoration: the 'opened'
  // write at tour start already stripped the welcome card's tag (and its
  // listener) long before 'completed' can arrive. Fires at most once;
  // the intro check happens at fire time so a user already inside the
  // intro tour is never re-tagged.
  const onChain = (event) => {
    if (event.detail?.familyId !== WELCOME_FAMILY) return;
    if (event.detail.field !== 'completed') return;
    document.removeEventListener(TUTORIAL_STATE_EVENT, onChain);
    if (!isFamilyCleared(INTRO_FAMILY)) {
      decorateCard(INTRO_FAMILY, 'intro', ANNOUNCEMENT_INTRO);
    }
  };
  document.addEventListener(TUTORIAL_STATE_EVENT, onChain);
}
