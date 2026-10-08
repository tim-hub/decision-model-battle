import type { GameState } from '../engine/types'

export type Phase = 'talk' | 'act'
export type Odds = Record<string, number>

export interface DecideRequest {
  phase: Phase
  tank_id: string
  turn: number
  state: GameState
  options: string[]
  team_statuses?: Record<string, string>
}

export type DecideResponse = { odds: Odds } | { ticks: Odds[] }

export interface Player {
  name: string
  decide(req: DecideRequest, signal: AbortSignal): Promise<unknown>
}
