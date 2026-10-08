import { alive } from '../engine/rules'
import type { GameState, TankClass } from '../engine/types'

const LETTER: Record<TankClass, string> = { light: 'L', repair: 'R', heavy: 'H' }

export function renderBoard(s: GameState): string[] {
  const grid = s.tiles.map((row) => row.split(''))
  for (const b of s.bullets) if (grid[b.y]?.[b.x] !== undefined) grid[b.y]![b.x] = '*'
  for (const t of alive(s)) grid[t.y]![t.x] = t.team === 'a' ? LETTER[t.class] : LETTER[t.class].toLowerCase()
  return grid.map((r) => r.join(''))
}

export function renderState(s: GameState): string {
  const hp = s.tanks.map((t) => `${t.id}:${t.hp}`).join(' ')
  const status = s.winner ? `winner ${s.winner}` : `turn ${s.turn}`
  return [...renderBoard(s).map((r) => r.split('').join(' ')), `${status}  ${hp}`].join('\n')
}
