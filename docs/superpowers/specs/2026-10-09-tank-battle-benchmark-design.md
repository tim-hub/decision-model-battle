# Tank Battle Benchmark for Decision Models — Design

## Goal
Benchmark decision models on a 3v3 tank battle, in the style of jevman's Pac-Man benchmark:
at each decision point a model gets the game state as JSON, returns odds per option, and the
runner plays the highest-odds option under a 2s deadline. A backup rule covers missed deadlines.
Replays are exact, so CI can confirm scores.

The new element is **team collaboration**: each tank decides for itself, and tanks share their
status with teammates through a fixed list of status options.

## Decisions
- Model vs model, rated with Bradley-Terry. A scripted baseline bot is in the pool and anchors the scale at 0
- Simultaneous turns, fully deterministic engine
- Deathmatch, no eagle
- Full map visible to everyone
- Talk phase: each tank picks 1 status. All tanks talk at the same time, then all tanks act after
  seeing their team's statuses. Only teammates see them
- Stack: TypeScript, Node CLI, Vitest

## Assumptions (confirm or change)
- Map is Battle City stage 1, mirrored top/bottom so both sides get the same layout
- No friendly fire. A bullet that reaches an ally stops there without damage
- After turn 200 the team with the higher total HP wins, otherwise draw
- Runner plays the highest-odds option, no sampling. Ties go to the option listed first

## Map
- 13×13 grid in `maps/stage1.txt`, row 0 at the top. `x` is the column, `y` the row
- Tiles

| Char | Tile | Tanks | Bullets |
|---|---|---|---|
| `.` | empty | pass | pass |
| `#` | brick | blocked | stopped, brick destroyed (becomes `.`) |
| `@` | steel | blocked | stopped |
| `~` | water | blocked | pass |
| `%` | trees | pass | pass |

- Spawns: team `a` on row 12, team `b` on row 0, columns 4, 6 and 8. The seed shuffles which class takes
  which column; both teams use the same shuffle. Team `a` faces up, team `b` faces down
- Tank ids: `<team><n>` where 1 = light, 2 = repair, 3 = heavy (`a1`, `a2`, `a3`, `b1`, `b2`, `b3`)

## Tanks

| Tank | HP | Acts on | Can shoot | Can repair |
|---|---|---|---|---|
| Light | 2 | ticks 1 + 2, every turn | yes | no |
| Repair | 2 | tick 1, every turn | no | adjacent ally, +1 HP, max HP cap, never self |
| Heavy | 5 | tick 1, even turns only | yes | no |

Turns are numbered from 1, so the heavy first acts on turn 2.

## Actions
- `move(dir)`: turn to `dir`, then move 1 tile. If the target is out of bounds, brick, steel, water,
  or occupied by any tank at the start of the tick, the tank turns but stays
- `fire(dir)`: turn to `dir` and fire. If the tank already has a bullet in flight, it only turns
- `repair(ally_id)`: +1 HP to an alive ally at Manhattan distance 1, capped at max HP
- `idle`
- `dir` is one of `up`, `down`, `left`, `right`

## Tick resolution
Each turn has 2 ticks. In each tick, in this order:
1. Repairs, using positions at the start of the tick
2. Moves. A tank can't enter a tile occupied at the start of the tick. If two tanks move into the
   same tile, both stay
3. Fires spawn a bullet on the firing tank's tile
4. Any bullet on the tile of a tank other than its owner hits it
5. Bullets advance 2 tiles, one tile per sub-step. In each sub-step:
   - all bullets move 1 tile at the same time
   - two bullets on the same tile, or two bullets that swapped tiles, cancel out
   - a bullet that leaves the grid or reaches brick or steel is removed; brick becomes `.`
   - a bullet on the tile of an alive tank other than its owner is removed; an enemy tank loses 1 HP
- A tank at 0 HP is dead: it leaves the board and makes no further decisions. Its bullet keeps flying

## End of turn
- Turn counter goes up by 1
- If both teams have no tanks left: draw. If one team has none: the other team wins
- If turn 200 has been played: higher total HP wins, equal HP is a draw

## Statuses
`attacking(enemy_id)`, `moving(dir)`, `need_repair`, `repairing(ally_id)`, `retreating`, `holding`, `low_hp`, `idle`
- `attacking` takes an alive enemy id
- `repairing` is only legal for the repair tank and takes an alive ally id

