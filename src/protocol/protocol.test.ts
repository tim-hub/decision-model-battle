import { describe, expect, test } from 'bun:test'
import { createGame, loadMap } from '../engine/map'
import { actOptions, talkOptions } from './options'
import { parseResponse } from './validate'

const s = createGame(loadMap('maps/stage1.txt'), 1)
const at = (turn: number) => ({ ...s, turn })

describe('legal options', () => {
  test('light and heavy can move, fire or idle; repair cannot fire', () => {
    expect(actOptions(at(2), 'a1')).toEqual([
      'idle', 'move(up)', 'move(down)', 'move(left)', 'move(right)',
      'fire(up)', 'fire(down)', 'fire(left)', 'fire(right)',
    ])
    expect(actOptions(at(2), 'a3')).toEqual(actOptions(at(2), 'a1'))
    expect(actOptions(at(2), 'a2').some((o) => o.startsWith('fire'))).toBe(false)
  })

  test('heavy has no options on odd turns', () => {
    expect(actOptions(at(1), 'a3')).toEqual([])
  })

  test('repair is offered only for adjacent alive allies', () => {
    const next = structuredClone(s)
    const heavy = next.tanks.find((t) => t.id === 'a3')!
    const repair = next.tanks.find((t) => t.id === 'a2')!
    Object.assign(heavy, { x: repair.x + 1, y: repair.y })
    expect(actOptions(next, 'a2').filter((o) => o.startsWith('repair'))).toEqual(['repair(a3)'])
  })

  test('talk offers attacking per alive enemy and repairing only to the repair tank', () => {
    expect(talkOptions(s, 'a1')).toContain('attacking(b3)')
    expect(talkOptions(s, 'a1').some((o) => o.startsWith('repairing'))).toBe(false)
    expect(talkOptions(s, 'a2')).toEqual(expect.arrayContaining(['repairing(a1)', 'repairing(a3)']))
  })
})

describe('response validation', () => {
  const options = ['idle', 'move(up)', 'fire(up)']

  test('picks the highest-odds option, ties go to the first listed', () => {
    expect(parseResponse({ odds: { 'fire(up)': 0.7, idle: 0.3 } }, options, 1)).toEqual({ choice: ['fire(up)'], odds: [{ 'fire(up)': 0.7, idle: 0.3 }] })
    expect(parseResponse({ odds: { 'fire(up)': 1, 'move(up)': 1 } }, options, 1)?.choice).toEqual(['move(up)'])
  })

  test('light returns one odds object per tick', () => {
    expect(parseResponse({ ticks: [{ idle: 1 }, { 'move(up)': 2 }] }, options, 2)?.choice).toEqual(['idle', 'move(up)'])
  })

  test.each([
    ['an illegal option', { odds: { 'fire(down)': 1 } }, 1],
    ['a negative value', { odds: { idle: -1 } }, 1],
    ['a non-number value', { odds: { idle: '1' } }, 1],
    ['an infinite value', { odds: { idle: Infinity } }, 1],
    ['all zero', { odds: { idle: 0 } }, 1],
    ['empty odds', { odds: {} }, 1],
    ['odds as an array', { odds: [1] }, 1],
    ['a missing body', null, 1],
    ['odds where ticks are expected', { odds: { idle: 1 } }, 2],
    ['the wrong number of ticks', { ticks: [{ idle: 1 }] }, 2],
    ['one bad tick', { ticks: [{ idle: 1 }, { nope: 1 }] }, 2],
  ])('rejects %s', (_, body, ticks) => {
    expect(parseResponse(body, options, ticks as number)).toBeNull()
  })
})
