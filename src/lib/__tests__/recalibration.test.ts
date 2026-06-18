import { describe, it, expect } from 'vitest'
import { goalEnvironment } from '../recalibration'
import { getModel, getPreTournamentModel } from '../bestbets'

describe('goalEnvironment', () => {
  it('measures this tournament as running hot (observed gpg > expected)', () => {
    const env = goalEnvironment(getPreTournamentModel())
    expect(env.n).toBe(24)
    expect(env.observedGpg).toBeGreaterThan(env.expectedGpg)
    expect(env.rawScale).toBeGreaterThan(1)
  })

  it('shrinks the raw ratio toward 1 (no overcorrection)', () => {
    const env = goalEnvironment(getModel())
    // The applied scale sits strictly between no-change and the raw ratio.
    expect(env.scale).toBeGreaterThan(1)
    expect(env.scale).toBeLessThan(env.rawScale)
  })

  it('keeps the scale modest — within sane bounds for a real adjustment', () => {
    const env = goalEnvironment(getModel())
    expect(env.scale).toBeGreaterThan(1)
    expect(env.scale).toBeLessThan(1.3)
  })

  it('observed goals/game is finite and football-plausible', () => {
    const env = goalEnvironment(getModel())
    expect(Number.isFinite(env.observedGpg)).toBe(true)
    expect(env.observedGpg).toBeGreaterThan(1.5)
    expect(env.observedGpg).toBeLessThan(5)
  })
})
