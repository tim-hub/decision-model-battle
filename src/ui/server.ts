import type { Server } from 'bun'
import type { GameState } from '../engine/types'
import type { ReplayResult, TurnRecord } from '../runner/replay'
import page from './index.html'

export interface Frame {
  state: GameState
  record: TurnRecord | null
}

export interface View {
  players: { a: string; b: string }
  seed: number
  frames: Frame[]
  result: ReplayResult | null
}

export function serveViewer(view: View, port: number): Server<undefined> {
  return Bun.serve({
    port,
    routes: {
      '/': page,
      '/api/view': (req) => {
        const from = Number(new URL(req.url).searchParams.get('from') ?? 0)
        return Response.json({ ...view, from, frames: view.frames.slice(from) })
      },
    },
  })
}

export function recordTurn(view: View, state: GameState, record: TurnRecord): void {
  view.frames.at(-1)!.record = record
  view.frames.push({ state, record: null })
}
