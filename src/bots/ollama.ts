import { parseOption } from '../protocol/options'
import type { DecideRequest, Odds, Player } from '../protocol/types'
import { renderBoard } from '../render/ascii'

const RULES =
  'Tank battle. Board: L light, R repair, H heavy (upper team a, lower team b), * bullet, # brick, @ steel, ~ water, % trees. Row 0 is up.'

function describe(option: string): string {
  const { name, arg } = parseOption(option)
  if (name === 'repair') return `heal ${arg}`
  if (name === 'attacking') return `say: attacking ${arg}`
  if (name === 'repairing') return `say: repairing ${arg}`
  if (arg) return `${name} ${arg}`
  return name === 'idle' ? 'wait' : `say: ${name.replace('_', ' ')}`
}

function question(req: DecideRequest, instructions: string) {
  return { type: 'choice', instructions, criteria: Object.fromEntries(req.options.map((o) => [o, describe(o)])) }
}

function questions(req: DecideRequest, ticks: number) {
  const me = req.tank_id
  if (req.phase === 'talk') {
    return { status: question(req, `${RULES} You are ${me}. Tell your team your plan.`) }
  }
  const plan = `${RULES} You are ${me}. Pick the action that helps your team win.`
  if (ticks === 1) return { action: question(req, plan) }
  return {
    tick1: question(req, `${plan} First of your 2 moves.`),
    tick2: question(req, `${plan} Second of your 2 moves.`),
  }
}

interface SystemOneResponse {
  answers: Record<string, { probabilities: Odds }>
}

export function ollamaPlayer(model: string, host = 'http://localhost:11434'): Player {
  return {
    name: `ollama:${model}`,
    decide: async (req, signal) => {
      const me = req.state.tanks.find((t) => t.id === req.tank_id)!
      const ticks = req.phase === 'act' && me.class === 'light' ? 2 : 1
      const state = {
        turn: req.turn,
        board: renderBoard(req.state),
        tanks: req.state.tanks.map((t) => `${t.id} ${t.class} x${t.x} y${t.y} hp${t.hp} ${t.dir}`),
        bullets: req.state.bullets.map((b) => `${b.owner} x${b.x} y${b.y} ${b.dir}`),
        team: req.team_statuses,
      }
      const asked = questions(req, ticks)
      const res = await fetch(`${host}/v1/systemone`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model, state, questions: asked, keep_alive: '30m' }),
        signal,
      })
      if (!res.ok) throw new Error(`${model} answered ${res.status}: ${await res.text()}`)
      const { answers } = (await res.json()) as SystemOneResponse
      const odds = Object.keys(asked).map((q) => answers[q]!.probabilities)
      return ticks === 1 ? { odds: odds[0] } : { ticks: odds }
    },
  }
}
