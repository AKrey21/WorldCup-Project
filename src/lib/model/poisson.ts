// Poisson primitives, computed in log-space for numerical stability.

const LOG_FACTORIAL_CACHE = [0, 0] // 0! = 1! = 1 -> log = 0

export function logFactorial(k: number): number {
  if (k < LOG_FACTORIAL_CACHE.length) return LOG_FACTORIAL_CACHE[k]
  let value = LOG_FACTORIAL_CACHE[LOG_FACTORIAL_CACHE.length - 1]
  for (let i = LOG_FACTORIAL_CACHE.length; i <= k; i++) {
    value += Math.log(i)
    LOG_FACTORIAL_CACHE[i] = value
  }
  return value
}

/** P(X = k) for X ~ Poisson(lambda). */
export function poissonPmf(k: number, lambda: number): number {
  if (lambda <= 0) return k === 0 ? 1 : 0
  return Math.exp(k * Math.log(lambda) - lambda - logFactorial(k))
}