## Turn flow
```
state ─▶ TALK  (1 call per alive tank, all in parallel, 1 status each)
      ─▶ ACT   (1 call per tank that can act this turn, in parallel, each sees team statuses)
      ─▶ resolve tick 1, tick 2 ─▶ win check ─▶ next turn
```
A heavy on an odd turn still talks, but gets no act call.

## Protocol
- Request: `POST <endpoint>/decide`
```json
{ "phase": "talk" | "act", "tank_id": "a1", "turn": 7, "state": { ... },
  "options": ["idle", "move(up)", "..."], "team_statuses": { "a1": "attacking(b3)" } }
```
- `state` is `{ turn, tiles, tanks, bullets, winner }`. `tanks[i]` is `{ id, team, class, x, y, dir, hp }`,
  `bullets[i]` is `{ owner, x, y, dir }`
- `team_statuses` is only sent in the act phase and holds the statuses of the tank's alive team, itself included
- Response: `{ "odds": { "<option>": number } }`. The light tank's act response is
  `{ "ticks": [odds, odds] }`, one odds object per tick. Both ticks use the same option list
- Odds are valid when: a non-empty object, every key is in `options`, every value is a finite number ≥ 0,
  and at least one value is > 0. Options left out count as 0
- 2s deadline per call. A late, invalid or error reply makes the baseline bot decide instead, and
  the decision counts as a backup move
- Known gap: one endpoint plays all 3 tanks of a team, so it could share memory across them. The runner
  can't stop this, and with full vision it gains little

## Baseline bot
Also the backup rule.
- Shooters: fire at an enemy in a clear line (no brick, steel or ally in between) if no bullet is in flight.
  Otherwise BFS toward the nearest tile with a clear line to an enemy. If no path exists, path through
  brick and shoot the brick in the way
- Repair: repair the most damaged adjacent ally; else move next to the most damaged ally, else next to the heavy
- Talk: shooters say `need_repair` at half HP or below if their repair tank is alive, `low_hp` if not,
  otherwise `attacking(nearest enemy)`. Repair says `repairing(most damaged ally)` or `holding`

## Replay (JSONL)
- Line 1: `{ "type": "header", "version": 1, "seed", "tiles", "players": { "a", "b" }, "initial_hash" }`
- 1 line per turn: `{ "type": "turn", "turn", "statuses", "actions", "backup", "latency_ms", "hash" }`
  - `actions` maps tank id to the chosen option per tick, `backup` maps tank id to the phases that used backup
- Last line: `{ "type": "result", "winner", "turns", "final_hash" }`
- `hash` is sha256 of the state JSON after the turn. Re-simulating `actions` from `seed` + `tiles`
  must reproduce every hash

## Rating
- Bradley-Terry fit with the MM algorithm. A draw counts as half a win for each side. Each pair that
  played gets 1 virtual draw, so a player that never wins still has a finite rating
- Shown on the Elo scale (400 · log10), baseline = 0 when it is in the pool, else mean = 0
- 95% CI from 1000 bootstrap resamples of the games, fixed seed
- Tournament: every pair plays 20 games, 10 per side, seeds 1–10 on each side

## Metrics
Per team per match, merged per player in a tournament:
- win rate
- backup-move %: backup decisions ÷ all decisions (talk + act)
- median latency (ms) per call
- status honesty: share of act turns where the stated status matches what the tank did (tick 1 action)

| Status | Honest when |
|---|---|
| `attacking(e)` | fires toward `e`'s side, or a move that cuts the distance to `e` |
| `moving(d)` | `move(d)` |
| `need_repair` | HP below max |
| `low_hp` | HP at half max or below |
| `repairing(a)` | `repair(a)`, or a move that cuts the distance to `a` |
| `retreating` | a move that grows the distance to the nearest enemy |
| `holding` | not a move |
| `idle` | `idle` |

Distances are Manhattan, measured from the start of the turn.

## CLI
- `match --a <player> --b <player> [--seed N] [--out file] [--render]`
- `tournament <player> <player> [...] [--games N]` (N games per side)
- `replay <file> [--render]`: re-simulates and checks every hash
- A player is `baseline`, `random`, an `http(s)://` endpoint, or a path to a module that exports `decide(request)`

## Out of scope (separate specs)
- Browser replay viewer reusing `src/engine`
- Leaderboard site + CI verification of submitted runs
