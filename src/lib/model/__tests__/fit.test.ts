import { describe, it, expect } from 'vitest'
import { fitDixonColes, lambdasFor, type RawMatch } from '../fit'

// Deterministic PRNG so the synthetic dataset (and thus the test) is stable.
function mulberry32(seed: number) {
  return function () {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function poissonSample(lambda: number, rng: () => number): number {
  const L = Math.exp(-lambda)
  let k = 0
  let p = 1
  do {
    k++
    p *= rng()
  } while (p > L)
  return k - 1
}

/** Generate a round-robin league from known true parameters. */
function syntheticLeague() {
  const rng = mulberry32(12345)
  const teams = ['A', 'B', 'C', 'D', 'E', 'F']
  const atkTrue = [0.6, 0.3, 0.0, -0.1, -0.3, -0.5]
  const defTrue = [0.4, 0.15, 0.0, -0.1, -0.2, -0.25]
  const cTrue = Math.log(1.3)
  const gammaTrue = 0.3
  const matches: RawMatch[] = []
  const ROUNDS = 240
  for (let r = 0; r < ROUNDS; r++) {
    for (let h = 0; h < teams.length; h++) {
      for (let a = 0; a < teams.length; a++) {
        if (h === a) continue
        const lh = Math.exp(cTrue + atkTrue[h] - defTrue[a] + gammaTrue)
        const la = Math.exp(cTrue + atkTrue[a] - defTrue[h])
        matches.push({
          date: '2025-06-01',
          home: teams[h],
          away: teams[a],
          homeScore: poissonSample(lh, rng),
          awayScore: poissonSample(la, rng),
          neutral: 0,
          importance: 1,
        })
      }
    }
  }
  return { teams, atkTrue, defTrue, gammaTrue, matches }
}

describe('dixon-coles fit', () => {
  it('recovers team strength ordering and home advantage from synthetic data', () => {
    const { teams, atkTrue, defTrue, gammaTrue, matches } = syntheticLeague()
    const model = fitDixonColes(matches, { asOf: '2025-06-01', halfLifeYears: 100 })

    // Attack ordering A > B > C > D > E > F should be recovered.
    const recoveredAtk = teams.map((t) => model.atk[model.index.get(t)!])
    for (let i = 1; i < teams.length; i++) {
      expect(recoveredAtk[i - 1]).toBeGreaterThan(recoveredAtk[i])
    }
    // Defense ordering likewise (higher def = concedes fewer).
    const recoveredDef = teams.map((t) => model.def[model.index.get(t)!])
    for (let i = 1; i < teams.length; i++) {
      expect(recoveredDef[i - 1]).toBeGreaterThan(recoveredDef[i])
    }

    // Home advantage recovered within a reasonable tolerance.
    expect(model.gamma).toBeGreaterThan(gammaTrue - 0.12)
    expect(model.gamma).toBeLessThan(gammaTrue + 0.12)

    // Recovered attack differences track the true ones (centered).
    const center = (xs: number[]) => {
      const mean = xs.reduce((a, b) => a + b, 0) / xs.length
      return xs.map((x) => x - mean)
    }
    const trueC = center(atkTrue)
    for (let i = 0; i < teams.length; i++) {
      expect(Math.abs(recoveredAtk[i] - trueC[i])).toBeLessThan(0.15)
    }

    // Best attack vs worst defense should yield a high home lambda.
    const lambdas = lambdasFor(model, 'A', 'F', false)!
    expect(lambdas.lh).toBeGreaterThan(lambdas.la)
    expect(lambdas.lh).toBeGreaterThan(2)

    void defTrue
  })

  it('returns null lambdas for an unknown team', () => {
    const { matches } = syntheticLeague()
    const model = fitDixonColes(matches, { asOf: '2025-06-01' })
    expect(lambdasFor(model, 'A', 'Atlantis', false)).toBeNull()
  })
})
