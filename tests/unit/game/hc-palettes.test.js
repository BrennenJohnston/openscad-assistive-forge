import { describe, it, expect } from 'vitest'
import { MONO_GLOW_FADE } from '../../../src/js/game/hc-palettes.js'

/**
 * CW-39 (CW-Q37): the phosphor trail is RETIRED in the game.
 *
 * The game is the only game-side enabler - its applyGlow wrapper hands this
 * constant to setPersistFade - so pinning the constant at zero pins the
 * retirement: at fade 0 the paint guard skips the afterglow pass entirely
 * and the whole 22.3%-per-throttled-frame price comes back. The pass costs
 * the same at any fade above zero, which is why the owner chose retirement
 * over retuning.
 *
 * The CAPABILITY deliberately survives for the main app's Alt View and the
 * bench's A/B hook, and that half is already unit-proven where it lives:
 * hfm.test.js pins a fresh converter instance at persistFade 0 and proves
 * setPersistFade still raises it per instance ('settings do not cross-talk
 * between instances'). This file pins only the game's side of the bargain.
 */
describe('the phosphor trail is retired in the game (CW-Q37)', () => {
  it('the game-side fade constant is zero, so the afterglow pass is skipped', () => {
    expect(MONO_GLOW_FADE).toBe(0)
  })
})
