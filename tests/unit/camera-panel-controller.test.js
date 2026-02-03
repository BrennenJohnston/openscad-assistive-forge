import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { initCameraPanelController } from '../../src/js/camera-panel-controller.js'

// Use standardized storage keys per UI_STANDARDS.md
const STORAGE_KEY_COLLAPSED = 'openscad-drawer-camera-state'
const STORAGE_KEY_MOBILE_COLLAPSED = 'openscad-drawer-camera-mobile-state'

function setupDom({ includeMobile = false, includeAnnouncer = false, includeViewButtons = false } = {}) {
  document.body.innerHTML = `
    <div class="preview-panel"></div>
    <div id="cameraPanel" class="camera-panel"></div>
    <button id="cameraPanelToggle"></button>
    ${includeMobile ? `
      <div id="cameraDrawer" class="camera-drawer"></div>
      <button id="cameraDrawerToggle"></button>
      <div id="cameraDrawerBody"></div>
      <button id="mobileCameraRotateLeft"></button>
      <button id="mobileCameraRotateRight"></button>
      <button id="mobileCameraRotateUp"></button>
      <button id="mobileCameraRotateDown"></button>
      <button id="mobileCameraPanLeft"></button>
      <button id="mobileCameraPanRight"></button>
      <button id="mobileCameraPanUp"></button>
      <button id="mobileCameraPanDown"></button>
      <button id="mobileCameraZoomIn"></button>
      <button id="mobileCameraZoomOut"></button>
      <button id="mobileCameraResetView"></button>
    ` : ''}
    ${includeViewButtons ? `
      <button class="camera-view-btn" data-view="top">Top</button>
      <button class="camera-view-btn" data-view="front">Front</button>
      <button class="camera-view-btn" data-view="right">Right</button>
      <button class="camera-view-btn" data-view="diagonal">Diagonal</button>
    ` : ''}
    ${includeAnnouncer ? '<div id="srAnnouncer"></div>' : ''}
  `
}

