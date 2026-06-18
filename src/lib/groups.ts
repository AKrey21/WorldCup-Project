// Live group standings from the played results.
//
// Pure, deterministic context — "how the group sits after the previous fixtures".
// No model, no API: just tally the games in played.json into the familiar table.
// Standings sharpen a human read (and the AI context brief) on stakes and
// motivation; they are deliberately NOT a model input.
//
// Ordering uses the headline FIFA criteria — points, then goal difference, then
// goals for — and falls back to team name for a stable display order. It does not
// resolve the head-to-head / fair-play tiebreaks or the cross-group best-third
// path, so treat ranks as indicative, not an official qualification verdict.

import played from '../data/played.json'

export interface TeamStanding {
  team: string
  group: string
  played: number
  w: number
  d: number
  l: number
  gf: number
  ga: number
  gd: number
  pts: number
  /** 1-based position within the group. */
  rank: number
}

export interface GroupTable {
  group: string
  teams: TeamStanding[]
}

interface PlayedRow {
  home: string
  away: string
  homeScore: number
  awayScore: number
  group?: string
}

/** Tally group-stage results into sorted, ranked tables (one per group). */
export function computeGroups(matches?: PlayedRow[]): GroupTable[] {
  const rows = (matches ?? (played.matches as PlayedRow[])).filter((m) => m.group)
  const byGroup = new Map<string, Map<string, TeamStanding>>()

  const ensure = (group: string, team: string): TeamStanding => {
    let g = byGroup.get(group)
    if (!g) {
      g = new Map()
      byGroup.set(group, g)
    }
    let t = g.get(team)
    if (!t) {
      t = { team, group, played: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0, rank: 0 }
      g.set(team, t)
    }
    return t
  }

  for (const m of rows) {
    const group = m.group as string
    const h = ensure(group, m.home)
    const a = ensure(group, m.away)
    h.played += 1
    a.played += 1
    h.gf += m.homeScore
    h.ga += m.awayScore
    a.gf += m.awayScore
    a.ga += m.homeScore
    if (m.homeScore > m.awayScore) {
      h.w += 1
      a.l += 1
      h.pts += 3
    } else if (m.homeScore < m.awayScore) {
      a.w += 1
      h.l += 1
      a.pts += 3
    } else {
      h.d += 1
      a.d += 1
      h.pts += 1
      a.pts += 1
    }
  }

  const tables: GroupTable[] = []
  for (const [group, g] of byGroup) {
    const teams = [...g.values()]
    for (const t of teams) t.gd = t.gf - t.ga
    teams.sort((x, y) => y.pts - x.pts || y.gd - x.gd || y.gf - x.gf || x.team.localeCompare(y.team))
    teams.forEach((t, i) => (t.rank = i + 1))
    tables.push({ group, teams })
  }
  tables.sort((a, b) => a.group.localeCompare(b.group))
  return tables
}

/** Flatten the tables into a team → standing lookup for per-fixture context. */
export function standingByTeam(tables: GroupTable[]): Map<string, TeamStanding> {
  const map = new Map<string, TeamStanding>()
  for (const t of tables) for (const s of t.teams) map.set(s.team, s)
  return map
}
