import { alive, DIRS, distance, STATS, ticksThisTurn } from '../engine/rules'
import type { Action, Dir, GameState, Tank } from '../engine/types'

function self(s: GameState, tankId: string): Tank {
  const tank = alive(s).find((t) => t.id === tankId)
  if (!tank) throw new Error(`no alive tank ${tankId}`)
  return tank
}

export function actTicks(s: GameState, tankId: string): number {
  return ticksThisTurn(self(s, tankId), s.turn)
}

export function actOptions(s: GameState, tankId: string): string[] {
  const t = self(s, tankId)
  if (ticksThisTurn(t, s.turn) === 0) return []
  const options = ['idle', ...DIRS.map((d) => `move(${d})`)]
  if (STATS[t.class].canFire) options.push(...DIRS.map((d) => `fire(${d})`))
  if (STATS[t.class].canRepair) {
    const adjacent = alive(s).filter((a) => a.team === t.team && a !== t && distance(a, t) === 1)
    options.push(...adjacent.map((a) => `repair(${a.id})`))
  }
  return options
}

export function talkOptions(s: GameState, tankId: string): string[] {
  const t = self(s, tankId)
  const enemies = alive(s).filter((e) => e.team !== t.team)
  const allies = alive(s).filter((a) => a.team === t.team && a !== t)
  return [
    ...enemies.map((e) => `attacking(${e.id})`),
    ...DIRS.map((d) => `moving(${d})`),
    'need_repair',
    ...(t.class === 'repair' ? allies.map((a) => `repairing(${a.id})`) : []),
    'retreating',
    'holding',
    'low_hp',
    'idle',
  ]
}

const OPTION = /^(\w+)(?:\((\w+)\))?$/

export function parseOption(option: string): { name: string; arg?: string } {
  const [, name, arg] = OPTION.exec(option) ?? []
  if (!name) throw new Error(`bad option ${option}`)
  return { name, arg }
}

export function parseAction(option: string): Action {
  const { name, arg } = parseOption(option)
  if (name === 'move' || name === 'fire') return { type: name, dir: arg as Dir }
  if (name === 'repair') return { type: 'repair', target: arg! }
  return { type: 'idle' }
}
