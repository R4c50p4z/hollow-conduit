# Hollow Conduit: *The Spores of Ruin* (working title)

A subterranean bio-industrial idle/logistics game for iPhone. Route ichor and spores through living conduits, refine
them into bile and vitriol, and feed a Heart whose yield is a **product** of everything you give it, while pressure
cracks your vessels, rot breeds wherever flow stagnates, and leeches crawl out of the dark.

**Systems design and all formulas:** [`docs/DESIGN.md`](docs/DESIGN.md)

**Documentación en castellano:** [`docs/es/LEEME.md`](docs/es/LEEME.md): guía de juego, mecánicas con fórmulas,
estructuras, estadísticas, logros y arquitectura. El juego se puede jugar en castellano o en inglés (⚙ Ajustes).

## Run it

```bash
npm install
npm run dev        # http://localhost:5173 (open on your phone via the LAN address)
npm test           # simulation unit tests (vitest)
npm run probe      # headless balance probe: npm run probe -- <minutes> <seed>
npm run build      # typecheck + production bundle in dist/
```

## iOS (Capacitor)

Capacitor 6 is configured (`capacitor.config.ts`, `webDir: dist`). On a Mac with Xcode:

```bash
npx cap add ios    # once: generates the native ios/ project
npm run ios:sync   # build web bundle + copy into the native project
npm run ios:open   # open in Xcode, run on device/simulator
```

## How to play (prototype)

- Pick **Vein Tap**, set the facing arrow, and tap a crimson vein. Pick **Conduit** and **drag** from the tap to the Heart.
- Feed the Heart *different* resources. Each one multiplies the others (see the ×N chips in the HUD).
- **Pressure** over 85% cracks structures, and cracked structures rupture. Toggle the overlay (◎ → P → R) to see
  pressure and rot.
- **Tap leeches** to strike them. Build **Thorn Wards** and feed them spores before the leeches outgrow your fingers.
- At 1M essence in a cycle you can **Metamorphose**: lose the cavern, gain mutagen, and mutate the Heart's exponent.
- **▤** opens the statistics panel: live network health, per-cycle and all-time counters, charts, cycle history and
  32 achievements (+2% essence each).

## Layout

```
src/sim/    deterministic simulation (pure TS, no DOM): engine, formulas, commands, save
src/game/   SimHost (fixed-timestep loop, autosave, offline catch-up), UI store
src/ui/     canvas renderer + React HUD/panels
scripts/    balance probe
docs/       design document
```
