import { describe, it, expect, vi } from 'vitest'
import {
  routeForFile,
  canReceiveLaunchedFiles,
  initLaunchFiles,
  DESIGN_EXTENSIONS,
  DRAWING_EXTENSIONS,
} from '../../src/js/launch-files.js'

/** A stand-in for window.launchQueue, so the seam can be tested without an install. */
function fakeWindow() {
  let consumer = null
  return {
    launchQueue: {
      setConsumer: (fn) => {
        consumer = fn
      },
    },
    deliver: (files) => consumer({ files }),
    hasConsumer: () => Boolean(consumer),
  }
}

/** A FileSystemFileHandle stand-in. */
function handleFor(name) {
  return { getFile: async () => ({ name }) }
}

describe('routeForFile', () => {
  it('sends designs and projects to the model loader', () => {
    expect(routeForFile('keyguard.scad')).toBe('design')
    expect(routeForFile('project.zip')).toBe('design')
  })

  it('sends drawings to the drawing editor', () => {
    expect(routeForFile('bird.svg')).toBe('drawing')
    expect(routeForFile('outline.dxf')).toBe('drawing')
  })

  it('does not care about case, or about a path in front of the name', () => {
    expect(routeForFile('C:\\Users\\me\\KEYGUARD.SCAD')).toBe('design')
    expect(routeForFile('/home/me/Bird.SVG')).toBe('drawing')
  })

  it('refuses anything else rather than guessing', () => {
    expect(routeForFile('notes.txt')).toBeNull()
    expect(routeForFile('model.stl')).toBeNull()
    expect(routeForFile('')).toBeNull()
    expect(routeForFile(null)).toBeNull()
  })

  it('handles exactly the types the manifest would claim', () => {
    // If these lists ever disagree with the manifest's file_handlers, the app
    // is registered for a type it will then refuse to open.
    expect(DESIGN_EXTENSIONS).toEqual(['.scad', '.zip'])
    expect(DRAWING_EXTENSIONS).toEqual(['.svg', '.dxf'])
  })
})

describe('canReceiveLaunchedFiles', () => {
  it('is false where the browser has no launch queue', () => {
    // Which is most browsers: this is a Chromium-family feature, it is not
    // Baseline, and it only works for an installed app.
    expect(canReceiveLaunchedFiles({})).toBe(false)
    expect(canReceiveLaunchedFiles(null)).toBe(false)
  })

  it('is true only when there is really one there', () => {
    expect(canReceiveLaunchedFiles({ launchQueue: null })).toBe(false)
    expect(canReceiveLaunchedFiles(fakeWindow())).toBe(true)
  })
})

describe('initLaunchFiles', () => {
  it('installs nothing where the feature does not exist', () => {
    expect(initLaunchFiles({ openDesign: vi.fn(), win: {} })).toBe(false)
  })

  it('installs nothing without somewhere to send a design', () => {
    expect(initLaunchFiles({ win: fakeWindow() })).toBe(false)
  })

  it('opens a launched design through the ordinary loader', async () => {
    const win = fakeWindow()
    const openDesign = vi.fn()
    expect(initLaunchFiles({ openDesign, win })).toBe(true)

    await win.deliver([handleFor('keyguard.scad')])
    expect(openDesign).toHaveBeenCalledWith({ name: 'keyguard.scad' })
  })

  it('opens a launched drawing in the drawing editor instead', async () => {
    const win = fakeWindow()
    const openDesign = vi.fn()
    const openDrawing = vi.fn()
    initLaunchFiles({ openDesign, openDrawing, win })

    await win.deliver([handleFor('bird.svg')])
    expect(openDrawing).toHaveBeenCalledWith({ name: 'bird.svg' })
    expect(openDesign).not.toHaveBeenCalled()
  })

  it('falls back to the loader when there is no drawing editor to send it to', async () => {
    const win = fakeWindow()
    const openDesign = vi.fn()
    initLaunchFiles({ openDesign, win })

    await win.deliver([handleFor('bird.svg')])
    expect(openDesign).toHaveBeenCalled()
  })

  it('waits for the engine before handing anything over', async () => {
    // A launched file arrives EARLIER than any upload can: the launch is the
    // page load. Handing it over before the engine is up is the trap.
    const win = fakeWindow()
    const order = []
    const openDesign = vi.fn(() => order.push('open'))
    const waitUntilReady = vi.fn(async () => {
      order.push('waited')
    })
    initLaunchFiles({ openDesign, waitUntilReady, win })

    await win.deliver([handleFor('a.scad')])
    expect(order).toEqual(['waited', 'open'])
  })

  it('says so, and opens nothing, for a type it does not handle', async () => {
    const win = fakeWindow()
    const openDesign = vi.fn()
    const onUnsupported = vi.fn()
    initLaunchFiles({ openDesign, onUnsupported, win })

    await win.deliver([handleFor('notes.txt')])
    expect(openDesign).not.toHaveBeenCalled()
    expect(onUnsupported).toHaveBeenCalledWith('notes.txt')
  })

  it('takes the first file when the system hands over several', async () => {
    const win = fakeWindow()
    const openDesign = vi.fn()
    initLaunchFiles({ openDesign, win })

    await win.deliver([handleFor('a.scad'), handleFor('b.scad')])
    expect(openDesign).toHaveBeenCalledTimes(1)
    expect(openDesign).toHaveBeenCalledWith({ name: 'a.scad' })
  })

  it('does nothing on an empty launch', async () => {
    const win = fakeWindow()
    const openDesign = vi.fn()
    initLaunchFiles({ openDesign, win })

    await win.deliver([])
    expect(openDesign).not.toHaveBeenCalled()
  })

  it('reports a handle it cannot read rather than failing silently', async () => {
    const win = fakeWindow()
    const openDesign = vi.fn()
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    initLaunchFiles({ openDesign, win })

    await win.deliver([
      {
        getFile: async () => {
          throw new Error('permission denied')
        },
      },
    ])

    expect(openDesign).not.toHaveBeenCalled()
    expect(error).toHaveBeenCalled()
    error.mockRestore()
  })
})
