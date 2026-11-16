# Extracción y cadenas de producción en Mindustry (v7, build 146)

Leyenda: [SRC] = verificado en código fuente v146 (raw.githubusercontent.com/Anuken/Mindustry/v146/...). [CALC] = calculado por mí a partir de [SRC] (aritmética). [COM] = estimación/afirmación comunitaria sin verificar. [MEM] = recordado, NO verificado en esta sesión (tratar con cautela).
Convención: 60 ticks = 1 s. Los valores de Blocks.java van "por tick" (p. ej. potencia 0,50/tick = 30 unidades/s).

Fuentes base (código):
- Drill: https://raw.githubusercontent.com/Anuken/Mindustry/v146/core/src/mindustry/world/blocks/production/Drill.java
- GenericCrafter: https://raw.githubusercontent.com/Anuken/Mindustry/v146/core/src/mindustry/world/blocks/production/GenericCrafter.java
- Blocks: https://raw.githubusercontent.com/Anuken/Mindustry/v146/core/src/mindustry/content/Blocks.java (solo se leyeron los primeros 100k de 215k caracteres; ahí estaban todos los bloques citados)
- PowerGraph: https://raw.githubusercontent.com/Anuken/Mindustry/v146/core/src/mindustry/world/blocks/power/PowerGraph.java
- BuildingComp: https://raw.githubusercontent.com/Anuken/Mindustry/v146/core/src/mindustry/entities/comp/BuildingComp.java
- Items, Rules, Block, OverdriveProjector, ConsumePower, PowerGenerator: misma ruta base `.../v146/core/src/mindustry/...`

## 1. Taladros (Drill): fórmula, tasas, mezcla de menas, bloqueo de salida

### Takeaway
Tiempo por ítem = (drillTime + 50·dureza)/multiplicador, y el progreso se acelera linealmente con el número de casillas de mena bajo el taladro; el taladro mina solo la mena dominante, se detiene cuando su buffer está lleno (back-pressure sin desperdicio) y reparte con round-robin. Escalar = poner más taladros/casillas o subir de tier, con ratios fáciles de calcular.

