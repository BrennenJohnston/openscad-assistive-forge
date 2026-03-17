import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  openModal,
  closeModal,
  setupModalCloseHandlers,
  initStaticModals,
  isAnyModalOpen,
  getActiveModal,
} from '../../src/js/modal-manager.js'

const makeVisible = (el) => {
  Object.defineProperty(el, 'offsetWidth', { value: 10, configurable: true })
  Object.defineProperty(el, 'offsetHeight', { value: 10, configurable: true })
  el.getClientRects = () => [{ width: 10, height: 10 }]
}

describe('Modal Manager', () => {
  let originalRaf

  beforeEach(() => {
    document.body.innerHTML = ''
    document.body.style.overflow = ''
    originalRaf = global.requestAnimationFrame
    global.requestAnimationFrame = (cb) => cb()
  })

  afterEach(() => {
    global.requestAnimationFrame = originalRaf
  })

  it('opens and closes a modal with focus management', () => {
    const trigger = document.createElement('button')
    trigger.textContent = 'Open'
    document.body.appendChild(trigger)
    trigger.focus()

    const modal = document.createElement('div')
    modal.classList.add('hidden')
    modal.setAttribute('aria-hidden', 'true')

    const first = document.createElement('button')
    first.textContent = 'First'
    makeVisible(first)
    modal.appendChild(first)

    const last = document.createElement('button')
    last.textContent = 'Last'
    makeVisible(last)
    modal.appendChild(last)

    document.body.appendChild(modal)

    const onClose = vi.fn()
    openModal(modal, { onClose })

    expect(modal.classList.contains('hidden')).toBe(false)
    expect(modal.getAttribute('aria-hidden')).toBe('false')
    expect(document.activeElement).toBe(first)
    expect(document.body.style.overflow).toBe('hidden')
    expect(isAnyModalOpen()).toBe(true)
    expect(getActiveModal()).toBe(modal)

    closeModal(modal)

    expect(modal.classList.contains('hidden')).toBe(true)
    expect(modal.getAttribute('aria-hidden')).toBe('true')
    expect(document.activeElement).toBe(trigger)
    expect(onClose).toHaveBeenCalled()
    expect(document.body.style.overflow).toBe('')
    expect(isAnyModalOpen()).toBe(false)
    expect(getActiveModal()).toBeNull()
  })

  it('traps focus within the modal on Tab navigation', () => {
    const modal = document.createElement('div')
    modal.classList.add('hidden')
    modal.setAttribute('aria-hidden', 'true')

    const first = document.createElement('button')
    first.textContent = 'First'
    makeVisible(first)
    modal.appendChild(first)

    const last = document.createElement('button')
    last.textContent = 'Last'
    makeVisible(last)
    modal.appendChild(last)

    document.body.appendChild(modal)

    openModal(modal)

    last.focus()
    const tabEvent = new KeyboardEvent('keydown', { key: 'Tab' })
    modal.dispatchEvent(tabEvent)
    expect(document.activeElement).toBe(first)

    first.focus()
    const shiftTabEvent = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true })
    modal.dispatchEvent(shiftTabEvent)
    expect(document.activeElement).toBe(last)

    closeModal(modal)
  })

  it('wires close handlers for buttons, overlay, and Escape', () => {
    const modal = document.createElement('div')
    modal.classList.add('hidden')
    modal.setAttribute('aria-hidden', 'true')

    const closeButton = document.createElement('button')
    closeButton.className = 'modal-close'
    closeButton.textContent = 'Close'
    makeVisible(closeButton)
    modal.appendChild(closeButton)

    const overlay = document.createElement('div')
    overlay.className = 'modal-overlay'
    makeVisible(overlay)
    modal.appendChild(overlay)

    const contentButton = document.createElement('button')
    contentButton.textContent = 'Content'
    makeVisible(contentButton)
    modal.appendChild(contentButton)

    document.body.appendChild(modal)

    openModal(modal)
    setupModalCloseHandlers(modal)

    closeButton.click()
    expect(modal.classList.contains('hidden')).toBe(true)

    openModal(modal)
    overlay.click()
    expect(modal.classList.contains('hidden')).toBe(true)

    openModal(modal)
    const escapeEvent = new KeyboardEvent('keydown', { key: 'Escape' })
    modal.dispatchEvent(escapeEvent)
    expect(modal.classList.contains('hidden')).toBe(true)
  })

  it('restores focus before setting aria-hidden=true on close', () => {
    const trigger = document.createElement('button')
    trigger.textContent = 'Open'
    document.body.appendChild(trigger)
    trigger.focus()

    const modal = document.createElement('div')
    modal.classList.add('hidden')
    modal.setAttribute('aria-hidden', 'true')

    const btn = document.createElement('button')
    btn.textContent = 'Action'
    makeVisible(btn)
    modal.appendChild(btn)
    document.body.appendChild(modal)

    openModal(modal)

    // Capture document.activeElement at the moment modal's aria-hidden is set to "true"
    let activeFocusWhenAriaHiddenSet = undefined
    const origSetAttribute = modal.setAttribute.bind(modal)
    modal.setAttribute = (name, value) => {
      if (name === 'aria-hidden' && value === 'true') {
        activeFocusWhenAriaHiddenSet = document.activeElement
      }
      return origSetAttribute(name, value)
    }

    closeModal(modal)

    // Focus must NOT be inside the modal when aria-hidden=true is applied
    expect(activeFocusWhenAriaHiddenSet).toBeDefined()
    expect(modal.contains(activeFocusWhenAriaHiddenSet)).toBe(false)
    expect(document.activeElement).toBe(trigger)
  })

  it('modals rendered with aria-hidden=true are not reachable by screen readers before opening', () => {
    // Verifies the expected initial HTML contract: static modals should carry
    // aria-hidden="true" so their content is not announced before first open.
    const modal = document.createElement('div')
    modal.className = 'modal hidden'
    modal.setAttribute('role', 'dialog')
    modal.setAttribute('aria-modal', 'true')
    modal.setAttribute('aria-hidden', 'true')

    const btn = document.createElement('button')
    btn.textContent = 'Inside'
    makeVisible(btn)
    modal.appendChild(btn)
    document.body.appendChild(modal)

    // Before opening: aria-hidden must be true
    expect(modal.getAttribute('aria-hidden')).toBe('true')

    openModal(modal)
    expect(modal.getAttribute('aria-hidden')).toBe('false')

    closeModal(modal)
    expect(modal.getAttribute('aria-hidden')).toBe('true')
  })

  it('initializes close handlers for static modals', () => {
    const featuresModal = document.createElement('div')
    featuresModal.id = 'featuresGuideModal'
    const closeButton = document.createElement('button')
    closeButton.id = 'featuresGuideClose'
    makeVisible(closeButton)
    const overlay = document.createElement('div')
    overlay.id = 'featuresGuideOverlay'
    makeVisible(overlay)
    featuresModal.appendChild(closeButton)
    featuresModal.appendChild(overlay)
    document.body.appendChild(featuresModal)

    initStaticModals()

    openModal(featuresModal)
    closeButton.click()
    expect(featuresModal.classList.contains('hidden')).toBe(true)

    openModal(featuresModal)
    overlay.click()
    expect(featuresModal.classList.contains('hidden')).toBe(true)
  })
})
