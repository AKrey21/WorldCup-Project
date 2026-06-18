// AI verdict on a single match's priced selections.
//
// Once the user drops real book prices onto a match, this asks Claude for a
// disciplined read: is any selection a worthwhile flat-stake value bet, and a
// short plain-language rationale citing the numbers. Forced tool use gives a
// clean {verdict, pick, confidence, rationale} object. The prompt keeps the
// model honest about the model's own limits (no lineups/injuries/in-game info)
// and frames this as paper-trading for learning, not financial advice.

import Anthropic from '@anthropic-ai/sdk'
import { makeClient, ODDS_PARSER_MODEL } from './anthropic'

export interface VerdictSelection {
  label: string
  modelProb: number
  fairOdds: number
  bookOdds?: number
  /** Edge in percentage points (model% − book-implied%). */
  edgePct?: number
  /** EV per $1 staked. */
  evPer1?: number
}

export interface VerdictInput {
  home: string
  away: string
  homeXg: number
  awayXg: number
  selections: VerdictSelection[]
}

export type VerdictCall = 'bet' | 'lean' | 'pass'

export interface Verdict {
  verdict: VerdictCall
  /** Selection label to back, or "No bet". */
  pick: string
  confidence: 'low' | 'medium' | 'high'
  rationale: string
}

const TOOL: Anthropic.Tool = {
  name: 'report_verdict',
  description:
    'Give a disciplined betting verdict and a short plain-language rationale for one match.',
  input_schema: {
    type: 'object',
    properties: {
      verdict: {
        type: 'string',
        enum: ['bet', 'lean', 'pass'],
        description: 'bet = clear value worth backing; lean = marginal/worth noting; pass = no bet.',
      },
      pick: {
        type: 'string',
        description: 'The exact label of the selection to back, or "No bet".',
      },
      confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
      rationale: {
        type: 'string',
        description:
          '2-3 sentences, plain language, citing the key numbers (model % vs book-implied %, edge, EV).',
      },
    },
    required: ['verdict', 'pick', 'confidence', 'rationale'],
  },
}

function table(input: VerdictInput): string {
  return input.selections
    .map((s) => {
      const parts = [
        s.label,
        `model ${(s.modelProb * 100).toFixed(0)}%`,
        `fair ${s.fairOdds.toFixed(2)}`,
      ]
      if (s.bookOdds !== undefined) {
        parts.push(`book ${s.bookOdds.toFixed(2)}`)
        if (s.edgePct !== undefined)
          parts.push(`edge ${s.edgePct >= 0 ? '+' : ''}${s.edgePct.toFixed(1)}%`)
        if (s.evPer1 !== undefined)
          parts.push(`EV ${s.evPer1 >= 0 ? '+' : ''}${(s.evPer1 * 100).toFixed(1)}c/$1`)
      } else {
        parts.push('book — (no price entered)')
      }
      return '- ' + parts.join(' · ')
    })
    .join('\n')
}

function buildPrompt(input: VerdictInput): string {
  return [
    `Match: ${input.home} vs ${input.away} (neutral venue).`,
    `Model expected goals: ${input.home} ${input.homeXg.toFixed(2)}, ${input.away} ${input.awayXg.toFixed(2)}.`,
    '',
    'Selections — model probability and fair odds (= 1 / probability); "book" is the real price the user entered; edge = model% − book-implied%; EV is per $1 staked:',
    table(input),
    '',
    'Decide whether any PRICED selection is a worthwhile flat-stake value bet, and explain briefly.',
    'Guidelines:',
    '- Only a selection with a book price can be a bet — ignore the ones with no price entered.',
    '- Value requires the book price to beat the fair price (positive edge / positive EV); a bigger edge is better.',
    '- Be disciplined and skeptical: this is a simplified full-time Dixon-Coles model with no lineups, injuries, motivation, weather or in-game information, so treat small edges (under ~2%) as likely noise and lean toward "pass".',
    '- "bet" = a clear, multi-percent edge you would actually back; "lean" = marginal but worth noting; "pass" = no worthwhile edge (a no-bet).',
    '- Keep the rationale to 2-3 sentences, plain language, citing the key numbers. This is paper-trading for learning, not financial advice.',
  ].join('\n')
}

export async function matchVerdict(input: VerdictInput, apiKey: string): Promise<Verdict> {
  const client = makeClient(apiKey)
  const resp = await client.messages.create({
    model: ODDS_PARSER_MODEL,
    max_tokens: 1024,
    tools: [TOOL],
    tool_choice: { type: 'tool', name: TOOL.name },
    messages: [{ role: 'user', content: buildPrompt(input) }],
  })

  if (resp.stop_reason === 'refusal') throw new Error('The model declined to respond.')
  const toolUse = resp.content.find((b) => b.type === 'tool_use')
  if (!toolUse || toolUse.type !== 'tool_use') throw new Error('No verdict was returned.')

  const v = toolUse.input as Partial<Verdict>
  const verdict: VerdictCall =
    v.verdict === 'bet' || v.verdict === 'lean' || v.verdict === 'pass' ? v.verdict : 'pass'
  const confidence =
    v.confidence === 'low' || v.confidence === 'medium' || v.confidence === 'high'
      ? v.confidence
      : 'low'
  return {
    verdict,
    pick: typeof v.pick === 'string' ? v.pick : 'No bet',
    confidence,
    rationale: typeof v.rationale === 'string' ? v.rationale : '',
  }
}
