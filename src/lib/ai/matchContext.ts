// AI match-context brief — the model's blind spot, filled.
//
// The Dixon-Coles model is full-time-goals only: it cannot know that a team's
// first-choice striker is suspended, that a side already through is resting
// starters, or that it's 40°C at kickoff. The bookmaker prices all of that. This
// asks Claude to web-search the things that move a specific match — injuries,
// suspensions, likely line-ups, form, motivation, weather/venue — and write a
// short, cited brief. The search runs server-side (`web_search`), so a static,
// backend-less app gets live news with no scraper and no CORS proxy; it is
// billable, hence opt-in (a button, your own key).
//
// This is INFORMATIONAL context, deliberately NOT a model input — you read it and
// adjust your own judgement. The numbers stay the numbers.

import Anthropic from '@anthropic-ai/sdk'
import { makeClient, ODDS_PARSER_MODEL } from './anthropic'

export interface ContextSource {
  url: string
  title: string
}

export interface MatchContextResult {
  /** The cited free-text brief (may contain simple markdown / bullets). */
  brief: string
  sources: ContextSource[]
}

// ---------------------------------------------------------------------------
// Prompt building (pure — unit-tested)
// ---------------------------------------------------------------------------

export function buildContextPrompt(home: string, away: string): string {
  return [
    `World Cup 2026 fixture: ${home} vs ${away}.`,
    '',
    'Search the web for what a full-time goals model cannot know but that moves this specific match. Cover, only where you find something concrete and recent:',
    '- Injuries & suspensions (key players out or doubtful)',
    '- Likely line-ups / rotation (rested or returning starters)',
    '- Recent form (last few results, run of goals)',
    '- Motivation & stakes (already qualified or eliminated, dead rubber, must-win)',
    '- Conditions (venue, heat/altitude, weather) if notable',
    '',
    'Write a tight brief grouped under those headings — one or two short bullets each, and skip any heading where you found nothing notable. Prefer recent, reputable sources and cite them. Keep it factual; do not give betting advice or predict a score.',
  ].join('\n')
}

// ---------------------------------------------------------------------------
// Research with the server-side web_search tool
// ---------------------------------------------------------------------------

interface Citation {
  type?: string
  url?: string
  title?: string
}

export async function matchContext(
  home: string,
  away: string,
  apiKey: string,
): Promise<MatchContextResult> {
  const client = makeClient(apiKey)
  const messages: Anthropic.MessageParam[] = [
    { role: 'user', content: buildContextPrompt(home, away) },
  ]

  let brief = ''
  const sourceMap = new Map<string, string>()

  // web_search is server-side; the API may `pause_turn` at a step limit — re-send.
  for (let step = 0; step < 5; step++) {
    const resp = await client.messages.create({
      model: ODDS_PARSER_MODEL,
      max_tokens: 2048,
      tools: [{ type: 'web_search_20260209', name: 'web_search' }],
      messages,
    })

    if (resp.stop_reason === 'refusal') throw new Error('The model declined to respond.')

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
