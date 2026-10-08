import { afterAll, expect, test } from 'bun:test'
import { baseline } from '../bots/baseline'
import { loadMap } from '../engine/map'
import { MAX_TURNS } from '../engine/rules'
import type { DecideRequest } from '../protocol/types'
import { httpPlayer } from './http'
import { runMatch } from './match'
import { fromJsonl, toJsonl, verifyReplay } from './replay'

const tiles = loadMap('maps/stage1.txt')

const fake = Bun.serve({
  port: 0,
  async fetch(request) {
    const req = (await request.json()) as DecideRequest
    if (req.tank_id === 'a3') return Response.json({ odds: { 'not-an-option': 1 } })
    if (req.tank_id === 'a2' && req.turn === 1) await Bun.sleep(300)
    const odds = { [req.options[0]!]: 1 }
    const light = req.phase === 'act' && req.tank_id === 'a1'
    return Response.json(light ? { ticks: [odds, odds] } : { odds })
  },
})
afterAll(() => fake.stop())

test('baseline vs baseline finishes within the turn cap', async () => {
  const replay = await runMatch({ a: baseline, b: baseline, seed: 1, tiles })
  expect(replay.result.winner).not.toBeNull()
  expect(replay.result.turns).toBeLessThanOrEqual(MAX_TURNS)
  expect(replay.turns.every((t) => Object.keys(t.backup).length === 0)).toBe(true)
})

test('slow, invalid and good replies: only slow and invalid ones become backup moves', async () => {
  const replay = await runMatch({ a: httpPlayer(fake.url.href), b: baseline, seed: 3, tiles, deadlineMs: 100 })
  const [first, ...rest] = replay.turns
  expect(first!.backup).toEqual({ a2: ['talk', 'act'], a3: ['talk'] })
  expect(first!.latency_ms.a2!.talk).toBeGreaterThanOrEqual(100)
  for (const turn of rest) {
    expect(turn.backup.a1).toBeUndefined()
    expect(turn.backup.a2).toBeUndefined()
    if (turn.statuses.a3) expect(turn.backup.a3).toEqual(turn.actions.a3 ? ['talk', 'act'] : ['talk'])
  }
  expect(first!.actions.a1).toEqual(['idle', 'idle'])
  expect(Object.values(first!.statuses).every(Boolean)).toBe(true)
})

test('act requests carry only the team statuses', async () => {
  const seen: DecideRequest[] = []
  const spy = { name: 'spy', decide: async (req: DecideRequest, signal: AbortSignal) => (seen.push(req), baseline.decide(req, signal)) }
  await runMatch({ a: spy, b: baseline, seed: 2, tiles })
  const act = seen.find((r) => r.phase === 'act')!
  expect(Object.keys(act.team_statuses!).sort()).toEqual(['a1', 'a2', 'a3'])
  expect(seen.find((r) => r.phase === 'talk')!.team_statuses).toBeUndefined()
})

test('re-simulating a recorded replay gives the same final state hash', async () => {
  const replay = fromJsonl(toJsonl(await runMatch({ a: baseline, b: httpPlayer(fake.url.href), seed: 5, tiles, deadlineMs: 100 })))
  expect(verifyReplay(replay)).toEqual({ ok: true, finalHash: replay.result.final_hash })
})

test('a tampered replay fails verification at the changed turn', async () => {
  const replay = await runMatch({ a: baseline, b: baseline, seed: 4, tiles })
  replay.turns[3]!.actions.a1 = ['move(left)', 'move(left)']
  expect(verifyReplay(replay)).toMatchObject({ ok: false, mismatchTurn: 4 })
})
