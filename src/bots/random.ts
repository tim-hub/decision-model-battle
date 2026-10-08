import { mulberry32 } from '../engine/map'
import type { Odds, Player } from '../protocol/types'

export function randomPlayer(seed: number): Player {
  const random = mulberry32(seed)
  const randomOdds = (options: string[]): Odds => Object.fromEntries(options.map((o) => [o, random()]))
  return {
    name: 'random',
    decide: async (req) =>
      req.phase === 'act' && req.state.tanks.find((t) => t.id === req.tank_id)?.class === 'light'
        ? { ticks: [randomOdds(req.options), randomOdds(req.options)] }
        : { odds: randomOdds(req.options) },
  }
}
