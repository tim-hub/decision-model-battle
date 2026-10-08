export type Dir = 'up' | 'down' | 'left' | 'right'
export type Team = 'a' | 'b'
export type TankClass = 'light' | 'repair' | 'heavy'
export type Winner = Team | 'draw' | null

export interface Tank {
  id: string
  team: Team
  class: TankClass
  x: number
  y: number
  dir: Dir
  hp: number
}

export interface Bullet {
  owner: string
  x: number
  y: number
  dir: Dir
}

export interface GameState {
  turn: number
  tiles: string[]
  tanks: Tank[]
  bullets: Bullet[]
  winner: Winner
}

export type Action =
  | { type: 'move'; dir: Dir }
  | { type: 'fire'; dir: Dir }
  | { type: 'repair'; target: string }
  | { type: 'idle' }

export type TurnActions = Record<string, Action[]>
