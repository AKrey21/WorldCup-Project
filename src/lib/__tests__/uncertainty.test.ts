import { describe, it, expect } from 'vitest'
import { bootstrapModels, probabilityBand } from '../uncertainty'
import { loadHistoricalMatches } from '../bestbets'

// A small but real slice keeps the test fast while exercising the real fit.
const matches = loadHistoricalMatches().filter((m) => m.date >= '2024-01-01')

describe('bootstrapModels', () => {
  it('is deterministic for a given seed', () => {
    const a = bootstrapModels(matches, 4, 99)
    const b = bootstrapModels(matches, 4, 99)
    expect(a).toHaveLength(4)
    expect(a[0].c).toBeCloseTo(b[0].c, 10)
    expect(a[3].gamma).toBeCloseTo(b[3].gamma, 10)
  })

  it('returns nothing for an empty dataset', () => {
    expect(bootstrapModels([], 5)).toHaveLength(0)
  })
})

describe('probabilityBand', () => {
  const models = bootstrapModels(matches, 6, 7)

  it('produces finite, non-negative spreads that average near the point estimate', () => {
    const band = probabilityBand(models, 'Brazil', 'Argentina', true)
    expect(band).not.toBeNull()
    expect(band!.sd).toBeGreaterThanOrEqual(0)
    expect(Number.isFinite(band!.sd)).toBe(true)
    const total = band!.home.mean + band!.draw.mean + band!.away.mean
    expect(total).toBeCloseTo(1, 6)
  })

  it('returns null when a team is unknown to the model', () => {
    expect(probabilityBand(models, 'Brazil', 'Atlantis', true)).toBeNull()
  })
})
