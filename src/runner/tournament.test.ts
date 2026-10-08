import { expect, test } from 'bun:test'
import { baseline } from '../bots/baseline'
import { randomPlayer } from '../bots/random'
import { loadMap } from '../engine/map'
import type { DecideRequest, Player } from '../protocol/types'
import { runMatch } from './match'
import { matchMetrics, summarize } from './metrics'
import { runTournament } from './tournament'

const tiles = loadMap('maps/stage1.txt')

test('baseline ranks above the random bot with a CI that excludes it', async () => {
  const standings = await runTournament(
    [
      { name: 'baseline', player: () => baseline },
      { name: 'random', player: randomPlayer },
    ],
    { tiles },
  )
  expect(standings.map((s) => s.name)).toEqual(['baseline', 'random'])
  expect(standings[0]).toMatchObject({ elo: 0, games: 20, backupPct: 0 })
  expect(standings[0]!.winRate).toBeGreaterThan(0.9)
  expect(standings[1]!.high).toBeLessThan(0)
})

const lightTicks = (req: DecideRequest, odds: Record<string, number>) =>
  req.phase === 'act' && req.state.tanks.find((t) => t.id === req.tank_id)!.class === 'light' ? { ticks: [odds, odds] } : { odds }

const liar: Player = {
  name: 'liar',
  decide: async (req) => (req.phase === 'talk' ? { odds: { 'moving(up)': 1 } } : lightTicks(req, { idle: 1 })),
}
const honestIdler: Player = {
  name: 'idler',
  decide: async (req) => (req.phase === 'talk' ? { odds: { holding: 1 } } : lightTicks(req, { idle: 1 })),
}
const broken: Player = {
  name: 'broken',
  decide: () => {
    throw new Error('down')
  },
}

test('metrics on a known replay: backups, honesty and latency', async () => {
  const replay = await runMatch({ a: broken, b: liar, seed: 1, tiles })
  const m = matchMetrics(replay)
  expect(replay.result.winner).toBe('a')
  expect(summarize(m.a).backupPct).toBe(100)
  expect(summarize(m.b)).toMatchObject({ backupPct: 0, honestyPct: 0 })
  expect(m.b.judged).toBe(replay.turns.reduce((n, t) => n + ['b1', 'b2', 'b3'].filter((id) => t.actions[id]).length, 0))
  expect(m.a.decisions).toBe(m.a.latencies.length)
  expect(summarize(m.a).medianLatencyMs).toBeGreaterThanOrEqual(0)
})

test('a tank whose status matches its action scores 100% honesty', async () => {
  const replay = await runMatch({ a: honestIdler, b: honestIdler, seed: 1, tiles })
  expect(replay.result).toMatchObject({ winner: 'draw', turns: 200 })
  expect(summarize(matchMetrics(replay).a).honestyPct).toBe(100)
})
