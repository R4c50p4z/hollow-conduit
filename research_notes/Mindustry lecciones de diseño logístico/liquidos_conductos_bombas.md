# Sistema de líquidos de Mindustry (conductos, bombas, tanques, puentes, fugas)

Fuente primaria: código oficial en GitHub, etiqueta v146 (build 146 estable), rama master comparada solo para `moveLiquid`.
Base: https://github.com/Anuken/Mindustry/tree/v146/core/src/mindustry
Archivos leídos: `entities/comp/BuildingComp.java`, `world/blocks/liquid/{Conduit,ArmoredConduit,LiquidRouter,LiquidBridge,LiquidJunction,LiquidBlock}.java`, `world/blocks/production/{Pump,SolidPump}.java`, `world/modules/LiquidModule.java`, `entities/Puddles.java`, `entities/comp/PuddleComp.java`, `content/{Blocks,Liquids}.java`, `world/blocks/distribution/ItemBridge.java`, `world/consumers/ConsumeLiquid.java`.
Unidades: el juego corre a 60 ticks/s. Las "unidades de líquido" (u) son floats; u/tick x 60 = u/s. Los números de pumpAmount se muestran en juego como u/s.

## 1. Algoritmo de flujo (moveLiquid / dumpLiquid)

### Takeaway
No hay presión global ni red de tuberías: cada edificio, en su propio `update`, empuja líquido a UN vecino comparando fracciones de llenado (cantidad/capacidad). Es difusión local por gradiente, con flujo proporcional a la diferencia de fracción; por eso se autoequilibra, nunca oscila y escala sin solver global.

