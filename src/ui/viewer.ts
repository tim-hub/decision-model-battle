import type { GameState, Tank, Team } from '../engine/types'
import type { Odds } from '../protocol/types'
import type { Frame, View } from './server'

const MAX_HP = { light: 2, repair: 2, heavy: 5 }
const LETTER = { light: 'L', repair: 'R', heavy: 'H' }
const ARROW = { up: '▲', down: '▼', left: '◀', right: '▶' }
const TILE_CLASS: Record<string, string> = { '#': 'brick', '@': 'steel', '~': 'water', '%': 'trees' }
const TOP_ODDS = 4

const $ = (id: string) => document.getElementById(id)!

function el(tag: string, className = '', text = ''): HTMLElement {
  const node = document.createElement(tag)
  node.className = className
  node.textContent = text
  return node
}

let frames: Frame[] = []
let view: View | null = null
let index = 0
let playing = false
let following = true
let timer: ReturnType<typeof setInterval> | undefined

function renderBoard(s: GameState): void {
  const board = $('board')
  board.replaceChildren()
  const cells = s.tiles.flatMap((row) => row.split('').map((tile) => el('div', `cell ${TILE_CLASS[tile] ?? ''}`)))
  for (const b of s.bullets) cells[b.y * 13 + b.x]?.append(el('div', 'bullet'))
  for (const t of s.tanks.filter((t) => t.hp > 0)) {
    const tank = el('div', `tank ${t.team}`, LETTER[t.class])
    tank.title = `${t.id} ${t.class} ${t.hp}/${MAX_HP[t.class]} HP`
    const arrow = el('span', 'arrow', ARROW[t.dir])
    Object.assign(arrow.style, { up: { top: '-1px' }, down: { bottom: '2px' }, left: { left: '1px' }, right: { right: '1px' } }[t.dir])
    const hp = el('div', 'hp')
    const fill = el('i')
    fill.style.width = `${(100 * t.hp) / MAX_HP[t.class]}%`
    hp.append(fill)
    tank.append(arrow, hp)
    cells[t.y * 13 + t.x]!.replaceChildren(tank)
  }
  board.append(...cells)
}

function renderOdds(odds: Odds, picked: string): HTMLElement {
  const grid = el('div', 'odds')
  const total = Object.values(odds).reduce((a, b) => a + b, 0) || 1
  const top = Object.entries(odds)
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_ODDS)
  for (const [option, p] of top) {
    const bar = el('div', 'bar')
    const fill = el('i')
    fill.style.width = `${(100 * p) / total}%`
    bar.append(fill)
    grid.append(el('span', option === picked ? 'picked' : '', option), bar, el('span', 'muted', `${Math.round((100 * p) / total)}%`))
  }
  return grid
}

function renderTank(t: Tank, frame: Frame): HTMLElement {
  const card = el('div', `tankcard ${t.hp > 0 ? '' : 'dead'}`)
  const head = el('div', 'row')
  head.append(el('b', `team-${t.team}`, t.id), el('span', '', `${t.class} · ${t.hp}/${MAX_HP[t.class]} HP`))
  card.append(head)
  const r = frame.record
  if (!r || t.hp <= 0) return card
  const backup = r.backup[t.id] ?? []
  const latency = r.latency_ms[t.id] ?? {}
  const talk = el('div', 'row')
  talk.append(el('span', 'muted', 'says'), el('span', 'chip', r.statuses[t.id] ?? '—'))
  if (backup.includes('talk')) talk.append(el('span', 'chip backup', 'backup'))
  talk.append(el('span', 'muted', `${latency.talk ?? '—'} ms`))
  card.append(talk)
  const actions = r.actions[t.id]
  if (!actions) {
    card.append(el('div', 'muted', 'no action this turn'))
    return card
  }
  const act = el('div', 'row')
  act.append(el('span', 'muted', 'does'), ...actions.map((a) => el('span', 'chip', a)))
  if (backup.includes('act')) act.append(el('span', 'chip backup', 'backup'))
  act.append(el('span', 'muted', `${latency.act ?? '—'} ms`))
  card.append(act)
  ;(r.odds[t.id]?.act ?? []).forEach((odds, tick) => card.append(renderOdds(odds, actions[tick]!)))
  return card
}

function renderPanel(team: Team, frame: Frame): void {
  const panel = $(`panel-${team}`)
  const name = view!.players[team]
  const tanks = frame.state.tanks.filter((t) => t.team === team)
  const hp = tanks.reduce((sum, t) => sum + Math.max(0, t.hp), 0)
  panel.replaceChildren(el('h2', `team-${team}`, `Team ${team.toUpperCase()} · ${name} · ${hp} HP`), ...tanks.map((t) => renderTank(t, frame)))
}

function render(): void {
  const frame = frames[index]
  if (!frame || !view) return
  renderBoard(frame.state)
  renderPanel('a', frame)
  renderPanel('b', frame)
  $('name-a').textContent = view.players.a
  $('name-b').textContent = view.players.b
  $('meta').textContent = `seed ${view.seed} · turn ${frame.state.turn} · frame ${index + 1}/${frames.length}`
  $('live').textContent = view.result ? `Winner: ${view.result.winner === 'draw' ? 'draw' : `team ${view.result.winner!.toUpperCase()}`}` : '● LIVE'
  const scrub = $('scrub') as HTMLInputElement
  scrub.max = String(frames.length - 1)
  scrub.value = String(index)
  $('play').textContent = playing ? '⏸' : '▶'
}

function go(to: number): void {
  index = Math.max(0, Math.min(frames.length - 1, to))
  following = index === frames.length - 1
  render()
}

function setPlaying(on: boolean): void {
  playing = on
  clearInterval(timer)
  if (on) {
    timer = setInterval(() => {
      if (index < frames.length - 1) go(index + 1)
      else if (view?.result) setPlaying(false)
    }, Number(($('speed') as HTMLSelectElement).value))
  }
  render()
}

async function poll(): Promise<void> {
  const from = Math.max(0, frames.length - 1)
  const next = (await (await fetch(`/api/view?from=${from}`)).json()) as View
  view = next
  frames = [...frames.slice(0, from), ...next.frames]
  if (following && !playing) index = frames.length - 1
  render()
  if (!next.result) setTimeout(poll, 300)
}

$('first').onclick = () => go(0)
$('prev').onclick = () => go(index - 1)
$('next').onclick = () => go(index + 1)
$('last').onclick = () => go(frames.length - 1)
$('play').onclick = () => setPlaying(!playing)
$('speed').onchange = () => playing && setPlaying(true)
$('scrub').oninput = (e) => go(Number((e.target as HTMLInputElement).value))
document.onkeydown = (e) => {
  if (e.key === 'ArrowLeft') go(index - 1)
  if (e.key === 'ArrowRight') go(index + 1)
  if (e.key === ' ') {
    e.preventDefault()
    setPlaying(!playing)
  }
}

poll()
