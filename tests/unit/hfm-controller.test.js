/**
 * The Alt View controller's effect on the preview it switches.
 *
 * The preview manager here is the real class with its drawing calls
 * stubbed, so the grid logic under test is the shipped one; the character
 * renderer is replaced, because the controller only needs its handle.
 *
 * @license GPL-3.0-or-later
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  BoxGeometry,
  Box3,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Vector3,
} from 'three'
import { PreviewManager } from '../../src/js/preview.js'

vi.mock('../../src/js/_hfm.js', () => ({
  initAltView: vi.fn(async () => ({
    enable: vi.fn(),
    disable: vi.fn(),
    render: vi.fn(),
    resize: vi.fn(),
    invalidate: vi.fn(),
    rebuildGlyphs: vi.fn(),
    setFontScale: vi.fn(),
    setContrastScale: vi.fn(),
    setPersistFade: vi.fn(),
    setReducedMotion: vi.fn(),
    clearPersistence: vi.fn(),
  })),
}))

function previewManagerStub() {
  const pm = Object.create(PreviewManager.prototype)
  Object.assign(pm, {
    gridEnabled: pm.loadGridPreference(),
    gridHelper: { visible: true },
    mesh: null,
    setPostLoadHook: vi.fn(),
    clearPostLoadHook: vi.fn(),
    setRenderOverride: vi.fn(),
    clearRenderOverride: vi.fn(),
    setResizeHook: vi.fn(),
    clearResizeHook: vi.fn(),
    detectTheme: vi.fn(() => 'dark'),
    updateTheme: vi.fn(),
    handleResize: vi.fn(),
    disableRotationCentering: vi.fn(),
  })
  pm.gridHelper.visible = pm.gridEnabled
  return pm
}

async function freshController(pm) {
  vi.resetModules()
  const { initHfmController } = await import('../../src/js/hfm-controller.js')
  return initHfmController({
    getPreviewManager: () => pm,
    getDisplayOptionsController: () => ({ refreshOverlays: vi.fn() }),
  })
}

describe('the character size the Alt View starts with', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.removeAttribute('data-ui-variant')
  })

  afterEach(() => {
    localStorage.clear()
    document.documentElement.removeAttribute('data-ui-variant')
  })

  async function lastAltView() {
    const { initAltView } = await import('../../src/js/_hfm.js')
    return initAltView.mock.results.at(-1).value
  }

  it('draws finer characters when nothing is saved, and a saved size wins', async () => {
    const pm = previewManagerStub()
    const controller = await freshController(pm)
    const toggle = document.createElement('button')

    await controller.enableAltViewWithPreview(toggle)
    const altView = await lastAltView()
    expect(altView.setFontScale).toHaveBeenLastCalledWith(0.6)
    controller.disableAltViewWithPreview(toggle)

    localStorage.setItem('openscad-forge-hfm-font-scale', '1.2')
    const pm2 = previewManagerStub()
    const controller2 = await freshController(pm2)
    await controller2.enableAltViewWithPreview(toggle)
    expect((await lastAltView()).setFontScale).toHaveBeenLastCalledWith(1.2)
  })
})

describe('the grid when the Alt View turns on and off', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.removeAttribute('data-ui-variant')
  })

  afterEach(() => {
    localStorage.clear()
    document.documentElement.removeAttribute('data-ui-variant')
  })

  it('hides the grid in the Alt View, keeps one turned on there, and restores the ordinary grid after', async () => {
    const pm = previewManagerStub()
    const controller = await freshController(pm)
    const toggle = document.createElement('button')
    expect(pm.gridHelper.visible).toBe(true)

    await controller.enableAltViewWithPreview(toggle)
    expect(document.documentElement.getAttribute('data-ui-variant')).toBe('mono')
    expect(pm.gridHelper.visible).toBe(false)

    pm.toggleGrid(true)
    controller.disableAltViewWithPreview(toggle)
    expect(pm.gridHelper.visible).toBe(true)

    pm.toggleGrid(false)
    await controller.enableAltViewWithPreview(toggle)
    expect(pm.gridHelper.visible).toBe(true)

    controller.disableAltViewWithPreview(toggle)
    expect(pm.gridHelper.visible).toBe(false)
  })
})

describe('the model stays on the bed in the Alt View', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.removeAttribute('data-ui-variant')
  })

  afterEach(() => {
    localStorage.clear()
    document.documentElement.removeAttribute('data-ui-variant')
  })

  // A 50 x 40 x 30 box as a load leaves it: centred, then raised by the
  // auto-bed so its bottom sits on the grid at Z 0 and the orbit target at
  // its middle.
  function previewManagerWithBox() {
    const pm = previewManagerStub()
    const geometry = new BoxGeometry(50, 40, 30)
    geometry.translate(0, 0, 15)
    pm.mesh = new Mesh(geometry, new MeshBasicMaterial())
    pm.autoBedEnabled = true
    pm.autoBedOffset = 15
    pm.rotationCenteringEnabled = false
    pm.referenceOverlay = null
    pm.camera = new PerspectiveCamera()
    pm.camera.position.set(100, -100, 100)
    pm.projectionMode = 'perspective'
    pm.controls = { target: new Vector3(0, 0, 15), update: vi.fn() }
    delete pm.disableRotationCentering
    return pm
  }

  const bottomZ = (pm) => {
    pm.mesh.updateMatrixWorld(true)
    return new Box3().setFromObject(pm.mesh).min.z
  }

  it('keeps the bottom on the grid and the orbit about the middle, on and off', async () => {
    const pm = previewManagerWithBox()
    const controller = await freshController(pm)
    const toggle = document.createElement('button')
    expect(bottomZ(pm)).toBeCloseTo(0)

    await controller.enableAltViewWithPreview(toggle)
    expect(bottomZ(pm)).toBeCloseTo(0)
    expect(pm.controls.target.z).toBeCloseTo(15)

    controller.disableAltViewWithPreview(toggle)
    expect(bottomZ(pm)).toBeCloseTo(0)
    expect(pm.controls.target.z).toBeCloseTo(15)
  })
})
