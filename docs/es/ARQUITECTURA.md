# Arquitectura del código

Pensado para quien siga desarrollando el juego (con o sin IA).

## Pila tecnológica

| Pieza | Para qué |
|---|---|
| **TypeScript** | Todo el código |
| **Vite** | Servidor de desarrollo y empaquetado |
| **React 18** | Interfaz (HUD, paneles, inspector) |
| **Canvas 2D** | La caverna, dibujada a mano cada fotograma (arte procedural, sin imágenes) |
| **Zustand** | Estado de la interfaz (herramienta elegida, panel abierto, idioma). **Nunca** el estado del juego. |
| **break_eternity.js** | Números gigantes (esencia > 1e308) |
| **Vitest** | Tests del simulador |
| **Capacitor 6** | Empaquetar como app de iOS |

## Estructura de carpetas

```
src/
  sim/                ← EL JUEGO. TypeScript puro: sin DOM, sin React, sin reloj real.
    types.ts            modelo de datos (SimState, Building, Counters…) y órdenes (Command)
    config.ts           TODAS las constantes de equilibrio
    formulas.ts         fórmulas puras (testeadas)
    engine.ts           tick(estado, dt): las 7 fases
    commands.ts         applyCommand(estado, orden): la ÚNICA forma de que el jugador cambie el estado
    stats.ts            contadores, series temporales, cierre de ciclo, snapshot() en directo
    achievements.ts     definición y comprobación de logros
    world.ts            generación del mapa, creación de estado, reinicio de ciclo
    save.ts             (de)serialización JSON + migraciones entre versiones de guardado
    rng.ts              generador aleatorio con semilla (mulberry32) guardado en el estado
    *.test.ts           tests
  game/
    host.ts             SimHost: bucle de paso fijo, autoguardado, simulación del tiempo fuera
    store.ts            estado de la interfaz (zustand) + preferencias (idioma, notación)
  i18n/
    en.ts               diccionario inglés (define las claves)
    es.ts               diccionario castellano (el compilador obliga a traducirlo todo)
    index.ts            t(clave, parámetros), useT()
    game.ts             textos del juego: eventos, errores y nombres a partir de códigos
  ui/
    render.ts           dibujo de la caverna en canvas
    Board.tsx           canvas + gestos (tocar, arrastrar conductos, golpear)
    Hud.tsx, BuildBar.tsx, Inspector.tsx, Panels.tsx, StatsPanel.tsx, Chart.tsx
    format.ts           formato de números (sufijos/científica, coma decimal en castellano)
    palette.ts          colores (incluida la paleta de gráficas validada para daltonismo)
scripts/probe.ts      bot de equilibrado sin interfaz
docs/                 diseño (inglés) y docs/es (castellano)
```

## Principios

1. **El simulador es una función pura** de `(estado, dt)` más un generador aleatorio con semilla. No toca el DOM ni la
   hora del sistema. Por eso:
   - se puede testear sin navegador,
   - el bot de equilibrado lo ejecuta a toda velocidad (90 minutos de juego en unos 12 s),
   - el tiempo sin conexión se simula de verdad,
   - y se podría mover a un Web Worker cambiando solo `host.ts`.
2. **La interfaz nunca modifica el estado directamente.** Todo pasa por `host.dispatch(orden)`, que llama a
   `applyCommand`. Las órdenes son datos planos (`{ t: 'build', x, y, kind, dir }`).
3. **El simulador no produce texto.** Emite **códigos** (`{ kind: 'rupture', params: { kind: 'tap', cause: 'pressure' } }`,
   `{ ok: false, reason: 'noEssence' }`) y la interfaz los traduce. Así el idioma es solo cosa de la interfaz.
4. **Determinismo:** misma semilla y mismas órdenes, mismo resultado. Hay un test que lo comprueba incluso guardando y
   cargando a mitad de partida.
5. **Dos dominios numéricos:** el físico (flujos, presión, podredumbre) usa `number`, y el económico (esencia, costes,
   mutágeno) usa `Decimal`. El puente es la fórmula del Corazón, que se calcula en escala logarítmica.

## Cómo se dibuja

- La interfaz de React se refresca **8 veces por segundo** (no hace falta más para números).
- El canvas se redibuja **cada fotograma** leyendo directamente `host.state`, sin pasar por React.
- El fondo (roca, vetas, lechos, madrigueras) se dibuja una sola vez y se cachea.

## Guardado

- `localStorage`, clave `hollow-conduit/save/v1`, cada 10 s y al pasar a segundo plano.
- Formato JSON; los `Decimal` se guardan como `{"$d": "1.5e300"}`.
- `save.ts → migrate()` actualiza partidas antiguas. **Si cambias la forma del estado, sube `SAVE_VERSION` y añade un
  paso de migración**, con su test en `features.test.ts`.
- Las preferencias (idioma y notación) van aparte: `hollow-conduit/lang` y `hollow-conduit/notation`.

## Cómo añadir cosas

### Una estructura nueva
1. `types.ts`: añádela a `Kind` y a `ALL_KINDS`.
2. `config.ts`: su ficha en `KINDS` y, si se construye, en `BUILDABLE`.
3. `world.ts`: en `zeroBuilt()`.
4. `engine.ts`: su comportamiento en `produce` / `accept` / `transfer` / `fillOf`.
5. `render.ts`: cómo se dibuja.
6. `en.ts` y `es.ts`: `kind.X.name`, `kind.X.short` y `kind.X.blurb`.
7. Un test.

### Una estadística nueva
1. `types.ts`: añade el campo a `Counters` (si es un contador) o a `Snapshot` en `stats.ts` (si es en directo).
2. `stats.ts`: inicialízala en `zeroCounters()`.
3. Increméntala donde ocurra con `count(s, 'campo', v)` (se apunta en el ciclo y en el total a la vez).
4. `StatsPanel.tsx`: añade una `<Row>` y la clave de texto en los dos diccionarios.
5. Si cambia la forma del guardado: migración.

### Un logro nuevo
1. `achievements.ts`: añade `{ id, group, check }`.
2. `en.ts` / `es.ts`: `ach.id.name` y `ach.id.desc`.
3. Regenera `docs/es/LOGROS.md`.

### Un idioma nuevo
1. Crea `src/i18n/xx.ts` con el tipo `Record<Key, string>`. El compilador te dirá qué claves faltan.
2. Añádelo a `DICTS` y `LANGS` en `src/i18n/index.ts` y al tipo `Lang` de `store.ts`.

## Comandos

```bash
npm run dev          # desarrollo (abre la IP local en el móvil)
npm test             # tests
npm run typecheck    # comprobación de tipos
npm run probe -- 60 1   # bot de equilibrado: 60 minutos, semilla 1
npm run build        # versión de producción en dist/
npm run ios:sync     # build + copiar al proyecto iOS (en Mac, tras «npx cap add ios»)
```
