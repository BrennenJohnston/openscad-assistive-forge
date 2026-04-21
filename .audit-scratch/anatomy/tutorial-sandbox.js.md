# Anatomy: src/js/tutorial-sandbox.js

- Total lines: 3659
- Top-level declarations: 105
- Exports: 2
- Module-level mutable state (let/var): 23
- Section banners: 1

## Section banners

| Line | Banner |
|---:|---|
| 239 | /** * Wait for element to become visible using IntersectionObserver when available * @param {HTMLElement} element - Elem |

## Exports

- startTutorial
- closeTutorial

## Module-level mutable state

| Line | Name | Snippet |
|---:|---|---|
| 38 | activeTutorial | `let activeTutorial = null;` |
| 39 | currentStepIndex | `let currentStepIndex = 0;` |
| 40 | tutorialOverlay | `let tutorialOverlay = null;` |
| 41 | triggerElement | `let triggerElement = null;` |
| 42 | previousFocus | `let previousFocus = null; // Store focus to restore on close` |
| 43 | preTutorialMode | `let preTutorialMode = null; // Store UI mode to restore on close` |
| 44 | completionListeners | `let completionListeners = [];` |
| 45 | stepCompleted | `let stepCompleted = true;` |
| 46 | resizeObserver | `let resizeObserver = null;` |
| 47 | isMinimized | `let isMinimized = false;` |
| 48 | drawerObserver | `let drawerObserver = null;` |
| 49 | focusTrapCleanup | `let focusTrapCleanup = null; // Cleanup function for focus trap` |
| 50 | consecutiveFailures | `let consecutiveFailures = 0; // Track consecutive step failures` |
| 51 | isNavigating | `let isNavigating = false; // Debounce navigation clicks` |
| 52 | isPaused | `let isPaused = false; // Pause state for visibility changes` |
| 53 | targetRemovalObserver | `let targetRemovalObserver = null; // Watch for target removal` |
| 54 | currentTarget | `let currentTarget = null; // Currently highlighted target` |
| 55 | scrollYBeforeLock | `let scrollYBeforeLock = 0; // Store scroll position for body lock` |
| 56 | didLockBodyScroll | `let didLockBodyScroll = false; // Avoid fighting other scroll locks (e.g. mobile drawer)` |
| 57 | wasAutoMinimized | `let wasAutoMinimized = false; // Track whether current minimized state was automatic` |
| 58 | isSettingUpStep | `let isSettingUpStep = false; // Guard flag to prevent drawer observer interference during step setup` |
| 606 | drawerChangeTimeout | `let drawerChangeTimeout = null;` |
| 2302 | repositionTimeout | `let repositionTimeout = null;` |

## Top-level declarations

| Line | Kind | Name |
|---:|---|---|
| 38 | module-level | activeTutorial |
| 39 | module-level | currentStepIndex |
| 40 | module-level | tutorialOverlay |
| 41 | module-level | triggerElement |
| 42 | module-level | previousFocus |
| 43 | module-level | preTutorialMode |
| 44 | module-level | completionListeners |
| 45 | module-level | stepCompleted |
| 46 | module-level | resizeObserver |
| 47 | module-level | isMinimized |
| 48 | module-level | drawerObserver |
| 49 | module-level | focusTrapCleanup |
| 50 | module-level | consecutiveFailures |
| 51 | module-level | isNavigating |
| 52 | module-level | isPaused |
| 53 | module-level | targetRemovalObserver |
| 54 | module-level | currentTarget |
| 55 | module-level | scrollYBeforeLock |
| 56 | module-level | didLockBodyScroll |
| 57 | module-level | wasAutoMinimized |
| 58 | module-level | isSettingUpStep |
| 60 | module-level | MAX_CONSECUTIVE_FAILURES |
| 61 | module-level | TUTORIAL_STORAGE_KEY |
| 62 | module-level | TUTORIAL_PROGRESS_EXPIRY_MS |
| 65 | module-level | SPOTLIGHT_PADDING |
| 66 | module-level | SPOTLIGHT_RADIUS |
| 67 | module-level | PANEL_OFFSET |
| 74 | function | findScrollableParent |
| 106 | function | isMobileViewport |
| 116 | function | isElementVisible |
| 158 | function | evaluateShowWhenCondition |
| 195 | function | resolveTargetByKey |
| 210 | function | resolveStepTarget |
| 246 | function | waitForIntersection |
| 288 | function | resolveTargetWithRetry |
| 374 | function | isMobileDrawerOpen |
| 384 | function | isParamPanelOpen |
| 402 | function | isInsideParamPanel |
| 410 | function | openMobileDrawer |
| 421 | function | closeMobileDrawer |
| 431 | function | openParamPanel |
| 450 | function | waitForTransition |
| 494 | function | executeEnsureAction |
| 584 | function | ensureStepPreconditions |
| 606 | module-level | drawerChangeTimeout |
| 612 | function | setupDrawerObserver |
| 644 | function | clearDrawerObserver |
| 661 | function | handleDrawerStateChange |
| 728 | function | checkIfAnyTargetInsideDrawer |
| 753 | function | _showDrawerReopenPrompt |
| 800 | function | shouldUseCompactContent |
| 815 | function | getStepContent |
| 825 | module-level | TUTORIALS |
| 1483 | function | saveTutorialProgress |
| 1500 | function | loadTutorialProgress |
| 1523 | function | clearTutorialProgress |
| 1537 | function | showTutorialResumeDialog |
| 1592 | function | showTutorialErrorDialog |
| 1649 | function | lockBodyScroll |
| 1665 | function | unlockBodyScroll |
| 1681 | function | navigateToStep |
| 1716 | function | findNextValidStepIndex |
| 1733 | function | skipToNextValidStep |
| 1749 | function | handleStepFailure |
| 1784 | function | watchTargetRemoval |
| 1820 | function | handleVisibilityChange |
| 1831 | function | pauseTutorial |
| 1841 | function | resumeTutorial |
| 1852 | function | handleBeforeUnload |
| 1861 | function | handlePopState |
| 1876 | function | setupTouchHandlers |
| 1943 | function | setupFocusTrap |
| 1955 | function | setBackgroundInert |
| 1989 | exported function | startTutorial |
| 2041 | function | createTutorialOverlay |
| 2162 | function | setupTutorialListeners |
| 2187 | function | handleKeydown |
| 2237 | function | showKeyboardHelp |
| 2252 | function | handleOverlayClick |
| 2274 | function | handleNextClick |
| 2302 | module-level | repositionTimeout |
| 2307 | function | scheduleReposition |
| 2320 | function | handleOrientationChange |
| 2339 | function | setupResizeObserver |
| 2369 | function | toggleMinimize |
| 2379 | function | setMinimized |
| 2406 | function | restoreIfAutoMinimized |
| 2417 | function | showStep |
| 2590 | function | updateSpotlightAndPosition |
| 2907 | function | getEffectiveViewport |
| 2933 | function | applyZoomAdjustments |
| 2947 | function | measureSafeAreaInsets |
| 2986 | function | calculateBestPosition |
| 3044 | function | positionPanel |
| 3151 | function | adjustTutorialZIndex |
| 3203 | function | setupCompletion |
| 3241 | function | attachCompletionListener |
| 3290 | function | attachDetailsOpenListener |
| 3347 | function | attachModalOpenListener |
| 3412 | function | attachModalCloseListener |
| 3447 | function | clearCompletionListeners |
| 3463 | exported function | closeTutorial |
| 3626 | function | isTutorialActive |
| 3637 | function | getCurrentTutorialId |
| 3652 | function | announceToScreenReader |

## Event listeners attached at module scope

| Line | Event | Snippet |
|---:|---|---|
| 476 | transitionend | `element.addEventListener('transitionend', handler);` |
| 779 | click | `reopenBtn.addEventListener('click', () => {` |
| 1570 | click | `modal.addEventListener('click', (e) => {` |
| 1576 | click | `modal.addEventListener('click', (e) => {` |
| 1625 | click | `modal.addEventListener('click', (e) => {` |
| 1631 | click | `modal.addEventListener('click', (e) => {` |
| 1921 | touchstart | `panel.addEventListener('touchstart', handleTouchStart, { passive: false });` |
| 1922 | touchend | `panel.addEventListener('touchend', handleTouchEnd, { passive: false });` |
| 1923 | contextmenu | `panel.addEventListener('contextmenu', handleContextMenu);` |
| 2150 | visibilitychange | `document.addEventListener('visibilitychange', handleVisibilityChange);` |
| 2153 | beforeunload | `window.addEventListener('beforeunload', handleBeforeUnload);` |
| 2156 | popstate | `window.addEventListener('popstate', handlePopState);` |
| 2169 | click | `closeBtn?.addEventListener('click', closeTutorial);` |
| 2170 | click | `minimizeBtn?.addEventListener('click', toggleMinimize);` |
| 2171 | click | `restoreBtn?.addEventListener('click', toggleMinimize);` |
| 2173 | click | `backBtn?.addEventListener('click', () =>` |
| 2176 | click | `nextBtn?.addEventListener('click', handleNextClick);` |
| 2179 | click | `tutorialOverlay.addEventListener('click', handleOverlayClick);` |
| 2181 | keydown | `document.addEventListener('keydown', handleKeydown);` |
| 2349 | scroll | `window.addEventListener('scroll', scheduleReposition, { passive: true });` |
| 2353 | resize | `window.visualViewport.addEventListener('resize', scheduleReposition);` |
| 2354 | scroll | `window.visualViewport.addEventListener('scroll', scheduleReposition);` |
| 2358 | orientationchange | `window.addEventListener('orientationchange', handleOrientationChange);` |
| 2362 | change | `screen.orientation.addEventListener('change', handleOrientationChange);` |
| 3335 | toggle | `details.addEventListener('toggle', handler, true);` |
| 3369 | click | `triggerBtn.addEventListener('click', clickHandler, true);` |