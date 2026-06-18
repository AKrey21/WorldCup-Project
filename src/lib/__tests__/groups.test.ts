import { describe, it, expect } from 'vitest'
import { computeGroups, standingByTeam } from '../groups'

describe('computeGroups', () => {
  it('tallies a small two-game group correctly', () => {
    const tables = computeGroups([
      { home: 'Mexico', away: 'South Africa', homeScore: 2, awayScore: 0, group: 'A' },
      { home: 'South Korea', away: 'Czech Republic', homeScore: 2, awayScore: 1, group: 'A' },
    ])
    expect(tables).toHaveLength(1)
    const a = tables[0]
    expect(a.group).toBe('A')
    expect(a.teams).toHaveLength(4)

    const mex = a.teams.find((t) => t.team === 'Mexico')!
    expect(mex.pts).toBe(3)
    expect(mex.gd).toBe(2)
    expect(mex.rank).toBe(1) // most points, best GD

    const sk = a.teams.find((t) => t.team === 'South Korea')!
    expect(sk.pts).toBe(3)
    expect(sk.rank).toBe(2) // tied on points, worse GD than Mexico

    const sa = a.teams.find((t) => t.team === 'South Africa')!
    expect(sa.pts).toBe(0)
    expect(sa.rank).toBe(4) // worst GD
  })

  it('counts a draw as a point each', () => {
    const tables = computeGroups([
      { home: 'Canada', away: 'Bosnia', homeScore: 1, awayScore: 1, group: 'B' },
    ])
    for (const t of tables[0].teams) {
      expect(t.pts).toBe(1)
      expect(t.played).toBe(1)
      expect(t.gd).toBe(0)
    }
  })

  it('ignores matches with no group and reads the real played.json otherwise', () => {
    const tables = computeGroups()
    // The shipped data covers groups A–L.
    expect(tables.length).toBe(12)
    for (const g of tables) {
      expect(g.teams.length).toBeGreaterThan(0)
      // Each team's points never exceed 3 per game played.
      for (const t of g.teams) expect(t.pts).toBeLessThanOrEqual(3 * t.played)
    }
  })
})

describe('standingByTeam', () => {
  it('maps each team to its standing', () => {
    const tables = computeGroups([
      { home: 'Mexico', away: 'South Africa', homeScore: 2, awayScore: 0, group: 'A' },
    ])
    const map = standingByTeam(tables)
    expect(map.get('Mexico')!.pts).toBe(3)
    expect(map.get('South Africa')!.pts).toBe(0)
    expect(map.get('Nowhere')).toBeUndefined()
  })
})
