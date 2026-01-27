/**
 * Service Worker Manager
 * Handles SW registration, updates, and user notifications
 * @license GPL-3.0-or-later
 */

import { getVersionString } from './version.js';
import { isValidServiceWorkerMessage } from './html-utils.js';

let registration = null;
let updateAvailable = false;
let updateCallback = null;

/**
 * Register service worker and set up update detection
 * @param {Object} options
 * @param {Function} options.onUpdateAvailable - Called when update is available
 * @param {Function} options.onUpdated - Called after SW has updated
 * @returns {Promise<ServiceWorkerRegistration|null>}
 */
export async function registerServiceWorker(options = {}) {
  if (!('serviceWorker' in navigator)) {
    console.log('[SW Manager] Service workers not supported');
    return null;
  }

  updateCallback = options.onUpdateAvailable;

  try {
    registration = await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
    });

    console.log('[SW Manager] Service worker registered');

    // Check for updates
    registration.addEventListener('updatefound', () => {
      const newWorker = registration.installing;
      console.log('[SW Manager] New service worker installing');

      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'installed') {
          if (navigator.serviceWorker.controller) {
            // New content available - there was an existing SW
            console.log('[SW Manager] New version available');
            updateAvailable = true;
            if (updateCallback) {
              updateCallback();
            }
          } else {
            // First install - no update, just caching
            console.log('[SW Manager] Content cached for offline use');
          }
        }
      });
    });

    // Listen for messages from SW
    navigator.serviceWorker.addEventListener('message', (event) => {
      // Validate message type against allowlist
      if (
        !isValidServiceWorkerMessage(event, ['SW_UPDATED', 'CACHE_CLEARED'])
      ) {
        console.warn(
          '[SW Manager] Ignoring invalid or unexpected message:',
          event.data
        );
        return;
      }

      if (event.data.type === 'SW_UPDATED') {
        console.log(
          '[SW Manager] Service worker updated to:',
          event.data.version
        );
        if (options.onUpdated) {
          options.onUpdated(event.data.version);
        }
      }

      if (event.data.type === 'CACHE_CLEARED') {
        console.log('[SW Manager] Cache cleared');
      }
    });

    // Check for updates periodically (every 60 minutes)
    setInterval(
      () => {
        registration.update();
      },
      60 * 60 * 1000
    );

    return registration;
  } catch (error) {
    console.error('[SW Manager] Registration failed:', error);
    return null;
  }
}

/**
 * Check if an update is available
 * @returns {boolean}
 */
export function isUpdateAvailable() {
  return updateAvailable;
}

/**
 * Apply pending service worker update
 * This will cause the page to reload
 */
export function applyUpdate() {
  if (!registration?.waiting) {
    console.log('[SW Manager] No waiting service worker');
    return;
  }

  // Tell the waiting SW to skip waiting and become active
  registration.waiting.postMessage({ type: 'SKIP_WAITING' });

  // Reload once the new SW takes over
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    window.location.reload();
  });
}

/**
 * Clear all service worker caches
 * @returns {Promise<void>}
 */
export async function clearCaches() {
  if (navigator.serviceWorker.controller) {
    return new Promise((resolve) => {
      const messageChannel = new MessageChannel();
      messageChannel.port1.onmessage = () => resolve();

      navigator.serviceWorker.controller.postMessage({ type: 'CLEAR_CACHE' }, [
        messageChannel.port2,
      ]);

      // Timeout fallback
      setTimeout(resolve, 5000);
    });
  }
}

/**
 * Get current service worker version
 * @returns {Promise<string|null>}
 */
export async function getSwVersion() {
  if (!navigator.serviceWorker.controller) {
    return null;
  }

  return new Promise((resolve) => {
    const messageChannel = new MessageChannel();
    messageChannel.port1.onmessage = (event) => {
      resolve(event.data?.version || null);
    };

    navigator.serviceWorker.controller.postMessage({ type: 'GET_VERSION' }, [
      messageChannel.port2,
    ]);

    // Timeout fallback
    setTimeout(() => resolve(null), 2000);
  });
}

