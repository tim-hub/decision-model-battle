import { baselineAct, baselineTalk } from '../bots/baseline'
import { createGame } from '../engine/map'
import { alive } from '../engine/rules'
import type { GameState, Tank } from '../engine/types'
import { actOptions, actTicks, talkOptions } from '../protocol/options'
import type { DecideRequest, Odds, Phase, Player } from '../protocol/types'
import { parseResponse } from '../protocol/validate'
import { applyTurn, hashState, type Replay, type TurnRecord } from './replay'

export interface MatchConfig {
  a: Player
  b: Player
  seed: number
  tiles: string[]
  deadlineMs?: number
  onTurn?: (state: GameState, record: TurnRecord) => void
}

interface Answer {
  choice: string[]
  odds: Odds[]
  backup: boolean
  latency: number
}

async function ask(player: Player, req: DecideRequest, ticks: number, backup: () => string[], deadlineMs: number): Promise<Answer> {
  const controller = new AbortController()
  const start = performance.now()
  let timer: Timer | undefined
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort()
      reject(new Error('deadline'))
    }, deadlineMs)
  })
  const reply = Promise.resolve().then(() => player.decide(structuredClone(req), controller.signal))
  const body = await Promise.race([reply, deadline]).catch(() => null)
  clearTimeout(timer)
  const latency = Math.round(performance.now() - start)
  const valid = parseResponse(body, req.options, ticks)
  if (valid) return { ...valid, backup: false, latency }
  const choice = backup()
  return { choice, odds: choice.map((c) => ({ [c]: 1 })), backup: true, latency }
}

export async function runMatch(cfg: MatchConfig): Promise<Replay> {
  const deadlineMs = cfg.deadlineMs ?? 2000
  const playerOf = (t: Tank) => (t.team === 'a' ? cfg.a : cfg.b)
  let state = createGame(cfg.tiles, cfg.seed)
  const header = {
    type: 'header' as const,
    version: 1 as const,
    seed: cfg.seed,
    tiles: cfg.tiles,
    players: { a: cfg.a.name, b: cfg.b.name },
    initial_hash: hashState(state),
  }
  const turns: TurnRecord[] = []

  while (!state.winner) {
    const s = state
    const tanks = alive(s)
    const talk = await Promise.all(
      tanks.map((t) =>
        ask(playerOf(t), { phase: 'talk', tank_id: t.id, turn: s.turn, state: s, options: talkOptions(s, t.id) }, 1, () => [baselineTalk(s, t.id)], deadlineMs),
      ),
    )
    const statuses = Object.fromEntries(tanks.map((t, i) => [t.id, talk[i]!.choice[0]!]))
    const teamStatuses = (t: Tank) => Object.fromEntries(tanks.filter((m) => m.team === t.team).map((m) => [m.id, statuses[m.id]!]))

    const actors = tanks.filter((t) => actTicks(s, t.id) > 0)
    const act = await Promise.all(
      actors.map((t) =>
        ask(
          playerOf(t),
          { phase: 'act', tank_id: t.id, turn: s.turn, state: s, options: actOptions(s, t.id), team_statuses: teamStatuses(t) },
          actTicks(s, t.id),
          () => baselineAct(s, t.id),
          deadlineMs,
        ),
      ),
    )

    const backup: Record<string, Phase[]> = {}
    const latency: TurnRecord['latency_ms'] = {}
    const odds: TurnRecord['odds'] = {}
    const note = (t: Tank, phase: Phase, answer: Answer) => {
      if (answer.backup) (backup[t.id] ??= []).push(phase)
      ;(latency[t.id] ??= {})[phase] = answer.latency
      ;(odds[t.id] ??= {})[phase] = answer.odds
    }
    tanks.forEach((t, i) => note(t, 'talk', talk[i]!))
    actors.forEach((t, i) => note(t, 'act', act[i]!))

    const record: TurnRecord = {
      type: 'turn',
      turn: s.turn,
      statuses,
      actions: Object.fromEntries(actors.map((t, i) => [t.id, act[i]!.choice])),
      odds,
      backup,
      latency_ms: latency,
      hash: '',
    }
    state = applyTurn(s, record)
    record.hash = hashState(state)
    turns.push(record)
    cfg.onTurn?.(state, record)
  }

  return { header, turns, result: { type: 'result', winner: state.winner, turns: turns.length, final_hash: hashState(state) } }
}
