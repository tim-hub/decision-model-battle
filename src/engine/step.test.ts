import { describe, expect, test } from 'bun:test'
import { MAX_TURNS } from './rules'
import { step } from './step'
import type { Action, Dir, GameState, Tank, TankClass, TurnActions } from './types'

const HP: Record<TankClass, number> = { light: 2, repair: 2, heavy: 5 }

function game(tiles: string[], tanks: Partial<Tank>[], turn = 1): GameState {
  return {
    turn,
    tiles,
    tanks: tanks.map((t) => ({ team: 'a', class: 'light', x: 0, y: 0, dir: 'up', hp: HP[t.class ?? 'light'], id: '', ...t })),
    bullets: [],
    winner: null,
  }
}

const move = (dir: Dir): Action => ({ type: 'move', dir })
const fire = (dir: Dir): Action => ({ type: 'fire', dir })
const idle: Action = { type: 'idle' }
const tank = (s: GameState, id: string) => s.tanks.find((t) => t.id === id)!
const open = (w: number, h = 1) => Array.from({ length: h }, () => '.'.repeat(w))
const enemyFar: Partial<Tank> = { id: 'z', team: 'b', class: 'heavy', x: 0, y: 0 }

function run(s: GameState, actions: TurnActions, turns = 1): GameState {
  for (let i = 0; i < turns; i++) s = step(s, actions)
  return s
}

describe('movement', () => {
  test('move turns the tank and moves it 1 tile per tick', () => {
    const s = run(game(open(5, 5), [{ id: 'r', class: 'repair', x: 2, y: 2 }, enemyFar]), { r: [move('right')] })
    expect(tank(s, 'r')).toMatchObject({ x: 3, y: 2, dir: 'right' })
  })

  test('brick, steel, water and the grid edge block movement but the tank still turns', () => {
    const s = run(game(['.#.', '@.~', '...'], [{ id: 'u', x: 1, y: 1 }, { id: 'l', x: 0, y: 2, class: 'repair' }, enemyFar]), {
      u: [move('up'), move('left')],
      l: [move('down')],
    })
    expect(tank(s, 'u')).toMatchObject({ x: 1, y: 1, dir: 'left' })
    expect(tank(s, 'l')).toMatchObject({ x: 0, y: 2, dir: 'down' })
  })

  test('water blocks and trees do not', () => {
    const s = run(game(['.~%.'], [{ id: 'w', x: 0, class: 'repair' }, { id: 't', x: 3, class: 'repair' }, enemyFar]), {
      w: [move('right')],
      t: [move('left')],
    })
    expect(tank(s, 'w').x).toBe(0)
    expect(tank(s, 't').x).toBe(2)
  })

  test('two tanks moving into the same tile both stay', () => {
    const s = run(game(open(3), [{ id: 'p', x: 0, class: 'repair' }, { id: 'q', x: 2, team: 'b', class: 'repair' }]), {
      p: [move('right')],
      q: [move('left')],
    })
    expect([tank(s, 'p').x, tank(s, 'q').x]).toEqual([0, 2])
  })

  test('a tank cannot enter a tile occupied at the start of the tick', () => {
    const s = run(game(open(3), [{ id: 'p', x: 0, class: 'repair' }, { id: 'q', x: 1, class: 'repair' }, enemyFar]), {
      p: [move('right')],
      q: [move('right')],
    })
    expect([tank(s, 'p').x, tank(s, 'q').x]).toEqual([0, 2])
  })
})

describe('speed per class', () => {
  const tanks: Partial<Tank>[] = [
    { id: 'l', class: 'light', x: 0, y: 0 },
    { id: 'r', class: 'repair', x: 0, y: 1 },
    { id: 'h', class: 'heavy', x: 0, y: 2 },
    { id: 'z', team: 'b', class: 'heavy', x: 9, y: 0 },
  ]
  const actions = { l: [move('right'), move('right')], r: [move('right'), move('right')], h: [move('right'), move('right')] }

  test('on an odd turn light moves twice, repair once, heavy not at all', () => {
    const s = run(game(open(10, 3), tanks, 1), actions)
    expect([tank(s, 'l').x, tank(s, 'r').x, tank(s, 'h').x]).toEqual([2, 1, 0])
  })

  test('on an even turn heavy moves once', () => {
    const s = run(game(open(10, 3), tanks, 2), actions)
    expect(tank(s, 'h').x).toBe(1)
  })
})