describe('Camera Panel Controller', () => {
  beforeEach(() => {
    localStorage.clear()
    document.body.innerHTML = ''
  })

  afterEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('returns null when required elements are missing', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const controller = initCameraPanelController()
    expect(controller).toBeNull()
    expect(warnSpy).toHaveBeenCalled()
  })

  it('defaults to collapsed and toggles state', () => {
    setupDom()
    const controller = initCameraPanelController()
    const panel = document.getElementById('cameraPanel')
    const toggleBtn = document.getElementById('cameraPanelToggle')

    expect(controller).toBeTruthy()
    expect(panel.classList.contains('collapsed')).toBe(true)
    expect(toggleBtn.getAttribute('aria-expanded')).toBe('false')

    toggleBtn.click()
    expect(panel.classList.contains('collapsed')).toBe(false)
    expect(localStorage.getItem(STORAGE_KEY_COLLAPSED)).toBe('false')

    toggleBtn.click()
    expect(panel.classList.contains('collapsed')).toBe(true)
    expect(localStorage.getItem(STORAGE_KEY_COLLAPSED)).toBe('true')
  })

  it('handles localStorage errors when initializing mobile drawer', () => {
    setupDom({ includeMobile: true })
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const originalGetItem = localStorage.getItem
    const originalSetItem = localStorage.setItem
    localStorage.getItem = () => { throw new Error('Storage error') }
    localStorage.setItem = () => { throw new Error('Storage error') }

    expect(() => initCameraPanelController()).not.toThrow()
    const drawer = document.getElementById('cameraDrawer')
    const toggleBtn = document.getElementById('cameraDrawerToggle')

    expect(drawer.classList.contains('collapsed')).toBe(true)
    expect(toggleBtn.getAttribute('aria-expanded')).toBe('false')
    expect(() => toggleBtn.click()).not.toThrow()
    expect(warnSpy).toHaveBeenCalled()

    localStorage.getItem = originalGetItem
    localStorage.setItem = originalSetItem
  })

  it('toggles mobile drawer and updates preview padding/aria', () => {
    setupDom({ includeMobile: true })
    localStorage.setItem(STORAGE_KEY_MOBILE_COLLAPSED, 'false')

    initCameraPanelController()

    const drawer = document.getElementById('cameraDrawer')
    const previewPanel = document.querySelector('.preview-panel')
    const toggleBtn = document.getElementById('cameraDrawerToggle')

    expect(drawer.classList.contains('collapsed')).toBe(false)
    expect(previewPanel.classList.contains('camera-drawer-open')).toBe(true)
    expect(toggleBtn.getAttribute('aria-expanded')).toBe('true')

    toggleBtn.click()
    expect(drawer.classList.contains('collapsed')).toBe(true)
    expect(previewPanel.classList.contains('camera-drawer-open')).toBe(false)
    expect(localStorage.getItem(STORAGE_KEY_MOBILE_COLLAPSED)).toBe('true')
  })

  it('updates preview padding on resize', () => {
    setupDom({ includeMobile: true })
    localStorage.setItem(STORAGE_KEY_MOBILE_COLLAPSED, 'false')
    vi.useFakeTimers()

    initCameraPanelController()
    const previewPanel = document.querySelector('.preview-panel')

    Object.defineProperty(window, 'innerWidth', {
      value: 900,
      writable: true,
      configurable: true,
    })
    window.dispatchEvent(new Event('resize'))
    vi.advanceTimersByTime(200)
    expect(previewPanel.classList.contains('camera-drawer-open')).toBe(false)

    window.innerWidth = 500
    window.dispatchEvent(new Event('resize'))
    vi.advanceTimersByTime(200)
    expect(previewPanel.classList.contains('camera-drawer-open')).toBe(true)
  })

  it('announces mobile camera actions', async () => {
    setupDom({ includeMobile: true, includeAnnouncer: true })
    vi.useFakeTimers()
    
    // Mock requestAnimationFrame to execute callback synchronously
    const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(cb => {
      cb(0)
      return 0
    })

    const previewManager = {
      rotateHorizontal: vi.fn(),
      zoomCamera: vi.fn(),
      fitCameraToModel: vi.fn(),
      mesh: { id: 'mesh' },
    }

    initCameraPanelController({ previewManager })
    const announcer = document.getElementById('srAnnouncer')

    document.getElementById('mobileCameraRotateLeft').click()
    expect(previewManager.rotateHorizontal).toHaveBeenCalled()
    expect(announcer.textContent).toBe('Rotate left')

    document.getElementById('mobileCameraZoomIn').click()
    expect(previewManager.zoomCamera).toHaveBeenCalled()
    expect(announcer.textContent).toBe('Zoom in')

    document.getElementById('mobileCameraResetView').click()
    expect(previewManager.fitCameraToModel).toHaveBeenCalled()

    // Wait for clear timeout
    vi.advanceTimersByTime(2000)
    expect(announcer.textContent).toBe('')
    
    rafSpy.mockRestore()
  })

  it('wires up standard view buttons and calls setCameraView', () => {
    setupDom({ includeViewButtons: true, includeAnnouncer: true })
    vi.useFakeTimers()
    
    // Mock requestAnimationFrame to execute callback synchronously
    const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(cb => {
      cb(0)
      return 0
    })

    const previewManager = {
      setCameraView: vi.fn(),
      mesh: { id: 'mesh' },
    }

    initCameraPanelController({ previewManager })

    // Click the "top" view button
    const topBtn = document.querySelector('.camera-view-btn[data-view="top"]')
    topBtn.click()
    expect(previewManager.setCameraView).toHaveBeenCalledWith('top')

    // Click the "front" view button
    const frontBtn = document.querySelector('.camera-view-btn[data-view="front"]')
    frontBtn.click()
    expect(previewManager.setCameraView).toHaveBeenCalledWith('front')

    // Click the "diagonal" view button
    const diagonalBtn = document.querySelector('.camera-view-btn[data-view="diagonal"]')
    diagonalBtn.click()
    expect(previewManager.setCameraView).toHaveBeenCalledWith('diagonal')

    rafSpy.mockRestore()
  })

  it('still calls setCameraView when no model loaded (handles internally)', () => {
    setupDom({ includeViewButtons: true, includeAnnouncer: true })
    vi.useFakeTimers()
    
    // Mock requestAnimationFrame to execute callback synchronously
    const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(cb => {
      cb(0)
      return 0
    })

    const previewManager = {
      setCameraView: vi.fn(),
      mesh: null, // No model loaded
    }

    initCameraPanelController({ previewManager })

    // Click view button - setCameraView is called (it handles no-mesh case internally)
    const topBtn = document.querySelector('.camera-view-btn[data-view="top"]')
    topBtn.click()
    expect(previewManager.setCameraView).toHaveBeenCalledWith('top')

    rafSpy.mockRestore()
  })

  it('announces fallback message when previewManager has no setCameraView method', () => {
    setupDom({ includeViewButtons: true, includeAnnouncer: true })
    vi.useFakeTimers()
    
    // Mock requestAnimationFrame to execute callback synchronously
    const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(cb => {
      cb(0)
      return 0
    })

    // PreviewManager without setCameraView method
    const previewManager = {
      mesh: null, // No model loaded and no setCameraView
    }

    initCameraPanelController({ previewManager })
    const announcer = document.getElementById('srAnnouncer')

    // Click view button - should announce fallback message
    const topBtn = document.querySelector('.camera-view-btn[data-view="top"]')
    topBtn.click()
    expect(announcer.textContent).toBe('Load a model first')

    rafSpy.mockRestore()
  })
})
