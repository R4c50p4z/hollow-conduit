# Defensa en Mindustry: torretas, logística de munición, oleadas, IA enemiga, reparación y bases autosuficientes

Notas en español; nombres de bloques/unidades de Mindustry en inglés entre paréntesis. Todo lo "verificado" proviene de la lectura del código fuente en la etiqueta v146 (v7 estable) vía raw.githubusercontent.com/Anuken/Mindustry/v146/... Rangos en unidades de mundo (8 unidades = 1 casilla). Potencias de `consumePower` están en unidades/tick (x60 = unidades/s). Los datos de `Blocks.java` se leyeron mediante un resumidor automático sobre trozos del archivo: cifras de torretas deben contrastarse antes de usarse como constantes exactas.

## 1. Torretas: daño, alcance, recarga, objetivos, munición, coste

### Takeaway
Las torretas se dividen en tres familias de consumo: por ítem (`ItemTurret`: munición almacenada), por líquido (`LiquidTurret`) y por energía (`PowerTurret`, sin munición). Cada tipo de munición cambia daño, cadencia (`reloadMultiplier`) y raciones por ítem (`ammoMultiplier`); el grafito/silicio intercambia cadencia por daño. Duo/hail/scatter/lancer/arc son la base temprana; ripple/salvo/cyclone/fuse la media.

