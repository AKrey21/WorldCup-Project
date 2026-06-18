// AI "Pick of the Day".
//
// A World Cup day has several fixtures at once. This asks Claude to read the
// whole day's slate — the model's probabilities and any book prices already
// entered — and surface the best one-to-three disciplined value bets, ranked,
// each with a plain-language rationale. Two optional phases:
//
//   1. Web research (server-side `web_search` tool) — Claude searches for the
//      day's injuries, suspensions, likely line-ups, form and motivation, and
//      writes a short brief with citations. The search runs on Anthropic's
//      servers, so a static browser app can use it with no scraper and no CORS
//      wall; it is billable, hence opt-in.
//   2. The pick — a forced tool call returns a structured, ranked verdict. The
//      research brief (if any) is folded in, but the statistical model stays the
//      spine: news adjusts, it does not override.

import Anthropic from '@anthropic-ai/sdk'
import { makeClient, ODDS_PARSER_MODEL } from './anthropic'

/** One side of a market the model surfaced for a fixture, with optional book edge. */
export interface PickSelection {
  label: string
  modelProb: number
  fairOdds: number
  bookOdds?: number
  /** Edge in percentage points (model% − book-implied%). */
  edgePct?: number
  /** EV per $1 staked. */
  evPer1?: number
}

export interface PickMatch {
  home: string
  away: string
  homeXg: number
  awayXg: number
  selections: PickSelection[]
}

export interface DaySource {
  url: string
  title: string
}

export type PickStance = 'bet' | 'lean' | 'pass'

export interface DayPick {
  matchup: string
  market: string
  selection: string
  stance: PickStance
  confidence: 'low' | 'medium' | 'high'
  /** Suggested flat-stake size in units, 0–3 (0 = no bet). */
  stakeUnits: number
  rationale: string
}

export interface PickOfDayResult {
  topPick: string
  dayNarrative: string
  picks: DayPick[]
  /** Web sources cited during research, if web research ran. */
  sources: DaySource[]
  /** True if the day was researched with the web_search tool. */
  researched: boolean
}

// ---------------------------------------------------------------------------
// Prompt building (pure — unit-tested)
// ---------------------------------------------------------------------------

function matchBlock(m: PickMatch): string {
  const lines = [`${m.home} vs ${m.away} — model xG ${m.homeXg.toFixed(2)} / ${m.awayXg.toFixed(2)}`]
  for (const s of m.selections) {
    const parts = [`  · ${s.label}`, `model ${(s.modelProb * 100).toFixed(0)}%`, `fair ${s.fairOdds.toFixed(2)}`]
    if (s.bookOdds !== undefined) {
      parts.push(`book ${s.bookOdds.toFixed(2)}`)
      if (s.edgePct !== undefined) parts.push(`edge ${s.edgePct >= 0 ? '+' : ''}${s.edgePct.toFixed(1)}%`)
      if (s.evPer1 !== undefined) parts.push(`EV ${s.evPer1 >= 0 ? '+' : ''}${(s.evPer1 * 100).toFixed(1)}c/$1`)
    } else {
      parts.push('book — (no price entered)')
    }
    lines.push(parts.join(' · '))
  }
  return lines.join('\n')
}

export function buildResearchPrompt(date: string, matches: PickMatch[]): string {
  const fixtures = matches.map((m) => `${m.home} vs ${m.away}`).join('\n- ')
  return [
    `Today's World Cup fixtures (${date}):`,
    `- ${fixtures}`,
    '',
    'Search the web for anything that would move these specific matches that a full-time goals model cannot know: confirmed or likely injuries and suspensions, expected line-ups and rotation, recent form, and motivation (a side already qualified or eliminated, a dead rubber, must-win).',
    'Write a tight brief — 1-2 sentences per fixture, only where you found something that matters. Skip fixtures with no notable news. Prefer recent, reputable sources and cite them.',
  ].join('\n')
}

export function buildPickPrompt(date: string, matches: PickMatch[], brief?: string): string {
  const parts = [
    `World Cup slate for ${date}. Pick the best disciplined, flat-stake value bets across the whole day.`,
    '',
    'Each fixture lists the model probability, fair odds (= 1 / probability, no margin), and — where the user entered one — the real book price with its edge and EV. A bet is only value when the book price beats the fair price (positive edge / EV).',
    '',
    'FIXTURES:',
    matches.map(matchBlock).join('\n\n'),
  ]
  if (brief && brief.trim()) {
    parts.push(
      '',
      'NEWS & CONTEXT (from a web search — injuries, line-ups, form, motivation):',
      brief.trim(),
    )
  }
  parts.push(
    '',
    'Guidelines:',
    '- Rank the day. Return at most 3 picks, best first; if nothing clears the bar, return a single "pass".',
    '- A selection can only be a real bet if a book price is entered and beats fair value. Without a price, the most you can do is "lean".',
    '- The Dixon-Coles model is full-time goals only — no lineups/injuries/in-game info. Use the news to ADJUST the model read (downgrade a side missing its key striker, fade a dead rubber for Unders), never to invent an edge the numbers do not support. Treat sub-2% edges as noise.',
    '- stakeUnits is a flat 0–3 (0 = no bet, 1 = small, 2 = standard, 3 = best of the day). Reserve 3 for a clear, multi-percent edge.',
    '- Rationale: 1-2 sentences each, plain language, cite the key numbers and any news factor. This is paper-trading for learning, not financial advice.',
  )
  return parts.join('\n')
}

