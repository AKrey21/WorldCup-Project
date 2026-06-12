import { describe, expect, it } from 'vitest'
import { kickoffToISO, parseOdds } from '../parser'

const SINGLE_MATCH = `5764Portugal vs Nigeria
Thu, 12 Jun 2026, 9.00pm
011X2
011.28Portugal
025.50Draw
0310.00Nigeria
12Total Goals Over/Under 2.5
011.85Over 2.5
021.95Under 2.5`

describe('parseOdds', () => {
  it('parses a match with two markets', () => {
    const out = parseOdds(SINGLE_MATCH)
    expect(out).toHaveLength(1)
    const m = out[0]
    expect(m.id).toBe('5764')
    expect(m.fixture).toBe('Portugal vs Nigeria')
    expect(m.kickoff).toBe('Thu, 12 Jun 2026, 9.00pm')
    expect(m.markets).toHaveLength(2)
    expect(m.markets[0].name).toBe('1X2')
    expect(m.markets[0].selections).toEqual([
      { code: '01', label: 'Portugal', odds: 1.28, impliedPct: 78.1 },
      { code: '02', label: 'Draw', odds: 5.5, impliedPct: 18.2 },
      { code: '03', label: 'Nigeria', odds: 10, impliedPct: 10 },
    ])
    expect(m.markets[1].name).toBe('Total Goals Over/Under 2.5')
  })

  it('segments multiple matches on each "vs" line', () => {
    const raw = `5764Portugal vs Nigeria
011X2
011.28Portugal
5765Brazil vs Ghana
011X2
011.50Brazil`
    const out = parseOdds(raw)
    expect(out).toHaveLength(2)
    expect(out[1].fixture).toBe('Brazil vs Ghana')
    expect(out[1].markets[0].selections[0].odds).toBe(1.5)
  })

  it('ignores bet-slip chrome and blank lines', () => {
    const raw = `Bet Slip
5764Portugal vs Nigeria

011X2
Cash Out
011.28Portugal`
    const out = parseOdds(raw)
    expect(out).toHaveLength(1)
    expect(out[0].markets[0].selections).toHaveLength(1)
  })

  it('drops markets that parsed no selections', () => {
    const raw = `5764Portugal vs Nigeria
011X2
12Total Goals Over/Under 2.5
011.85Over 2.5`
    const out = parseOdds(raw)
    expect(out[0].markets).toHaveLength(1)
    expect(out[0].markets[0].name).toBe('Total Goals Over/Under 2.5')
  })

  it('stamps every match with capturedAt', () => {
    const at = '2026-06-12T14:32:00.000Z'
    const out = parseOdds(SINGLE_MATCH, at)
    expect(out[0].capturedAt).toBe(at)
  })

  it('handles fixture lines without a numeric prefix', () => {
    const out = parseOdds(`Portugal vs Nigeria
011X2
011.28Portugal`)
    expect(out).toHaveLength(1)
    expect(out[0].fixture).toBe('Portugal vs Nigeria')
  })
})

describe('kickoffToISO', () => {
  it('parses SG Pools kickoff strings', () => {
    const iso = kickoffToISO('Thu, 12 Jun 2026, 9.00pm')
    expect(iso).not.toBeNull()
    const d = new Date(iso!)
    expect(d.getFullYear()).toBe(2026)
    expect(d.getMonth()).toBe(5)
    expect(d.getDate()).toBe(12)
    expect(d.getHours()).toBe(21)
  })
  it('handles 12am/12pm and missing minutes', () => {
    expect(new Date(kickoffToISO('Sun, 19 Jul 2026, 12pm')!).getHours()).toBe(12)
    expect(new Date(kickoffToISO('Sun, 19 Jul 2026, 12.30am')!).getHours()).toBe(0)
  })
  it('returns null on garbage', () => {
    expect(kickoffToISO('tomorrow-ish')).toBeNull()
    expect(kickoffToISO(null)).toBeNull()
  })
})
