import type { Player } from '../protocol/types'

export function httpPlayer(url: string): Player {
  return {
    name: url,
    decide: async (req, signal) => {
      const res = await fetch(`${url.replace(/\/$/, '')}/decide`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(req),
        signal,
      })
      if (!res.ok) throw new Error(`${url} answered ${res.status}`)
      return res.json()
    },
  }
}
