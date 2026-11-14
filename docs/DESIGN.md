# The Spores of Ruin — Systems Design (v0.2)

Working title. This document is the source of truth for the math; every constant named here lives in
[`src/sim/config.ts`](../src/sim/config.ts) and every formula in [`src/sim/formulas.ts`](../src/sim/formulas.ts).

---

## 1. Pillars → mechanisms

| Pillar | How the prototype delivers it |
|---|---|
| **True exponential scaling** | The Heart's yield is a *product* over resources, raised to a mutable exponent α. Each refinement stage is a multiplier on all the others; prestige raises the exponent itself. |
| **Mindustry-style logistics** | Resources only exist inside buildings. They move tile-to-tile through directional conduits with hard throughput limits, one fluid per vessel. The Heart's intake is capped per resource. |
| **Active pressure** | Anything backed up over 85% loses integrity and eventually ruptures. Stagnant structures breed rot that spreads along your network. Leeches crawl out of burrows and gnaw on structures. |
| **Hybrid session pacing** | The 2–5 min check-in: strike leeches, mend cracked vessels, cleanse rot, vent an overpressured line. The 30 min deep dive: re-route around bottlenecks, add a refinery stage, rebuild for the next Heart tier. |

There is no tap-to-earn. The only "tap" verbs are defensive (strike, mend, cleanse, vent), and each one is a response to
a failure your architecture allowed.

---

## 2. Resources and the refinement chain

```
 vein ──Tap──▶ ICHOR ──┬──────────────────────────────▶ HEART
                       └─Digester (2:1)─▶ BILE ─┬──────▶ HEART
                                                └─┐
 spore bed ─Sporangium─▶ SPORE ─┬─────────────────┴─Womb (1 bile + 2 spore : 1)─▶ VITRIOL ─▶ HEART
                                └──────────────────────────────────────────────▶ HEART
```

| Resource | Heart weight `w_r` | Source |
|---|---|---|
| ichor   | 1.0 | Vein Tap: `1.0 · richness · 2^tier · 1.4^fecundity` /s |
| spore   | 0.5 | Sporangium: `0.8 · richness · 2^tier · 1.4^fecundity` /s |
| bile    | 1.5 | Digester: 2 ichor → 1 bile, `0.5 · 2^tier · 1.35^catalysis` crafts/s |
| vitriol | 2.2 | Catalytic Womb: 1 bile + 2 spore → 1 vitriol, `0.25 · 2^tier · 1.35^catalysis` crafts/s |

Refining *destroys volume* (2 ichor → 1 bile) but *raises the exponent* on what's left. Whether that trade is worth it is
the central optimisation question, and the answer changes as your intake grows (see §3).

Bile and spore are also **fuel**: Cauterizers burn bile, Thorn Wards eat spores. Defence competes with yield for the same flow.

---

## 3. The Heart: synthesis formula

```
E/s = M · ( Π_r (1 + x_r)^(w_r · α)  −  1 )  +  pulse
```

- `x_r` — Heart intake of resource r, units/s (EMA, τ = 2 s), capped at `8 · 2^heartTier` per resource.
- `α` — Heart exponent, `1 + 0.05 · hypertrophy`. **The main prestige lever.**
- `M` — global multiplier, `mutagenBonus · (1 + 0.02 · achievements)`; see §6 for the mutagen softcap.
- `pulse` — 0.25 E/s residual heartbeat. Exists only so a fully collapsed network can always crawl back (anti-softlock).

Computed in log₁₀ space (`Σ w·α·log10(1+x)`) then exponentiated into a `break_eternity` Decimal, so the intake values
stay in f64 while the yield can go past 1e308.

**Why a product.** With a sum, the optimum is "find the best resource and scale it." With a product, every new
resource type multiplies everything already flowing. Concretely, at equal volume:

| Feed (units/s) | E/s |
|---|---|
| 4 ichor | 4.0 |
| 2 ichor + 1 bile + 0.5 vitriol | 3 · 2^1.5 · 1.5^2.2 − 1 ≈ 19.7 |

Same tap count, 5× the yield, but you need a digester, a womb, a spore line, and four separate conduit runs into the
Heart's four faces (one fluid per conduit), which is where the logistics puzzle comes from.

**Why `−1`.** It makes yield exactly zero with nothing flowing, so the pulse is the only income from a dead network.

### 3.1 The growth race (why walls exist and how prestige breaks them)

Upgrading a building one tier doubles its rate (`2^tier`) and costs `base · tierBase · g^tier`. If you upgrade a whole
chain one tier, every `x_r` doubles and

