export interface ParsedSelection {
  code: string
  label: string
  odds: number
  impliedPct: number
}

export interface ParsedMarket {
  code: string
  name: string
  selections: ParsedSelection[]
}

export interface ParsedMatch {
  id: string
  fixture: string
  kickoff: string | null
  capturedAt: string
  markets: ParsedMarket[]
}

// SG Pools paste grammar: every selection row is
// [2-digit code][odds N.NN][label] glued together — "011.28Portugal".
// The two-decimal odds is the anchor that makes splitting reliable.
// Bet-type headers are lines starting with 2 digits but with no odds.
const RE_MATCH = /^(\d{3,})(.+?\s+vs\s+.+)$/i // "5764Portugal vs Nigeria"
const RE_SEL = /^(\d{2})(\d+\.\d{2})(.+)$/ // "011.28Portugal"
const RE_HEAD = /^(\d{2})(.+)$/ // "12Total Goals Over/Under 2.5"
const RE_DATE = /([A-Za-z]{3},\s*\d{1,2}\s+[A-Za-z]{3}\s+\d{4},\s*[\d.]+\s*[ap]m)/i
const IGNORE = /^(bet slip|cash out|your bet slip)/i

export function parseOdds(raw: string, capturedAt = new Date().toISOString()): ParsedMatch[] {
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  const matches: ParsedMatch[] = []
  let cur: ParsedMatch | null = null
  let mkt: ParsedMarket | null = null
  let anon = 0

  for (const line of lines) {
    if (IGNORE.test(line)) continue
    if (/\svs\s/i.test(line) && !RE_SEL.test(line)) {
      const m = line.match(RE_MATCH)
      cur = {
        id: m ? m[1] : `pasted-${++anon}`,
        fixture: (m ? m[2] : line).trim(),
        kickoff: null,
        capturedAt,
        markets: [],
      }
      matches.push(cur)
      mkt = null
      continue
    }
    if (!cur) continue
    if (!cur.kickoff) {
      const d = line.match(RE_DATE)
      if (d) {
        cur.kickoff = d[1].replace(/\s+/g, ' ')
        if (!RE_SEL.test(line)) continue
      }
    }
    const s = line.match(RE_SEL)
    if (s) {
      const odds = parseFloat(s[2])
      if (mkt) {
        mkt.selections.push({
          code: s[1],
          label: s[3].trim(),
          odds,
          impliedPct: +(100 / odds).toFixed(1),
        })
      }
      continue
    }
    const h = line.match(RE_HEAD)
    if (h) {
      mkt = { code: h[1], name: h[2].trim(), selections: [] }
      cur.markets.push(mkt)
      continue
    }
  }

  for (const mt of matches) {
    mt.markets = mt.markets.filter((m) => m.selections.length > 0)
  }
  return matches
}

/**
 * Best-effort parse of an SG Pools kickoff string
 * ("Thu, 12 Jun 2026, 9.00pm") into an ISO date. Returns null if unparseable.
 */
export function kickoffToISO(kickoff: string | null): string | null {
  if (!kickoff) return null
  const m = kickoff.match(
    /(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4}),\s*(\d{1,2})(?:\.(\d{2}))?\s*([ap]m)/i,
  )
  if (!m) return null
  const months: Record<string, number> = {
    jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
    jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
  }
  const month = months[m[2].toLowerCase()]
  if (month === undefined) return null
  let hour = parseInt(m[4], 10) % 12
  if (m[6].toLowerCase() === 'pm') hour += 12
  const d = new Date(parseInt(m[3], 10), month, parseInt(m[1], 10), hour, m[5] ? parseInt(m[5], 10) : 0)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}
