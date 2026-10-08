import type { Player } from '../protocol/types'
import { rate, type GameResult, type Rating } from '../rating/bradley-terry'
import { runMatch } from './match'
import { matchMetrics, mergeMetrics, summarize, type MetricsSummary, type TeamMetrics } from './metrics'
import type { Replay } from './replay'

export interface Entry {
  name: string
  player: (seed: number) => Player
}

export interface TournamentConfig {
  tiles: string[]
  gamesPerSide?: number
  deadlineMs?: number
  onGame?: (replay: Replay) => void
}

export interface Standing extends Rating, MetricsSummary {
  games: number
  winRate: number
}

export async function runTournament(entries: Entry[], cfg: TournamentConfig): Promise<Standing[]> {
  const gamesPerSide = cfg.gamesPerSide ?? 10
  const games: GameResult[] = []
  const metrics = new Map<string, TeamMetrics[]>(entries.map((e) => [e.name, []]))
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      for (const [a, b] of [[entries[i]!, entries[j]!], [entries[j]!, entries[i]!]] as const) {
        for (let seed = 1; seed <= gamesPerSide; seed++) {
          const replay = await runMatch({ a: a.player(seed), b: b.player(seed), seed, tiles: cfg.tiles, deadlineMs: cfg.deadlineMs })
          games.push({ a: a.name, b: b.name, winner: replay.result.winner ?? 'draw' })
          const m = matchMetrics(replay)
          metrics.get(a.name)!.push(m.a)
          metrics.get(b.name)!.push(m.b)
          cfg.onGame?.(replay)
        }
      }
    }
  }
  const anchor = entries.some((e) => e.name === 'baseline') ? 'baseline' : undefined
  return rate(games, anchor).map((r) => {
    const own = games.filter((g) => g.a === r.name || g.b === r.name)
    const points = own.reduce((sum, g) => sum + (g.winner === 'draw' ? 0.5 : g[g.winner] === r.name ? 1 : 0), 0)
    return { ...r, games: own.length, winRate: points / own.length, ...summarize(mergeMetrics(metrics.get(r.name)!)) }
  })
}