### Cited Findings
- Campos: `hardnessDrillMultiplier = 50f`; `drillTime = 300` (frames, base de la clase); `liquidBoostIntensity = 1.6f` ("cuántas veces más rápido progresa con líquido"); `warmupSpeed = 0.015f`; `drillMultipliers` (mapa por ítem, por defecto 1) — [Drill.java v146](https://raw.githubusercontent.com/Anuken/Mindustry/v146/core/src/mindustry/world/blocks/production/Drill.java) [SRC]
- Fórmula: `getDrillTime(item) = (drillTime + hardnessDrillMultiplier * item.hardness) / drillMultipliers.get(item, 1f)` [SRC]
- Bucle de actualización [SRC]: `timeDrilled += warmup*delta`; `delay = getDrillTime(dominantItem)`; solo avanza si `items.total() < itemCapacity && dominantItems > 0 && efficiency > 0`; `speed = lerp(1, liquidBoostIntensity, optionalEfficiency) * efficiency`; `progress += delta * dominantItems * speed * warmup`; cuando `progress >= delay` y hay hueco: `offload(dominantItem); progress %= delay` (el resto del progreso se conserva).
- Tasa teórica por taladro: `items/s = 60 / getDrillTime(item) * nº_casillas_de_mena` [SRC: así lo calcula `drawPlace`: `60f / getDrillTime(returnItem) * returnCount`]. Nota: la estadística de la ficha del bloque usa la base `drillTime` sin dureza (`60/drillTime*size*size`), es decir, sobreestima para menas con dureza > 0 [SRC].
- Mena mixta: `countOre` cuenta casillas por ítem; ordena por prioridad de ítem, luego por cantidad y luego por `item.id`; el taladro toma el último (`itemArray.peek()`) = mena dominante, y `dominantItems` = nº de casillas de esa mena. Las demás casillas no aportan [SRC].
- Minable si `drops.hardness <= tier` y no es `blockedItem` [SRC].
- Salida: `offload` al producir (intenta dar al vecino con rotación `cdump`; si nadie acepta, lo guarda en el propio taladro) y además `dump()` cada `dumpTime` (=5 ticks, 12 veces/s) [SRC: Drill, Block, BuildingComp]. El dump itera `proximity` empezando en `cdump` y avanza `cdump` tras cada intento (round-robin entre cintas/contenedores/consumidores adyacentes) [SRC].
- Back-pressure: si `items.total() >= itemCapacity` el taladro no avanza `progress` (se queda parado, no pierde ni acumula ítems perdidos). `itemCapacity` por defecto 10 [SRC Block.java]; blastDrill 20 [SRC Blocks].
- Tabla de bloques (Blocks.java v146) [SRC]:

| Taladro | Tamaño | drillTime | Tier | Coste | Potencia | Boost de agua (consumo/tick) |
|---|---|---|---|---|---|---|
| Mechanical Drill | 2x2 | 600 | 2 | Cu 12 | no | 0,05 |
| Pneumatic Drill | 2x2 | 400 | 3 | Cu 18, grafito 10 | no | 0,06 |
| Laser Drill | 3x3 | 280 | 4 | Cu 35, grafito 30, Si 30, Ti 20 | 1,10/tick (66/s) | 0,08 |
| Airblast Drill (blastDrill) | 4x4 | 280 | 5 | Cu 65, Si 60, Ti 50, Th 75 | 3/tick (180/s) | 0,10; liquidBoostIntensity 1,8 |

- Dureza de ítems [SRC Items.java]: cobre 1, plomo 1, carbón 2, titanio 3, torio 4 (arena y chatarra: no se asigna, por defecto 0 [MEM: Item.hardness por defecto 0]). Costes de ítem (para coste de construcción): cobre 0,5; plomo 0,7; grafito 1; silicio 0,8; titanio 1; metaglass 1,5; torio 1,1; plastanio 1,3.
- Tasas calculadas, casillas completas (items/s) [CALC desde la fórmula SRC]:

| Mena (dureza) | Mecánico 4 casillas | Neumático 4 | Láser 9 | Airblast 16 |
|---|---|---|---|---|
| Arena/chatarra (0) | 0,400 | 0,600 | 1,929 | 3,429 |
| Cobre/plomo (1) | 0,369 | 0,533 | 1,636 | 2,909 |
| Carbón (2) | 0,343 | 0,480 | 1,421 | 2,526 |
| Titanio (3) | — | 0,436 | 1,256 | 2,233 |
| Torio (4) | — | — | 1,125 | 2,000 |

  Por casilla de mena: mecánico/cobre = 0,0923 items/s; aumentar el tier sube la tasa por casilla y además el tamaño aumenta el nº de casillas (efecto compuesto: Airblast cobre ≈ 7,9x un mecánico).
- Boost de agua: el progreso se multiplica por `lerp(1,1.6,optionalEfficiency)`; como `warmup` tiende a `speed` en la rama master (`warmup = approachDelta(warmup, speed, warmupSpeed)`), el efecto efectivo es ~1,6² = 2,56x [CALC/MEM: la ficha de juego muestra liquidBoostIntensity²; en v146 no verifiqué la línea de warmup, solo en master]. [Drill.java master](https://raw.githubusercontent.com/Anuken/Mindustry/master/core/src/mindustry/world/blocks/production/Drill.java)
- Bloques "tipo taladro" de otro tipo: Water Extractor (2x2, 0,11 agua/tick = 6,6/s, 1,5/tick de potencia = 90/s, coste metaglass 30, grafito 30, plomo 30, Cu 30) y Cultivator (2x2, craftTime 100, 1 spore pod, agua 0,3/tick, potencia 80/60/tick ≈ 1,33/tick, boost máx 2) [SRC Blocks.java]. Nota: en v146 el Cultivator es un GenericCrafter, no un Drill [SRC Blocks, definido como crafter].

### Inferences
- La fórmula lineal en nº de casillas hace el "valor de la veta" legible: una veta rica = más casillas bajo el taladro, sin concepto de "riqueza" oculto. Para tu juego: richness por veta ≈ nº de casillas, y el doble por tier ≈ el salto de drillTime (600→400→280) más tamaño.
- El stat "base" engañoso (sin dureza) muestra que Mindustry prioriza simplicidad en la UI y compensa con el overlay de colocación (`drawPlace`) que muestra la tasa real antes de construir.
- "Dominante" evita mezclar salidas: un taladro = un tipo de ítem, lo que mantiene cada línea pura y los ratios predecibles.

### Gaps
- No verifiqué en v146 la línea exacta de `warmup` ni el factor 2,56x; no leí `Drill.setStats` para `Stat.boostEffect`.
- La rama master (v8/BE) parece conservar la misma fórmula y `drillMultipliers`; no hice diff real con v146, así que posibles diferencias de v8 quedan sin confirmar.

## 2. Crafters (GenericCrafter): ciclos, buffers, eficiencia, ratios

### Takeaway
Un crafter acumula progreso solo si tiene todos los insumos y espacio de salida; su velocidad escala con la eficiencia (potencia/líquido), acepta solo ítems que consume hasta un límite por tipo y empuja la salida cada tick/temporizador. Esto genera back-pressure natural: lleno de salida → deja de consumir.

### Cited Findings
- Campos: `craftTime = 80` por defecto; `outputItem`/`outputItems`; `progress`, `warmup` [SRC GenericCrafter.java v146](https://raw.githubusercontent.com/Anuken/Mindustry/v146/core/src/mindustry/world/blocks/production/GenericCrafter.java).
- `updateTile`: `if(efficiency > 0){ progress += getProgressIncrease(craftTime); warmup = approachDelta(warmup, warmupTarget(), warmupSpeed); } ; if(progress >= 1f) craft(); dumpOutputs();` — `dumpOutputs()` se ejecuta cada tick pero los ítems se sueltan cuando `timer(timerDump, dumpTime / timeScale)` [SRC].
- `shouldConsume()` devuelve false si `items.get(output.item) + output.amount > itemCapacity` (salida llena) o si una salida líquida está llena; si no, `enabled` [SRC]. Con `shouldConsume` false, `efficiency` = 0 (BuildingComp) [SRC] y no se consume nada.
- `craft()`: `consume()`, `offload(output.item)` por cada unidad de salida, `progress %= 1f` (conserva resto) [SRC].
- `getMaximumAccepted` devuelve `itemCapacity`; `acceptItem` base: `block.consumesItem(item) && items.get(item) < getMaximumAccepted(item)` [SRC BuildingComp]. Es decir, solo acepta ítems que consume y hasta el límite por tipo (el comentario de `itemCapacity` en Block dice "usually per-type") [SRC Block.java].
- Eficiencia: `efficiency` = mínimo de la eficiencia de los consumidores no opcionales (`minEfficiency = min(...)`); los consumidores opcionales usan `optionalEfficiency`; se multiplica por `efficiencyScale()` [SRC BuildingComp]. Para ConsumePower `efficiency() = power.status` (0..1 continuo) [SRC ConsumePower]. Consecuencia: con 50 % de potencia el crafter va al 50 % de velocidad (no se apaga).
- Recetas (Blocks.java v146) [SRC] + tasa por segundo [CALC]:

| Bloque | craftTime (ticks) | Entrada por ciclo | Salida | Potencia | Throughput (a 100 %) | Coste |
|---|---|---|---|---|---|---|
| Graphite Press | 90 | 2 carbón | 1 grafito | 0 | 1,33 carbón/s -> 0,667 grafito/s | Cu 75, Pb 30 |
| Silicon Smelter | 40 | 1 carbón + 2 arena | 1 Si | 0,50/tick (30/s) | 1,5 carbón/s + 3 arena/s -> 1,5 Si/s | Cu 30, Pb 25 |
| Kiln | 30 | 1 plomo + 1 arena | 1 metaglass | 0,60/tick (36/s) | 2 plomo/s + 2 arena/s -> 2 metaglass/s | Cu 60, grafito 30, Pb 30 |
| Plastanium Compressor | 60 | 2 titanio + 0,25 aceite/tick (15/s) | 1 plastanio | 3/tick (180/s) | 2 Ti/s + 15 aceite/s -> 1 plast/s | Si 80, Pb 115, grafito 60, Ti 80 |
| Pulverizer | 40 | 1 chatarra | 1 arena | 0,50/tick (30/s) | 1,5 chatarra/s -> 1,5 arena/s | Cu 30, Pb 25 |
  Un comunitario cita receta del smelter "1 carbón, 2 arena, 30 potencia/s, 0,66 s" (coincide con 40 ticks) — [gameplay.tips](https://gameplay.tips/guides/9736-mindustry.html) [COM]. En v146 el valor craftTime del smelter lo da el SRC arriba (40).
- Ratios de taladros por crafter [CALC, casillas completas]: Silicon Smelter necesita 1,5 carbón/s y 3 arena/s. Con mecánicos: ~4,4 taladros de carbón (0,343) + 7,5 de arena (0,4). Con neumáticos: 3,1 carbón (0,48) + 5 arena (0,6). Con láser: ~1,06 láser de carbón (1,421) + 1,56 láser de arena (1,929). Graphite Press: 1,33 carbón/s ≈ 3,9 mecánicos o 2,8 neumáticos.
- Cinta: una afirmación comunitaria de que una cinta de titanio se satura con ~5-6 smelters no está verificada — [shapes.inc/mindustrytool](https://shapes.inc/mindustrytool) [COM, sospechosa: fuente de asistente IA].
- Herramientas: la búsqueda no encontró una calculadora de ratios específica de Mindustry fiable; solo hojas de Google Docs sin verificar ([ejemplo](https://docs.google.com/spreadsheets/d/18sle4UbULnCvJEJROs7NeTrD9MwFariB), no abierta). La ficha en juego muestra throughput real en el overlay.

### Inferences
- Patrón productor-buffer-consumidor: cada bloque tiene buffer pequeño (itemCapacity 10) y se detiene cuando su salida no cabe; el estancamiento se propaga hacia atrás por las cintas sin lógica central. Los cuellos de botella se ven como cintas llenas/paradas (visual) y el crafter con barra de progreso parada.
- Receta estable por bloque (n entradas -> 1 salida a tasa fija) facilita "N de A por 1 de B": la matemática de ratio es simple división.
- Para tu juego: el digestor 2:1 y reactor catalítico 1+2:1 encajan con este modelo; añade buffer por tipo y parada por salida llena para que sea auto-regulado.

### Gaps
- No verifiqué `Block.init` para saber si `itemCapacity` se auto-ajusta al doble del consumo ([MEM], no confirmado) ni los detalles de `ConsumeItems` / `getProgressIncrease`.
- No encontré un calculador Mindustry específico; las cifras de ratio son mías ([CALC]).

## 3. Potencia: generadores, nodos, baterías y satisfacción

### Takeaway
La red es un grafo con producción y demanda sumadas por tick; si falta energía, todos los consumidores reciben el mismo ratio produced/needed y trabajan proporcionalmente más lento, con baterías como colchón. Es una degradación suave, no un apagón binario.

### Cited Findings
- `getSatisfaction()`: 0 si no se produce nada; 1 si no hay demanda; si no `clamp(lastPowerProduced / lastPowerNeeded)` [SRC PowerGraph.java v146](https://raw.githubusercontent.com/Anuken/Mindustry/v146/core/src/mindustry/world/blocks/power/PowerGraph.java).
- Producción y demanda por tick: `powerProduced += producer.getPowerProduction()*delta`; `powerNeeded += requestedPower(consumer)*delta` [SRC].
- Déficit: `useBatteries(powerNeeded - powerProduced)`; superávit: `chargeBatteries(...)`; luego `distributePower(needed, produced, charged)` [SRC]. Las baterías se descargan en proporción `min(1, needed/stored)` y se cargan `status += (1-status)*chargedPercent` [SRC].
- Distribución: `coverage = min(1, produced/needed)` (1 si needed=0); consumidores no almacenadores reciben `power.status = coverage`; los buffered rellenan `status += rate/capacity` [SRC].
- Para los consumidores la eficiencia = `power.status`, así que un crafter/taladro con 60 % de cobertura rinde 60 % [SRC ConsumePower + BuildingComp].
- `getPowerProduction() = powerProduction * productionEfficiency`; la ficha multiplica por 60 para mostrar potencia/s [SRC PowerGenerator.java].
- Valores (Blocks.java v146) [SRC]: Combustion Generator 1/tick (60/s), 120 ticks por ítem, coste Cu 25 Pb 15; Steam Generator 5,5/tick (330/s), 90 ticks/ítem, agua 0,1/tick, coste Cu 35 grafito 25 Pb 40 Si 30; Solar Panel 0,1/tick (6/s), Pb 10 Si 15; Battery capacidad 4000, Cu 5 Pb 20; Power Node maxNodes 10, laserRange 6, Cu 1 Pb 3.
- Demandas: smelter 30/s, kiln 36/s, pulverizador 30/s, laser drill 66/s, airblast 180/s, water extractor 90/s, plastanium compressor 180/s, overdrive projector 3,5/tick = 210/s [CALC desde SRC]. Un combustion generator (60/s) alimenta ~2 smelters; un laser drill pide ~1,1 combustion [CALC].

### Inferences
- Satisfacción compartida = justicia simple: todos bajan igual, no hay prioridades que gestionar; el jugador ve barras de potencia y decide añadir generadores o baterías. Es "amigable" porque los fallos son graduales y recuperables.
- Para tu juego: usar una eficiencia global continua en vez de on/off, con un buffer (batería) opcional.

### Gaps
- No leí `PowerNode`/laser linking ni límites de enlace; no cubrí `ConsumePower.usage` por bloque más allá de Blocks.java.

## 4. Boosters y multiplicadores; progresión por tecnología

### Takeaway
Hay boosts opcionales (agua en taladros, overdrive, fase) cuyo bonus no se acumula multiplicativamente entre proyectores (gana el máximo), y el coste de investigación crece de forma superlineal con el coste de materiales.

### Cited Findings
- Overdrive Projector: `reload=60`, `range=80` (10 casillas), `speedBoost=1.5`, `speedBoostPhase=0.75`, `useTime=400` ticks por ítem de fase, `phaseRangeBoost=20`; `realBoost = (speedBoost + phaseHeat*speedBoostPhase)*efficiency` (máximo 2,25x); cada pulso aplica boost durante `reload+1` ticks; coste Pb 100, Ti 75, Si 75, plast 30; potencia 3,5/tick [SRC OverdriveProjector + Blocks](https://raw.githubusercontent.com/Anuken/Mindustry/v146/core/src/mindustry/world/blocks/defense/OverdriveProjector.java).
- Apilado: `applyBoost` usa `timeScale = Math.max(timeScale, intensity)`: el boost más fuerte gana, no se multiplican; el tiempo se refresca solo si la intensidad es >= la actual [SRC BuildingComp]. `applySlowdown` usa `min`.
- `GenericCrafter` acelera con `timeScale` (el temporizador de dump usa `dumpTime / timeScale`) [SRC].
- Agua en taladros: intensidad 1,6 (1,8 en Airblast), consumo/tick 0,05/0,06/0,08/0,10 [SRC Blocks]; apilado con overdrive: no verificado (en Drill, `delta()` incorpora `timeScale`, por lo que se multiplicaría con el agua [MEM]).
- Coste de investigación: `researchRequirements` = `round(60*mult + amount^1.11 * 20 * mult)` por item, con multiplicadores por ítem; `researchCost` puede sobrescribirlo [SRC Block.java].
- Coste de construcción: `buildCost = Σ(amount * item.cost)`, luego `*buildCostMultiplier` [SRC Block.java] (tiempos reales de construcción incluyen otros factores no leídos).
- Reemplazo: `canReplace` permite poner un bloque sobre otro del mismo `group` y mismo tamaño (o mayor si hay subclase/anyReplace) — por eso un taladro mejor se coloca sobre uno viejo [SRC Block.java].

### Inferences
- "max, no multiplicar" evita explosiones de potencia; la progresión se controla por tier y coste, no por apilado de boosts.
- Las cadenas se vuelven más caras por pasos: Mecánico Cu12 -> Neumático Cu18+grafito10 -> Láser (4 recursos + potencia) -> Airblast (torio). Cada tier exige un recurso producido por la cadena anterior, lo que fuerza a extender la producción.
- Para tu juego: tier = x2 es más agresivo que Mindustry (600->400 = x1,5 en base; el salto real viene de tamaño/casillas).

### Gaps
- No leí cuánto "unidad-boost" (p. ej. unidades que aceleran) existe; no verifiqué si overdrive y agua se multiplican; no revisé el árbol tecnológico (`SerpuloTechTree.java`).

## 5. Costes, reembolso y economía

### Takeaway
El reembolso por defecto al deconstruir es 50 % de los materiales; el coste escala por tier con recursos de la cadena previa. Se pueden reemplazar bloques in situ por mejores.

### Cited Findings
- `deconstructRefundMultiplier = 0.5f` ("porcentaje de materiales reembolsados al deconstruir") y `buildCostMultiplier = 1f` — [Rules.java v146](https://raw.githubusercontent.com/Anuken/Mindustry/v146/core/src/mindustry/game/Rules.java) [SRC]. `instantDeconstruct` implica ningún reembolso [SRC Block.java].
- Costes de tier de taladros ver tabla sección 1 [SRC]. Escalado: mecánico 12 Cu ≈ 6 de coste; láser incluye Ti/Si/grafito [CALC con Items.cost].
- El modo sandbox tiene recursos infinitos (`infiniteResources`) [SRC Rules].

### Inferences
- El 50 % de reembolso hace que experimentar sea barato pero no gratis: fomenta rediseñar. En tu juego, reembolso parcial al mejorar puede evitar el miedo a gastar.

### Gaps
- No verifiqué si el reembolso al reemplazar bloques (upgrade in place) es parcial o total en la construcción (`ConstructBlock`); no cubrí cómo se dividen los costes de ConstructBlock.

## 6. Principios de diseño: modularidad, back-pressure, visibilidad, herramientas

### Takeaway
Cada bloque es un pequeño sistema autónomo (buffer por tipo, receta fija, dump round-robin, parada con salida llena); la red lo conecta con cintas, y los cuellos de botella son visibles.

### Cited Findings
- Round-robin en dump/offload y rechazo por `acceptItem` crean back-pressure natural [SRC BuildingComp, ver arriba].
- Un taladro o crafter parado por buffer lleno no destruye ni pierde ítems [SRC Drill/GenericCrafter].
- La interfaz muestra tasas en overlay de colocación (`drawPlace`) y barras de progreso/potencia [SRC Drill, PowerGenerator.setBars].
- Calculadoras: no se encontró una canónica; búsqueda web ofrece sobre todo herramientas de Factorio ([búsqueda](https://west-games.com/factorio-smelter-ratio-calculator/) irrelevante) [COM].

### Inferences
- Modularidad = locales + fija (receta, buffer, tasa) + conectores universales (cinta/dump): permite copiar-pegar módulos y escalar linealmente.
- Para tu juego, adopta: (a) tasa por veta = f(casillas, tier, dureza); (b) buffers por insumo y parada con salida llena; (c) eficiencia continua; (d) boosts que toman el máximo; (e) overlay con ratio "N taladros por digestor".
- Ejemplo de cálculo: digestor 2:1 a ritmo T consume 2T/s de entrada; reactor 1+2:1 necesita entradas 1:2 -> tasa de producción debe dividir con ratios racionales, igual que carbón/arena 1:2 del smelter.

### Gaps
- Sin fuentes sobre mods/calculadoras, guías de Reddit ni la wiki oficial (fetch de la wiki devolvió 404); las discusiones comunitarias no se pudieron citar.
- No se verificaron diferencias v8/BE más allá de que `Drill.java` en master conserva fórmula y campos iguales.
