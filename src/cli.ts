import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { parseArgs } from 'node:util'
import { createGame, loadMap } from './engine/map'
import type { Team } from './engine/types'
import { renderState } from './render/ascii'
import { runMatch } from './runner/match'
import { matchMetrics, summarize, type TeamMetrics } from './runner/metrics'
import { resolvePlayer } from './runner/players'
import { fromJsonl, replayStates, toJsonl, verifyReplay, type Replay } from './runner/replay'
import { runTournament } from './runner/tournament'
import { recordTurn, serveViewer, type View } from './ui/server'

const USAGE = `usage:
  bun src/cli.ts match --a <player> --b <player> [--seed N] [--out file] [--ui] [--port N] [--deadline ms] [--render]
  bun src/cli.ts replay <file> [--ui] [--port N] [--render]
  bun src/cli.ts tournament <player> <player> [...] [--games N] [--out-dir dir] [--deadline ms]
player: baseline | random | ollama:<model> | http(s)://endpoint | path/to/module`

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    a: { type: 'string' },
    b: { type: 'string' },
    seed: { type: 'string', default: '1' },
    out: { type: 'string' },
    'out-dir': { type: 'string', default: 'replays' },
    games: { type: 'string', default: '10' },
    deadline: { type: 'string', default: '2000' },
    port: { type: 'string', default: '3737' },
    ui: { type: 'boolean', default: false },
    render: { type: 'boolean', default: false },
  },
})

const tiles = loadMap('maps/stage1.txt')
const deadlineMs = Number(values.deadline)
const pct = (n: number) => `${n.toFixed(1)}%`

function printMetrics(replay: Replay): void {
  const metrics = matchMetrics(replay)
  const rows = (['a', 'b'] as Team[]).map((team) => {
    const m: TeamMetrics = metrics[team]
    const s = summarize(m)
    return { team, player: replay.header.players[team], backup: pct(s.backupPct), 'median ms': s.medianLatencyMs, honesty: pct(s.honestyPct) }
  })
  console.table(rows)
}

function startViewer(view: View): void {
  const server = serveViewer(view, Number(values.port))
  console.log(`viewer: ${server.url}`)
}

function save(replay: Replay, path: string): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, toJsonl(replay))
}

async function match(): Promise<void> {
  if (!values.a || !values.b) throw new Error(USAGE)
  const seed = Number(values.seed)
  const [a, b] = await Promise.all([resolvePlayer(values.a), resolvePlayer(values.b)])
  const view: View = { players: { a: a.name, b: b.name }, seed, frames: [{ state: createGame(tiles, seed), record: null }], result: null }
  if (values.ui) startViewer(view)
  const replay = await runMatch({
    a: a.player(seed),
    b: b.player(seed),
    seed,
    tiles,
    deadlineMs,
    onTurn: (state, record) => {
      recordTurn(view, state, record)
      if (values.render) console.log(`${renderState(state)}\n${JSON.stringify(record.statuses)}\n`)
    },
  })
  view.result = replay.result
  const out = values.out ?? join(values['out-dir'], `match-seed${seed}.jsonl`)
  save(replay, out)
  console.log(`winner: ${replay.result.winner} after ${replay.result.turns} turns`)
  printMetrics(replay)
  console.log(`replay: ${out}\nfinal hash: ${replay.result.final_hash}`)
  if (values.ui) console.log('viewer stays up, Ctrl-C to quit')
}

function replay(): void {
  const file = positionals[1]
  if (!file) throw new Error(USAGE)
  const replay = fromJsonl(readFileSync(file, 'utf8'))
  const check = verifyReplay(replay)
  const view: View = { players: replay.header.players, seed: replay.header.seed, frames: [], result: replay.result }
  for (const { before, record, after } of replayStates(replay)) {
    view.frames.push({ state: before, record })
    if (values.render) console.log(`${renderState(after)}\n${JSON.stringify(record.statuses)}\n`)
    if (record === replay.turns.at(-1)) view.frames.push({ state: after, record: null })
  }
  console.log(`winner: ${replay.result.winner} after ${replay.result.turns} turns`)
  printMetrics(replay)
  console.log(check.ok ? `verified, final hash: ${check.finalHash}` : `MISMATCH at turn ${check.mismatchTurn}, got ${check.finalHash}`)
  if (values.ui) startViewer(view)
  else if (!check.ok) process.exit(1)
}

async function tournament(): Promise<void> {
  const specs = positionals.slice(1)
  if (specs.length < 2) throw new Error(USAGE)
  const entries = await Promise.all(specs.map(resolvePlayer))
  let n = 0
  const standings = await runTournament(entries, {
    tiles,
    gamesPerSide: Number(values.games),
    deadlineMs,
    onGame: (r) => {
      const { a, b } = r.header.players
      const file = join(values['out-dir'], `game${++n}-${a}-vs-${b}-seed${r.header.seed}.jsonl`.replace(/[^\w.-]+/g, '_'))
      save(r, file)
      console.log(`game ${n}: ${a} vs ${b} seed ${r.header.seed} → ${r.result.winner} (${r.result.turns} turns)`)
    },
  })
  console.table(
    standings.map((s, i) => ({
      rank: i + 1,
      player: s.name,
      elo: Math.round(s.elo),
      '95% CI': `${Math.round(s.low)} … ${Math.round(s.high)}`,
      games: s.games,
      'win rate': pct(100 * s.winRate),
      backup: pct(s.backupPct),
      'median ms': s.medianLatencyMs,
      honesty: pct(s.honestyPct),
    })),
  )
}

const commands: Record<string, () => void | Promise<void>> = { match, replay, tournament }
const command = commands[positionals[0] ?? '']
if (!command) {
  console.error(USAGE)
  process.exit(1)
}
await command()
