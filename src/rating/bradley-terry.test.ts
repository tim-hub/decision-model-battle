import { expect, test } from 'bun:test'
import { rate, type GameResult } from './bradley-terry'

const games = (a: string, b: string, aWins: number, bWins: number, draws = 0): GameResult[] => [
  ...Array.from({ length: aWins }, () => ({ a, b, winner: 'a' as const })),
  ...Array.from({ length: bWins }, () => ({ a, b, winner: 'b' as const })),
  ...Array.from({ length: draws }, () => ({ a, b, winner: 'draw' as const })),
]

test('equal records give equal ratings around 0', () => {
  const [x, y] = rate(games('x', 'y', 5, 5))
  expect(x!.elo).toBeCloseTo(0)
  expect(y!.elo).toBeCloseTo(0)
})

test('the anchor sits at 0 and a stronger player rates above it', () => {
  const ratings = rate(games('strong', 'baseline', 15, 5), 'baseline')
  expect(ratings.map((r) => r.name)).toEqual(['strong', 'baseline'])
  expect(ratings[1]!.elo).toBe(0)
  expect(ratings[0]!.elo).toBeGreaterThan(100)
})

test('a player that never wins still gets a finite rating', () => {
  const [, loser] = rate(games('w', 'l', 20, 0))
  expect(Number.isFinite(loser!.elo)).toBe(true)
})

test('the point rating sits inside its 95% bootstrap interval', () => {
  for (const r of rate([...games('x', 'y', 12, 6, 2), ...games('y', 'z', 9, 9), ...games('x', 'z', 14, 4)])) {
    expect(r.low).toBeLessThanOrEqual(r.elo)
    expect(r.high).toBeGreaterThanOrEqual(r.elo)
  }
})
