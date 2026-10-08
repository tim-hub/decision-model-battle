import { expect, test } from 'bun:test'
import { createGame, loadMap, parseMap } from './map'

const stage1 = loadMap('maps/stage1.txt')

test('stage 1 parses as a 13x13 grid', () => {
  expect(stage1).toHaveLength(13)
  for (const row of stage1) expect(row).toHaveLength(13)
})

test('stage 1 is mirrored top/bottom', () => {
  expect(stage1).toEqual([...stage1].reverse())
})

test('rejects a map with the wrong size or unknown tiles', () => {
  expect(() => parseMap('...\n...')).toThrow()
  expect(() => parseMap(stage1.join('\n').replace('#', 'X'))).toThrow()
})

test('teams spawn on empty mirrored tiles with the same column shuffle', () => {
  const s = createGame(stage1, 7)
  for (const t of s.tanks) expect(stage1[t.y]![t.x]).toBe('.')
  const a = s.tanks.filter((t) => t.team === 'a')
  const b = s.tanks.filter((t) => t.team === 'b')
  expect(a.map((t) => t.x)).toEqual(b.map((t) => t.x))
  expect(a.every((t) => t.y === 12) && b.every((t) => t.y === 0)).toBe(true)
})
