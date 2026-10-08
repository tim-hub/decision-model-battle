import type { Odds } from './types'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function pickOption(odds: unknown, options: string[]): string | null {
  if (!isRecord(odds)) return null
  const entries = Object.entries(odds)
  if (entries.length === 0) return null
  for (const [option, p] of entries) {
    if (!options.includes(option) || typeof p !== 'number' || !Number.isFinite(p) || p < 0) return null
  }
  let best: string | null = null
  for (const option of options) {
    const p = (odds[option] as number | undefined) ?? 0
    if (p > 0 && (best === null || p > (odds[best] as number))) best = option
  }
  return best
}

export function parseResponse(body: unknown, options: string[], ticks: number): { choice: string[]; odds: Odds[] } | null {
  if (!isRecord(body)) return null
  const perTick = ticks === 1 ? [body.odds] : body.ticks
  if (!Array.isArray(perTick) || perTick.length !== ticks) return null
  const choice = perTick.map((odds) => pickOption(odds, options))
  return choice.every((p) => p !== null) ? { choice: choice as string[], odds: perTick as Odds[] } : null
}
