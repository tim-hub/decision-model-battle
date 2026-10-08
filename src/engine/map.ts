import { readFileSync } from 'node:fs'
import { STATS } from './rules'
import type { GameState, Tank, TankClass, Team } from './types'

const TILE_CHARS = /^[.#@~%]+$/
const SIZE = 13
const SPAWN_COLUMNS = [4, 6, 8]
const CLASS_ORDER: TankClass[] = ['light', 'repair', 'heavy']

export function parseMap(text: string): string[] {
  const rows = text.trim().split('\n').map((r) => r.trim())
  if (rows.length !== SIZE || rows.some((r) => r.length !== SIZE || !TILE_CHARS.test(r))) {
    throw new Error(`map must be ${SIZE}x${SIZE} of . # @ ~ %`)
  }
  return rows
}

export function loadMap(path: string): string[] {
  return parseMap(readFileSync(path, 'utf8'))
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function shuffledColumns(seed: number): number[] {
  const random = mulberry32(seed)
  const cols = [...SPAWN_COLUMNS]
  for (let i = cols.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[cols[i], cols[j]] = [cols[j]!, cols[i]!]
  }
  return cols
}

export function createGame(tiles: string[], seed: number): GameState {
  const cols = shuffledColumns(seed)
  const spawn = (team: Team, y: number): Tank[] =>
    CLASS_ORDER.map((cls, i) => ({
      id: `${team}${i + 1}`,
      team,
      class: cls,
      x: cols[i]!,
      y,
      dir: team === 'a' ? 'up' : 'down',
      hp: STATS[cls].hp,
    }))
  return {
    turn: 1,
    tiles,
    tanks: [...spawn('a', tiles.length - 1), ...spawn('b', 0)],
    bullets: [],
    winner: null,
  }
}