describe('bullets', () => {
  test('a bullet flies 2 tiles per tick and leaves the grid at the edge', () => {
    const s1 = step(game(open(13, 2), [{ id: 'l', x: 0 }, { ...enemyFar, y: 1 }]), { l: [fire('right'), idle] })
    expect(s1.bullets).toEqual([{ owner: 'l', x: 4, y: 0, dir: 'right' }])
    const s3 = run(s1, { l: [idle, idle] }, 2)
    expect(s3.bullets).toEqual([{ owner: 'l', x: 12, y: 0, dir: 'right' }])
    expect(run(s3, { l: [idle, idle] }).bullets).toEqual([])
  })

  test('a bullet destroys 1 brick and stops', () => {
    const s = run(game(['..#.#'], [{ id: 'l', x: 0 }, enemyFar]), { l: [fire('right')] })
    expect(s.tiles).toEqual(['....#'])
    expect(s.bullets).toEqual([])
  })

  test('steel stops a bullet and is not destroyed', () => {
    const s = run(game(['.@...'], [{ id: 'l', x: 0 }, enemyFar]), { l: [fire('right')] })
    expect(s.tiles).toEqual(['.@...'])
    expect(s.bullets).toEqual([])
  })

  test('bullets pass over water and trees and hit the enemy behind', () => {
    const s = run(game(['.~%..'], [{ id: 'l', x: 0 }, { id: 'e', team: 'b', class: 'heavy', x: 3 }]), { l: [fire('right')] })
    expect(tank(s, 'e').hp).toBe(4)
  })

  test('a hit deals 1 damage and a tank at 0 HP dies', () => {
    const s1 = step(game(open(3), [{ id: 'l', x: 0 }, { id: 'e', team: 'b', x: 2 }]), { l: [fire('right'), idle] })
    expect(tank(s1, 'e').hp).toBe(1)
    const s2 = step(s1, { l: [fire('right'), idle], e: [move('down'), idle] })
    expect(tank(s2, 'e')).toMatchObject({ hp: 0, x: 2 })
  })

  test('no friendly fire: an ally stops the bullet without damage', () => {
    const s = run(game(open(5), [{ id: 'l', x: 0 }, { id: 'h', class: 'heavy', x: 2 }, { id: 'e', team: 'b', x: 4 }]), { l: [fire('right')] })
    expect(tank(s, 'h').hp).toBe(5)
    expect(tank(s, 'e').hp).toBe(2)
    expect(s.bullets).toEqual([])
  })

  test('a tank has at most 1 bullet in flight', () => {
    const s = step(game(open(13), [{ id: 'l', x: 0 }, { ...enemyFar, x: 12 }]), { l: [fire('right'), fire('right')] })
    expect(s.bullets).toHaveLength(1)
  })

  test('a repair tank cannot fire', () => {
    const s = step(game(open(5), [{ id: 'r', class: 'repair', x: 0 }, { ...enemyFar, x: 4 }]), { r: [fire('right')] })
    expect(s.bullets).toEqual([])
    expect(tank(s, 'r').dir).toBe('right')
  })

  test('two bullets that meet head-on cancel out', () => {
    const s = step(game(open(7), [{ id: 'l', x: 0 }, { id: 'e', team: 'b', x: 6 }]), { l: [fire('right'), idle], e: [fire('left'), idle] })
    expect(s.bullets).toEqual([])
    expect([tank(s, 'l').hp, tank(s, 'e').hp]).toEqual([2, 2])
  })

  test('two bullets that swap tiles cancel out', () => {
    const s = step(game(open(6), [{ id: 'l', x: 0 }, { id: 'e', team: 'b', x: 5 }]), { l: [fire('right'), idle], e: [fire('left'), idle] })
    expect(s.bullets).toEqual([])
    expect([tank(s, 'l').hp, tank(s, 'e').hp]).toEqual([2, 2])
  })
})

