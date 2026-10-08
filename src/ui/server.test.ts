import { afterAll, expect, test } from 'bun:test'
import { baseline } from '../bots/baseline'
import { createGame, loadMap } from '../engine/map'
import { runMatch } from '../runner/match'
import { recordTurn, serveViewer, type View } from './server'

const tiles = loadMap('maps/stage1.txt')
const view: View = { players: { a: 'baseline', b: 'baseline' }, seed: 1, frames: [{ state: createGame(tiles, 1), record: null }], result: null }
const server = serveViewer(view, 0)
afterAll(() => server.stop())

test('the viewer page loads its bundled script', async () => {
  const html = await (await fetch(server.url)).text()
  const script = /src="([^"]+\.js)"/.exec(html)![1]!
  expect((await fetch(new URL(script, server.url))).status).toBe(200)
})

test('the view API streams frames: each board is paired with the decisions made on it', async () => {
  const replay = await runMatch({ a: baseline, b: baseline, seed: 1, tiles, onTurn: (state, record) => recordTurn(view, state, record) })
  view.result = replay.result
  const all = (await (await fetch(new URL('/api/view?from=0', server.url))).json()) as View
  expect(all.frames).toHaveLength(replay.turns.length + 1)
  expect(all.frames[0]!.record!.turn).toBe(1)
  expect(all.frames.at(-1)!.record).toBeNull()
  const tail = (await (await fetch(new URL(`/api/view?from=${replay.turns.length}`, server.url))).json()) as View
  expect(tail.frames).toHaveLength(1)
  expect(tail.result).toEqual(replay.result)
})
