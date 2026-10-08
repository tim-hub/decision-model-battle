import { alive, DELTA, distance, STATS } from '../engine/rules'
import type { Action, GameState, Tank, Team } from '../engine/types'
import { parseAction, parseOption } from '../protocol/options'
import { replayStates, type Replay } from './replay'

export interface TeamMetrics {
  decisions: number
  backups: number
  latencies: number[]
  honest: number
  judged: number
}

export interface MetricsSummary {
  backupPct: number
  medianLatencyMs: number
  honestyPct: number
}

const empty = (): TeamMetrics => ({ decisions: 0, backups: 0, latencies: [], honest: 0, judged: 0 })

function towards(me: Tank, target: Tank, action: Action): boolean {
  if (action.type === 'fire') {
    return { up: target.y < me.y, down: target.y > me.y, left: target.x < me.x, right: target.x > me.x }[action.dir]
  }
  if (action.type !== 'move') return false
  const dest = { x: me.x + DELTA[action.dir][0], y: me.y + DELTA[action.dir][1] }
  return distance(dest, target) < distance(me, target)
}

function nearestEnemy(s: GameState, me: Tank, from: { x: number; y: number }): number {
  return Math.min(...alive(s).filter((e) => e.team !== me.team).map((e) => distance(from, e)))
}

export function isHonest(s: GameState, me: Tank, status: string, option: string): boolean {
  const { name, arg } = parseOption(status)
  const action = parseAction(option)
  const other = s.tanks.find((t) => t.id === arg)
  switch (name) {
    case 'attacking':
      return !!other && towards(me, other, action)
    case 'moving':
      return action.type === 'move' && action.dir === arg
    case 'need_repair':
      return me.hp < STATS[me.class].hp
    case 'low_hp':
      return me.hp * 2 <= STATS[me.class].hp
    case 'repairing':
      return (action.type === 'repair' && action.target === arg) || (!!other && action.type === 'move' && towards(me, other, action))
    case 'retreating':
      return (
        action.type === 'move' &&
        nearestEnemy(s, me, { x: me.x + DELTA[action.dir][0], y: me.y + DELTA[action.dir][1] }) > nearestEnemy(s, me, me)
      )
    case 'holding':
      return action.type !== 'move'
    default:
      return action.type === 'idle'
  }
}

export function matchMetrics(replay: Replay): Record<Team, TeamMetrics> {
  const metrics = { a: empty(), b: empty() }
  for (const { before, record } of replayStates(replay)) {
    for (const [id, status] of Object.entries(record.statuses)) {
      const me = before.tanks.find((t) => t.id === id)!
      const m = metrics[me.team]
      const phases = record.latency_ms[id] ?? {}
      m.decisions += Object.keys(phases).length
      m.backups += record.backup[id]?.length ?? 0
      m.latencies.push(...Object.values(phases))
      const action = record.actions[id]?.[0]
      if (action === undefined) continue
      m.judged += 1
      if (isHonest(before, me, status, action)) m.honest += 1
    }
  }
  return metrics
}

export function mergeMetrics(parts: TeamMetrics[]): TeamMetrics {
  return parts.reduce(
    (sum, m) => ({
      decisions: sum.decisions + m.decisions,
      backups: sum.backups + m.backups,
      latencies: [...sum.latencies, ...m.latencies],
      honest: sum.honest + m.honest,
      judged: sum.judged + m.judged,
    }),
    empty(),
  )
}

export function summarize(m: TeamMetrics): MetricsSummary {
  const sorted = [...m.latencies].sort((x, y) => x - y)
  const mid = sorted.length / 2
  const median = sorted.length === 0 ? 0 : sorted.length % 2 ? sorted[Math.floor(mid)]! : (sorted[mid - 1]! + sorted[mid]!) / 2
  return {
    backupPct: m.decisions ? (100 * m.backups) / m.decisions : 0,
    medianLatencyMs: median,
    honestyPct: m.judged ? (100 * m.honest) / m.judged : 0,
  }
}