describe('repair', () => {
  const tiles = open(4, 2)

  test('repairs an adjacent ally by 1 HP', () => {
    const s = step(game(tiles, [{ id: 'r', class: 'repair', x: 0 }, { id: 'h', class: 'heavy', x: 1, hp: 2 }, enemyFar]), {
      r: [{ type: 'repair', target: 'h' }],
    })
    expect(tank(s, 'h').hp).toBe(3)
  })

  test('caps at max HP', () => {
    const s = step(game(tiles, [{ id: 'r', class: 'repair', x: 0 }, { id: 'l', x: 1, hp: 2 }, { ...enemyFar, x: 3 }]), {
      r: [{ type: 'repair', target: 'l' }],
    })
    expect(tank(s, 'l').hp).toBe(2)
  })

  test('never repairs self, an enemy or a tank that is not adjacent', () => {
    const s = step(
      game(tiles, [
        { id: 'r', class: 'repair', x: 0, hp: 1 },
        { id: 'h', class: 'heavy', x: 2, hp: 1 },
        { id: 'e', team: 'b', class: 'heavy', x: 0, y: 1, hp: 1 },
      ]),
      { r: [{ type: 'repair', target: 'r' }] },
    )
    const s2 = step(s, { r: [{ type: 'repair', target: 'h' }] })
    const s3 = step(s2, { r: [{ type: 'repair', target: 'e' }] })
    expect([tank(s3, 'r').hp, tank(s3, 'h').hp, tank(s3, 'e').hp]).toEqual([1, 1, 1])
  })
})

describe('win check', () => {
  test('a team with no tanks left loses', () => {
    const s = step(game(open(3), [{ id: 'l', x: 0 }, { id: 'e', team: 'b', x: 2, hp: 1 }]), { l: [fire('right')] })
    expect(s.winner).toBe('a')
  })

  test('both teams wiped out in the same turn is a draw', () => {
    const s = step(
      game(open(2, 2), [
        { id: 'a1', x: 0, y: 0, hp: 1 },
        { id: 'a2', x: 1, y: 1, hp: 1 },
        { id: 'b1', team: 'b', x: 1, y: 0, hp: 1 },
        { id: 'b2', team: 'b', x: 0, y: 1, hp: 1 },
      ]),
      { a1: [fire('right')], b1: [fire('down')], a2: [fire('left')], b2: [fire('up')] },
    )
    expect(s.tanks.map((t) => t.hp)).toEqual([0, 0, 0, 0])
    expect(s.winner).toBe('draw')
  })

  test(`after turn ${MAX_TURNS} the higher total HP wins`, () => {
    const s = step(game(['.@.'], [{ id: 'l', x: 0 }, { id: 'e', team: 'b', x: 2, hp: 1 }], MAX_TURNS), {})
    expect(s.winner).toBe('a')
  })

  test(`after turn ${MAX_TURNS} equal HP is a draw, and before it the game goes on`, () => {
    const tanks: Partial<Tank>[] = [{ id: 'l', x: 0 }, { id: 'e', team: 'b', x: 2 }]
    expect(step(game(['.@.'], tanks, MAX_TURNS), {}).winner).toBe('draw')
    expect(step(game(['.@.'], tanks, MAX_TURNS - 1), {}).winner).toBeNull()
  })
})

test('step does not mutate its input', () => {
  const s = game(['.#.'], [{ id: 'l', x: 0 }, { id: 'e', team: 'b', x: 2 }])
  const copy = structuredClone(s)
  step(s, { l: [fire('right'), move('down')] })
  expect(s).toEqual(copy)
})
