import { describe, it, expect } from 'vitest'
import {
  buildBoard,
  candidateKey,
  fixtureId,
  fixtureSelections,
  getModel,
  illustrativeOdds,
  loadFixtures,
  loadHistoricalMatches,
  priceCandidate,
  tierByEdge,
  type Candidate,
  type Fixture,
} from '../bestbets'

describe('data loaders', () => {
  it('loads the historical matches into RawMatch shape', () => {
    const m = loadHistoricalMatches()
    expect(m.length).toBeGreaterThan(5000)
    const first = m[0]
    expect(typeof first.date).toBe('string')
    expect(typeof first.home).toBe('string')
    expect(typeof first.homeScore).toBe('number')
    expect(first.neutral === 0 || first.neutral === 1).toBe(true)
  })

  it('loads World Cup fixtures', () => {
    const f = loadFixtures()
    expect(f.length).toBeGreaterThan(0)
    expect(f[0]).toHaveProperty('home')
    expect(f[0]).toHaveProperty('away')
  })
})

describe('buildBoard', () => {
  const model = getModel()
  const fixtures = loadFixtures()
  const board = buildBoard(model, fixtures)

  it('emits up to three candidates per analysed fixture', () => {
    expect(board.candidates.length).toBe(board.analyses.size * 3)
    // Every analysed fixture is reachable by id.
    for (const c of board.candidates) {
      expect(board.analyses.has(c.fixtureId)).toBe(true)
    }
  })

  it('covers the three core market kinds for each fixture', () => {
    const someId = board.candidates[0].fixtureId
    const kinds = board.candidates
      .filter((c) => c.fixtureId === someId)
      .map((c) => c.marketKind)
      .sort()
    expect(kinds).toEqual(['1X2', 'BTTS', 'Total'])
  })

  it('reports fixtures it could not model rather than guessing', () => {
    expect(Array.isArray(board.skipped)).toBe(true)
    // Skipped + analysed accounts for every fixture.
    expect(board.skipped.length + board.analyses.size).toBe(fixtures.length)
  })

  it('fair odds are the reciprocal of the model probability', () => {
    for (const c of board.candidates.slice(0, 25)) {
      expect(c.modelProb).toBeGreaterThan(0)
      expect(c.modelProb).toBeLessThanOrEqual(1)
      expect(c.fairOdds).toBeCloseTo(1 / c.modelProb, 8)
    }
  })

  it('surfaces the model-favoured side of each market', () => {
    for (const a of board.analyses.values()) {
      const cands = board.candidates.filter((c) => c.fixtureId === a.fixtureId)
      const total = cands.find((c) => c.marketKind === 'Total')!
      // The surfaced total side must be the more probable one.
      const favouredOver = a.ou.over >= a.ou.under
      expect(total.selection.startsWith('Over')).toBe(favouredOver)
    }
  })

  it('candidate keys are unique', () => {
    const keys = new Set(board.candidates.map(candidateKey))
    expect(keys.size).toBe(board.candidates.length)
  })
})

describe('fixtureSelections', () => {
  const model = getModel()
  const a = [...buildBoard(model, loadFixtures()).analyses.values()][0]
  const byId = new Map(fixtureSelections(a).map((s) => [s.selId, s.modelProb]))
  const p = (id: string) => byId.get(id as never) as number

  it('covers the offered markets (9 fixed selections)', () => {
    // 1X2 ×3, O/U 2.5 ×2, BTTS ×2, Odd/Even ×2. Asian handicap is variable-line.
    expect(fixtureSelections(a).length).toBe(9)
  })

  it('complementary sides of each market sum to 1', () => {
    expect(p('home') + p('draw') + p('away')).toBeCloseTo(1, 6)
    expect(p('over') + p('under')).toBeCloseTo(1, 6)
    expect(p('bttsYes') + p('bttsNo')).toBeCloseTo(1, 6)
    expect(p('odd') + p('even')).toBeCloseTo(1, 6)
  })

  it('fair odds are 1 / probability for every selection', () => {
    for (const s of fixtureSelections(a)) {
      expect(s.fairOdds).toBeCloseTo(1 / s.modelProb, 8)
    }
  })
})

describe('priceCandidate', () => {
  const base: Candidate = {
    fixtureId: 'x',
    date: '2026-06-20',
    home: 'A',
    away: 'B',
    neutral: true,
    marketKind: '1X2',
    market: 'Match Result (1X2)',
    selection: 'A',
    modelProb: 0.5, // fair odds 2.00
    fairOdds: 2,
    tier: 'Unpriced',
  }

  it('flags a price that beats fair odds as +EV value', () => {
    const c = priceCandidate(base, 2.2)
    expect(c.bookOdds).toBe(2.2)
    // edge = 0.5 - 1/2.2 ≈ 0.0455
    expect(c.edge!).toBeCloseTo(0.5 - 1 / 2.2, 8)
    expect(c.ev!).toBeGreaterThan(0)
    expect(c.tier).toBe('Medium') // edge ≈0.0455 sits in the 0.02–0.05 band
  })

  it('flags a price short of fair odds as a pass', () => {
    const c = priceCandidate(base, 1.8)
    expect(c.edge!).toBeLessThan(0)
    expect(c.ev!).toBeLessThan(0)
    expect(c.tier).toBe('Pass')
  })

  it('leaves the candidate unpriced for missing or invalid odds', () => {
    for (const bad of [undefined, NaN, 0, 1, -3]) {
      const c = priceCandidate(base, bad as number | undefined)
      expect(c.bookOdds).toBeUndefined()
      expect(c.edge).toBeUndefined()
      expect(c.ev).toBeUndefined()
      expect(c.tier).toBe('Unpriced')
    }
  })

  it('tiers by edge thresholds', () => {
    expect(tierByEdge(0.06)).toBe('High')
    expect(tierByEdge(0.03)).toBe('Medium')
    expect(tierByEdge(0.01)).toBe('Low')
    expect(tierByEdge(-0.01)).toBe('Pass')
  })
})

describe('illustrativeOdds', () => {
  const c: Candidate = {
    fixtureId: 'f1',
    date: '2026-06-20',
    home: 'A',
    away: 'B',
    neutral: true,
    marketKind: 'Total',
    market: 'Total Goals O/U 2.5',
    selection: 'Over 2.5',
    modelProb: 0.55,
    fairOdds: 1 / 0.55,
    tier: 'Unpriced',
  }

  it('is deterministic and within a plausible band of fair odds', () => {
    const a = illustrativeOdds(c)
    const b = illustrativeOdds(c)
    expect(a).toBe(b)
    expect(a).toBeGreaterThan(c.fairOdds * 0.85)
    expect(a).toBeLessThan(c.fairOdds * 1.2)
    expect(a).toBeGreaterThanOrEqual(1.05)
  })

  it('varies by selection so the demo board has a spread of edges', () => {
    const other = illustrativeOdds({ ...c, selection: 'Under 2.5' })
    expect(other).not.toBe(illustrativeOdds(c))
  })
})

describe('fixtureId', () => {
  it('is stable for the same fixture', () => {
    const f: Pick<Fixture, 'date' | 'home' | 'away'> = {
      date: '2026-06-20',
      home: 'Brazil',
      away: 'Serbia',
    }
    expect(fixtureId(f)).toBe('2026-06-20|Brazil|Serbia')
  })
})