/**
 * Show update toast notification
 * @param {HTMLElement} container - Container to add toast to
 */
export function showUpdateToast(container = document.body) {
  // Remove existing toast if any
  const existing = document.getElementById('update-toast');
  if (existing) {
    existing.remove();
  }

  const toast = document.createElement('div');
  toast.id = 'update-toast';
  toast.className = 'update-toast';
  toast.setAttribute('role', 'alert');
  toast.setAttribute('aria-live', 'polite');
  toast.innerHTML = `
    <div class="update-toast-content">
      <span class="update-toast-icon" aria-hidden="true">🔄</span>
      <span class="update-toast-message">
        A new version is available!
        <span class="update-toast-version">${getVersionString()}</span>
      </span>
      <div class="update-toast-actions">
        <button type="button" class="update-toast-btn update-toast-btn--primary" id="updateNowBtn">
          Update Now
        </button>
        <button type="button" class="update-toast-btn update-toast-btn--dismiss" id="updateLaterBtn" aria-label="Dismiss">
          Later
        </button>
      </div>
    </div>
  `;

  // Add styles if not present
  if (!document.getElementById('update-toast-styles')) {
    const styles = document.createElement('style');
    styles.id = 'update-toast-styles';
    styles.textContent = `
      .update-toast {
        position: fixed;
        bottom: 1rem;
        left: 50%;
        transform: translateX(-50%);
        z-index: 10000;
        max-width: 90vw;
        width: 400px;
        background: var(--surface-2, #1a1a2e);
        border: 1px solid var(--border-color, #333);
        border-radius: 0.5rem;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
        animation: slideUp 0.3s ease-out;
      }
      
      @keyframes slideUp {
        from {
          transform: translateX(-50%) translateY(100%);
          opacity: 0;
        }
        to {
          transform: translateX(-50%) translateY(0);
          opacity: 1;
        }
      }
      
      .update-toast-content {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        padding: 1rem;
        flex-wrap: wrap;
      }
      
      .update-toast-icon {
        font-size: 1.5rem;
      }
      
      .update-toast-message {
        flex: 1;
        min-width: 150px;
        color: var(--text-primary, #fff);
      }
      
      .update-toast-version {
        display: block;
        font-size: 0.75rem;
        color: var(--text-muted, #888);
        margin-top: 0.25rem;
      }
      
      .update-toast-actions {
        display: flex;
        gap: 0.5rem;
      }
      
      .update-toast-btn {
        padding: 0.5rem 1rem;
        border-radius: 0.25rem;
        font-size: 0.875rem;
        cursor: pointer;
        transition: background-color 0.2s;
      }
      
      .update-toast-btn--primary {
        background: var(--accent-bg, #4a9eff);
        color: var(--accent-fg, #fff);
        border: none;
      }
      
      .update-toast-btn--primary:hover {
        background: var(--accent-bg-hover, #3a8eef);
      }
      
      .update-toast-btn--dismiss {
        background: transparent;
        color: var(--text-muted, #888);
        border: 1px solid var(--border-color, #333);
      }
      
      .update-toast-btn--dismiss:hover {
        background: var(--surface-3, #2a2a3e);
      }
      
      @media (prefers-reduced-motion: reduce) {
        .update-toast {
          animation: none;
        }
      }
    `;
    document.head.appendChild(styles);
  }

  container.appendChild(toast);

  // Event handlers
  document.getElementById('updateNowBtn').addEventListener('click', () => {
    applyUpdate();
  });

  document.getElementById('updateLaterBtn').addEventListener('click', () => {
    toast.remove();
  });

  // Auto-dismiss after 30 seconds
  setTimeout(() => {
    if (document.getElementById('update-toast')) {
      toast.remove();
    }
  }, 30000);
}

/**
 * Check for updates manually
 * @returns {Promise<boolean>} True if update is available
 */
export async function checkForUpdates() {
  if (!registration) {
    return false;
  }

  try {
    await registration.update();
    return updateAvailable;
  } catch (error) {
    console.error('[SW Manager] Update check failed:', error);
    return false;
  }
}
