// AI-assisted odds import.
//
// The deterministic SG Pools paste-parser only handles one rigid grammar. Real
// pasted blocks vary — abbreviations, different market labels, fractional or
// American prices, reordered columns. Rather than chase every format with regex,
// we hand the raw text plus the board's candidate rows to Claude and let it map
// prices to fixtures by meaning ("BRA" → Brazil, "o2.5" → Over 2.5). The model
// is forced to call a single reporting tool, so the result is structured and
// validated at the tool-call layer — no brittle JSON-from-prose parsing.

import Anthropic from '@anthropic-ai/sdk'
import { makeClient, ODDS_PARSER_MODEL } from './anthropic'

/** A board selection the model can attach a price to. */
export interface OddsItem {
  key: string
  home: string
  away: string
  market: string
  selection: string
}

export interface OddsMatch {
  /** A candidate key from the board (`fixtureId::marketKind`). */
  key: string
  /** Decimal odds the model read for that selection. */
  bookOdds: number
  /** The snippet of pasted text the price came from, for transparency. */
  source?: string
}

export interface ParseResult {
  matches: OddsMatch[]
  /** Prices/lines the model saw but could not confidently map to a candidate. */
  unmatched: string[]
}

const TOOL: Anthropic.Tool = {
  name: 'report_odds_matches',
  description:
    'Report which candidate bets the pasted odds text provides a confident decimal price for.',
  input_schema: {
    type: 'object',
    properties: {
      matches: {
        type: 'array',
        description: 'One entry per candidate you found a confident decimal price for.',
        items: {
          type: 'object',
          properties: {
            key: { type: 'string', description: 'The exact candidate key from the list.' },
            bookOdds: { type: 'number', description: 'Decimal odds greater than 1, e.g. 1.95.' },
            source: { type: 'string', description: 'The snippet of pasted text this came from.' },
          },
          required: ['key', 'bookOdds'],
        },
      },
      unmatched: {
        type: 'array',
        description: 'Prices or lines from the paste you could not confidently map to a candidate.',
        items: { type: 'string' },
      },
    },
    required: ['matches', 'unmatched'],
  },
}

function candidateLines(items: OddsItem[]): string {
  return items
    .map((c) => `${c.key} | ${c.home} v ${c.away} | ${c.market} | ${c.selection}`)
    .join('\n')
}

function buildPrompt(rawText: string, candidates: OddsItem[]): string {
  return [
    'You match pasted sportsbook/odds text to a fixed list of candidate bets for World Cup fixtures.',
    '',
    'Rules:',
    '- For each candidate you can find a confident price for in the pasted text, return its exact `key` and the DECIMAL odds.',
    '- Match team names loosely: abbreviations, partial names, and alternate spellings all count (e.g. "BRA"/"Brasil" → Brazil).',
    '- Match market and selection by meaning: 1X2 = home / draw / away; "Over 2.5"/"o2.5"/"+2.5" → Over 2.5 total goals (and the Under); "BTTS"/"GG" → both teams to score yes, "NG" → no; "1/2 Goal"/"+1.5"/"−1.5" → the ±1.5 handicap; "Odd"/"Even" → odd/even total goals.',
    '- Every side of every listed market is a candidate (home/draw/away, over/under 2.5, BTTS yes/no, both handicap sides, odd/even), so match each pasted price to its exact side.',
    '- Prices must be DECIMAL odds greater than 1.0. Convert clearly fractional (e.g. 5/2) or American (e.g. +150) prices to decimal; if a price is ambiguous, skip it.',
    '- Only return a match when you are confident. Never invent a key — use only keys from the list below.',
    '',
    'CANDIDATES (format: key | HOME v AWAY | MARKET | SELECTION):',
    candidateLines(candidates),
    '',
    'PASTED ODDS TEXT:',
    rawText,
  ].join('\n')
}

export async function parseOddsWithAI(
  rawText: string,
  items: OddsItem[],
  apiKey: string,
): Promise<ParseResult> {
  const client = makeClient(apiKey)
  const validKeys = new Set(items.map((i) => i.key))

  const resp = await client.messages.create({
    model: ODDS_PARSER_MODEL,
    max_tokens: 4096,
    tools: [TOOL],
    tool_choice: { type: 'tool', name: TOOL.name },
    messages: [{ role: 'user', content: buildPrompt(rawText, items) }],
  })

  if (resp.stop_reason === 'refusal') {
    throw new Error('The model declined to process this request.')
  }

  const toolUse = resp.content.find((b) => b.type === 'tool_use')
  if (!toolUse || toolUse.type !== 'tool_use') {
    throw new Error('No structured result was returned.')
  }

  const input = toolUse.input as { matches?: unknown; unmatched?: unknown }

  // Validate everything the model returned: keys must exist on the board and
  // odds must be sane decimals. We never trust the model's output blindly.
  const matches: OddsMatch[] = Array.isArray(input.matches)
    ? input.matches.flatMap((raw) => {
        if (typeof raw !== 'object' || raw === null) return []
        const m = raw as Record<string, unknown>
        if (typeof m.key !== 'string' || !validKeys.has(m.key)) return []
        if (typeof m.bookOdds !== 'number' || !Number.isFinite(m.bookOdds) || m.bookOdds <= 1) return []
        return [{ key: m.key, bookOdds: m.bookOdds, source: typeof m.source === 'string' ? m.source : undefined }]
      })
    : []

  const unmatched: string[] = Array.isArray(input.unmatched)
    ? input.unmatched.filter((u): u is string => typeof u === 'string')
    : []

  return { matches, unmatched }
}
