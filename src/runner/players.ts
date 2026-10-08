import { resolve } from 'node:path'
import { baseline } from '../bots/baseline'
import { ollamaPlayer } from '../bots/ollama'
import { randomPlayer } from '../bots/random'
import type { Player } from '../protocol/types'
import { httpPlayer } from './http'
import type { Entry } from './tournament'

export async function resolvePlayer(spec: string): Promise<Entry> {
  if (spec === 'baseline') return { name: spec, player: () => baseline }
  if (spec === 'random') return { name: spec, player: randomPlayer }
  if (spec.startsWith('ollama:')) return { name: spec, player: () => ollamaPlayer(spec.slice('ollama:'.length)) }
  if (/^https?:\/\//.test(spec)) return { name: spec, player: () => httpPlayer(spec) }
  const mod = (await import(resolve(spec))) as { decide: Player['decide'] }
  return { name: spec, player: () => ({ name: spec, decide: mod.decide }) }
}