```
E  →  E · 2^(α · Σw)        Σw = 1.0 + 0.5 + 1.5 + 2.2 = 5.2
```

so one full-chain tier is worth ×2^5.2 ≈ ×37 at α = 1. The Heart's intake cap sets the ceiling, and its tier cost grows
×45 per tier. **Since 45 > 37, payback time on Heart tiers grows every tier. That growing payback is the wall.** In v0.2 the Heart
also carries a super-exponential ramp: cost = `150 · 45^t · 1.1^(t(t−1)/2)`, so the wall always comes back.
Hypertrophy only pushes it further out: about Heart tier 6 at α = 1.2, and about tier 17 at α = 1.5.

Without the ramp (v0.1), any α > 1.06 removed the wall entirely, and a 7-minute cycle reached 1e58.

Building costs grow ×1.04 to ×1.5 per copy owned, depending on kind, so the limited veins and spore beds on each
map (6 and 4) cap how wide you can go. Past that cap, tiers are the only way up.

---

## 4. Logistics simulation

### 4.1 Data model (`src/sim/types.ts`)

- `SimState.tiles: Tile[]`, a flat `w × h` array (9 × 13 for portrait iPhone). Each tile has `terrain`, `richness`,
  `rot ∈ [0,1]` and an optional `Building`.
- `Building` buffers are fixed `[ichor, spore, bile, vitriol]` number tuples: `store` (input/transit), `out`
  (produced, waiting to push) and `incoming` (received this tick). No allocation in the hot loop, trivially JSON-able.
- All economic quantities (`essence`, `mutagen`, costs) are `Decimal`. Physical quantities are `number`.

### 4.2 Tick phases (`src/sim/engine.ts`, fixed dt = 0.1 s)

1. **Produce:** taps/sporangia fill `out` up to `outCap`, and processors convert `store → out` continuously,
   limited by inputs, output space and craft rate.
2. **Transfer:** each building pushes toward its facing; conduits push `store` up to `throughput·dt`. Receivers write
   into `incoming`, which is merged into `store` only after every building has pushed. **So nothing moves more than one
   tile per tick**, and iteration order can't teleport fluid. The iteration origin rotates every tick so merges stay fair.
   - Conduits accept from any side except their own output face, and only if they hold no *other* fluid.
   - Ganglia (routers) split evenly to every neighbour that isn't feeding into them, then give leftovers to whoever has room.
3. **Synthesise:** the Heart drains up to its intake cap per resource and updates the intake EMA and essence.
4. **Pressure:** `fill = contents / capacity` for vessels, `out / outCap` for producers and processors. Valved sinks
   (Heart, Ward, Cauterizer) just stop accepting and never over-pressurise, so their backlog becomes the *upstream*
   conduit's problem.
5. **Rot field:** see §5.
6. **Parasites:** see §6.

Capacities scale with tier (`12 · 2^tier` for a conduit) so a vessel always holds about 2 s of its own throughput.
**Pressure is therefore a clean bottleneck signal.** A free-flowing line sits near 0%. A line feeding something slower
than itself climbs to 100% within seconds.

---

## 5. Hazards

### 5.1 Pressure → strain → integrity → rupture

