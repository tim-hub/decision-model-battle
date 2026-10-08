import { createHash } from 'node:crypto'
import { createGame } from '../engine/map'
import { step } from '../engine/step'
import type { GameState, Winner } from '../engine/types'
import { parseAction } from '../protocol/options'
import type { Odds, Phase } from '../protocol/types'

export interface ReplayHeader {
  type: 'header'
  version: 1
  seed: number
  tiles: string[]
  players: { a: string; b: string }
  initial_hash: string
}

export interface TurnRecord {
  type: 'turn'
  turn: number
  statuses: Record<string, string>
  actions: Record<string, string[]>
  odds: Record<string, Partial<Record<Phase, Odds[]>>>
  backup: Record<string, Phase[]>
  latency_ms: Record<string, Partial<Record<Phase, number>>>
  hash: string
}

export interface ReplayResult {
  type: 'result'
  winner: Winner
  turns: number
  final_hash: string
}

export interface Replay {
  header: ReplayHeader
  turns: TurnRecord[]
  result: ReplayResult
}

export function hashState(s: GameState): string {
  return createHash('sha256').update(JSON.stringify(s)).digest('hex')
}

export function applyTurn(s: GameState, record: TurnRecord): GameState {
  const actions = Object.fromEntries(Object.entries(record.actions).map(([id, opts]) => [id, opts.map(parseAction)]))
  return step(s, actions)
}

export function* replayStates(replay: Replay): Generator<{ before: GameState; record: TurnRecord; after: GameState }> {
  let state = createGame(replay.header.tiles, replay.header.seed)
  for (const record of replay.turns) {
    const after = applyTurn(state, record)
    yield { before: state, record, after }
    state = after
  }
}

export function verifyReplay(replay: Replay): { ok: boolean; finalHash: string; mismatchTurn?: number } {
  let state = createGame(replay.header.tiles, replay.header.seed)
  if (hashState(state) !== replay.header.initial_hash) return { ok: false, finalHash: hashState(state), mismatchTurn: 0 }
  for (const { record, after } of replayStates(replay)) {
    state = after
    if (hashState(after) !== record.hash) return { ok: false, finalHash: hashState(after), mismatchTurn: record.turn }
  }
  const finalHash = hashState(state)
  return { ok: finalHash === replay.result.final_hash && state.winner === replay.result.winner, finalHash }
}

export function toJsonl(replay: Replay): string {
  return [replay.header, ...replay.turns, replay.result].map((line) => JSON.stringify(line)).join('\n') + '\n'
}

export function fromJsonl(text: string): Replay {
  const lines = text.trim().split('\n').map((l) => JSON.parse(l))
  return { header: lines[0], turns: lines.slice(1, -1), result: lines.at(-1) }
}
