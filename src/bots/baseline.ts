import { alive, DELTA, DIRS, distance, STATS, tankAt, tankPassable, tileAt } from '../engine/rules'
import type { Dir, GameState, Tank } from '../engine/types'
import { actTicks, parseAction } from '../protocol/options'
import type { DecideResponse, Player } from '../protocol/types'

interface Pos {
  x: number
  y: number
}

const missingHp = (t: Tank) => STATS[t.class].hp - t.hp

function clearLine(s: GameState, me: Tank, from: Pos, to: Pos): Dir | null {
  if (from.x !== to.x && from.y !== to.y) return null
  const dir: Dir = from.x === to.x ? (to.y < from.y ? 'up' : 'down') : to.x < from.x ? 'left' : 'right'
  const [dx, dy] = DELTA[dir]
  for (let x = from.x + dx, y = from.y + dy; x !== to.x || y !== to.y; x += dx, y += dy) {
    const tile = tileAt(s, x, y)
    const blocker = tankAt(s, x, y)
    if (tile === '#' || tile === '@' || (blocker && blocker.team === me.team && blocker !== me)) return null
  }
  return dir
}

function firstStep(start: Pos, isGoal: (p: Pos) => boolean, canEnter: (p: Pos) => boolean): Dir | null {
  const seen = new Set([`${start.x},${start.y}`])
  const queue: [Pos, Dir][] = DIRS.map((d) => [{ x: start.x + DELTA[d][0], y: start.y + DELTA[d][1] }, d])
  while (queue.length) {
    const [p, first] = queue.shift()!
    const k = `${p.x},${p.y}`
    if (seen.has(k) || !canEnter(p)) continue
    seen.add(k)
    if (isGoal(p)) return first
    for (const d of DIRS) queue.push([{ x: p.x + DELTA[d][0], y: p.y + DELTA[d][1] }, first])
  }
  return null
}

function enterable(s: GameState, me: Tank, throughBrick: boolean): (p: Pos) => boolean {
  return (p) => {
    const tile = tileAt(s, p.x, p.y)
    const other = tankAt(s, p.x, p.y)
    return (tankPassable(tile) || (throughBrick && tile === '#')) && (!other || other === me)
  }
}

function shooterPick(s: GameState, me: Tank, pos: Pos, bulletInFlight: boolean): string {
  const enemies = alive(s)
    .filter((e) => e.team !== me.team)
    .sort((a, b) => distance(pos, a) - distance(pos, b))
  for (const e of enemies) {
    const dir = clearLine(s, me, pos, e)
    if (dir) return bulletInFlight ? 'idle' : `fire(${dir})`
  }
  const hasShot = (p: Pos) => enemies.some((e) => clearLine(s, me, p, e))
  const open = firstStep(pos, hasShot, enterable(s, me, false))
  if (open) return `move(${open})`
  const dug = firstStep(pos, hasShot, enterable(s, me, true))
  if (!dug) return 'idle'
  const next = tileAt(s, pos.x + DELTA[dug][0], pos.y + DELTA[dug][1])
  if (next !== '#') return `move(${dug})`
  return bulletInFlight ? 'idle' : `fire(${dug})`
}

function repairPick(s: GameState, me: Tank): string {
  const allies = alive(s)
    .filter((a) => a.team === me.team && a !== me)
    .sort((a, b) => missingHp(b) - missingHp(a))
  const patient = allies.find((a) => missingHp(a) > 0 && distance(a, me) === 1)
  if (patient) return `repair(${patient.id})`
  const target = allies.find((a) => missingHp(a) > 0) ?? allies.find((a) => a.class === 'heavy') ?? allies[0]
  if (!target || distance(target, me) === 1) return 'idle'
  const dir = firstStep(me, (p) => distance(p, target) === 1, enterable(s, me, false))
  return dir ? `move(${dir})` : 'idle'
}

export function baselineAct(s: GameState, tankId: string): string[] {
  const me = alive(s).find((t) => t.id === tankId)!
  const pos = { x: me.x, y: me.y }
  let bulletInFlight = s.bullets.some((b) => b.owner === me.id)
  const picks: string[] = []
  for (let tick = 0; tick < actTicks(s, tankId); tick++) {
    const pick = me.class === 'repair' ? repairPick(s, me) : shooterPick(s, me, pos, bulletInFlight)
    picks.push(pick)
    const action = parseAction(pick)
    if (action.type === 'fire') bulletInFlight = true
    if (action.type === 'move') {
      const next = { x: pos.x + DELTA[action.dir][0], y: pos.y + DELTA[action.dir][1] }
      if (enterable(s, me, false)(next)) Object.assign(pos, next)
    }
  }
  return picks
}

export function baselineTalk(s: GameState, tankId: string): string {
  const me = alive(s).find((t) => t.id === tankId)!
  const allies = alive(s).filter((a) => a.team === me.team && a !== me)
  if (me.class === 'repair') {
    const patient = allies.filter((a) => missingHp(a) > 0).sort((a, b) => missingHp(b) - missingHp(a))[0]
    return patient ? `repairing(${patient.id})` : 'holding'
  }
  if (me.hp * 2 <= STATS[me.class].hp) return allies.some((a) => a.class === 'repair') ? 'need_repair' : 'low_hp'
  const nearest = alive(s)
    .filter((e) => e.team !== me.team)
    .sort((a, b) => distance(me, a) - distance(me, b))[0]!
  return `attacking(${nearest.id})`
}

export function oddsFor(picks: string[]): DecideResponse {
  const odds = picks.map((p) => ({ [p]: 1 }))
  return odds.length === 1 ? { odds: odds[0]! } : { ticks: odds }
}

export const baseline: Player = {
  name: 'baseline',
  decide: async (req) =>
    oddsFor(req.phase === 'talk' ? [baselineTalk(req.state, req.tank_id)] : baselineAct(req.state, req.tank_id)),
}
