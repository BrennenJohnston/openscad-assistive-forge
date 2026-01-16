import { beforeAll, afterEach, vi } from 'vitest'

// Setup JSDOM environment
beforeAll(() => {
  // Mock localStorage with actual storage
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
  global.localStorage = localStorageMock

  // Mock sessionStorage with separate storage
  const sessionStorage = {}
  const sessionStorageMock = {
    getItem: vi.fn((key) => sessionStorage[key] || null),
    setItem: vi.fn((key, value) => { sessionStorage[key] = value }),
    removeItem: vi.fn((key) => { delete sessionStorage[key] }),
    clear: vi.fn(() => { Object.keys(sessionStorage).forEach(key => delete sessionStorage[key]) }),
    length: 0,
    key: vi.fn((index) => Object.keys(sessionStorage)[index] || null)
  }
  global.sessionStorage = sessionStorageMock

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

  // Mock matchMedia
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
})

// Clean up after each test
afterEach(() => {
  vi.clearAllMocks()
  document.body.innerHTML = ''
})
