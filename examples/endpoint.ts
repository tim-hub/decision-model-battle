import type { DecideRequest, DecideResponse, Odds } from '../src/protocol/types'

const DIRECTION_OF = (dx: number, dy: number) => (Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up')

export async function decide(req: DecideRequest): Promise<DecideResponse> {
  const me = req.state.tanks.find((t) => t.id === req.tank_id)!
  const enemies = req.state.tanks.filter((t) => t.team !== me.team && t.hp > 0)
  const target = enemies.sort((a, b) => Math.abs(a.x - me.x) + Math.abs(a.y - me.y) - (Math.abs(b.x - me.x) + Math.abs(b.y - me.y)))[0]!
  const dir = DIRECTION_OF(target.x - me.x, target.y - me.y)
  const aligned = target.x === me.x || target.y === me.y

  const odds: Odds = {}
  for (const option of req.options) odds[option] = 0.01
  if (req.phase === 'talk') {
    odds[`attacking(${target.id})`] = 1
    return { odds }
  }
  if (aligned && req.options.includes(`fire(${dir})`)) odds[`fire(${dir})`] = 1
  else odds[`move(${dir})`] = 1
  return me.class === 'light' ? { ticks: [odds, odds] } : { odds }
}

if (import.meta.main) {
  const port = Number(process.env.PORT ?? 3000)
  Bun.serve({
    port,
    routes: { '/decide': { POST: async (req) => Response.json(await decide((await req.json()) as DecideRequest)) } },
  })
  console.log(`endpoint listening on http://localhost:${port}`)
}
