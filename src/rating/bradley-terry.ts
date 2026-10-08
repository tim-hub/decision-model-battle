import { mulberry32 } from '../engine/map'

export interface GameResult {
  a: string
  b: string
  winner: 'a' | 'b' | 'draw'
}

export interface Rating {
  name: string
  elo: number
  low: number
  high: number
}

const ITERATIONS = 300

function fitElo(names: string[], games: GameResult[], anchor?: string): number[] {
  const index = new Map(names.map((n, i) => [n, i]))
  const wins = names.map(() => 0)
  const played = names.map(() => names.map(() => 0))
  for (const g of games) {
    const a = index.get(g.a)!
    const b = index.get(g.b)!
    wins[a]! += g.winner === 'a' ? 1 : g.winner === 'draw' ? 0.5 : 0
    wins[b]! += g.winner === 'b' ? 1 : g.winner === 'draw' ? 0.5 : 0
    played[a]![b]! += 1
    played[b]![a]! += 1
  }
  names.forEach((_, i) =>
    names.forEach((_, j) => {
      if (i === j || played[i]![j] === 0) return
      wins[i]! += 0.5
      played[i]![j]! += 1
    }),
  )
  let p = names.map(() => 1)
  for (let it = 0; it < ITERATIONS; it++) {
    p = p.map((pi, i) => {
      const denom = p.reduce((sum, pj, j) => sum + played[i]![j]! / (pi + pj), 0)
      return denom > 0 ? wins[i]! / denom : pi
    })
    const meanLog = p.reduce((sum, x) => sum + Math.log(x), 0) / p.length
    p = p.map((x) => x / Math.exp(meanLog))
  }
  const elo = p.map((x) => 400 * Math.log10(x))
  const zero = anchor !== undefined && index.has(anchor) ? elo[index.get(anchor)!]! : 0
  return elo.map((e) => e - zero)
}

export function rate(games: GameResult[], anchor?: string, samples = 1000, seed = 1): Rating[] {
  const names = [...new Set(games.flatMap((g) => [g.a, g.b]))]
  const point = fitElo(names, games, anchor)
  const random = mulberry32(seed)
  const draws = Array.from({ length: samples }, () =>
    fitElo(names, games.map(() => games[Math.floor(random() * games.length)]!), anchor),
  )
  const percentile = (i: number, q: number) => draws.map((d) => d[i]!).sort((x, y) => x - y)[Math.floor(q * (samples - 1))]!
  return names
    .map((name, i) => ({ name, elo: point[i]!, low: percentile(i, 0.025), high: percentile(i, 0.975) }))
    .sort((x, y) => y.elo - x.elo)
}
