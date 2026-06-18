import { describe, it, expect } from 'vitest'
import { buildContextPrompt } from '../matchContext'

describe('buildContextPrompt', () => {
  const p = buildContextPrompt('Mexico', 'South Korea')

  it('names both teams and the tournament', () => {
    expect(p).toContain('Mexico vs South Korea')
    expect(p).toContain('World Cup 2026')
  })

  it('asks for injuries, line-ups, form, motivation and conditions', () => {
    const low = p.toLowerCase()
    expect(low).toContain('injuries')
    expect(low).toContain('line-ups')
    expect(low).toContain('form')
    expect(low).toContain('motivation')
    expect(low).toContain('altitude')
  })

  it('keeps it factual — no betting advice or score prediction', () => {
    expect(p.toLowerCase()).toContain('do not give betting advice')
  })
})
