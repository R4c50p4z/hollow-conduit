# Transporte de objetos en Mindustry (v7 build 146): reglas, números y lecciones de diseño

Leyenda: [FUENTE] = leído en código oficial (tag v146); [DERIVADO] = cálculo mío a partir de constantes del código, no medido en juego; [FOLKLORE] = comunidad/secundario, sin verificar. Fuentes de código: https://github.com/Anuken/Mindustry/tree/v146/core/src/mindustry/world/blocks/distribution (archivos Conveyor.java, Junction.java, Router.java, OverflowGate.java, Sorter.java, ItemBridge.java, BufferedItemBridge.java, StackConveyor.java, ArmoredConveyor.java, MassDriver.java) y https://github.com/Anuken/Mindustry/blob/v146/core/src/mindustry/content/Blocks.java. Nota: el resumen de cada archivo lo obtuve vía una herramienta de fetch que parafrasea; las citas de una línea son literales, el resto es paráfrasis del fetch.

## 1. Cinta transportadora (conveyor, titanium conveyor, armored conveyor, plastanium conveyor): velocidad, capacidad, entrada lateral/trasera, contrapresión

### Takeaway
Cada cinta es una celda con un buffer de solo 3 ítems y posiciones continuas (0..1); la única regla de flujo es "avanzo si hay hueco delante, si no me quedo" y de ahí sale toda la contrapresión. La velocidad mostrada (4.2 y 11 ítems/s) es una cifra de pantalla fija en código, no un resultado de simulación.

