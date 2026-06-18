import { describe, it, expect } from 'vitest'
import { buildPickPrompt, buildResearchPrompt, type PickMatch } from '../pickOfDay'

const MATCHES: PickMatch[] = [
  {
    home: 'France',
    away: 'Senegal',
    homeXg: 1.8,
    awayXg: 0.9,
    selections: [
      { label: 'France', modelProb: 0.62, fairOdds: 1.61, bookOdds: 1.75, edgePct: 4.9, evPer1: 0.085 },
      { label: 'Draw', modelProb: 0.22, fairOdds: 4.55 },
    ],
  },
  {
    home: 'Norway',
    away: 'Senegal',
    homeXg: 1.4,
    awayXg: 1.3,
    selections: [{ label: 'Over 2.5', modelProb: 0.55, fairOdds: 1.82 }],
  },
]

describe('buildResearchPrompt', () => {
  const p = buildResearchPrompt('2026-06-22', MATCHES)

  it('names the date and every fixture', () => {
    expect(p).toContain('2026-06-22')
    expect(p).toContain('France vs Senegal')
    expect(p).toContain('Norway vs Senegal')
  })

  it('asks for injuries, line-ups, form and motivation', () => {
    expect(p.toLowerCase()).toContain('injuries')
    expect(p.toLowerCase()).toContain('line-ups')
    expect(p.toLowerCase()).toContain('motivation')
  })
})

describe('buildPickPrompt', () => {
  it('includes model probabilities, fair odds and entered book prices', () => {
    const p = buildPickPrompt('2026-06-22', MATCHES)
    expect(p).toContain('France vs Senegal')
    expect(p).toContain('model 62%')
    expect(p).toContain('fair 1.61')
    expect(p).toContain('book 1.75')
    expect(p).toContain('edge +4.9%')
  })

  it('marks selections with no entered price', () => {
    const p = buildPickPrompt('2026-06-22', MATCHES)
    expect(p).toContain('no price entered')
  })

  it('omits the news section when there is no brief', () => {
    const p = buildPickPrompt('2026-06-22', MATCHES)
    expect(p).not.toContain('NEWS & CONTEXT')
  })

  it('folds in the research brief when provided', () => {
    const p = buildPickPrompt('2026-06-22', MATCHES, 'France rest their captain; dead rubber.')
    expect(p).toContain('NEWS & CONTEXT')
    expect(p).toContain('dead rubber')
  })

  it('caps the recommendation at three picks', () => {
    const p = buildPickPrompt('2026-06-22', MATCHES)
    expect(p).toContain('at most 3 picks')
  })
})
