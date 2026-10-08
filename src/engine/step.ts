import { alive, BULLET_SPEED, DELTA, distance, MAX_TURNS, STATS, tankAt, tankPassable, tileAt, TICKS, ticksThisTurn } from './rules'
import type { Action, GameState, Tank, TurnActions, Winner } from './types'

const key = (x: number, y: number) => `${x},${y}`

export function step(state: GameState, actions: TurnActions): GameState {
  const s = structuredClone(state)
  for (let tick = 0; tick < TICKS; tick++) {
    const tickActions = new Map<Tank, Action>()
    for (const t of alive(s)) {
      const action = tick < ticksThisTurn(t, s.turn) ? actions[t.id]?.[tick] : undefined
      if (action) tickActions.set(t, action)
    }
    resolveTick(s, tickActions)
  }
  s.turn += 1
  s.winner = winnerOf(s)
  return s
}

function resolveTick(s: GameState, actions: Map<Tank, Action>): void {
  for (const [t, a] of actions) if (a.type === 'repair') repair(s, t, a.target)
  moveTanks(s, actions)
  for (const [t, a] of actions) if (a.type === 'fire') fire(s, t, a.dir)
  hitTanks(s)
  for (let i = 0; i < BULLET_SPEED; i++) advanceBullets(s)
}

function repair(s: GameState, healer: Tank, targetId: string): void {
  const target = alive(s).find((t) => t.id === targetId)
  if (!STATS[healer.class].canRepair || !target || target === healer) return
  if (target.team !== healer.team || distance(healer, target) !== 1) return
  target.hp = Math.min(STATS[target.class].hp, target.hp + 1)
}

function moveTanks(s: GameState, actions: Map<Tank, Action>): void {
  const occupied = new Set(alive(s).map((t) => key(t.x, t.y)))
  const targets = new Map<Tank, [number, number]>()
  for (const [t, a] of actions) {
    if (a.type !== 'move') continue
    t.dir = a.dir
    const x = t.x + DELTA[a.dir][0]
    const y = t.y + DELTA[a.dir][1]
    if (tankPassable(tileAt(s, x, y)) && !occupied.has(key(x, y))) targets.set(t, [x, y])
  }
  const claims = new Map<string, number>()
  for (const [x, y] of targets.values()) claims.set(key(x, y), (claims.get(key(x, y)) ?? 0) + 1)
  for (const [t, [x, y]] of targets) {
    if (claims.get(key(x, y)) === 1) Object.assign(t, { x, y })
  }
}

function fire(s: GameState, t: Tank, dir: Tank['dir']): void {
  t.dir = dir
  if (!STATS[t.class].canFire || s.bullets.some((b) => b.owner === t.id)) return
  s.bullets.push({ owner: t.id, x: t.x, y: t.y, dir })
}

function hitTanks(s: GameState): void {
  s.bullets = s.bullets.filter((b) => {
    const target = tankAt(s, b.x, b.y)
    if (!target || target.id === b.owner) return true
    const shooter = s.tanks.find((t) => t.id === b.owner)
    if (shooter?.team !== target.team) target.hp -= 1
    return false
  })
}

function advanceBullets(s: GameState): void {
  const before = s.bullets.map((b) => key(b.x, b.y))
  for (const b of s.bullets) {
    b.x += DELTA[b.dir][0]
    b.y += DELTA[b.dir][1]
  }
  const after = s.bullets.map((b) => key(b.x, b.y))
  const cancelled = new Set<number>()
  for (let i = 0; i < s.bullets.length; i++) {
    for (let j = i + 1; j < s.bullets.length; j++) {
      const swapped = after[i] === before[j] && after[j] === before[i]
      if (after[i] === after[j] || swapped) cancelled.add(i).add(j)
    }
  }
  s.bullets = s.bullets.filter((b, i) => !cancelled.has(i) && !hitsTerrain(s, b))
  hitTanks(s)
}

function hitsTerrain(s: GameState, b: { x: number; y: number }): boolean {
  const tile = tileAt(s, b.x, b.y)
  if (tile === '#') {
    const row = s.tiles[b.y]!
    s.tiles[b.y] = row.slice(0, b.x) + '.' + row.slice(b.x + 1)
  }
  return tile === undefined || tile === '#' || tile === '@'
}

function winnerOf(s: GameState): Winner {
  const hp = (team: string) => alive(s).filter((t) => t.team === team).reduce((sum, t) => sum + t.hp, 0)
  const a = hp('a')
  const b = hp('b')
  if (a === 0 && b === 0) return 'draw'
  if (a === 0) return 'b'
  if (b === 0) return 'a'
  if (s.turn <= MAX_TURNS) return null
  return a > b ? 'a' : b > a ? 'b' : 'draw'
}