### Cited Findings
- Constantes de la clase: `itemSpace = 0.4f`, `capacity = 3`, `speed`, `displayedSpeed`; buffers paralelos `Item[] ids`, `float[] xs, ys` de tamaño `capacity`; `minitem` = posición del ítem más cercano a la entrada — [Conveyor.java](https://raw.githubusercontent.com/Anuken/Mindustry/v146/core/src/mindustry/world/blocks/distribution/Conveyor.java) [FUENTE]
- Valores de bloque: conveyor `health=45, speed=0.03f, displayedSpeed=4.2f`, coste 1 cobre; titanium-conveyor `health=65, speed=0.08f, displayedSpeed=11f`, coste 1 cobre+1 plomo+1 titanio; armored-conveyor `health=180, speed=0.08f, displayedSpeed=11f` (plastanio+torio+vidrio metálico) — [Blocks.java](https://raw.githubusercontent.com/Anuken/Mindustry/v146/core/src/mindustry/content/Blocks.java) [FUENTE]
- `setStats` muestra `displayedSpeed` (ítems/s) como `Stat.itemsMoved`, no la velocidad simulada; un comentario en el código dice que hace falta un valor calculado a mano porque "the actual movement speed is apparently not linear" — Conveyor.java (enlace arriba) [FUENTE]
- Aceptación (`acceptItem`): rechaza si `len >= capacity`; calcula `direction = |facing.relativeTo(tile) - rotation|`; acepta si `(direction == 0 && minitem >= itemSpace) || (direction % 2 == 1 && minitem > 0.7f)` y no si el origen es un bloque rotatorio al que esta cinta apunta (`!(source.block.rotate && next == source)`) — Conveyor.java [FUENTE]. Es decir: entrada trasera exige hueco de 0.4 tile; entrada lateral exige hueco mayor (>0.7), por lo que la cinta principal tiene prioridad de facto sobre las laterales.
- Inserción (`handleItem`): desde atrás se inserta en `ys = 0`; desde un lado se inserta en el índice medio con `ys = 0.5f` y un desplazamiento lateral `x = ±1` que luego se anima hacia el centro — Conveyor.java [FUENTE]. Esto permite fusión inline: una cinta lateral puede meter ítems en mitad de otra si hay hueco, sin bloque extra.
- Movimiento (`updateTile`): `moved = speed * edelta()`; para cada ítem `nextpos = (i==len-1 ? 100f : ys[i+1]) - itemSpace; maxmove = clamp(nextpos - ys[i], 0, moved)`; si `ys[i] >= 1f && pass(ids[i])` el ítem sale a la siguiente cinta. Si `pass()` falla (no hay siguiente o no acepta), el ítem se queda parado en el extremo y bloquea a los de detrás — Conveyor.java [FUENTE]. Esa es la contrapresión: no hay colas globales, solo "el de delante no me deja".
- `pass(item)` solo traspasa si el edificio de delante es del mismo equipo y `acceptItem` lo permite; `aligned` (siguiente cinta con misma rotación) limita al primer ítem por el `minitem` de la siguiente, evitando amontonamiento — Conveyor.java [FUENTE]
- ArmoredConveyor.acceptItem: `super.acceptItem && (source.block instanceof Conveyor || facingEdge.relativeTo(tile) == rotation)`, o sea solo acepta de cintas (cualquier lado) o de cualquier bloque que esté exactamente detrás; no acepta inserción lateral de bloques no-cinta (taladros, etc.) — [ArmoredConveyor.java](https://raw.githubusercontent.com/Anuken/Mindustry/v146/core/src/mindustry/world/blocks/distribution/ArmoredConveyor.java) [FUENTE]
- Plastanium conveyor (`StackConveyor`): `speed = 4f/60f`, `itemCapacity = 10`, `health = 75`; tres estados `stateMove/stateLoad/stateUnload`; solo el extremo de entrada (sin cinta detrás) acepta ítems, y rechaza durante cooldown (`cooldown > recharge - 1f`, `recharge = 2f`); `acceptStack` rechaza si ya hay otro tipo de ítem (`items.any() && !items.has(item)`); la pila entera pasa a la siguiente solo cuando esta está libre — [StackConveyor.java](https://raw.githubusercontent.com/Anuken/Mindustry/v146/core/src/mindustry/world/blocks/distribution/StackConveyor.java) y Blocks.java [FUENTE]
- Guía comunitaria: el extremo de entrada acepta de todos los lados y arma un lote de 10; cada lote es de un solo tipo de ítem; mezclar tipos en una línea la "glitchea"; un unloader puede sacar 2 ítems de cada lote que pasa; la línea hace pausas ocasionales de carga y se recomienda un overflow gate — [mindustryschematics.com](https://www.mindustryschematics.com/guides/plastanium-converyors-and-how-to-use-them.md) [FOLKLORE, guía de comunidad]
- Cifras comunitarias de rendimiento: titanio "11 ítems/s" como base de cálculo; plastanio citado inconsistentemente (~37/s vs ~40/s); enrutadores, junctions y bridges limitan a ~11/s una línea de plastanio — resultados de búsqueda sobre [guía de logística](https://game-platform-web-5a2.pages.dev/en/mindustry/guides/logistics) y el artículo anterior [FOLKLORE, fuentes en conflicto]

### Inferences
- [DERIVADO] Techo teórico de una cinta = `speed*60 / itemSpace`: básica 0.03*60/0.4 = 4.5 ítems/s; titanio 0.08*60/0.4 = 12 ítems/s. Los displayedSpeed (4.2 y 11) quedan ~7 % y ~8 % por debajo, coherente con el comentario de "no lineal". No encontré medición independiente.
- [DERIVADO] Plastanio: 4/60 de avance por tick con lotes de 10; el rendimiento depende de cuántas cargas por segundo admite la entrada (recharge) más que de la velocidad, por eso se pone más de una entrada por línea (comunidad).
- Propiedad que lo hace robusto: regla puramente local (cada cinta solo mira a la de delante), capacidad minúscula (3) que hace visible el atasco inmediatamente, y asimetría trasera/lateral que da prioridad natural sin configuración. Es legible porque el ítem parado ES el estado de contrapresión.
- Para un idle game móvil: buffer pequeño por celda + "mover si hay hueco" da contrapresión gratis; considerar mostrar separación de ítems en lugar de contadores.

### Gaps
- No hallé medición empírica fiable de ítems/s reales de cinta básica/titanio (hay discrepancia teoría 4.5/12 vs mostrado 4.2/11; folklore habla de otros valores sin fuente verificable).
- Cifras de plastanio (37 vs 40 ítems/s) no verificadas en código ni wiki oficial.
- No se consultó la wiki oficial ni diferencias v8/BE (ver sección 5).

## 2. Junction, router, distributor, overflow/underflow gate, sorter, bridge, mass driver, unloader, contenedores: comportamiento, buffers y fallos conocidos

### Takeaway
Los bloques de ruteo son máquinas de estado minúsculas con buffer 0-1 ítem (router) o por dirección (junction), y los de selección (sorter, overflow) son instantáneos (`instantTransfer`) sin buffer, con una regla anti-cadena explícita. Los fallos famosos (cadenas de routers, retroceso, atasco por mezcla) salen directamente de esas reglas locales.

### Cited Findings
- Junction: `speed = 26` (frames que tarda un ítem en cruzar), `capacity = 6`, `health = 30`, coste 2 cobre; usa `DirectionalItemBuffer` (un buffer por dirección de entrada); `acceptItem` exige `buffer.accepts(relative)` y que exista edificio del mismo equipo en el lado opuesto; si el destino no acepta el ítem, espera ("skip blocks that don't want the item, keep waiting") — [Junction.java](https://raw.githubusercontent.com/Anuken/Mindustry/v146/core/src/mindustry/world/blocks/distribution/Junction.java) y Blocks.java [FUENTE]. Cada eje se bloquea de forma independiente: un atasco E-O no frena N-S.
- Router: `speed = 8f`; acepta solo si no sostiene ítem (`items.total()==0`); guarda ítem y su origen (`lastInput`), avanza `time += 1/speed*delta`; rota entre vecinos desde `rotation` y entrega al primero que acepte; se salta el origen si es un overflow gate; no entrega a otro router/instantTransfer hasta que `time>=1` — [Router.java](https://raw.githubusercontent.com/Anuken/Mindustry/v146/core/src/mindustry/world/blocks/distribution/Router.java) [FUENTE]. Coste 3 cobre; distributor = Router `size=2`, plomo 4 + cobre 4 — Blocks.java [FUENTE]
- Overflow gate: `invert=false`, sin buffer (`instantTransfer`); `getTileTarget`: calcula `to` = lado opuesto al origen; si `!canForward || inv` mira lados a/b; si ambos aceptan alterna con el bit `rotation & (1<<from)`; si ninguno acepta devuelve `inv && canForward ? to : null`; `canForward` excluye pares instantTransfer→instantTransfer (`!(fromInst && to.block.instantTransfer)`) — [OverflowGate.java](https://raw.githubusercontent.com/Anuken/Mindustry/v146/core/src/mindustry/world/blocks/distribution/OverflowGate.java) [FUENTE]. Overflow = prioriza frente, desborda a lados; underflow (`invert=true`) = prioriza lados, y solo va al frente si ambos lados están bloqueados. Coste plomo 2 + cobre 4. Un gate deshabilitado por lógica (`enabled=false`) invierte su modo.
- Sorter / inverted sorter: `instantTransfer=true`; si `((item == sortItem) != invert) == enabled` el ítem sigue recto; si no, va a los lados (izq/der) alternando con el bit de `rotation`; si solo un lado acepta va a ese; si ninguno, no acepta (el ítem queda esperando en el bloque anterior); rechaza `isSame(source) && isSame(destino)` para impedir cadenas de bloques instantáneos — [Sorter.java](https://raw.githubusercontent.com/Anuken/Mindustry/v146/core/src/mindustry/world/blocks/distribution/Sorter.java) [FUENTE]. Coste plomo 2 + cobre 2.
- Bridge conveyor (`BufferedItemBridge`): `range = 4`, `speed = 74f`, `bufferCapacity = 14`, coste plomo 6 + cobre 6; `ItemBridge.itemCapacity = 10`, `transportTime = 2f`; `acceptItem` = mismo equipo, `items.total() < itemCapacity` y `checkAccept` (rechaza ítems que vengan desde la dirección hacia la que apunta el enlace); un puente final sin enlace descarga (`doDump`) a vecinos excepto hacia donde llegan puentes entrantes — BufferedItemBridge.java / [ItemBridge.java](https://raw.githubusercontent.com/Anuken/Mindustry/v146/core/src/mindustry/world/blocks/distribution/ItemBridge.java) y Blocks.java [FUENTE]. La API permite cadenas de puentes.
- Phase conveyor: `ItemBridge` con `range = 12`, consumo `0.30` de energía/tick-unidad, coste fase 5 + silicio 7 + plomo 10 + grafito 10 — Blocks.java [FUENTE]
- Mass driver: `size=3`, `itemCapacity=120`, `reload=200f`, `range=440f` (unidades del mundo; un tile = 8 unidades, o sea 55 tiles [DERIVADO]), `consumePower(1.75f)`; dispara solo si tiene `minDistribute=10` ítems, el receptor tiene ≥10 huecos, la recarga terminó, es el primero en la cola del receptor y ambos están alineados a 2°; estados `idle/accepting/shooting`; acepta solo con `items.total() < itemCapacity && linkValid()` — [MassDriver.java](https://raw.githubusercontent.com/Anuken/Mindustry/v146/core/src/mindustry/world/blocks/distribution/MassDriver.java) y Blocks.java [FUENTE]. Nota: el default de la clase es `reload=100f`, Blocks.java lo sobreescribe a 200.
- Unloader: temporizador `unloadTimer += delta()` frente a `speed` (stat mostrado = `60f/speed` ítems/s; valor de `speed` no verificado por mí); equilibra entre vecinos usando `loadFactor` (cantidad / capacidad máxima), toma del más lleno, entrega al menos lleno, y no transfiere si los factores son iguales; sin `sortItem` rota por todos los ítems (`rotations`) — [Unloader.java](https://raw.githubusercontent.com/Anuken/Mindustry/v146/core/src/mindustry/world/blocks/storage/Unloader.java) [FUENTE]
- Erekir (v7) usa un sistema aparte de "ducts": duct `speed = 4f` (todos los ducts/duct-bridge/duct-router/overflow-duct igual), duct-bridge coste 20 berilio, etc. — Blocks.java [FUENTE]
- Router chains: dos routers adyacentes se pasan el ítem de ida y vuelta; el mecanismo (rotación sobre todos los vecinos aceptantes, incluido el origen salvo overflow gate) está en el código de Router.java [FUENTE]; que sea "el fallo clásico" es opinión comunitaria sin cita directa en mis fuentes [FOLKLORE].

### Inferences
- [DERIVADO] Bridge: `bufferCapacity/speed` = 14 ítems por 74 ticks = 11.35 ítems/s, cerca del 11/s que repite la comunidad (aquí no medido). Junction: capacidad 6 por dirección con retardo 26 ticks (tiempo en que cada ítem queda retenido): hasta ≈13.8 ítems/s por dirección si el buffer se mantiene lleno y la salida lo consume. Router: un ítem cada `speed=8` ticks → 7.5 ítems/s máx. (por tanto un router limita una línea de titanio de 11/s).
- Robustez: sorter y overflow son sin estado (sin buffer, instantTransfer) y la regla anti-cadena evita bucles infinitos de cómputo en un tick: es una decisión de diseño que previene tanto la latencia como las paradojas de orden de actualización.
- Mezcla/atascos: un sorter sin salida lateral libre bloquea la cinta de entrada con el ítem equivocado en cabeza; no hay prevención global (por diseño); el jugador resuelve con overflow al final o un sumidero/incinerador.
- Para el juego móvil: ofrecer bloques "instantáneos" sin buffer y con prohibición de encadenarlos mantiene la simulación local y determinista.

### Gaps
- Velocidad real del unloader (`speed` en Blocks.java, truncado en mi fetch), capacidades de container/vault/core (sección de Blocks.java no leída por truncado) — no obtenidas.
- Comportamiento de back-flow en bridges y chain de routers solo inferido del código, sin cita comunitaria directa.

## 3. Por qué funciona "poner cintas": principios y cómo se revelan los cuellos de botella

### Takeaway
Funciona porque toda la lógica es local, el estado es visible (ítems físicos parados o fluyendo) y la contrapresión es la única señal de control; el cuello de botella se ve como el punto donde la cinta pasa de espaciada a compactada.

### Cited Findings
- Cada cinta guarda ≤3 ítems con separación mínima 0.4 y solo consulta a la siguiente (`pass`/`acceptItem`) — Conveyor.java [FUENTE]. No existe grafo global ni planificador de rutas.
- Las cintas no filtran tipo: aceptan cualquier ítem hasta llenar capacidad (`acceptItem` no comprueba tipo) — Conveyor.java [FUENTE]. Mezclar es posible; el bloqueo por cabeza es la consecuencia.
- Los bloques de ruteo comparten la interfaz `acceptItem/handleItem` (Router, Sorter, OverflowGate, Junction, Bridge), por lo que cualquiera conecta con cualquiera — archivos citados arriba [FUENTE].
- El stat de velocidad de la cinta está fijado en código (`displayedSpeed`), y no hay medidor de rendimiento nativo en la info mostrada de bloques que yo haya verificado — Conveyor.java / Blocks.java [FUENTE]; que Mindustry carezca de medidor de ítems/s en pantalla es folklore no confirmado aquí.

### Inferences
- Principios (propios, a partir del código): (1) interacción local; (2) contrapresión como único control; (3) ítems visibles como estado; (4) reglas asimétricas para prioridad (trasera > lateral); (5) bloques pequeños, composición libre; (6) unidad de tiempo implícita (el espaciado), sin colas ocultas.
- Un cuello de botella se descubre porque aguas arriba la cinta se ve llena y aguas abajo vacía/espaciada; no hace falta UI.
- Lección: evitar contadores de buffer invisibles; que el atasco sea espacial.

### Gaps
- No encontré declaraciones de Anuken sobre estas decisiones de diseño (devlogs/itch no consultados).
- No consulté la wiki oficial ni Reddit en profundidad.

## 4. Tablas de rendimiento, heurísticas de ratio y patrones estándar (filtrado, prioridad, cruces, anti-mezcla)

### Takeaway
Tengo cifras de código y derivaciones, pero las heurísticas de ratio de taladros por cinta y patrones comunitarios los dejo mayormente sin fuente verificada.

### Cited Findings
Tabla de referencia (ítems/s):
- Cinta básica: mostrado 4.2 [FUENTE]; techo teórico 4.5 [DERIVADO]
- Cinta de titanio / armored: mostrado 11 [FUENTE]; techo teórico 12 [DERIVADO]
- Bridge conveyor: ~11.35 [DERIVADO: 14/74*60]; comunidad ~11–13 [FOLKLORE]; cuatro puentes en línea "44/s" afirmado en [Reddit](https://redlib.snake-cloud.ts.net/r/Mindustry/comments/1dhrb30/bridge_conveyor_good_substitute_for_normal) y [guía](https://game-platform-web-5a2.pages.dev/en/mindustry/block/bridge-conveyor) [FOLKLORE, no verificado]
- Router: ≤7.5 [DERIVADO]
- Junction: ≤~13.8 por dirección [DERIVADO]
- Plastanio: 37–40 comunitario [FOLKLORE]
- Patrones: sorter inline para filtrar; overflow gate delante para dar prioridad al frente y desbordar a lados; underflow al revés; junction/bridge para cruzar; overflow gate sobre línea de plastanio llena — comportamiento de bloques [FUENTE]; los patrones nombrados como "estándar comunitario" son folklore salvo el consejo del gate en plastanio ([guía](https://www.mindustryschematics.com/guides/plastanium-converyors-and-how-to-use-them.md)).

### Inferences
- Heurística: ratio taladros/cinta = (ítems/s de cinta) / (ítems/s por taladro); ejemplo posible, pero no tengo la tasa de taladro verificada, así que no la cuantifico.
- Para evitar mezcla: un sorter por salida, y overflow/underflow final hacia sumidero; la prevención es cosa del jugador, no del motor.

### Gaps
- Ratios de taladros por cinta, loops de belts, balanceo, "batch" de plastanio más allá de lo citado: no cubiertos por fuentes leídas.
- Sin tutoriales de Reddit/Steam leídos a fondo (resultados de búsqueda solo parciales).

## 5. Quejas conocidas, mitigaciones y diferencias v7/v8

### Takeaway
No obtuve fuentes verificables sobre quejas ni diferencias de v8/BE; solo dejo señales.

### Cited Findings
- Hilos Reddit citados en búsqueda sugieren discusión de velocidad real y de ítems saltados: [diagonal conveyors faster](https://cal1.lr.ggtyler.dev/r/Mindustry/comments/1fwngsx/diagonal_conveyer_are_faster), [belts skipping items](https://redlib.belloworld.it/r/Mindustry/comments/1far0du/how_to_stop_belts_from_skipping_items/llwqvyy/?context=3) — solo títulos vistos, contenido no leído [FOLKLORE]
- Comunidad dice que "titanium-conveyor es más lento que bridge-conveyor por diferencia de fps" — fuente: [hilo Reddit](https://redlib.snake-cloud.ts.net/r/Mindustry/comments/1dhrb30/bridge_conveyor_good_substitute_for_normal) [FOLKLORE, de segunda mano]

### Inferences
- El comentario del código sobre "velocidad no lineal" y la dependencia de `edelta()` (delta de frame) apuntan a que las tasas reales varían con el timeScale/fps; esto encaja con esas quejas, pero es especulación mía.

### Gaps
- Diferencias v8/BE: no investigadas. Medidores de rendimiento y mods/schematics que mitigan router chains: no investigados. Wiki oficial (el enlace /wiki/logic/ dio 404) y devlogs de Anuken no leídos.
