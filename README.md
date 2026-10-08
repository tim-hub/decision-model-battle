# Tank Battle Benchmark

Benchmark decision models on a 3v3 tank battle (Battle City stage 1, mirrored). Each tank asks its
team's model twice per turn: first which **status** to share with teammates, then which **action** to
take after seeing the team's statuses. The model returns odds per option and the runner plays the
highest. Late, invalid or failed replies fall back to a scripted baseline and count as backup moves.
Every game is written to a replay that re-simulates to the same state hash.

Full rules: [docs/superpowers/specs/2026-10-09-tank-battle-benchmark-design.md](docs/superpowers/specs/2026-10-09-tank-battle-benchmark-design.md)

## Setup
```sh
bun install
bun test
```

## Run a match
```sh
# headless: prints result + metrics, writes replays/match-seed1.jsonl
bun src/cli.ts match --a ollama:laya --b ollama:tev1 --seed 1

# live browser viewer at http://localhost:3737
bun src/cli.ts match --a ollama:laya --b baseline --seed 1 --ui
```

| Flag | Default | Meaning |
|---|---|---|
| `--seed` | 1 | shuffles spawn columns |
| `--out` | `replays/match-seed<N>.jsonl` | replay file |
| `--ui` | off | serve the live viewer |
| `--port` | 3737 | viewer port |
| `--deadline` | 2000 | ms per model call before backup kicks in |
| `--render` | off | print the ASCII board every turn |

A player is one of:
- `baseline`: the scripted bot (also the backup rule)
- `random`: random odds
- `ollama:<model>`: a local Ollama decision model, for example `ollama:laya`, `ollama:tev1`, `ollama:nimble`
- `http://host:port`: your own endpoint (see below)
- `path/to/module`: a module that exports `decide(request)`, run in-process

## Replays
```sh
bun src/cli.ts replay replays/match-seed1.jsonl           # verify every turn's hash
bun src/cli.ts replay replays/match-seed1.jsonl --ui      # step through it in the browser
bun src/cli.ts replay replays/match-seed1.jsonl --render  # ASCII, every turn
```
Each turn line holds every tank's status, actions, full odds, backup flags and latency.

## Viewer
Board with HP bars, plus a card per tank showing what it said, what it did, the top odds per tick,
backup badges and latency. Controls: ◀ ▶ (or arrow keys) to step, space to play/pause, the slider to scrub,
and a speed picker. In live mode the viewer follows the newest turn until you step back.

## Tournament
```sh
bun src/cli.ts tournament baseline ollama:laya ollama:tev1 ollama:nimble
```
Every pair plays 10 games per side (`--games N`), seeds 1–N on each side. Prints a Bradley-Terry
ranking on the Elo scale (baseline = 0) with a 95% bootstrap CI, win rate, backup-move %, median latency
and status honesty. Each game's replay goes to `--out-dir` (default `replays/`).

## Ollama decision models
`ollama:<model>` calls `POST http://localhost:11434/v1/systemone` with one `choice` question per decision
(two for the light tank's act call, one per tick) and uses the returned `probabilities` as odds. The
model sees the whole game: the ASCII board (terrain, tanks, bullets), every tank's position, HP and facing,
all bullets, the turn, and in the act phase its team's statuses. The input is kept compact because `laya`
caps it at roughly 350 tokens.

## Write your own model
Serve `POST /decide`. Request:
```json
{
  "phase": "act",
  "tank_id": "a1",
  "turn": 7,
  "state": { "turn": 7, "tiles": ["..."], "tanks": [{ "id": "a1", "team": "a", "class": "light", "x": 4, "y": 12, "dir": "up", "hp": 2 }], "bullets": [], "winner": null },
  "options": ["idle", "move(up)", "move(down)", "move(left)", "move(right)", "fire(up)", "fire(down)", "fire(left)", "fire(right)"],
  "team_statuses": { "a1": "attacking(b3)", "a2": "repairing(a3)", "a3": "need_repair" }
}
```
Reply `{ "odds": { "<option>": number } }`, or `{ "ticks": [odds, odds] }` for the light tank's act call.
Keys must come from `options`, values must be ≥ 0 with at least one > 0. You have 2 seconds.

[examples/endpoint.ts](examples/endpoint.ts) is a ~30-line endpoint:
```sh
bun examples/endpoint.ts                                         # listens on :3000
bun src/cli.ts match --a http://localhost:3000 --b baseline --seed 1
bun src/cli.ts match --a examples/endpoint --b baseline --seed 1  # same, in-process
```
