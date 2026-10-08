import type { Dir, GameState, Tank, TankClass } from './types'

export const MAX_TURNS = 200
export const TICKS = 2
export const BULLET_SPEED = 2
export const DIRS: Dir[] = ['up', 'down', 'left', 'right']

export const DELTA: Record<Dir, [number, number]> = {
  up: [0, -1],
  down: [0, 1],
  left: [-1, 0],
  right: [1, 0],
}

export const STATS: Record<TankClass, { hp: number; canFire: boolean; canRepair: boolean }> = {
  light: { hp: 2, canFire: true, canRepair: false },
  repair: { hp: 2, canFire: false, canRepair: true },
  heavy: { hp: 5, canFire: true, canRepair: false },
}

export function ticksThisTurn(tank: Tank, turn: number): number {
  if (tank.class === 'light') return 2
  if (tank.class === 'heavy' && turn % 2 === 1) return 0
  return 1
}

export function tileAt(s: GameState, x: number, y: number): string | undefined {
  return s.tiles[y]?.[x]
}

export function tankPassable(tile: string | undefined): boolean {
  return tile === '.' || tile === '%'
}

export function alive(s: GameState): Tank[] {
  return s.tanks.filter((t) => t.hp > 0)
}

export function tankAt(s: GameState, x: number, y: number): Tank | undefined {
  return alive(s).find((t) => t.x === x && t.y === y)
}

export function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y)
}