// ---------------------------------------------------------------------------
// Phase 1 — web research (server-side web_search)
// ---------------------------------------------------------------------------

interface Citation {
  type?: string
  url?: string
  title?: string
}

/** Research the day's matches with the web_search tool. Returns a brief + sources. */
export async function researchDay(
  date: string,
  matches: PickMatch[],
  apiKey: string,
): Promise<{ brief: string; sources: DaySource[] }> {
  const client = makeClient(apiKey)
  const messages: Anthropic.MessageParam[] = [
    { role: 'user', content: buildResearchPrompt(date, matches) },
  ]

  let brief = ''
  const sourceMap = new Map<string, string>()

  // web_search is a server-side tool; the API may pause (`pause_turn`) when its
  // internal loop hits a step limit — re-send to let it continue.
  for (let step = 0; step < 5; step++) {
    const resp = await client.messages.create({
      model: ODDS_PARSER_MODEL,
      max_tokens: 2048,
      tools: [{ type: 'web_search_20260209', name: 'web_search' }],
      messages,
    })

    for (const block of resp.content) {
      if (block.type === 'text') {
        brief += block.text
        const citations = (block as { citations?: Citation[] }).citations
        if (Array.isArray(citations)) {
          for (const c of citations) {
            if (c?.url) sourceMap.set(c.url, c.title || c.url)
          }
        }
      }
    }

    if (resp.stop_reason === 'pause_turn') {
      messages.push({ role: 'assistant', content: resp.content })
      continue
    }
    break
  }

  const sources = [...sourceMap.entries()].map(([url, title]) => ({ url, title }))
  return { brief: brief.trim(), sources }
}

// ---------------------------------------------------------------------------
// Phase 2 — the structured pick
// ---------------------------------------------------------------------------

const PICK_TOOL: Anthropic.Tool = {
  name: 'report_pick_of_day',
  description: "Report the day's ranked best bets with a short rationale for each.",
  input_schema: {
    type: 'object',
    properties: {
      topPick: {
        type: 'string',
        description: 'One-line summary of the single best play, or "No bet today".',
      },
      dayNarrative: {
        type: 'string',
        description: "2-3 sentences on the day's slate overall.",
      },
      picks: {
        type: 'array',
        description: 'At most 3 picks, best first. Empty or a single pass if nothing clears the bar.',
        items: {
          type: 'object',
          properties: {
            matchup: { type: 'string', description: 'e.g. "France vs Senegal".' },
            market: { type: 'string', description: 'e.g. "Match Result (1X2)", "Total Goals O/U 2.5".' },
            selection: { type: 'string', description: 'The exact selection to back.' },
            stance: { type: 'string', enum: ['bet', 'lean', 'pass'] },
            confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
            stakeUnits: { type: 'integer', description: 'Flat stake 0-3 (0 = no bet).' },
            rationale: { type: 'string', description: '1-2 sentences citing the key numbers and any news.' },
          },
          required: ['matchup', 'market', 'selection', 'stance', 'confidence', 'stakeUnits', 'rationale'],
        },
      },
    },
    required: ['topPick', 'dayNarrative', 'picks'],
  },
}

function normStance(v: unknown): PickStance {
  return v === 'bet' || v === 'lean' || v === 'pass' ? v : 'pass'
}

function normConfidence(v: unknown): DayPick['confidence'] {
  return v === 'low' || v === 'medium' || v === 'high' ? v : 'low'
}

function normPick(raw: unknown): DayPick | null {
  if (typeof raw !== 'object' || raw === null) return null
  const m = raw as Record<string, unknown>
  if (typeof m.matchup !== 'string' || typeof m.selection !== 'string') return null
  const units = typeof m.stakeUnits === 'number' ? Math.max(0, Math.min(3, Math.round(m.stakeUnits))) : 0
  return {
    matchup: m.matchup,
    market: typeof m.market === 'string' ? m.market : '',
    selection: m.selection,
    stance: normStance(m.stance),
    confidence: normConfidence(m.confidence),
    stakeUnits: units,
    rationale: typeof m.rationale === 'string' ? m.rationale : '',
  }
}

export interface PickOfDayInput {
  date: string
  matches: PickMatch[]
  /** Optional research brief + sources from researchDay(). */
  brief?: string
  sources?: DaySource[]
}

export async function pickOfDay(input: PickOfDayInput, apiKey: string): Promise<PickOfDayResult> {
  const client = makeClient(apiKey)
  const resp = await client.messages.create({
    model: ODDS_PARSER_MODEL,
    max_tokens: 2048,
    tools: [PICK_TOOL],
    tool_choice: { type: 'tool', name: PICK_TOOL.name },
    messages: [{ role: 'user', content: buildPickPrompt(input.date, input.matches, input.brief) }],
  })

  if (resp.stop_reason === 'refusal') throw new Error('The model declined to respond.')
  const toolUse = resp.content.find((b) => b.type === 'tool_use')
  if (!toolUse || toolUse.type !== 'tool_use') throw new Error('No pick was returned.')

  const out = toolUse.input as { topPick?: unknown; dayNarrative?: unknown; picks?: unknown }
  const picks = Array.isArray(out.picks)
    ? out.picks.map(normPick).filter((p): p is DayPick => p !== null)
    : []

  return {
    topPick: typeof out.topPick === 'string' ? out.topPick : 'No bet today',
    dayNarrative: typeof out.dayNarrative === 'string' ? out.dayNarrative : '',
    picks,
    sources: input.sources ?? [],
    researched: Boolean(input.brief && input.brief.trim()),
  }
}
