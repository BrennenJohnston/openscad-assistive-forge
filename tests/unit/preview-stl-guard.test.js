/**
 * Tests for the empty-geometry guard in PreviewManager.loadSTL().
 * Three.js is mocked here because it requires WebGL which is unavailable in jsdom.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('three', () => {
  class Scene {
    constructor() {
      this.add = vi.fn()
      this.remove = vi.fn()
      this.background = null
    }
  }
  class Color {}
  class Vector3 {
    constructor() { this.set = vi.fn(); this.copy = vi.fn() }
    length() { return 1 }
  }
  class Box3 {
    constructor() {
      this.setFromObject = vi.fn()
      this.getCenter = vi.fn(() => ({ x: 0, y: 0, z: 0 }))
      this.getSize = vi.fn(() => ({ x: 1, y: 1, z: 1 }))
    }
  }
  class PerspectiveCamera {
    constructor() {
      this.position = { set: vi.fn(), copy: vi.fn() }
      this.up = { set: vi.fn(), copy: vi.fn() }
      this.lookAt = vi.fn()
      this.updateProjectionMatrix = vi.fn()
      this.aspect = 1
    }
  }
  class WebGLRenderer {
    constructor() {
      this.setSize = vi.fn()
      this.setPixelRatio = vi.fn()
      this.render = vi.fn()
      this.domElement = document.createElement('canvas')
      this.dispose = vi.fn()
      this.shadowMap = {}
    }
  }
  class AmbientLight {}
  class DirectionalLight {
    constructor() { this.position = { set: vi.fn() }; this.castShadow = false }
  }
  class GridHelper {
    constructor() {
      this.material = { opacity: 1, transparent: false, color: {} }
      this.scale = { set: vi.fn() }
      this.rotation = { x: 0, y: 0, z: 0 }
      this.position = { set: vi.fn(), copy: vi.fn() }
      this.visible = true
    }
  }
  class MeshPhongMaterial {
    constructor() {
      this.color = { setHex: vi.fn() }
      this.dispose = vi.fn()
    }
  }
  class Mesh {
    constructor(geo, mat) {
      this.geometry = geo || { dispose: vi.fn(), computeVertexNormals: vi.fn(), center: vi.fn() }
      this.material = mat || { dispose: vi.fn() }
    }
  }
  class BufferGeometry {
    constructor() {
      this.attributes = { position: { count: 0 } }
      this.dispose = vi.fn()
      this.computeVertexNormals = vi.fn()
      this.center = vi.fn()
      this.computeBoundingBox = vi.fn()
      this.boundingBox = { min: { y: 0 }, max: { y: 1 } }
    }
  }
  return {
    Scene, Color, Vector3, Box3, PerspectiveCamera, WebGLRenderer,
    AmbientLight, DirectionalLight, GridHelper, MeshPhongMaterial, Mesh, BufferGeometry,
    sRGBEncoding: 3001, PCFSoftShadowMap: 2,
  }
})

vi.mock('three/examples/jsm/controls/OrbitControls.js', () => {
  class OrbitControls {
    constructor() {
      this.update = vi.fn()
      this.addEventListener = vi.fn()
      this.removeEventListener = vi.fn()
      this.dispose = vi.fn()
      this.reset = vi.fn()
      this.target = { copy: vi.fn(), set: vi.fn() }
      this.saveState = vi.fn()
      this.enableDamping = false
    }
  }
  return { OrbitControls }
})

vi.mock('three/examples/jsm/loaders/STLLoader.js', () => {
  class STLLoader {
    parse() {
      return {
        attributes: { position: { count: 0 } },
        dispose: vi.fn(),
        computeVertexNormals: vi.fn(),
        center: vi.fn(),
        computeBoundingBox: vi.fn(),
        boundingBox: { min: { y: 0 }, max: { y: 1 } },
      }
    }
  }
  return { STLLoader }
})

import { PreviewManager } from '../../src/js/preview.js'

describe('PreviewManager.loadSTL empty geometry guard', () => {
  let container
  let manager

  beforeEach(async () => {
    container = document.createElement('div')
    container.style.width = '800px'
    container.style.height = '600px'
    document.body.appendChild(container)
    localStorage.clear()

    manager = new PreviewManager(container)
    await manager.init()
  })

  afterEach(() => {
    document.body.removeChild(container)
    localStorage.clear()
  })

  it('rejects with EMPTY_GEOMETRY error when STL has 0 triangles', async () => {
    await expect(manager.loadSTL(new ArrayBuffer(84))).rejects.toMatchObject({
      code: 'EMPTY_GEOMETRY',
    })
  })
})