Fullness alone does **not** hurt. Pressure is born at a **blocked pump**: a producer or processor whose output buffer
is above 85% (it is producing and can't get rid of it). From there **strain** propagates downstream through vessels
that are themselves above 85%, and stops at the first one with room. Conduits pass it along their facing, junctions
along each full lane, and full routers to every full output. Only strained structures take pressure damage.

This means a dead end fed by a tap still ruptures, and so does a line carrying more than the next segment can move.
But a **full overflow branch** beside a ganglion that can send the surplus elsewhere is at rest and safe. Without
strain, overflow designs (the staple of every logistics game) were impossible. The v0.2 multi-cycle bot found that
those branches cost it 46k essence in cleanses per hour.

```
over   = (fill − 0.85) / 0.15                    when fill > 0.85 and strained
loss/s = ( over² / 180  +  [rot > 0.6] / 400 ) · (1 + 2·rot) · 0.85^chitin · 1.15^depth
regen  = +1/300 per s when not strained and nothing is hurting it
```

A fully blocked vessel on clean rock ruptures in 3 min. On fully rotten rock it takes 1 min. A **rupture** destroys
the building with no refund, adds +0.5 rot to its tile and +0.2 to each neighbour, and the building-cost counter drops
(rebuilding is cheaper).

Player responses: **Mend** (costs `20% · invested · damage`), **Vent** (empty it instantly for +0.15 rot), **Seal**
(turn it off; a sealed conduit is a valve), or fix the architecture.

### 5.2 Rot: a reaction–diffusion field

Per tile per second:

```
bare rock               r' = −0.004                                (firebreak)
flowing structure       r' = −0.002                                (moving fluid scours its vessel)
stagnant structure      r' = 0.01 · r · (1 − r)                    (logistic growth)
valved sink             r' = 0
all tiles               r' += 0.0015 · Σ_neighbours (r_n − r)      (diffusion)
over-pressured (>85%)   r' += 0.004                                (stagnation seeding)
```

"Flowing" means `pressure < 0.5` and outflow above 0.05/s. Effects: throughput and production fall by `(1 − 0.75·r)`,
integrity loss is amplified, structures can't be placed on `r ≥ 0.5`, and anything above 0.6 decays on its own.

Rot also comes from **entropy**: each second, with probability `0.004 · (1 + 0.5·log10(1+E/s)) · 1.15^depth`, a random
structure gains +0.25 rot. A more powerful network decays faster.

*Design note.* The first prototype grew rot logistically on every tile, and it consumed the whole map in about 12 minutes
whatever the player did. Tying growth to stagnation makes rot a direct consequence of bottlenecks and idle machines. It
also makes spacing a real decision: gaps of bare rock stop rot spreading but cost conduit length and throughput.

Counters: **Cleanse** (sets a tile to 0 and costs 15 s of current output) and **Cauterizer** (burns 0.25 bile/s to
scour 0.05·2^tier rot/s across a 5×5 area, only while there's rot to burn).

### 5.3 Leeches

- Waves every `max(75, 200 · 0.96^wave)` s, the first at 4:00. Count `1 + ⌊wave/3⌋ + ⌊log10(1+E/s)/2⌋`.
- HP `4 · (1 + log10(1+E/s))^1.5 · 1.05^wave · 1.15^depth`. **Threat follows your output, not the clock.** (The first
  version scaled ×1.2 per wave, and leeches became unkillable for any network by minute 60.)
- They crawl one tile per 1.5 s toward the nearest structure and only go for the Heart once nothing else stands. Once
  latched they drain 25%/s of contents, take 1%/s integrity and add rot. On the Heart they drain 1%/s of banked essence.
- They're **sated after 45 s of feeding** and burrow away. Damage per wave is bounded, and a leech can't camp a dead
  network forever (the earlier soft-lock).
- Counters: **Strike** (tap the leech, `1 · 1.6^talons` damage) and **Thorn Ward** (eats 0.3 spore/s to deal 1·2^tier dps
  to the weakest leech in a 5×5 area).

---

## 6. Metamorphosis (prestige)

```
mutagen gained = ⌊ (runEssence / 1e6)^0.35 · 1.2^depth ⌋      (needs runEssence ≥ 1e6)
```

You get a new procedural cavern with a fresh seed (the layout knowledge you built up is deliberately thrown away) and
starting essence back at 40. Then you **choose**: **Descend** (`depth + 1`: hazards ×1.15, future mutagen ×1.2) or
**Remain** at the current depth. Descending blindly collapses around depth 33, where hazards outgrow Chitin. Depth is a
risk/reward dial, not an automatic ramp.

**Unspent-mutagen bonus (softcapped):** `1 + 0.1·m` up to m = 100 (×11), then `11 · √(m/100)`. Linear forever was a
positive feedback loop (essence → mutagen → bonus → essence).

**Mutation cost:** `base · growth^L · ramp^(L(L−1)/2)`.

| Mutation | Effect / level | base · growth · ramp | Max |
|---|---|---|---|
| Hypertrophy | α += 0.05 (exponent on *all* weights) | 1 · 3 · 1.4 | 40 |
| Vascular Memory | conduit/ganglion/junction throughput & capacity ×1.5 | 1 · 2.2 · 1.2 | 50 |
| Fecundity | extraction ×1.4 | 1 · 2.5 · 1.2 | 50 |
| Catalysis | processor speed ×1.35 | 2 · 2.5 · 1.2 | 50 |
| Chitin | integrity loss ×0.85 | 1 · 2 · 1.25 | 25 |
| Talons | strike damage ×1.6 | 1 · 2 · 1.2 | 50 |

**Achievements** (32) each add +2% to M permanently.

---

## 7. Measured pacing (`npm run probe`)

`scripts/probe.ts` runs a greedy "attentive player" bot on a fixed reference layout with no vitriol and no layout
improvements. It strikes leeches, mends anything under 50%, cleanses rot over 0.55, and saves for Heart tiers.

```
  5m  E/s    97   heart t1
 15m  E/s   452   heart t2
 25m  E/s  1370   heart t2   ← wall: next Heart tier costs 3.0e5, payback grows
 35m  run 1.26e6              ← first Metamorphosis available (1 mutagen)
 75m  E/s ~1040   0 ruptures, 249 leeches killed
```

Along the way the probe turned up and drove fixes for three soft-locks (bankruptcy from blocked taps, global rot
takeover, unkillable leeches camping the Heart) and one real bug (the rot evaporation floor cancelled diffusion).
**These numbers are a floor, not a target.** A human building a vitriol line should beat the bot by orders of magnitude,
and that gap is the skill expression. Human playtesting is still needed to tune it.

---

### Multi-cycle (`npm run probe:deep -- 24`)
A smarter bot builds the full four-resource refinery (junction, ganglia, inline wards). It finds the real bottleneck,
metamorphoses when its mutagen-per-minute peaks, descends only after clean cycles, and buys Hypertrophy first. Measured
over 24 h of continuous play:

| Cycle | ~Hours | Depth | α | Peak E/s |
|---|---|---|---|---|
| 1 | 1 | 0 | 1.00 | 1.2e3 |
| 13 | 2.7 | 12 | 1.15 | 3e5 |
| 31 | 5 | 30 | 1.35 | 2e14 |
| 61 | 9 | 35 | 1.40 | 4e15 |
| 121 | 16 | 35 | 1.45 | 1.6e18 |
| 175 | 24 | 36 | 1.45 | ~1e19 |

There is no runaway or collapse, and depth settles near 35 on its own.

## 8. Architecture

```
src/sim/      pure TypeScript: no DOM, no clock, no React. Deterministic (seeded mulberry32 in state).
  types.ts      data model + Command union
  config.ts     every tunable constant
  formulas.ts   pure math (unit-tested)
  engine.ts     tick(state, dt): the six phases
  commands.ts   applyCommand(state, cmd): the ONLY way the player mutates state
  world.ts      map generation, state creation, run reset
  save.ts       JSON (de)serialisation with Decimal revival
src/game/
  host.ts       SimHost: fixed-timestep accumulator, autosave, offline catch-up (≤2 h at dt 0.5)
  store.ts      zustand UI state (tool, selection, overlays): never sim state
src/ui/       Canvas renderer (procedural ink art) + React HUD/panels
scripts/probe.ts  headless balance probe
```

- **Decoupling.** The UI reads `host.state` every animation frame for the canvas and re-renders React chrome at 8 Hz.
  All writes go through `host.dispatch(Command)`. Commands are plain serialisable data, so moving the sim into a Web
  Worker only means replacing `SimHost` with a postMessage proxy. Nothing else changes.
- **Determinism.** `serialize(a) === serialize(b)` after identical seeds and commands, including across a save/load
  round trip (tested). That covers replays, bug repros and eventually server-validated leaderboards.
- **Offline.** On resume the sim really runs the time you were away (capped at 2 h, dt 0.5, chunked with a progress
  bar), hazards included, then shows a report. Nothing is safe to leave unattended.

---

### v0.2 additions
- `src/i18n/`: typed en/es dictionaries; the sim emits codes, never prose.
- `src/sim/stats.ts`: per-cycle and lifetime counters, peaks, a 10 s time series and cycle summaries; `snapshot()` for
  live network metrics. Panel at `src/ui/StatsPanel.tsx`, export at `src/game/export.ts`.
- `src/sim/achievements.ts`: 32 achievements, each giving +2% M.
- `src/game/native.ts`: Capacitor Preferences saves and haptics, with web fallbacks.
- Save v2, with migration from v1 in `save.ts`.

## 9. Known gaps / next steps

1. **Balance with humans.** The bot never builds vitriol, so the late curve (Heart t3+, α > 1.1) is untested.
2. **Bridges / underflow conduits.** A 9×13 grid gets congested. A junction tile that passes two fluids crossing at
   right angles is the next logistics primitive.
3. **Web Worker host** once the grid or offline window grows.
4. **Capacitor iOS shell:** `npx cap add ios` (needs macOS + Xcode), Preferences plugin for saves (localStorage can be
   evicted by iOS), haptics on ruptures and strikes.
5. **Second prestige layer** (e.g. "Sporulation": carry one building blueprint between caverns).
6. **Pressure as a resource:** a pressurised line could boost throughput (×1.5 at 70–85% fill), so you'd have to run
   near the edge on purpose. That's the "skill ceiling" version of the pressure mechanic.
