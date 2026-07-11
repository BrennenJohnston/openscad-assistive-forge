import { beforeAll, afterEach, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Storage mocks — installed at MODULE SCOPE, not in beforeAll.
//
// Several src modules (e.g. library-manager.js) touch localStorage from
// module-level singletons, which run while the test file's imports are being
// evaluated — before any beforeAll hook. Installing the mocks here (setup
// files are evaluated before the test module) guarantees a functional
// localStorage during import. It also avoids ever touching Node's lazy
// experimental webstorage global, whose accessor emits
// "--localstorage-file was provided without a valid path" warnings and
// yields a non-functional object in worker processes.
//
// Object.defineProperty is used because the built-in global may be an
// accessor property; plain assignment to a getter-only property throws in
// strict mode (ESM).
// ---------------------------------------------------------------------------

const storage = {}
const localStorageMock = {
  getItem: vi.fn((key) => storage[key] || null),
  setItem: vi.fn((key, value) => { storage[key] = value }),
  removeItem: vi.fn((key) => { delete storage[key] }),
  clear: vi.fn(() => { Object.keys(storage).forEach(key => delete storage[key]) }),
  length: 0,
  key: vi.fn((index) => Object.keys(storage)[index] || null),
  _storage: storage  // Internal reference for debugging
}
Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
  writable: true,
  configurable: true,
})

const sessionStorageData = {}
const sessionStorageMock = {
  getItem: vi.fn((key) => sessionStorageData[key] || null),
  setItem: vi.fn((key, value) => { sessionStorageData[key] = value }),
  removeItem: vi.fn((key) => { delete sessionStorageData[key] }),
  clear: vi.fn(() => { Object.keys(sessionStorageData).forEach(key => delete sessionStorageData[key]) }),
  length: 0,
  key: vi.fn((index) => Object.keys(sessionStorageData)[index] || null)
}
Object.defineProperty(globalThis, 'sessionStorage', {
  value: sessionStorageMock,
  writable: true,
  configurable: true,
})

// Setup JSDOM environment
beforeAll(() => {
  // Mock fetch
  global.fetch = vi.fn()

  // Mock IntersectionObserver
  global.IntersectionObserver = class IntersectionObserver {
    constructor() {}
    disconnect() {}
    observe() {}
    takeRecords() { return [] }
    unobserve() {}
  }

  // Mock ResizeObserver
  global.ResizeObserver = class ResizeObserver {
    constructor() {}
    disconnect() {}
    observe() {}
    unobserve() {}
  }

  // Mock matchMedia (jsdom only — some suites opt into the node
  // environment via @vitest-environment, where window does not exist)
  if (typeof window !== 'undefined') {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation(query => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    })
  }
})

// Clean up after each test
afterEach(() => {
  vi.clearAllMocks()
  if (typeof document !== 'undefined') {
    document.body.innerHTML = ''
  }
})