### Cited Findings
- `LiquidModule` guarda un array `float[]` por tipo de líquido y un `current` (último líquido añadido); los bloques normales usan un solo líquido (`current()`, `currentAmount()`). `add()` fija `current = liquid`; `remove()` limita para no bajar de 0. — [LiquidModule.java](https://raw.githubusercontent.com/Anuken/Mindustry/v146/core/src/mindustry/world/modules/LiquidModule.java)
- `Block.liquidCapacity = 10f` por defecto y `Block.liquidPressure = 1f` por defecto. — [Block.java](https://raw.githubusercontent.com/Anuken/Mindustry/v146/core/src/mindustry/world/Block.java)
- `moveLiquid(next, liquid)` (BuildingComp), paráfrasis literal del código:
  ```
  next = next.getLiquidDestination(this, liquid)      // junctions reenvían
  if next.team == team && next.hasLiquids && this.liquids[liquid] > 0:
      ofract = next.liquids[liquid] / next.capacity
      fract  = this.liquids[liquid] / this.capacity * this.liquidPressure
      flow   = min( clamp(fract - ofract, 0, 1) * this.capacity , this.liquids[liquid] )
      flow   = min( flow , next.capacity - next.liquids[liquid] )      // no desbordar destino
      if flow > 0 && ofract <= fract && next.acceptLiquid(this, liquid):
          next.handleLiquid(...flow); this.liquids.remove(flow); return flow
      else if !next.consumesLiquid(liquid) && next.currentAmount/next.capacity > 0.1 && fract > 0.1:
          // reacciones entre líquidos distintos (ver sección 4)
  ```
  — [BuildingComp.java v146](https://raw.githubusercontent.com/Anuken/Mindustry/v146/core/src/mindustry/entities/comp/BuildingComp.java). Idéntico en master (líneas 943-958), es decir sin cambios conocidos para v8/BE. — [master](https://raw.githubusercontent.com/Anuken/Mindustry/master/core/src/mindustry/entities/comp/BuildingComp.java)
- Observación: el flujo es `diferencia_de_fracción x capacidad_del_emisor`, SIN factor de delta-tiempo ni de amortiguación; se mueve por tick, de ahí que el equilibrio sea muy rápido (con destino vacío, `fract*cap` = todo el contenido del emisor, limitado por el espacio libre del destino; con destino parcialmente lleno pasa la diferencia de fracciones x capacidad). Por el orden de actualización secuencial de edificios la onda se propaga a ~1 conducto por tick en el sentido de la rotación. (Esta última frase es inferencia mía del código, no medida.)
- `moveLiquidForward(leaks, liquid)`: toma el tile frontal (`tile.nearby(rotation)`); si hay edificio llama `moveLiquid`; si no hay edificio y `leaks` y el tile no es sólido ni tiene líquidos, fuga: `leakAmount = liquids[liquid] / 1.5` se deposita como charco y se elimina del conducto (¡2/3 del contenido por tick!). — [BuildingComp.java](https://raw.githubusercontent.com/Anuken/Mindustry/v146/core/src/mindustry/entities/comp/BuildingComp.java)
- `dumpLiquid(liquid, scaling = 2f)`: itera los vecinos (`proximity`) con un puntero rotatorio (`cdump`/`incrementDump`, reparto round-robin); para cada vecino con líquidos: si `ofract < fract` transfiere `(fract - ofract) * capacidad_emisor / scaling`. Con scaling 2 pasa la mitad de la diferencia (amortigua rebotes entre tanques); los puentes usan scaling 1. `transferLiquid` limita por espacio libre del destino y exige `acceptLiquid`. — [BuildingComp.java](https://raw.githubusercontent.com/Anuken/Mindustry/v146/core/src/mindustry/entities/comp/BuildingComp.java)
- Los comentarios del propio código dicen "TODO entire liquid system is awful" y señalan el uso de `current()` como incorrecto para bloques multi-líquido: el autor reconoce que es simple, no ideal. — mismo archivo.
- `Conduit.updateTile`: `if(currentAmount > 0.0001 && timer(timerFlow, 1)) moveLiquidForward(leaks, current)` = 1 intento de transferencia por tick, solo hacia delante (la dirección es la rotación del conducto). `canOverdrive = false`, duerme (`sleep()`) cuando está vacío. — [Conduit.java](https://raw.githubusercontent.com/Anuken/Mindustry/v146/core/src/mindustry/world/blocks/liquid/Conduit.java)
- `Conduit.acceptLiquid`: acepta si `(current == liquid || currentAmount < 0.2)` Y la fuente no está justo delante (`(source.relativeTo(tile)+2)%4 != rotation`), es decir no acepta desde su cara frontal: ningún retroceso desde el conducto siguiente. — mismo archivo.
- `liquidPressure` solo multiplica la fracción del EMISOR en la comparación: con 1.025 (pulse/plated) un conducto emisor al 97.6 % aún puede empujar a un receptor lleno; da gradiente extra para vencer la pérdida en cadenas largas. Valores usados: 1.0 (conducto básico), 1.025 (pulse, plated), 1.03 (reinforced). — [Blocks.java](https://raw.githubusercontent.com/Anuken/Mindustry/v146/core/src/mindustry/content/Blocks.java)
- Telemetría: `LiquidModule.updateFlow` promedia (ventana 3, cada 20 ticks) el líquido recibido por tipo y expone `getFlowRate` en u/s: la UI muestra flujo medido, no teórico. — [LiquidModule.java](https://raw.githubusercontent.com/Anuken/Mindustry/v146/core/src/mindustry/world/modules/LiquidModule.java)

### Inferences
- Propiedades emergentes: (a) flujo monotónico hacia fracciones menores, nunca hacia mayores (`ofract <= fract`), así que no hay oscilación; (b) conservación de masa exacta salvo fugas/consumo; (c) coste O(1) por edificio por tick, sin grafo.
- El caudal sostenido de una cadena larga no está documentado en el código: depende del gradiente que sostenga la fuente. Un conducto lleno hacia otro al 50 % pasa 5 u (cap 10) en un tick, pero en régimen estacionario el gradiente por segmento decae a lo largo de la cadena. Requeriría medición/simulación (puede portarse el algoritmo y medir).
- Para re-implementar: estado por celda = (tipo, cantidad); regla = `flow = clamp(f_src*pressure - f_dst, 0, 1)*cap_src`, limitada por contenido y espacio libre del destino; prohibir entrada por la cara frontal; admisión solo si mismo líquido o cantidad < 0.2.

### Gaps
- No encontré fuente fiable de caudal sostenido (u/s) por tipo de conducto. Una página Fandom antigua indica "4.9 líquidos/s por conducto, multiplicar por capacidad" y otra web de terceros da capacidad de pulse = 40; ambas contradicen el código v146 (pulse = 16) y aparentan ser de versiones antiguas o no oficiales: no usarlas. [Fandom](https://mindustry.fandom.com/wiki/File:Liquid_Junction.png), [terceros](https://game-platform-web-5a2.pages.dev/en/mindustry/block/pulse-conduit).

## 2. Tabla de bloques de líquidos (v146)

### Takeaway
Los conductos escalan en capacidad/presión y resistencia, no en velocidad (todos mueven 1 vez por tick). Los tanques son enormes (700 / 1800) y sirven de buffer; los puentes saltan 4 (o 12 con fase) casillas.

### Cited Findings
Todos los datos de [Blocks.java v146 líneas ~2119-2215](https://raw.githubusercontent.com/Anuken/Mindustry/v146/core/src/mindustry/content/Blocks.java), valores por defecto de [Block.java](https://raw.githubusercontent.com/Anuken/Mindustry/v146/core/src/mindustry/world/Block.java):

| Bloque (nombre en juego) | Tamaño | Capacidad (u) | Presión | Vida | Coste | Notas |
|---|---|---|---|---|---|---|
| Conducto (conduit) | 1 | 10 (def.) | 1.0 | 45 | 1 metaglass | fuga al frente abierto |
| Conducto de pulso (pulse conduit) | 1 | 16 | 1.025 | 90 | 2 titanium, 1 metaglass | fuga |
| Conducto blindado (plated conduit, clase ArmoredConduit) | 1 | 16 | 1.025 | 220 | 2 thorium, 1 metaglass, 1 plastanium | `leaks = false`; solo acepta de conductos/puentes/junction o de un bloque que lo mire de frente |
| Enrutador de líquido (liquid router) | 1 | 20 | n/a | def. | 4 graphite, 2 metaglass | `dumpLiquid` a todos los vecinos; no sólido |
| Contenedor de líquido (liquid container) | 2x2 | 700 | n/a | def. | 10 titanium, 15 metaglass | LiquidRouter |
| Tanque de líquido (liquid tank) | 3x3 | 1800 | n/a | 500 | 30 titanium, 40 metaglass | LiquidRouter |
| Unión de líquido (liquid junction) | 1 | sin almacén | n/a | def. | 4 graphite, 8 metaglass | reenvía instantáneamente a la casilla opuesta (`getLiquidDestination`) recursivamente; sin buffer |
| Conducto puente (bridge conduit) | 1 | 10 (def.) | 1 | def. | 4 graphite, 8 metaglass | `range = 4`; sin energía |
| Conducto de fase (phase conduit) | 1 | 10 (def.) | 1 | def. | 5 phase fabric, 7 silicon, 20 metaglass, 10 titanium | `range = 12`; energía 0.30/tick (=18/s) |

- No existe en v146 un "liquid overflow/underflow gate" ni una válvula en `content/Blocks.java` (el archivo `LiquidValve.java` no existe en v146: la descarga devolvió 404/vacío). El equivalente en v146 es la unión (junction) + enrutador. — verificado por ausencia en [Blocks.java](https://raw.githubusercontent.com/Anuken/Mindustry/v146/core/src/mindustry/content/Blocks.java).
- Puente de líquidos (`LiquidBridge`): cada tick, si `warmup >= 0.25`, `moved |= moveLiquid(other, current) > 0.05f` hacia el extremo enlazado (un `moveLiquid` por tick); el extremo final hace `dumpLiquid(current, 1f)` (scaling 1, descarga agresiva). `canDumpLiquid` restringe qué vecinos reciben (no devuelve al puente de origen). — [LiquidBridge.java](https://raw.githubusercontent.com/Anuken/Mindustry/v146/core/src/mindustry/world/blocks/liquid/LiquidBridge.java), [ItemBridge.java](https://raw.githubusercontent.com/Anuken/Mindustry/v146/core/src/mindustry/world/blocks/distribution/ItemBridge.java)
- Router: `updateTile` llama `dumpLiquid(current)` si `currentAmount > 0.01`; `acceptLiquid` = mismo líquido o `currentAmount < 0.2`. Reparte a todos los vecinos con fracción menor (incluso hacia atrás, a diferencia del conducto). — [LiquidRouter.java](https://raw.githubusercontent.com/Anuken/Mindustry/v146/core/src/mindustry/world/blocks/liquid/LiquidRouter.java)
- Bloques reforzados de Erekir (reinforced conduit/pump/bridge, hidrógeno etc.) existen en el mismo archivo; fuera del alcance principal (reinforced conduit presión 1.03).

### Inferences
- El diseño tiene tres "niveles" claros: fino (conducto, cap 10-16), medio (router 20), buffer (container 700, tank 1800 = ratio 70x-180x un conducto). Los tanques desacoplan producción y consumo.
- La junction permite cruzar sin mezclar y sin añadir latencia, equivalente a la junction de objetos.

### Gaps
- Capacidad de bridge-conduit y phase-conduit asumida del valor por defecto (10) porque Blocks.java no la sobrescribe; no verifiqué la clase ItemBridge para `liquidCapacity`.
- Costes de wiki comunitaria no contrastados (solo código).

## 3. Bombas y extractores

### Takeaway
Producción por casilla válida: `u/tick = nº_casillas_válidas x multiplicador_suelo x pumpAmount`. Mecánica 7 u/s por casilla; rotatoria 48 u/s (2x2); de impulso 118.8 u/s (3x3). Un conducto básico aguanta un par de bombas pequeñas; el escalado real depende del gradiente (ver sección 1).

### Cited Findings
Fuente: [Pump.java](https://raw.githubusercontent.com/Anuken/Mindustry/v146/core/src/mindustry/world/blocks/production/Pump.java), [Blocks.java](https://raw.githubusercontent.com/Anuken/Mindustry/v146/core/src/mindustry/content/Blocks.java), [SolidPump.java](https://raw.githubusercontent.com/Anuken/Mindustry/v146/core/src/mindustry/world/blocks/production/SolidPump.java).
- Código de la bomba (updateTile): `maxPump = min(capacidad - actual, amount * pumpAmount * edelta())`, se suma al propio buffer y luego `dumpLiquid(liquidDrop)` (scaling 2). `amount` = suma de `liquidMultiplier` de cada casilla bajo la bomba con el mismo `liquidDrop`; una bomba solo puede estar sobre un único tipo de líquido (si mezcla tipos, la colocación es inválida).
- Salida mostrada: `60 * pumpAmount * size^2` u/s (stat `output`).

| Bloque | pumpAmount (u/tick/casilla) | Tamaño | Cap. interna | Energía | Salida máx. con agua normal | Coste |
|---|---|---|---|---|---|---|
| Bomba mecánica (mechanical pump) | 7/60 = 0.1167 | 1x1 | 10 | 0 | 7 u/s | 15 copper, 10 metaglass |
| Bomba rotatoria (rotary pump) | 0.2 | 2x2 | 30 | 0.3/tick (18/s) | 48 u/s | 70 copper, 50 metaglass, 20 silicon, 35 titanium |
| Bomba de impulso (impulse pump) | 0.22 | 3x3 | 40 | 1.3/tick (78/s) | 118.8 u/s | 80 copper, 90 metaglass, 30 silicon, 40 titanium, 35 thorium |
| Extractor de agua (water extractor, SolidPump) | 0.11 | 2x2 | 30 | 1.5/tick (90/s) | 6.6 u/s a eficiencia 1 (60 x 0.11); atributo de suelo modifica | 30 metaglass, 30 graphite, 30 lead, 30 copper |
| Extractor de petróleo (oil extractor, Fracker) | 0.25 | 3x3 | 30 | 3/tick | 15 u/s a eficiencia 1; consume arena + 0.15 agua/tick | 150 copper, 175 graphite, 115 lead, 115 thorium, 75 silicon |
| Prensa de esporas (spore press, GenericCrafter) | n/a | 2x2 | 60 | ver nota | outputLiquid oil 18/60 = 0.3 u/tick = 18 u/s | 35 lead, 30 silicon |
| Cultivador (cultivator) | n/a (consume agua 18/60 = 0.3 u/tick = 18 u/s) | 2x2 | def. | 80/60 | produce spore pod (item), no líquido | 25 copper, 25 lead, 10 silicon |

- Líquido por suelo (Floor.liquidDrop / liquidMultiplier): deep-water → agua x1.5; shallow water / sand-water / darksand-water → agua x1; tar → petróleo x1; cryofluid floor → criofluido x0.5; slag floor → escoria x1; arkycite floor → arkycite. — [Blocks.java](https://raw.githubusercontent.com/Anuken/Mindustry/v146/core/src/mindustry/content/Blocks.java) (líneas ~185-460; asignación de nombre exacto de cada floor a cada valor la deduje por orden en el archivo para sand/darksand-water: marcar como menor certeza).
- Ejemplo calculado: mecánica sobre agua profunda = 7 x 1.5 = 10.5 u/s; rotatoria 4 casillas de agua profunda = 72 u/s; impulso 9 casillas deep = 178 u/s; en criofluido la mecánica da 3.5 u/s.
- `shouldConsume` de la bomba es falso si su buffer está casi lleno: se auto-detiene (contrapresión, sin pérdida) y la energía no se gasta. — [Pump.java](https://raw.githubusercontent.com/Anuken/Mindustry/v146/core/src/mindustry/world/blocks/production/Pump.java)
- Consumo de líquidos: `ConsumeLiquid` retira `amount * edelta * multiplier` por tick del buffer y su eficiencia es `min(líquido_disponible / necesario, 1)`; el consumidor acepta solo su líquido (`liquidFilter`). — [ConsumeLiquid.java](https://raw.githubusercontent.com/Anuken/Mindustry/v146/core/src/mindustry/world/consumers/ConsumeLiquid.java)
- Las torretas con refrigerante (`coolant`) y taladros aceptan líquido como "booster" (stat `booster` vs `input` en `ConsumeLiquid.display`); detalles numéricos de torretas/taladros no verificados. — [Turret.java](https://raw.githubusercontent.com/Anuken/Mindustry/v146/core/src/mindustry/world/blocks/defense/turrets/Turret.java)

### Inferences
- Ratio de dimensionado: un tanque o container como buffer entre bombas y consumidores permite que un solo conducto alimente muchos bloques porque los consumidores toman por demanda; la ratio "bombas por conducto" no está fijada en el código y la comunidad usa regla empírica (no hallé fuente citable).
- Mecanismo de contrapresión útil para tu juego: producción condicionada a espacio libre en buffer (no desborda ni desperdicia).

### Gaps
- Cuántas bombas aguanta un conducto (caudal máximo real) no está en el código; no hay medición comunitaria citable en mis búsquedas.
- No leí Turret/Drill para confirmar multiplicadores de refrigerante (agua 0.4 heatCapacity, criofluido 0.9 en `Liquids.java` sí confirmados: ver siguiente sección).

## 4. Mezcla e incompatibilidad, reacciones

### Takeaway
No se mezclan: un contenedor/conducto de un solo líquido solo acepta otro si es el mismo o si está (casi) vacío (< 0.2 u). Si dos líquidos incompatibles se tocan en un flujo bloqueado, ciertas combinaciones (caliente+inflamable, caliente+frío) dañan y evaporan.

### Cited Findings
- `acceptLiquid` de Conduit y LiquidRouter: `liquids.current() == liquid || liquids.currentAmount() < 0.2f`. Entonces un conducto con agua rechaza petróleo hasta que baje de 0.2 u (se "purga" consumiendo o agotando); al entrar con < 0.2 u, `add()` cambia `current` al nuevo líquido. — [Conduit.java](https://raw.githubusercontent.com/Anuken/Mindustry/v146/core/src/mindustry/world/blocks/liquid/Conduit.java), [LiquidRouter.java](https://raw.githubusercontent.com/Anuken/Mindustry/v146/core/src/mindustry/world/blocks/liquid/LiquidRouter.java)
- Bloques consumidores: `Building.acceptLiquid` = `hasLiquids && consumesLiquid(liquid)`: solo aceptan lo que consumen (filtro `liquidFilter`). — [BuildingComp.java](https://raw.githubusercontent.com/Anuken/Mindustry/v146/core/src/mindustry/entities/comp/BuildingComp.java)
- Reacciones en `moveLiquid` cuando `flow` falló, el vecino no consume el líquido, tiene > 10 % de llenado y la fracción del emisor > 0.1, y ambos líquidos son `blockReactive`: (1) si uno tiene `flammability > 0.3` y el otro `temperature > 0.7` → `damageContinuous(1)` a ambos edificios cada tick y chispas de fuego; (2) si uno es caliente (>0.7) y el otro frío (<0.55) → el emisor pierde `min(contenido, 0.7*delta)` por tick y emite vapor. — [BuildingComp.java](https://raw.githubusercontent.com/Anuken/Mindustry/v146/core/src/mindustry/entities/comp/BuildingComp.java)
- Propiedades de líquidos (Liquids.java): agua (heatCapacity 0.4, boilPoint 0.5); escoria (temperature 1, viscosity 0.7); petróleo (flammability 1.2, explosiveness 1.2, viscosity 0.75, heatCapacity 0.7, boilPoint 0.65, puede posarse sobre agua); criofluido (heatCapacity 0.9, temperature 0.25, boilPoint 0.55); gases (ozone, hydrogen, nitrogen, cyanogen) existen. — [Liquids.java](https://raw.githubusercontent.com/Anuken/Mindustry/v146/core/src/mindustry/content/Liquids.java)

### Inferences
- Para tu juego "un fluido por conducto": la regla "acepta si mismo fluido o buffer casi vacío" evita bloqueos permanentes (el conducto se vacía y cambia de fluido solo) y es muy intuitiva: el jugador ve rechazo en la unión.
- El daño por reacción solo ocurre en contactos hostiles: es un castigo suave por mal diseño, no una explosión global.

### Gaps
- Detalle de multiplicadores de refrigeración de torretas/taladros (agua 1.x etc.) no recopilado.

## 5. Fugas, charcos, fuego y "presión"

### Takeaway
No hay daño por sobrepresión: el único fallo del sistema es la fuga por extremo abierto (conducto con salida a casilla vacía), que convierte líquido en charcos que pueden evaporarse, inflamarse o dañar. Los conductos blindados no filtran. El sistema "simplemente funciona" porque casi nada puede fallar de forma catastrófica.

### Cited Findings
- Fuga: solo en el conducto cuyo frente es una casilla sin edificio, no sólida y sin `hasLiquids`; elimina `contenido/1.5` por tick y lo deposita como `Puddles.deposit(...)`. Bloquea con un bloque sólido, un edificio con líquidos o `plated conduit` (`leaks=false`). Puentes, routers, junction y bombas NO fugan (junction tiene `//TODO should leak!`). — [BuildingComp.java](https://raw.githubusercontent.com/Anuken/Mindustry/v146/core/src/mindustry/entities/comp/BuildingComp.java), [LiquidJunction.java](https://raw.githubusercontent.com/Anuken/Mindustry/v146/core/src/mindustry/world/blocks/liquid/LiquidJunction.java), [ArmoredConduit.java](https://raw.githubusercontent.com/Anuken/Mindustry/v146/core/src/mindustry/world/blocks/liquid/ArmoredConduit.java)
- Charcos (`Puddles`, `PuddleComp`): `maxLiquid = 70` por casilla; un charco pierde `delta*(1 - viscosity)/(5 + (3 si recibe))` por tick (se evapora, más lento si es viscoso); si `amount >= 70/1.5 = 46.7` rebosa a las 4 casillas vecinas vacías (`min((amount-46.7)/4, 0.3*delta)` cada una); sobre 35 u los unidades terrestres que pasen reciben el efecto del líquido (wet, tarred, melting...) 2 s. — [Puddles.java](https://raw.githubusercontent.com/Anuken/Mindustry/v146/core/src/mindustry/entities/Puddles.java), [PuddleComp.java](https://raw.githubusercontent.com/Anuken/Mindustry/v146/core/src/mindustry/entities/comp/PuddleComp.java)
- Si el líquido hierve (`willBoil`, p.ej. agua en mundos calientes) se evapora sin crear charco; en entorno espacio salen partículas; sobre suelos líquidos solo hay ondulación o reacción; sobre suelo sólido no hay charco. — [Puddles.java](https://raw.githubusercontent.com/Anuken/Mindustry/v146/core/src/mindustry/entities/Puddles.java)
- Fuego: charco inflamable + líquido caliente (inflamabilidad > 0.3 con temperatura > 0.7) crea `Fires` y, con probabilidad `0.006 * amount`, una bola de fuego; líquido frío sobre charco caliente produce vapor y resta 10 % de la cantidad, caliente sobre frío resta 40 %. Un charco con temperatura > 0.7 sobre un edificio también provoca fuego con prob. 0.5 cada 40 ticks. `PuddleComp.getFlammability = flammability * amount` (usado por el sistema de fuego). — [Puddles.java](https://raw.githubusercontent.com/Anuken/Mindustry/v146/core/src/mindustry/entities/Puddles.java), [PuddleComp.java](https://raw.githubusercontent.com/Anuken/Mindustry/v146/core/src/mindustry/entities/comp/PuddleComp.java)
- Aguas con un único líquido: los charcos de líquidos distintos en la misma casilla reaccionan (`reactPuddle`) en vez de coexistir.
- En el código no aparece un concepto de "presión" con daño: `liquidPressure` solo sesga la comparación de fracciones (sección 1). Un conducto lleno simplemente no acepta más.

### Inferences
- Por qué "just works": (1) conservación local y sin deadlock (el líquido siempre busca fracción menor); (2) contrapresión natural (bombas y crafters paran cuando están llenos); (3) un único tipo por celda y rechazo en la unión evita contaminar redes; (4) la dirección del conducto es explícita y no acepta por delante; (5) las únicas pérdidas son visibles (charco).
- Para un juego móvil con "putrefacción por estancamiento": se puede añadir una variable `edad` por celda que crece mientras la fracción no cambia, y que el charco/rot se genere cuando se supera un umbral; Mindustry no tiene esto (no hallé evidencia), es diseño nuevo.

### Gaps
- Daño directo de charcos a edificios (salvo reacciones) no confirmado.
- Comportamiento exacto del conducto cuando el frente es un edificio enemigo (`team != team`): no hay fuga ni flujo (la rama requiere `next.team == team`).

## 6. Heurísticas de diseño comunitarias

### Takeaway
No encontré fuentes comunitarias sólidas y citables en esta pasada (la búsqueda web devolvió wikis antiguas y sitios de terceros contradictorios). Las heurísticas siguientes se derivan del código y se marcan como inferencia.

### Cited Findings
- Los sitios de terceros recomiendan "conductos de mayor nivel almacenan más y pueden prevenir fugas" sin números. — [guía de terceros](https://game-platform-web-5a2.pages.dev/en/mindustry/guides/liquid-management) (calidad baja, no oficial).

### Inferences (derivadas del código v146)
- Tanque como buffer: container (700) y tank (1800) equivalen a 70 y 180 conductos básicos de capacidad; ponerlos entre bomba y consumidor absorbe picos.
- Larga distancia: puente de conducto salta 4 casillas (range=4) y de fase 12, sin fugar y con una sola transferencia por extremo por tick; evita los 3-4 conductos intermedios.
- Conducto blindado (plated) al lado de bloques que no deben recibir líquido y en cualquier salida abierta, porque `leaks=false` y solo acepta por detrás/de conductos.
- Evitar backflow: los conductos no aceptan desde el frente; el router sí devuelve hacia atrás; usar junction para cruzar.
- No mezclar líquidos en un router: un router con agua rechaza petróleo hasta < 0.2 u.
- Pulse/plated (cap 16, presión 1.025) mejoran el gradiente para cadenas largas.

### Gaps
- Benchmarks de throughput comunitarios (u/s por tipo de conducto, nº de bombas por conducto) sin fuente verificable: pendiente de medir portando el algoritmo o consultando Reddit/wiki oficial (mindustrygame.github.io/wiki no se consultó por límite de llamadas y por no estar entre los resultados).
- Diferencias v8/BE: `moveLiquid` es idéntico en master (comparado). No comparé el resto de archivos (Conduit, Blocks) con master; podría haber cambios en costes/valores en BE.
- Posición exacta de números de línea de floors (sand-water etc.) y algunas capacidades por defecto de bridge no verificadas individualmente.
