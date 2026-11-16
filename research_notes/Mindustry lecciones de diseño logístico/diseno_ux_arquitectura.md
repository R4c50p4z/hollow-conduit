# Mindustry: por qué funciona como conjunto de diseño e ingeniería (arquitectura, UX de construcción móvil, legibilidad, progresión)

Notas sobre Mindustry v7 (build 146; las citas de código apuntan a la etiqueta `v146`). Todo lo que no lleva fuente es inferencia mía y está en "Inferencias". No se pudo contrastar nada de v8/BE (ver Gaps). Los términos de Mindustry van en inglés entre paréntesis.

Convención de URLs de código: base `https://raw.githubusercontent.com/Anuken/Mindustry/v146/core/src/mindustry/`

## 1. Arquitectura de simulación (reglas locales, sin solver global)

### Takeaway
Cada bloque (`Building`) se actualiza solo en su propio `update()` y solo habla con sus vecinos adyacentes (`proximity`); no hay solver global de flujo. La contrapresión, el atasco y la distribución surgen de reglas locales de aceptación (`acceptItem`) y de buffers pequeños en cada bloque.

### Cited Findings
- `BuildingComp.update()` llama a `updateConsumption()` y luego a `updateTile()` (si `enabled` o el bloque no tiene `noUpdateDisabled`). Es el único punto de entrada por bloque por tick. — [BuildingComp.java](https://raw.githubusercontent.com/Anuken/Mindustry/v146/core/src/mindustry/entities/comp/BuildingComp.java)
- `proximity` es una `Seq<Building>` (capacidad inicial 6) reconstruida por `updateProximity()` mirando los bordes del bloque con `world.build(...)`; descarta nulos y edificios de otro equipo; cada bloque se añade a la lista del vecino y dispara `onProximityAdded()/onProximityUpdate()`. — [BuildingComp.java](https://raw.githubusercontent.com/Anuken/Mindustry/v146/core/src/mindustry/entities/comp/BuildingComp.java)
- La proximidad se recalcula solo cuando cambia el mapa (colocar/quitar), no cada tick. En `World.endMapLoad()` se llama `updateProximity()` en cada build tras cargar. — [World.java](https://raw.githubusercontent.com/Anuken/Mindustry/v146/core/src/mindustry/core/World.java)
- `dump(Item)` recorre `proximity` desde un puntero rotatorio `cdump` y entrega UN ítem al primer vecino que pasa `acceptItem` y `canDump`; `moveForward` pasa al `front()` si acepta. `acceptItem` por defecto es `block.consumesItem(item) && items.get(item) < getMaximumAccepted(item)`: el vecino decide. — [BuildingComp.java](https://raw.githubusercontent.com/Anuken/Mindustry/v146/core/src/mindustry/entities/comp/BuildingComp.java)
- Cada bloque tiene `itemCapacity` por defecto 10 (buffer propio). — [Block.java](https://raw.githubusercontent.com/Anuken/Mindustry/v146/core/src/mindustry/world/Block.java)
- Tiempo: `delta()` = `Time.delta * timeScale` y `edelta()` = `efficiency * delta()`; la velocidad de proceso escala continuamente con la eficiencia. `efficiency` es el mínimo de los consumidores no opcionales (degradación suave, no binaria). — [BuildingComp.java](https://raw.githubusercontent.com/Anuken/Mindustry/v146/core/src/mindustry/entities/comp/BuildingComp.java)
- Bucle principal: `Logic.update()` salta todo el bloque de simulación si `state.isPaused()` (los ticks, el temporizador de oleadas y las entidades se detienen), y al final llama `Groups.update()`. El temporizador de oleadas descuenta `Time.delta`. — [Logic.java](https://raw.githubusercontent.com/Anuken/Mindustry/v146/core/src/mindustry/core/Logic.java)
- Sueño de bloques: `sleep()` acumula `Time.delta` en `sleepTime`; al llegar a `timeToSleep` (60 ticks) el edificio sale de la lista de actualización; `noSleep()` lo reactiva (se llama desde `onProximityUpdate`, `handleStack`, `removeStack`). — [BuildingComp.java](https://raw.githubusercontent.com/Anuken/Mindustry/v146/core/src/mindustry/entities/comp/BuildingComp.java)
- La cinta (`Conveyor`) usa si `len == 0` reinicia `clogHeat` y se duerme; guarda los ítems en arrays paralelos `ids/xs/ys` (capacidad `capacity = 3`, separación `itemSpace = 0.4f`), cada ítem avanza `speed * edelta()` limitado a `itemSpace` detrás del anterior; `minitem` de la cinta siguiente (`nextc.minitem`) limita el avance. `acceptItem` rechaza si está llena: desde atrás exige `minitem >= itemSpace`, de lado `minitem > 0.7`. Eso ES la contrapresión: una cinta llena deja de aceptar y la presión se propaga hacia atrás vecino a vecino. — [Conveyor.java](https://raw.githubusercontent.com/Anuken/Mindustry/v146/core/src/mindustry/world/blocks/distribution/Conveyor.java)
- Guardado de cintas: `write()` empaqueta cada ítem en un entero (id + `xs`/`ys` cuantizados); `read()` los desempaqueta y llama `updateTile()`. Comentario en código: "keep draw position deterministic" (el orden de dibujo se deriva de la posición). — [Conveyor.java](https://raw.githubusercontent.com/Anuken/Mindustry/v146/core/src/mindustry/world/blocks/distribution/Conveyor.java)
- Almacenamiento del mundo: `Tiles` plano con índice `x + y*width`; `world.build(x,y)` = `tile.build`. En World.java no hay chunking de simulación (el comentario fuente de `addDarkness` dice "TODO optimize; this is very slow and called too often!"). — [World.java](https://raw.githubusercontent.com/Anuken/Mindustry/v146/core/src/mindustry/core/World.java)
- Router: `itemCapacity` 1, solo acepta si está vacío (`lastItem == null`), espera `speed = 8` ticks antes de pasar a otro router/bloque instantáneo, y reparte round-robin con el puntero `rotation` sobre `proximity`; no excluye la fuente (salvo overflow gate), por lo que puede devolver el ítem a la cinta de origen. — [Router.java](https://raw.githubusercontent.com/Anuken/Mindustry/v146/core/src/mindustry/world/blocks/distribution/Router.java)
- Mismo problema de rendimiento en Factorio resuelto distinto: líneas de transporte agrupadas guardando huecos entre ítems en vez de posiciones, actualización O(1) por extremos; "whenever a belt compresses - it will stay that way forever"; ganancia declarada de 5-10x general. Contraste útil: Factorio optimiza con una estructura global de "líneas", Mindustry con bloques locales independientes. — [Factorio FFF-176](https://factorio.com/blog/post/fff-176)

### Inferences
- Como cada bloque solo conoce su `proximity` y un `acceptItem` booleano, el coste por tick es O(nº de bloques activos) y el fallo es local: un bloque lleno simplemente no acepta; no existe estado global que se pueda "romper". (Inferencia mía a partir del código.)
- El "sleep" tras 60 ticks sin actividad es el mecanismo principal para escalar a miles de bloques: la mayoría de cintas vacías cuestan casi nada. La reactivación vía proximidad hace que sea invisible para el jugador.
- El estado de las cintas serializado como enteros por ítem (no recalculado) hace el guardado barato y reproduce exactamente el estado visible tras cargar; para un juego móvil con guardado frecuente (suspensión de app) esta propiedad es crítica.
- Transferible: un modelo "buffer pequeño + `acceptItem` + empujar solo al vecino" da back-pressure gratis y es trivial de depurar; la degradación suave es `velocidad *= eficiencia` en lugar de `if(!ok) parar`.

### Gaps
- No pude confirmar cómo se hace el batching/intervalos de actualización a nivel de `Groups`/`EntityGroup` ni si hay actualización por intervalos (p.ej. `Interval timer`) para cierto tipo de bloques: el excerpt de `Groups` no se recuperó. Tampoco vi el tick fijo exacto (60 ticks/s se infiere de `timeToSleep = 60` y del uso de `Time.delta`, pero no lo verifiqué en `Time.java`).
- Determinismo estricto (lockstep) no verificado; Mindustry multijugador usa servidor autoritativo con sincronización (`sync`), no lockstep. No lo confirmé con fuente.
- Existe `readme`/comentarios de Anuke sobre su filosofía de arquitectura (p.ej. el artículo de "Entity Components" con `@Component`/anotaciones `comp`) que no se recuperaron.

## 2. UX de construcción (escritorio y, sobre todo, móvil)

### Takeaway
La colocación es un sistema de planes (`BuildPlan`) en cola: se previsualiza, se valida bloque a bloque con color, se confirma, y construye el núcleo/unidades con consumo progresivo de recursos. En móvil se separan explícitamente modos (colocar / romper / seleccionar esquema) con botones grandes y una acción de confirmar, y el arrastre largo genera líneas con enrutado A*.

### Cited Findings
- Colocación en línea: `InputHandler.updateLine/iterateLine` genera planes por cada punto; modo recto con `Placement.normalizeLine` ("Normalize two points into one straight line, no diagonals"); modo diagonal con `Placement.pathfindLine`, que usa A* (4 vecinos, límite de 1000 nodos); coste: tile bloqueado/agua profunda 20, giro 8, resto 1; si falla vuelve a línea recta. La rotación de cada tile de la línea se deriva de la dirección al siguiente punto. — [InputHandler.java](https://raw.githubusercontent.com/Anuken/Mindustry/v146/core/src/mindustry/input/InputHandler.java), [Placement.java](https://raw.githubusercontent.com/Anuken/Mindustry/v146/core/src/mindustry/input/Placement.java)
- Auto-puentes: `calculateBridges` convierte tramos de la línea en puentes (`ItemBridge`/`DirectionBridge`) cuando hay hueco no colocable dentro de rango, configurando la dirección del enlace. — [Placement.java](https://raw.githubusercontent.com/Anuken/Mindustry/v146/core/src/mindustry/input/Placement.java)
- Auto-conexión visual de cintas: `blends()` + `buildBlending()` fijan `blendbits` que eligen la variante de sprite (curvas, entradas laterales); `onProximityUpdate` recalcula `next`, `nextc`, `aligned`. Es decir, la forma visual se deduce de los vecinos, no se guarda. — [Conveyor.java](https://raw.githubusercontent.com/Anuken/Mindustry/v146/core/src/mindustry/world/blocks/distribution/Conveyor.java)
- Reemplazo en el sitio: `Block.canReplace` exige mismo `BlockGroup` (no `none`) y tamaño compatible; `Build.validPlace` permite sobreponer si el nuevo bloque puede reemplazar el existente y su huella cubre la del antiguo; con la opción `blockreplace`, `updateLine` cambia el bloque de cada plan por `getReplacement` (mejorar cinta arrastrando encima). — [Block.java](https://raw.githubusercontent.com/Anuken/Mindustry/v146/core/src/mindustry/world/Block.java), [Build.java](https://raw.githubusercontent.com/Anuken/Mindustry/v146/core/src/mindustry/world/Build.java), [InputHandler.java](https://raw.githubusercontent.com/Anuken/Mindustry/v146/core/src/mindustry/input/InputHandler.java)
- Validez: `Build.validPlace` comprueba unidades ocupando, protección de núcleo enemigo, oscuridad de campaña, niebla estática, suelo (agua profunda), `canPlaceOn`, y reemplazo. — [Build.java](https://raw.githubusercontent.com/Anuken/Mindustry/v146/core/src/mindustry/world/Build.java)
- Color de validez: `Block.drawPlan` tiñe con `Pal.breakInvalid` si es inválido (blanco si es válido) con un pulso `Mathf.absin`; `drawPlaceText` usa `Pal.accent` válido y `Pal.remove` inválido. — [Block.java](https://raw.githubusercontent.com/Anuken/Mindustry/v146/core/src/mindustry/world/Block.java)
- Construcción: `ConstructBlock` es un bloque marcador (`build1..N`) con `progress` 0..1 y acumuladores fraccionales por requisito; `construct` toma ítems del núcleo en proporción al progreso y se detiene si faltan; `deconstruct` devuelve `deconstructRefundMultiplier` × coste (solo ítems desbloqueados y hasta la capacidad del núcleo); al terminar, la salud conserva la fracción del edificio previo (`healthf`). El shader `Shaders.blockbuild` dibuja el progreso y el color va de `Pal.accent` a `Pal.remove` al deconstruir. — [ConstructBlock.java](https://raw.githubusercontent.com/Anuken/Mindustry/v146/core/src/mindustry/world/blocks/ConstructBlock.java)
- Reconstrucción: los bloques destruidos se guardan en `team.data().plans` (bloques con `rebuildable = true`); `rebuildArea` encola un `BuildPlan` por cada plan de equipo dentro de la selección; `removeSelection` borra planes de la cola/equipo. — [InputHandler.java](https://raw.githubusercontent.com/Anuken/Mindustry/v146/core/src/mindustry/input/InputHandler.java), [Block.java](https://raw.githubusercontent.com/Anuken/Mindustry/v146/core/src/mindustry/world/Block.java)
- Esquemas (`Schematics`): formato binario con cabecera `msch`, versión 1, DEFLATE, dimensiones (máx. 128x128), mapa de etiquetas, diccionario de nombres de bloque y por tile (índice, posición, config, rotación); `rotate` en pasos de 90°; compartir como base64 (empieza por `bXNjaAB`); en móvil la caché de previews se recorta a 32 entradas cada 2 s. Al ser nombres + config + rotación (no ids numéricos), el formato es robusto a versiones. — [Schematics.java](https://raw.githubusercontent.com/Anuken/Mindustry/v146/core/src/mindustry/game/Schematics.java)
- Móvil (`MobileInput`): `mode` ∈ {none, placing, breaking, schematicSelect, rebuildSelect}; tocar en `placing` añade un `BuildPlan` a `selectPlans`; tocar un plan existente lo quita; botón de confirmar (check/llave) pasa los planes válidos a la cola del jugador y los antiguos "se desvanecen" (`removals`, comentario "move all current plans to removal array so they fade out"); botones: romper (martillo), alternar diagonal (`swapdiagonal`), rotar, confirmar, cancelar 155x50, panel de esquemas con guardar/cancelar/flipX/flipY/rotar. — [MobileInput.java](https://raw.githubusercontent.com/Anuken/Mindustry/v146/core/src/mindustry/input/MobileInput.java)
- Móvil, arrastre: pulsación larga fuera de `none` activa `lineMode` y ancla `lineStartX/Y`; la línea solo cuenta si arrastras >=3 tiles (`isLinePlacing`) y borrado por área >=2 (`isAreaBreaking`); al soltar se vuelcan los `linePlans`. Con planes seleccionados, tocar uno y arrastrar mueve todo el grupo; si no, arrastrar panea la cámara. Pellizco = zoom (`renderer.setScale`), con auto-pan en bordes (`edgePan`, `maxPanSpeed = 1.3f`). — [MobileInput.java](https://raw.githubusercontent.com/Anuken/Mindustry/v146/core/src/mindustry/input/MobileInput.java)
- Móvil, rotación: manual por botón, `rotation = (rotation + 1) % 4`; solo si el bloque rota. Doble toque: configura/posee; toque simple en vacío: empieza a minar (salvo `doubletapmine`). Pulsación larga en modo `none`: disparo manual o selección por rectángulo en modo comando. — [MobileInput.java](https://raw.githubusercontent.com/Anuken/Mindustry/v146/core/src/mindustry/input/MobileInput.java)
- Opinión/recepción (agregador, no primaria): reseñas dicen que los controles táctiles están "generalmente bien optimizados" pero hay pedidos de mejora, sobre todo en el tutorial; un jugador reporta 10 fps con muchos enemigos. — [Vaporlens/Steam summary vía búsqueda](https://vaporlens.app/app/1127400/mindustry)

### Inferences
- Lo que hace sentir bien en táctil (inferencia): (1) separar modos con botones persistentes en vez de gestos ocultos; (2) pasar por una cola de planes con confirmación (se puede corregir antes de gastar nada, y el gasto es progresivo); (3) umbral de arrastre mínimo (3 tiles) para evitar líneas accidentales; (4) un dedo mueve el grupo de planes, así que se puede reubicar sin deshacer; (5) A* con penalización de giros produce líneas con pocas curvas, que es lo que haría un humano.
- El reembolso parcial + reemplazo en el sitio + reconstrucción automática reducen el coste emocional de experimentar (sin penalización de reorganizar). Es la "sensación de seguridad" que busca un diseño sin estrés.
- El esquema como lista de nombres + rotación + config, sin ids numéricos, es una buena práctica de formato para blueprints de la app.

### Gaps
- No leí `DesktopInput.java` ni `Autotiler`; no verifiqué los atajos de escritorio ni si el espejo (flip) vive en `InputHandler.flipPlans` (se menciona `rotatePlans`/`flipPlans`, sin más detalle).
- No encontré el valor de `deconstructRefundMultiplier` (el excerpt de `Rules` no se leyó; por defecto suele ser 0.5, pero NO lo verifiqué).
- No tengo fuente primaria de Anuke sobre sus decisiones de UX móvil (devlogs, itch.io, Reddit); solo código y reseñas. No pude leer el texto completo de Android Central.

## 3. Feedback y legibilidad

### Takeaway
El estado se comunica con color y animación en el propio bloque (ítems visibles en cintas, barras de líquido/energía, estado verde/naranja/rojo), no con paneles globales. Lo que falta es una medición cuantitativa de caudal.

### Cited Findings
- `BlockStatus` tiene 4 valores: `active` (verde `5ce677`), `noOutput` (naranja), `noInput` (`Pal.remove`, rojo), `logicDisable` (morado `8a73c6`). `BuildingComp.status()` devuelve `noOutput` cuando no consume, `noInput` si la eficiencia es 0 o la producción no es válida, y `active` o `noInput` alternando según un ciclo por tick comparado con `efficiency` (así un bloque con 50% de eficiencia parpadea entre estados). — [BlockStatus.java](https://raw.githubusercontent.com/Anuken/Mindustry/v146/core/src/mindustry/world/meta/BlockStatus.java), [BuildingComp.java](https://raw.githubusercontent.com/Anuken/Mindustry/v146/core/src/mindustry/entities/comp/BuildingComp.java)
- Barras: `Block.setBars()` añade barra de salud, de energía si hay `consPower`, de ítems si `hasItems && configurable`, y barras de líquido; `addBar/removeBar/addLiquidBar` permiten personalizar. — [Block.java](https://raw.githubusercontent.com/Anuken/Mindustry/v146/core/src/mindustry/world/Block.java)
- Cintas: cada ítem se dibuja en su posición real (`xs`, `ys`), los tramos laterales se pintan en capa inferior, y la animación de frames usa `speed`. El atasco se mide con `clogHeat` (sube cuando `minitem < itemSpace`). — [Conveyor.java](https://raw.githubusercontent.com/Anuken/Mindustry/v146/core/src/mindustry/world/blocks/distribution/Conveyor.java)
- La estadística de caudal de la cinta es un valor aparte (`displayedSpeed`) que solo se usa en la ficha ("setStats"), porque la velocidad real de movimiento no es lineal; es decir, el juego muestra un valor teórico de la ficha, no un caudal medido. — [Conveyor.java](https://raw.githubusercontent.com/Anuken/Mindustry/v146/core/src/mindustry/world/blocks/distribution/Conveyor.java)
- Construcción: shader de progreso y cambio de color acento/remove al deconstruir (ver sección 2). — [ConstructBlock.java](https://raw.githubusercontent.com/Anuken/Mindustry/v146/core/src/mindustry/world/blocks/ConstructBlock.java)
- Comparación: en otros juegos del género los jugadores fabrican su propio medidor de caudal (Factorio: combinadores/mod Belt Counter 3.0; Satisfactory: mod Throughput Counter and Limiter), lo que indica una demanda recurrente. — [resultados de búsqueda: Belt Counter 3.0](https://mods.factorio.com/mod/beltcounter3), [Throughput Counter and Limiter](https://www.mado-hosting.com/de/satisfactory-mods/CounterLimiter)

### Inferences
- El estado en colores fijos (verde / naranja / rojo) con semántica distinta (naranja = salida bloqueada, rojo = sin entrada) permite diagnosticar el cuello de botella con un vistazo: busca el primer naranja aguas arriba y el primer rojo aguas abajo. Es la base de la "optimización satisfactoria" (opinión/inferencia mía).
- Los parpadeos alternados según eficiencia dan una lectura analógica del estado sin añadir un widget.
- Hueco real: la ficha muestra un caudal teórico y el juego no muestra caudal medido; para la app propia, un overlay de presión/"podredumbre" ya cubre este hueco de forma más legible.

### Gaps
- No encontré una petición concreta de la comunidad de Mindustry (Reddit/GitHub issues) pidiendo un medidor de caudal; la búsqueda solo devolvió peticiones de otros juegos. Marcar como "no verificado" que la comunidad lo pida en Mindustry.
- No verifiqué el panel de estadísticas de unidad/bloque (`StatValues`), los iconos de alerta de daño/enemigos ni el color/relleno de líquidos (`LiquidModule`/`Drawf`).
- No hay en estas notas una descripción de las capas de overlay de Mindustry (p.ej. mapa de conexión de energía) que serían análogas a un overlay de presión.

## 4. Progresión y ritmo

### Takeaway
La campaña encadena sectores y un árbol de investigación donde cada nodo requiere un objetivo (completar sector, investigar otro bloque); la logística básica (cinta → cruce → router) abre los sectores siguientes, y el núcleo es a la vez almacén, fuente de construcción y meta de mejora.

### Cited Findings
- Estructura del árbol de Serpulo: raíz `coreShard`; rama logística `conveyor → junction → router → (sorter, distributor, container, itemBridge, launchPad)`; producción `mechanicalDrill → bombas, conductos, graphitePress, energía, fundición`; torretas `duo → paredes, scatter, hail, salvo, lancer`; unidades `groundFactory → dagger/nova/crawler`; cadena de sectores `groundZero → frozenForest → craters → ruinousShores → windsweptIslands → tarFields → impact0078 → desolateRift → planetaryTerminal`. — [SerpuloTechTree.java](https://raw.githubusercontent.com/Anuken/Mindustry/v146/core/src/mindustry/content/SerpuloTechTree.java)
- Objetivos de desbloqueo: `SectorComplete(sector)` y `Research(content)`. Ejemplos: `frozenForest` exige completar `groundZero` e investigar `junction` y `router`; `craters` exige `frozenForest`, `mender`, `combustionGenerator`; `launchPad` exige `SectorComplete(extractionOutpost)`; `thoriumReactor` exige investigar criofluido. — [SerpuloTechTree.java](https://raw.githubusercontent.com/Anuken/Mindustry/v146/core/src/mindustry/content/SerpuloTechTree.java)
- El núcleo es un inventario compartido: almacenes adyacentes se enlazan a su `ItemModule`; `storageCapacity` suma la capacidad propia y la de los almacenes; con `coreIncinerates` acepta hasta 20x la capacidad y destruye el exceso con efecto visual. Los ítems del núcleo financian la construcción. La mejora de núcleo (`coreFoundation → coreNucleus`) consume sus requisitos y conserva el resto. — [CoreBlock.java](https://raw.githubusercontent.com/Anuken/Mindustry/v146/core/src/mindustry/world/blocks/storage/CoreBlock.java)
- Costes de construcción: `buildCost` = suma de (cantidad × `item.cost`) × `buildCostMultiplier` (por defecto 20); el tiempo de construcción crece con el coste de materiales. — [Block.java](https://raw.githubusercontent.com/Anuken/Mindustry/v146/core/src/mindustry/world/Block.java)
- Descripción oficial de campaña: dos campañas (Serpulo y Erekir), 35 mapas hechos a mano y más de 250 sectores procedurales, fábricas que producen mientras juegas otros sectores, defensa de sectores contra invasiones periódicas, distribución entre sectores con plataformas de lanzamiento, 250+ bloques tecnológicos. — [Steam](https://store.steampowered.com/app/1127400)
- Recepción (reseñas agregadas, opinión): la progresión del árbol gusta en general; hay quejas de "curva de dificultad del tutorial" y de poca guía; una reseña dice que la investigación en campaña es instantánea pero cara; otra critica que el árbol de Erekir se desbloquea pronto al investigar torio/tejido de fase (reseña individual). — [Vaporlens](https://vaporlens.app/app/1127400/mindustry), [búsqueda de reseñas](https://planet.freegamedev.net/?p=53173)

### Inferences
- El patrón "bloque nuevo = respuesta a un problema que acabas de sentir" (junction + router antes de la segunda zona; mender + generador antes de craters) es una forma de introducción gradual: los requisitos obligan a haber usado la mecánica antes de entrar al reto que la necesita. (Inferencia a partir de los requisitos del árbol.)
- Núcleo como almacén y fuente de construcción da un bucle "extraer → entregar al núcleo → gastar" con una sola métrica visible (inventario), y el incinerado evita atascar por exceso (soft failure).
- "Una cosa más": producir mientras juegas otro sector + amenazas periódicas crean múltiples objetivos pendientes (opinión mía, sin fuente directa).

### Gaps
- No obtuve los costes de investigación (`ItemStack`s), la curva de amenaza (`SpawnGroup`/`waves`) ni datos de ritmo; el `SerpuloTechTree` solo contiene prerrequisitos, no costes.
- No hay fuente primaria de Anuke sobre cómo diseñó el ritmo de introducción; no se leyeron los mapas/objetivos del tutorial de `groundZero`.
- No cubrí Erekir (ductos, logística sin mezcla, 'duct router') más allá de una mención; la progresión de Erekir queda sin analizar.

## 5. Principios de game feel y críticas conocidas

### Takeaway
Los jugadores y reseñas reconocen el valor de la automatización profunda con control manual, pero las quejas se concentran en: curva de aprendizaje empinada con poca guía, el comportamiento caótico de routers encadenados y los controles de unidad confusos. Las soluciones comunitarias (compuertas de desborde, selectores invertidos) muestran un hueco de diseño.

### Cited Findings
- Cadenas de routers: según un hilo de r/Mindustry, el problema no es el router sino encadenar muchos; un comentario afirma (anécdota, sin medir) que con 5 routers en serie el último recibe menos del 10% de la entrada; otro atribuye el fallo a que el router devuelve ítems a la fuente ("router pass back"); soluciones: overflow/underflow gates y sorters. — [r/Mindustry (espejo)](https://axebps-redlib.hf.space/r/Mindustry/comments/18gsfqd/can_anyone_explain_whats_wrong_with_the_router), [guía Steam](https://steamcommunity.com/sharedfiles/filedetails/?id=3031727399)
- Reglas de encadenado: un ítem solo puede atravesar dos bloques del grupo sorter/overflow seguidos, y luego necesita un bloque "normal" intermedio (según una guía de la comunidad, no verificado en código). — [guía Steam](https://steamcommunity.com/sharedfiles/filedetails/?id=3031727399)
- Cintas que "saltan" ítems en cruces: hilos de 2024 recomiendan routers/overflow/underflow o un sorter invertido en la conexión. — [r/Mindustry (espejo)](https://redlib.belloworld.it/r/Mindustry/comments/1far0du/how_to_stop_belts_from_skipping_items/)
- Reseñas (Steam, agregadas): dificultad del tutorial, curva empinada, "unit control" torpe porque se solapa con los controles de construcción en PC, caídas de fps con muchos enemigos en móvil. — [Vaporlens](https://vaporlens.app/app/1127400/mindustry)
- Referencia de Factorio: la compresión de cinta es "emergent gameplay"; en 0.16 se quitó la compresión por sideloading/subterráneos y los jugadores discutieron la falta de formas simples de comprimir. — [FFF-231](https://factorio.com/blog/post/fff-231) (título y fragmentos; no leí el artículo completo)
- Factorio optimizó las cintas para que el jugador "nunca necesite subterráneas por rendimiento" (objetivo declarado de FFF-176) — el rendimiento técnico no debe forzar decisiones de diseño. — [FFF-176](https://factorio.com/blog/post/fff-176)

### Inferences
- Router "mágico": el router mezcla las funciones de distribuir, mezclar y devolver; tener un único bloque que hace 3 cosas con reglas ocultas produce confusión (inferencia mía: separar en bloques de una sola función, como hace Erekir con ductos, ver Gaps).
- Críticas a no copiar: tutorial débil, controles de unidad vs construcción solapados, comportamiento no determinista/intuitivo de routers, falta de medición de caudal.
- No encontré críticas específicas de "UI saturada" ni "picos de dificultad" con fuente fiable; se mencionan solo de forma indirecta (tutorial, curva empinada).

### Gaps
- Nada de Shapez, Satisfactory ni Oxygen Not Included analizados (no se buscaron por límite de llamadas). Faltan análisis de diseñadores sobre contrapresión/cuellos de botella.
- Sin reseñas profesionales (PC Gamer, Rock Paper Shotgun) leídas.
- "Pathfinding quirks" de enemigos: no investigado.

## 6. Reglas de diseño transferibles (con evidencia)

### Takeaway
Reglas prácticas para un juego iPhone de conductos con progresión exponencial: fallos locales y visibles, cada bloque es un buffer, degradación suave, previsualización con validez, cola de planes con confirmación, reembolso/reemplazo para experimentar sin miedo, blueprints portables, y un indicador de caudal explícito.

### Cited Findings
- (R1) Hacer los fallos locales y visibles: `acceptItem` local + `status()` con colores distintos por causa. — [BuildingComp.java](https://raw.githubusercontent.com/Anuken/Mindustry/v146/core/src/mindustry/entities/comp/BuildingComp.java), [BlockStatus.java](https://raw.githubusercontent.com/Anuken/Mindustry/v146/core/src/mindustry/world/meta/BlockStatus.java)
- (R2) Cada bloque es un buffer: `itemCapacity` 10 por defecto, cinta de 3 ítems con `itemSpace` 0.4. — [Block.java](https://raw.githubusercontent.com/Anuken/Mindustry/v146/core/src/mindustry/world/Block.java), [Conveyor.java](https://raw.githubusercontent.com/Anuken/Mindustry/v146/core/src/mindustry/world/blocks/distribution/Conveyor.java)
- (R3) Degradación suave: `edelta()` = eficiencia × delta; núcleo incinera el exceso en vez de bloquear. — [BuildingComp.java](https://raw.githubusercontent.com/Anuken/Mindustry/v146/core/src/mindustry/entities/comp/BuildingComp.java), [CoreBlock.java](https://raw.githubusercontent.com/Anuken/Mindustry/v146/core/src/mindustry/world/blocks/storage/CoreBlock.java)
- (R4) Previsualización con validez y pulso de color. — [Block.java](https://raw.githubusercontent.com/Anuken/Mindustry/v146/core/src/mindustry/world/Block.java)
- (R5) Reemplazar en el sitio, reembolso, conservar salud, reconstrucción de destruidos. — [ConstructBlock.java](https://raw.githubusercontent.com/Anuken/Mindustry/v146/core/src/mindustry/world/blocks/ConstructBlock.java), [InputHandler.java](https://raw.githubusercontent.com/Anuken/Mindustry/v146/core/src/mindustry/input/InputHandler.java)
- (R6) Modo explícito + confirmación + umbral de arrastre en móvil. — [MobileInput.java](https://raw.githubusercontent.com/Anuken/Mindustry/v146/core/src/mindustry/input/MobileInput.java)
- (R7) Enrutado asistido con penalización de giros. — [Placement.java](https://raw.githubusercontent.com/Anuken/Mindustry/v146/core/src/mindustry/input/Placement.java)
- (R8) Blueprints portables y robustos a versiones. — [Schematics.java](https://raw.githubusercontent.com/Anuken/Mindustry/v146/core/src/mindustry/game/Schematics.java)
- (R9) Progresión que obliga a dominar una mecánica antes de abrir la siguiente. — [SerpuloTechTree.java](https://raw.githubusercontent.com/Anuken/Mindustry/v146/core/src/mindustry/content/SerpuloTechTree.java)

### Inferences
- Añadir, para la app propia, lo que Mindustry no hace: indicador de caudal medido (el campo `displayedSpeed` de Mindustry es un valor teórico) y overlay de presión (generalizar `clogHeat`); permitiría "optimización satisfactoria" sin hojas de cálculo.
- Evitar bloques "mágicos" con reglas ocultas (router): preferir bloques de una sola función con comportamiento determinista.
- Con progresión exponencial, el tamaño de buffer y la velocidad de bloques deberían escalar también para mantener la legibilidad (inferencia mía; sin fuente).
- Para un uso con una mano en iPhone: botones de modo en el borde inferior, confirmar con un solo toque y un arrastre largo para líneas, siguiendo el esquema de `MobileInput` (inferencia).

### Gaps
- Sin evidencia de pruebas con usuarios ni medidas del "feeling" móvil; todo lo de UX táctil es lectura de código más reseñas agregadas.
- Diferencias v8/BE (build 147+/BE) no investigadas: no puedo indicar qué cambió en input, esquemas o árbol tecnológico.
- No se consultaron fuentes primarias de Anuke (devlogs, itch.io, Reddit AMA, GDC).