### Cited Findings
- Valores por defecto de `Turret`: `maxAmmo = 30`, `ammoPerShot = 1`, `targetAir = true`, `targetGround = true`, `unitSort = closest`, `targetInterval = 20` ticks (re-búsqueda de objetivo cada 1/3 s), `shootCone = 8°`, `liquidCapacity = 20`. Recarga: `reloadCounter += delta * peekAmmo().reloadMultiplier * baseReloadSpeed()`, la torreta recarga aunque no tenga objetivo; dispara solo si `reloadCounter >= reload`, apunta dentro del cono y `hasAmmo()` — [Turret.java](https://raw.githubusercontent.com/Anuken/Mindustry/v146/core/src/mindustry/world/blocks/defense/turrets/Turret.java)
- Objetivos: edificios solo se consideran si `targetGround`; con solo `targetAir` busca unidades no terrestres; el filtro es `(e.isGrounded() || targetAir) && (!e.isGrounded() || targetGround)` — [Turret.java](https://raw.githubusercontent.com/Anuken/Mindustry/v146/core/src/mindustry/world/blocks/defense/turrets/Turret.java)
- El alcance efectivo es `range + peekAmmo().rangeChange` (la munición puede cambiarlo); `useAmmo` resta `ammoPerShot` del último tipo y lo elimina al llegar a 0 — [Turret.java](https://raw.githubusercontent.com/Anuken/Mindustry/v146/core/src/mindustry/world/blocks/defense/turrets/Turret.java)
- Duo: coste cobre 35; salud 250; alcance 110 (13,75 casillas); recarga 20 ticks; munición: cobre (daño 9, x2), grafito (18, reload x0,6, x4), silicio (12, reload x1,5, x5, guiada). Refrigerante 0,1/tick — [Blocks.java](https://raw.githubusercontent.com/Anuken/Mindustry/v146/core/src/mindustry/content/Blocks.java) (offset 100000)
- Scatter (antiaéreo, flak): cobre 85 + plomo 45; alcance 220; recarga 18; chatarra (splash 33, reload x0,5, x5), plomo (splash 40,5, x4), metacristal (splash 45, reload x0,8, x5, 6 fragmentos de 5) — misma fuente
- Scorch: cobre 25 + grafito 22; salud 400; alcance 60 (7,5 casillas); recarga 6; carbón (daño 17, x3, quemadura 4 s), pirotita (60, x6, quemadura 10 s) — misma fuente
- Hail (artillería, solo suelo en el juego): cobre 40 + grafito 17; alcance 235; recarga 60; grafito (20, splash 33), silicio (20, reload x1,2, x3), pirotita (25, splash 45, x4) — misma fuente
- Lancer (energía): cobre 60, plomo 70, silicio 60, titanio 30; alcance 165; recarga 80; consumo 6/tick (360/s); láser de daño 140 que atraviesa hasta 4 objetivos; refrigerante 0,2 — misma fuente
- Arc (energía): cobre 50 + plomo 50; alcance 90; recarga 35; consumo 3,3/tick; rayo de daño 20, longitud 25; refrigerante 0,1 — misma fuente
- Wave (líquido): metacristal 45, plomo 75, cobre 25; alcance 110; recarga 3; capacidad 10; agua/slag (daño 4)/crio/aceite. Tsunami: metacristal 100, plomo 400, titanio 250, torio 100; alcance 190; capacidad 40; daño agua 0,2, slag 4,75 — misma fuente
- `LiquidTurret`: solo acepta líquidos presentes en `ammoTypes`; solo cambia de líquido cuando el actual casi se agota; cada disparo gasta `1/ammoMultiplier`; apaga fuegos propios cercanos si `extinguish` — [LiquidTurret.java](https://raw.githubusercontent.com/Anuken/Mindustry/v146/core/src/mindustry/world/blocks/defense/turrets/LiquidTurret.java)
- Salvo: cobre 100, grafito 80, titanio 50; alcance 190; recarga 31; 4 disparos; cobre (11), grafito (20, x0,6), pirotita (18, splash 12), silicio (15, x1,5, guiada), torio (29) — misma fuente Blocks.java
- Ripple (artillería, `targetAir=false`, `minRange 50`): cobre 150, grafito 135, titanio 60; alcance 290 (36 casillas); recarga 60; 4 proyectiles, `ammoPerShot = 2`; grafito (20 + splash 33), silicio (reload x1,2), pirotita (24/45), compuesto explosivo (splash 55), plastanio (splash 45 + 10 fragmentos de 10) — misma fuente
- Cyclone (flak): cobre 200, titanio 125, plastanio 80; alcance 200; recarga 8; metacristal (6 + splash 45 + 4 frag.), explosivo, plastanio, aleación de sobretensión (13, splash 75, rayos) — misma fuente
- Fuse (corto alcance, perforante): cobre 225, grafito 225, torio 100; alcance 90; recarga 35; titanio (66, x1,3) y torio (105) — misma fuente
- Swarmer: grafito 35, titanio 35, plastanio 45, silicio 30; alcance 240; recarga 30; 4 misiles; explosivo/pirotita/surge. Parallax (tractor, energía 3/tick, alcance 240, daño 0,3) y Segment (defensa de punto, energía 8/tick, alcance 180, daña balas 30) — misma fuente
- `PowerTurret`: `hasAmmo()` siempre true ("siempre puedes rotar, nunca disparar sin energía"); la munición de la unidad escala con `power.status`; la lógica exacta de reducción de recarga con poca energía no se vio — [PowerTurret.java](https://raw.githubusercontent.com/Anuken/Mindustry/v146/core/src/mindustry/world/blocks/defense/turrets/PowerTurret.java)

### Inferences
- Alcance en casillas útil para un juego de cuadrícula: scorch 7,5, arc 11, duo 13,75, lancer 20,6, hail 29, ripple 36 (dividir entre 8). Dos escalones claros: "puntos de choque" baratos y de corto alcance frente a artillería de largo alcance que cubre a las demás.
- Las torretas energéticas evitan por completo la logística de munición: sustituyen un punto de fallo (suministro de ítems) por otro (red eléctrica).
- Mismo patrón de compromiso en varias torretas (grafito = más daño/menos cadencia; silicio = más cadencia + guiado): una variable de "calidad de munición" entrega elecciones sin añadir bloques nuevos.

### Gaps
- Spectre, meltdown, foreshadow y tsunami/spectre en detalle no se leyeron (fuera del tramo leído de Blocks.java); el resumidor tampoco devolvió `maxAmmo` por torreta ni `targetAir` de hail/duo; pueden existir excepciones.
- Dps exactos y el efecto de la energía insuficiente sobre la recarga requieren leer `Turret.updateReload`/`baseReloadSpeed` y la clase de consumo.

## 2. Logística de munición y refrigerante

### Takeaway
Una torreta de ítems acepta un ítem solo si cabe su ración completa (`totalAmmo + ammoMultiplier <= maxAmmo`); por tanto una cinta que pasa junto a ella la mantiene llena y el exceso sigue. Se dispara siempre con el último tipo añadido; sin munición la torreta simplemente deja de disparar (fallo natural y visible).

### Cited Findings
- `acceptItem`: `ammoTypes.get(item) != null && totalAmmo + ammoTypes.get(item).ammoMultiplier <= maxAmmo`; `acceptStack` devuelve `min((maxAmmo - totalAmmo)/ammoMultiplier, amount)`; `removeStack` devuelve 0 (no se puede sacar munición) — [ItemTurret.java](https://raw.githubusercontent.com/Anuken/Mindustry/v146/core/src/mindustry/world/blocks/defense/turrets/ItemTurret.java)
- `handleItem` apila por tipo de ítem (una `ItemEntry` por tipo) y mueve el tipo recién añadido al final de la lista; `peekAmmo` usa el último, de modo que el último ítem aceptado pasa a ser la munición activa — [ItemTurret.java](https://raw.githubusercontent.com/Anuken/Mindustry/v146/core/src/mindustry/world/blocks/defense/turrets/ItemTurret.java); [Turret.java](https://raw.githubusercontent.com/Anuken/Mindustry/v146/core/src/mindustry/world/blocks/defense/turrets/Turret.java)
- `hasAmmo`: si la entrada superior tiene menos que `ammoPerShot` pero la inferior alcanza, se intercambian; la torreta dispara solo si la entrada activa tiene `amount >= ammoPerShot` — [Turret.java](https://raw.githubusercontent.com/Anuken/Mindustry/v146/core/src/mindustry/world/blocks/defense/turrets/Turret.java)
- `coolantMultiplier = 5` por defecto ("cuánto se reduce la recarga por cada unidad de líquido de capacidad calorífica"); el refrigerante es un consumidor opcional (`booster`); consumos declarados: duo/hail/arc/scorch 0,1/tick, scatter/salvo/lancer 0,2, swarmer/fuse/ripple/cyclone 0,3 — [BaseTurret.java](https://raw.githubusercontent.com/Anuken/Mindustry/v146/core/src/mindustry/world/blocks/defense/turrets/BaseTurret.java); [Blocks.java](https://raw.githubusercontent.com/Anuken/Mindustry/v146/core/src/mindustry/content/Blocks.java)
- Los parámetros de ammoMultiplier por ítem (p. ej. duo: cobre x2, grafito x4, silicio x5; fuse: titanio x4, torio x5) determinan cuántos disparos da cada ítem; con `maxAmmo` 30 una torreta almacena del orden de 30 unidades de munición — [Blocks.java](https://raw.githubusercontent.com/Anuken/Mindustry/v146/core/src/mindustry/content/Blocks.java)

### Inferences
- Patrón estándar "cinta junto a la fila de torretas": al rechazar `acceptItem` cuando está lleno, la cinta fluye sin bloquearse; cada torreta toma solo lo que consume. Una cinta cerrada al final acumula ítems hasta saturarse y actúa como buffer de la línea, pero mezclar munición hace que la torreta cambie al último tipo recibido (la prioridad no es configurable, es "el último gana").
- Dado `maxAmmo=30`, el buffer interno de una torreta dura segundos a minutos de combate (duo con grafito: 30 raciones, 1 ración/disparo, 1 disparo cada ~33 ticks con x0,6 → alrededor de 16 s de fuego continuo, cálculo propio); el buffer real es la cinta y el contenedor aguas arriba.
- El "fallo natural" es limpio: sin ítems, la torreta deja de disparar pero sigue en pie; no hay degradación gradual hasta que la munición se agota.

### Gaps
- No se verificó la fórmula de `updateCooling` (de memoria: la recarga avanza extra `amount * heatCapacity * coolantMultiplier` por tick; agua heatCapacity 0,4 y criofluido 0,9). Cifra de impulso exacta no verificada; folclore comunitario habla de ~+40% con agua y ~+90% con criofluido en torretas pequeñas.
- No se documentó el comportamiento exacto de `acceptItem` con munición mezclada en cintas reales ni los patrones de plano comunitarios (no se consultaron guías de r/Mindustry con éxito).

## 3. Oleadas y generación

### Takeaway
Las oleadas son una lista de `SpawnGroup` (aparición por oleada, escalado lineal por oleada, escudos crecientes, tope `max`), ya sea la lista artesanal por defecto (`Waves.get()`) o la generada proceduralmente por sector a partir de un `difficulty` (0..1) con progresiones por tiers y jefes con estado `boss`.

### Cited Findings
- `getSpawned(wave)`: 0 si la oleada está fuera de `[begin,end]` o `(wave-begin) % spacing != 0`; si no, `min(unitAmount + ((wave-begin)/spacing)/unitScaling, max)` con división entera; `max` por defecto 40; `shields` + `shieldScaling*(wave-begin)`; `effect` se aplica "indefinidamente" (999999 ticks) — [SpawnGroup.java](https://raw.githubusercontent.com/Anuken/Mindustry/v146/core/src/mindustry/game/SpawnGroup.java)
- Lista por defecto: 28 grupos; dagas oleadas 1-10 (`unitScaling` 2, `max` 30), crawlers desde la 4 (2 unidades), mace desde la 7 (espaciado 3), flares desde la 3, atrax 31, fortress 40, scepter 41, reign 81, toxopid 210 con escudo 1000 — [Waves.java](https://raw.githubusercontent.com/Anuken/Mindustry/v146/core/src/mindustry/game/Waves.java) (el resumen proviene de un resumidor automático; verificar valores concretos)
- `Waves.generate(difficulty,...)`: 4 líneas de especies sin naval (dagger, nova, crawler, flare) con 5 tiers; cada progresión dura `rand(8,16) + lerp(5,0,difficulty) + tier*4` oleadas, el tier sube tras cada tramo (máx. 3), 30% de cambio de especie; escudos `max((wave-30)*shieldsPerWave, 0)` con `shieldsPerWave = 20 + difficulty*30`; nuevas progresiones solapadas cada `rand(15,30)*lerp(1,0.5,difficulty)` oleadas — [Waves.java](https://raw.githubusercontent.com/Anuken/Mindustry/v146/core/src/mindustry/game/Waves.java)
- Jefes: primera oleada de jefe `rand(50,70)*lerp(1,0.5,difficulty)`, espaciado `rand(25,40)*lerp(1,0.5,d)`, tier 3 si dificultad < 0,6 si no tier 4; jefes finales desde ~120+rand(0,30), 500 escudos; en modo ataque con d >= 0,5, megas curanderas en oleadas 3-20; `shift = max(d*14-5, 0)` adelanta todos los grupos — [Waves.java](https://raw.githubusercontent.com/Anuken/Mindustry/v146/core/src/mindustry/game/Waves.java)
- Reglas de oleadas: `waveSpacing = 2 minutos` por defecto, `initialWaveSpacing` (si <= 0 se usa 2x `waveSpacing`), `waveTimer = true`, `waitEnemies = false`, `winWave` (0 = sin victoria por oleadas), `dropZoneRadius = 300`, `enemyCoreBuildRadius = 400`, `unitHealthMultiplier = 1` — [Rules.java](https://raw.githubusercontent.com/Anuken/Mindustry/v146/core/src/mindustry/game/Rules.java)

### Inferences
- Tres palancas independientes y legibles: cuántas (`unitAmount`/`unitScaling`/`max`), cuán resistentes (escudos lineales con el nº de oleada, a partir de ~oleada 30) y qué tipo (tier por especie). Facilita diseñar "oleadas justas": la información de la siguiente oleada puede mostrarse al jugador.
- `waitEnemies` permite una variante "no acumula presión" que sirve para juegos con ausencia del jugador.
- Los jefes llegan con espaciado fijo, produciendo picos previsibles sobre una rampa suave.

### Gaps
- El número exacto de unidades por oleada por dificultad de sector y el sistema de "amenaza/threat" de sectores lanzables no se verificó (SectorPresets, `Sector.threat`).
- Diferencias v8/BE: no se comprobaron.

## 4. IA enemiga

### Takeaway
La IA terrestre sigue un campo de flujo (`fieldCore`) hacia el núcleo con coste extra por atravesar edificios enemigos (los muros se "pagan" con su vida), dispara a lo que esté en alcance con prioridad de unidades sobre edificios; la aérea elige objetivos por banderas (`targetFlags`) y los ataca desde 0,8 de su alcance.

### Cited Findings
- Pathfinder: celdas con edificios de otro equipo son transitables con coste `1 + min(health/40, 80)*5` (hasta +400) — los muros más débiles son más baratos de atravesar y el campo rodea los fuertes cuando hay alternativa; +2 junto a sólido, +6 junto a líquido, +30 suelo dañino, +6000 agua profunda; sólidos propios y estáticos son impasibles — [Pathfinder.java](https://raw.githubusercontent.com/Anuken/Mindustry/v146/core/src/mindustry/ai/Pathfinder.java)
- `fieldCore` parte de los núcleos enemigos (y de los puntos de aparición para el equipo de oleadas); cada unidad se mueve al vecino (8 direcciones) de menor peso — [Pathfinder.java](https://raw.githubusercontent.com/Anuken/Mindustry/v146/core/src/mindustry/ai/Pathfinder.java)
- GroundAI: avanza con `pathfind(fieldCore)` hasta estar a `range*0.5` del núcleo; fija el núcleo como objetivo si está a `range/1.3 + tamaño/2`; se detiene cerca de un generador de oleadas si es el equipo de oleadas — [GroundAI.java](https://raw.githubusercontent.com/Anuken/Mindustry/v146/core/src/mindustry/ai/types/GroundAI.java)
- Selección de objetivos (AIController): `Units.closestTarget` comprueba primero unidades y solo después edificios; reobjetivo cada 40 ticks sin objetivo y 90 con él; cada arma reobjetiva por separado salvo `singleTarget` — [AIController.java](https://raw.githubusercontent.com/Anuken/Mindustry/v146/core/src/mindustry/entities/units/AIController.java); [Units.java](https://raw.githubusercontent.com/Anuken/Mindustry/v146/core/src/mindustry/entities/Units.java)
- FlyingAI: primero el núcleo si está en rango; luego recorre `unit.type.targetFlags` en orden (entrada `null` = cualquier objetivo cercano); si nada, el núcleo; se acerca a `range*0.8` (o circula si `circleTarget`); sin objetivo, va al generador de oleadas — [FlyingAI.java](https://raw.githubusercontent.com/Anuken/Mindustry/v146/core/src/mindustry/ai/types/FlyingAI.java)
- Comentario comunitario (no oficial): los terrestres "buscan el camino de menor resistencia" y los aéreos van al tipo de edificio más cercano — [resumen de búsqueda](https://steamcommunity.com/app/1127400/discussions/0/4302599288386452932) (de baja fiabilidad, no abierto directamente)

### Inferences
- "Ir al núcleo, disparar a lo que esté en alcance por el camino" es el equivalente de un enjambre que ataca "la estructura más cercana": el diseño permite que los muros funcionen como señuelo/coste de camino y que el jugador moldee el recorrido (laberintos con muros débiles al lado de la ruta ideal).
- Cada mecanismo (rutas por coste, prioridad de unidad sobre edificio, banderas aéreas) es un parámetro de dificultad ajustable independiente del recuento de enemigos.

### Gaps
- Contenido de `targetFlags` por unidad aérea (p. ej. flare → generadores, horizon → fábricas/bombardeo) no verificado en `UnitTypes.java`.
- Cómo los terrestres disparan realmente a muros bloqueantes (colisión + `Units.closestTarget`) no se confirmó más allá de lo anterior.

## 5. Apoyo pasivo/activo y reconstrucción

### Takeaway
Muros absorben, menders curan un % de la vida máxima por pulso, los force projectors añaden un escudo regenerable, y las unidades constructoras (`BuilderAI`) reconstruyen automáticamente bloques destruidos desde una cola compartida del equipo.

### Cited Findings
- Muros (multiplicador de salud 4): cobre 320 (6 cobre), cobre grande 1280 (24 cobre), titanio 440, torio 800, plastanio 500 (aislante, absorbe láseres) — [Blocks.java](https://raw.githubusercontent.com/Anuken/Mindustry/v146/core/src/mindustry/content/Blocks.java) (offset 30000)
- Mender: plomo 30 + cobre 25; energía 0,3/tick; recarga 200 ticks; rango 40 (5 casillas); cura 4% de la vida máxima; silicio opcional como impulso; Mend Projector: plomo 100, titanio 25, silicio 40, cobre 50; energía 1,5/tick; recarga 250 ticks; rango 85; cura 11%; fase opcional — [Blocks.java](https://raw.githubusercontent.com/Anuken/Mindustry/v146/core/src/mindustry/content/Blocks.java) (offset 60000)
- `MendProjector`: cura `maxHealth * (healPercent + phaseHeat*phaseBoost)/100 * efficiency` cada `reload` ticks a plena capacidad; la energía baja reduce la cura proporcionalmente; el impulso se consume cada `useTime = 400` ticks — [MendProjector.java](https://raw.githubusercontent.com/Anuken/Mindustry/v146/core/src/mindustry/world/blocks/defense/MendProjector.java)
- Force Projector: plomo 100, titanio 75, silicio 125; energía 4/tick; `shieldHealth` 750; radio ~101,7; enfriamiento 1,5 normal, 1,2 con líquido, ruptura 0,35 — [Blocks.java](https://raw.githubusercontent.com/Anuken/Mindustry/v146/core/src/mindustry/content/Blocks.java); Overdrive Projector: energía 3,5/tick, requiere silicio/plastanio — misma fuente
- Reconstrucción: `BuilderAI` toma el primer plan de `team.data().plans`, lo rota a la cola si no se puede construir, tiene `rebuildPeriod` 120 ticks (10 si la IA de construcción del equipo está activa), huye de enemigos a 370 de distancia — [BuilderAI.java](https://raw.githubusercontent.com/Anuken/Mindustry/v146/core/src/mindustry/ai/types/BuilderAI.java)

### Inferences
- Un mender al 4%/200 ticks cura el 1,2%/s de vida: una pared dañada se regenera en ~50 s, frente a un ataque sostenido. Mender + muros baratos es la capa de "mantenimiento" más barata; la dependencia es energía (0,3/tick) y silicio opcional.
- La reconstrucción necesita recursos disponibles en el núcleo: el fallo se desplaza otra vez al suministro.

### Gaps
- Unidades de fábrica y torreta/unidad del propio núcleo (Shard/Foundation) no se investigaron.
- Si los poly reconstruyen por defecto en v146 y qué unidades usan `BuilderAI` no se verificó en `UnitTypes.java`.

## 6. Comportamiento sin conexión (AFK)

### Takeaway
Un sector abandonado no se simula en tiempo real: al volver se aplica una estimación analítica (`SectorDamage`) que compara el dps/vida de la base con la regresión de las próximas oleadas, y puede destruir edificios del camino o perder el sector.

### Cited Findings
- `SectorInfo.prepare()` guarda ítems, oleada, `winWave`, `waveSpacing` y reinicia `secondsPassed`, `wavesPassed`, `damage`; llama a `SectorDamage.writeParameters` si `allowWaveSimulation` — [SectorInfo.java](https://raw.githubusercontent.com/Anuken/Mindustry/v146/core/src/mindustry/game/SectorInfo.java)
- Producción/exportación se mantienen por ventanas móviles de 60 muestras con tope a la producción bruta; sin plataforma de lanzamiento activa se borra la exportación — [SectorInfo.java](https://raw.githubusercontent.com/Anuken/Mindustry/v146/core/src/mindustry/game/SectorInfo.java)
- `SectorDamage` (ruta del archivo no verificada en este árbol; resumen automático): simula hasta 50 oleadas; la eficacia escala con `health/sumHealth` (una base dañada lucha peor); enemigos por regresión lineal sobre las 10 siguientes oleadas; solo cuentan torretas con munición en rango (`range + 4 casillas`) y eficiencia > 0,08; `sumHealth*0.9`, multiplicador de enemigos presentes 1,6, jefe 1,2; el sector cae si `tiempo para destruir enemigos > tiempo para destruir la base`; si la regeneración supera el daño enemigo se salta la oleada; el daño aplicado se eleva a 1,2 y borra edificios a lo largo del camino punto de aparición -> núcleo, con peso por vida — (resumen automático de SectorDamage.java; URL no resuelta en la primera consulta, segunda consulta devolvió el análisis)

### Inferences
- Filosofía: la defensa se evalúa por sus parámetros agregados (dps con munición, vida total, regeneración), no por simulación fina. Es un modelo directamente trasladable a un idle: "dps efectivo vs presión de la oleada" con regeneración como factor.
- Que cuente solo la munición disponible refuerza que la defensa es su logística.
- El daño recae sobre el camino de entrada (edificios a lo largo de la ruta), no sobre todo el mapa: el castigo es localizado y comprensible.

### Gaps
- Temporizadores de oleadas en sectores no activos, invasión de sectores lanzados y umbrales exactos (`shouldAttack`) no se verificaron.
- Sistema de dificultad/threat de sectores (v7 vs v8/BE) no investigado.

## 7. Principios de diseño y transferencia

### Takeaway
En Mindustry la cadena logística es la defensa: la torreta es un consumidor más con buffer pequeño; los fallos son localizados (munición/energía) y el sistema offline los modela con el mismo criterio.

### Cited Findings
- Fundamento mecánico: `acceptItem` por ración completa + `maxAmmo` pequeño + imposibilidad de extraer munición — [ItemTurret.java](https://raw.githubusercontent.com/Anuken/Mindustry/v146/core/src/mindustry/world/blocks/defense/turrets/ItemTurret.java)
- La simulación offline exige munición y alcance para contar una torreta — [SectorDamage (resumen)](https://raw.githubusercontent.com/Anuken/Mindustry/v146/core/src/mindustry/game/SectorInfo.java)

### Inferences (aplicables al juego de cuadrícula con sanguijuelas)
- Estructura de capas autosuficiente: (1) muros baratos como coste de camino/señuelo (el campo de flujo los cuenta por vida); (2) torretas de largo alcance con buffer propio y línea de suministro redundante; (3) reparación pasiva (mender: ~1,2%/s) que no requiere atención; (4) reconstrucción automática desde una cola que se reintenta, gastando recursos.
- Modelar el offline como un duelo agregado (tiempo para matar la oleada vs tiempo para destruir la base) con regeneración y degradación proporcional a la salud actual; aplicar el daño a edificios a lo largo del camino de entrada, no al azar.
- Hacer legibles los fallos: sin munición = torreta inactiva (visible), no daño oculto. Limitar un "buffer de seguridad" (p. ej. contenedor de reserva) como palanca de diseño: más buffer = más horas desatendido.
- Parámetros de oleada separados (cantidad, escudo, tipo, espaciado, jefes periódicos) permiten afinar la justicia y mostrar la próxima oleada.
- Cap de simulación (50 oleadas) y cotas como `max` evitan resultados extremos tras largas ausencias.

### Gaps
- No se consultaron guías comunitarias de "bases AFK" ni notas de lanzamiento de Anuken; el diseño de "defensa sin atención" se dedujo del código. Diferencias de v8/BE (por ejemplo, torretas de Erekir, nueva IA, cambios en `Waves`) no investigadas.
