# Mecánicas del juego (con fórmulas)

Este documento describe exactamente qué calcula el simulador. Las constantes están en `src/sim/config.ts` y las fórmulas
en `src/sim/formulas.ts`.

**Convenciones:** `x` = ingesta del Corazón en unidades/s, `t` = nivel (*tier*) de una estructura, `r` = podredumbre
(0–1), `p` = presión (0–1), `E` = esencia/s.

---

## 1. El reloj del simulador

- La simulación avanza en **pasos fijos de 0,1 s** (10 por segundo), sea cual sea la velocidad del móvil.
- Cuando el juego vuelve de segundo plano o se reabre, simula el tiempo perdido de verdad: pasos de **0,5 s** las primeras
  2 h y de **1 s** hasta **12 h**. Si la red fue **estable** en la última hora simulada (0 roturas, ninguna estructura
  perdida), el resto de la ausencia, **hasta 7 días**, se acredita a la producción media de esa hora. Ver §12.
- Es **determinista**: con la misma semilla y las mismas órdenes da exactamente el mismo resultado. Esto está comprobado
  en los tests, guardando y cargando a mitad de partida.

Cada paso ejecuta siete fases en este orden:

| # | Fase | Qué pasa |
|---|---|---|
| 1 | Producción | Sangradores y esporangios extraen; digestores y matrices transmutan; los cauterizadores queman bilis |
| 2 | Transferencia | Todo empuja su contenido hacia la casilla a la que mira |
| 3 | Síntesis | El Corazón consume y genera esencia |
| 4 | Presión | Se calcula lo lleno que está cada vaso; se aplica daño; revientan las estructuras a 0 de integridad |
| 5 | Podredumbre | Crece, se difunde, se limpia y aparece por entropía |
| 6 | Parásitos | Oleadas, movimiento, mordiscos y guardias |
| 7 | Estadísticas | Récords, muestras para las gráficas y comprobación de logros (una vez por segundo) |

---

## 2. El Corazón: la fórmula central

```
E/s = M · ( Π_r (1 + x_r)^(w_r · α)  −  1 )  +  0,25
```

| Símbolo | Significado | Valor |
|---|---|---|
| `x_r` | Ingesta del recurso r (media móvil exponencial, τ = 2 s) | 0 … tope |
| `w_r` | Peso del recurso | icor **1,0** · esporas **0,5** · bilis **1,5** · vitriolo **2,2** |
| `α` | Exponente del Corazón | `1 + 0,05 · Hipertrofia` |
| `M` | Multiplicador global | `bonus_mutágeno · (1 + 0,02 · logros)` (ver §9) |
| `0,25` | Latido residual | Evita quedarse bloqueado sin ingresos si la red colapsa entera |

**Tope de ingesta:** `8 · 2^t` unidades/s **por recurso** (8, 16, 32, 64…). Lo que llegue por encima se acumula en el
búfer del Corazón (3 s de tope) y, cuando este se llena, hace retroceder la presión por tus conductos.

**Por qué es un producto y no una suma.** Con una suma, lo óptimo sería escalar un solo recurso. Con un producto, cada
recurso nuevo **multiplica** todo lo demás:

| Alimentación (unidades/s) | E/s |
|---|---|
| 4 icor | 4,0 |
| 2 icor + 1 bilis + 0,5 vitriolo (mismos sangradores) | 3 · 2^1,5 · 1,5^2,2 − 1 ≈ **19,7** |
| 1 de cada recurso | 2^(1+0,5+1,5+2,2) − 1 = 2^5,2 − 1 ≈ **35,8** |

El cálculo se hace en escala logarítmica (`Σ w·α·log₁₀(1+x)`) y el resultado se guarda con `break_eternity.js`, así que
la esencia puede pasar de 1e308 sin desbordarse.

### 2.1 La carrera del crecimiento (por qué hay muros)

Si mejoras **toda** una cadena un nivel, cada `x` se duplica y:

```
E  →  E · 2^(α · Σw)        con Σw = 5,2 → ×37 por nivel (α = 1)
```

Pero el nivel t del Corazón cuesta `150 · 45^t · 1,1^(t(t−1)/2)`: cada nivel encarece ×45 **y además** un 10 % más que
el anterior (×45, ×49,5, ×54,5…). Como 45 > 37, el tiempo que tarda en amortizarse cada mejora del Corazón **crece**: eso
es el muro.

La Hipertrofia lo empuja más lejos, pero **nunca lo elimina**. Con α = 1,2 un nivel completo vale 2^6,24 ≈ ×76, así que
el muro aparece hacia el nivel 6 del Corazón. Con α = 1,5 vale ×223 y aparece hacia el nivel 17. Esta rampa
supraexponencial se añadió en la v0.2 porque, sin ella, en cuanto α pasaba de 1,06 un solo ciclo de 7 minutos llegaba a
10⁵⁸.

---

## 3. Producción y procesado

Cada nivel **duplica** el ritmo (`2^t`). La podredumbre lo reduce: `× (1 − 0,75·r)`.

| Estructura | Ritmo base | Fórmula completa |
|---|---|---|
| Sangrador | 1,0 icor/s | `1,0 · riqueza · 2^t · 1,4^Fecundidad · (1 − 0,75r)` |
| Esporangio | 0,8 esporas/s | `0,8 · riqueza · 2^t · 1,4^Fecundidad · (1 − 0,75r)` |
| Digestor | 0,5 transm./s | 2 icor → 1 bilis · `0,5 · 2^t · 1,35^Catálisis · (1 − 0,75r)` |
| Matriz Catalítica | 0,25 transm./s | 1 bilis + 2 esporas → 1 vitriolo · `0,25 · 2^t · 1,35^Catálisis · (1 − 0,75r)` |

- Los procesadores son **continuos**: transmutan fracciones, limitados por lo que tienen dentro, por el espacio de salida
  y por su ritmo.
- **Refinar destruye volumen** (2 icor → 1 bilis) pero **sube el exponente** de lo que queda. Compensa casi siempre en
  cuanto el icor no es tu único recurso.

---

## 4. Transporte

### 4.1 Reglas de flujo
- Cada estructura **empuja** hacia la casilla a la que mira (flecha).
- Los receptores apuntan lo recibido en un búfer `incoming` que solo se suma al final del paso. **Nada avanza más de una
  casilla por paso**, haya el orden que haya.
- El orden de recorrido **rota cada paso**, para que en las uniones no gane siempre la misma entrada.

### 4.2 Quién acepta qué

| Estructura | Acepta | Capacidad (nivel 0) | Empuja |
|---|---|---|---|
| Conducto | **un solo fluido** a la vez, por cualquier lado salvo su salida | 12 · 2^t | `6 · 2^t · 1,5^Vascular · (1−0,75r)` /s hacia su flecha |
| Ganglio | cualquier mezcla | 6 · 2^t | `8 · 2^t …`/s repartidos a partes iguales entre todos los vecinos que **no** le alimentan |
| Cruce | por cada carril, un fluido; lo que entra por un lado sale por el opuesto | 6 · 2^t por carril | `6 · 2^t …`/s por carril |
| Digestor | solo icor | 8 · 2^t | 20 · 2^t /s de su salida |
| Matriz | bilis y esporas | 8 · 2^t cada una | 20 · 2^t /s |
| Guardia | solo esporas | reserva 4 · 2^t (+ otro tanto de paso) | el sobrante de la reserva, en línea |
| Cauterizador | solo bilis | reserva 4 · 2^t (+ otro tanto de paso) | el sobrante de la reserva, en línea |
| Corazón | todo | 3 s de tope por recurso | — |
| Sangrador / Esporangio | nada | salida 4 · 2^t | 20 · 2^t /s |

La capacidad crece al mismo ritmo que el caudal, así que **un conducto siempre guarda unos 2 s de su propio caudal**.
Por eso la presión es una señal limpia: un conducto que fluye bien está casi vacío, y uno con un atasco delante se llena
en segundos.

---

## 5. Presión, tensión e integridad

**Presión** (`p`), lo lleno que está algo:
- Conducto / Ganglio: contenido / capacidad.
- Cruce: el carril más lleno.
- Sangrador / Esporangio / Digestor / Matriz: búfer de salida / capacidad de salida. Que se llene la *entrada* de un
  procesador no le daña: le daña no poder sacar lo que produce.
- Corazón, Guardia y Cauterizador: **nunca** tienen presión (son sumideros con válvula; si se saturan, el problema pasa
  al conducto anterior).

**Tensión (lo que realmente hace daño).** Estar lleno **no basta** para dañarse. La presión **nace en una bomba
bloqueada**, es decir, un sangrador, esporangio, digestor o matriz cuya salida pasa del 85 %: está produciendo y no puede
sacarlo. La bomba en sí **solo se queda quieta, sin dañarse**: así un Esporangio que alimenta directamente una Guardia
llena es seguro. Pero empuja la **tensión** al vaso que tiene delante, si está lleno, y desde ahí viaja aguas abajo por
los vasos que también estén por encima del 85 % hasta el primero que tiene sitio:

- **Conducto:** pasa la tensión hacia su flecha.
- **Cruce:** la pasa por cada carril lleno.
- **Ganglio:** la pasa a todas sus salidas llenas (solo si él mismo está lleno y en tensión).

Consecuencias:
- Un callejón sin salida alimentado por un sangrador → tensión → revienta. ✔
- Una línea que lleva más de lo que el siguiente tramo puede mover → tensión → revienta. ✔
- Una **rama de desbordamiento** llena junto a un Ganglio que puede mandar el resto a otro sitio → **en reposo**, no se
  daña. ✔ Esto permite diseños de «lo que sobre, que vaya allí», imposibles antes de la v0.2.

En pantalla, solo las estructuras **en tensión** brillan en naranja-rojo. La capa **P** muestra el llenado de todas.

**Pérdida de integridad por segundo** (solo con tensión; sin tensión, `p` cuenta como 0):
```
exceso  = (p − 0,85) / 0,15                      si p > 0,85 y en tensión
pérdida = ( exceso² / 180  +  [r > 0,6] / 400 ) · (1 + 2r) · 0,85^Quitina · 1,15^profundidad
```
- A presión 100 % sin podredumbre una estructura **revienta en 3 minutos**. Con podredumbre al 100 %, en 1 minuto.
- Por encima de 0,6 de podredumbre se pierde integridad aunque no haya presión.
- **Regeneración:** +1/300 por segundo (5 min de 0 a 100 %) si no está en tensión y nada la daña.

**Rotura:**
- La estructura desaparece **sin reembolso** y su contenido se derrama.
- +0,5 de podredumbre en su casilla y +0,2 en cada vecina.
- El contador de construcción de ese tipo baja (reconstruirla es más barato).
- Se registra la causa: **presión**, **podredumbre** o **sanguijuelas**.

---

## 6. Podredumbre: un campo de reacción-difusión

Cada casilla tiene una podredumbre `r` entre 0 y 1. Cada segundo:

| Situación de la casilla | Variación local |
|---|---|
| Roca desnuda | −0,004 (**cortafuegos**) |
| Estructura **en tensión** | `+0,01 · r · (1 − r)` (crecimiento logístico) y +0,004 adicional |
| Estructura **con flujo** (sacando > 0,05/s y sin tensión) | −0,002 (el flujo la arrastra) |
| Estructura en reposo con **r > 0,35** (infección establecida) | `+0,01 · r · (1 − r)` |
| Estructura en reposo con **r ≤ 0,35** | −0,0007 (se cura sola) |
| Estructura vecina de otra infectada (r > 0,35) | `+0,006 · (r_vecina − r)` (**contagio**, solo entre estructuras) |
| Todas | `+0,0015 · Σ_vecinos (r_vecino − r)` (difusión) |

**El umbral de no retorno (35 %)** separa dos mundos. Por debajo, cualquier estructura sana se cura sola. Por encima,
la infección se mantiene y avanza por la red (una casilla cada ~10 minutos) hasta que la limpias, la cauterizas o la
aíslas con roca.

Además:
- **Entropía:** cada segundo, con probabilidad `0,004 · (1 + 0,5·log₁₀(1+E)) · 1,15^profundidad`, una casilla al azar
  de la caverna recibe hasta +0,25. Tiene tres límites:
  - **Nunca la sube por encima de 0,30**, por debajo del umbral de no retorno: el desgaste aleatorio no puede iniciar una
    infección.
  - Nunca cae sobre el Corazón.
  - En la roca se evapora enseguida.

  Una red más potente se desgasta más a menudo, pero ese desgaste se cura solo y lo único que hace es bajar el caudal
  un rato. Por eso conviene dejar margen.
- **Efectos:** caudal y producción × (1 − 0,75·r); daño a la integridad amplificado; no se puede construir con r ≥ 0,5.
- **Purificar a mano:** pone la casilla a 0 y cuesta `máx(5, 15 · E/s)` (15 segundos de producción).
- **Cauterizador:** quema 0,25 · 1,5^t de bilis/s para quitar `0,05 · 2^t` /s en un cuadrado de 5×5, y solo funciona si
  hay podredumbre que quemar.

> *Nota de diseño:* la primera versión hacía crecer la podredumbre en todas las casillas, y se comía el mapa entero en 12
> minutos hicieras lo que hicieras. Atarla al estancamiento la convierte en consecuencia directa de un mal diseño, y hace
> que dejar huecos sea una decisión con coste (más conducto, menos caudal) y beneficio (cortafuegos).

---

## 7. Sanguijuelas

**Periodo de gracia:** durante los primeros **2 días de juego** (172.800 s de tiempo total de partida, incluido el
simulado sin conexión; no se reinicia con la metamorfosis) las madrigueras no sueltan nada. La primera oleada llega 4:00
después de que termine. Se puede terminar antes desde ⚙ Ajustes.

**Oleadas:**
- Primera a los **4:00** (tras la gracia). Después cada `máx(75, 200 · 0,96^oleada)` s: 192 s, 184 s… hasta 75 s a partir de la oleada 24.
- Cantidad: `1 + ⌊mín(oleada, 12)/3⌋ + ⌊log₁₀(1+E)/2⌋`. El número de oleada deja de sumar a partir de la 12 (como
  máximo +4).

**Vida:**
```
vida = 4 · (1 + log₁₀(1+E))^1,5 · 1,15^profundidad
```
**El tiempo no las hace más fuertes**, solo tu producción y la profundidad que elegiste. A 0 E/s tienen 4 de vida y a
1.000 E/s, 32. Hasta la v0.2 crecían además ×1,05 por oleada, y en las pruebas AFK llegaban a tener miles de millones
de vida a las 9 horas: ninguna red aguantaba dormida.

**Comportamiento:**
- Avanzan una casilla cada 1,5 s hacia la estructura más cercana (solo van a por el Corazón cuando no queda otra).
- Enganchadas: chupan el **25 %/s** del contenido, quitan **1 %/s** de integridad y añaden 0,01/s de podredumbre.
- **Espinas:** sobre una Guardia de Espinas muerden al **25 %** (0,25 %/s y 0,0025/s de podredumbre) y **no pueden
  chupar sus esporas**. Una Guardia junto a una madriguera hace de pararrayos estable si mata más deprisa de lo que la
  muerden.
- En el Corazón: roban el **1 %/s** de tu esencia acumulada.
- **Saciedad:** tras **45 s** comiendo se van. Así el daño por oleada está acotado y una sanguijuela no puede quedarse para
  siempre en una red muerta.

**Defensas:**
- **Golpe:** `1 · 1,6^Garras` de daño por toque.
- **Guardia de Espinas:** gasta 0,3 · 1,5^t esporas/s para hacer `1 · 2^t` de daño/s a la sanguijuela con menos vida en
  su cuadrado de 5×5. Solo gasta cuando tiene objetivo.

---

## 8. Economía

| Acción | Coste |
|---|---|
| Construir la n-ésima estructura de un tipo | `coste_base · crecimiento^n` (ver ESTRUCTURAS.md) |
| Mejorar del nivel t al t+1 | `máx(1, coste_base) · base_nivel · crecimiento_nivel^t` |
| Remendar | `20 % · invertido · (1 − integridad)` |
| Purificar | `máx(5, 15 · E/s)` |
| Arrasar | recuperas el **50 %** de lo invertido (y el contenido se derrama) |
| Purgar | gratis, pero +0,15 de podredumbre |

---

## 9. Metamorfosis (prestigio)

```
mutágeno = ⌊ (esencia del ciclo / 1.000.000)^0,35 · 1,2^profundidad ⌋      (requiere ≥ 1M)
```

| Esencia del ciclo | Mutágeno (profundidad 0) |
|---|---|
| 1M | 1 |
| 10M | 2 |
| 100M | 5 |
| 1B (10⁹) | 11 |
| 1T (10¹²) | 125 |

Al metamorfosear: caverna nueva (semilla nueva), esencia a 40 y se cierra el ciclo en las estadísticas. Se conservan el
mutágeno, las mutaciones, los logros y todas las estadísticas totales.

### Descender o permanecer
Al metamorfosear **eliges**:
- **Descender** (+1 de profundidad): peligros ×1,15 (vida de sanguijuelas, daño a la integridad y entropía) y
  mutágeno futuro ×1,2.
- **Permanecer:** misma profundidad, mismo peligro y mismo rendimiento.

Descender a ciegas lleva al colapso: en las pruebas, a partir de profundidad ~33 los peligros (×100 y más) superan a la
Quitina y todo revienta. Lo sensato es bajar mientras los ciclos salen limpios y quedarse cuando empiezan las roturas.

### Bonus del mutágeno sin gastar
```
bonus = 1 + 0,1 · m                      si m ≤ 100
bonus = 11 · √(m / 100)                  si m > 100      (tope suave)
```
| Mutágeno sin gastar | 0 | 50 | 100 | 400 | 10.000 | 1.000.000 |
|---|---|---|---|---|---|---|
| Bonus | ×1 | ×6 | ×11 | ×22 | ×110 | ×1.100 |

El tope suave existe porque, siendo lineal, el bonus realimentaba la esencia → mutágeno → bonus sin freno.

### Mutaciones
Coste: `base · crecimiento^nivel · rampa^(nivel(nivel−1)/2)`. La rampa hace que los niveles altos sean un objetivo a
largo plazo.

| Mutación | Efecto por nivel | base · crec. · rampa | Máx. |
|---|---|---|---|
| Hipertrofia | α += 0,05 | 1 · 3 · 1,4 | 40 |
| Memoria Vascular | caudal y capacidad de conductos/ganglios/cruces ×1,5 | 1 · 2,2 · 1,2 | 50 |
| Fecundidad | extracción ×1,4 | 1 · 2,5 · 1,2 | 50 |
| Catálisis | velocidad de procesadores ×1,35 | 2 · 2,5 · 1,2 | 50 |
| Quitina | pérdida de integridad ×0,85 | 1 · 2 · 1,25 | 25 |
| Garras | daño de golpe ×1,6 | 1 · 2 · 1,2 | 50 |

Coste del nivel indicado (de ese nivel al siguiente):

| Mutación | 0 | 1 | 2 | 3 | 4 | 5 | 7 | 10 | 15 | 20 |
|---|---|---|---|---|---|---|---|---|---|---|
| Hipertrofia | 1 | 3 | 12 | 74 | 609 | 7.028 | 2,56e6 | 2,22e11 | 3,16e22 | 2,03e37 |
| Memoria Vascular | 1 | 2 | 5 | 18 | 69 | 319 | 11.475 | 9,71e6 | 2,82e13 | 7,81e21 |
| Fecundidad | 1 | 2 | 7 | 27 | 116 | 604 | 28.079 | 3,49e7 | 1,92e14 | 1,01e23 |
| Catálisis | 2 | 5 | 15 | 54 | 233 | 1.209 | 56.158 | 6,98e7 | 3,84e14 | 2,01e23 |
| Quitina | 1 | 2 | 5 | 15 | 61 | 298 | 13.877 | 2,35e7 | 4,91e14 | 2,71e24 |
| Garras | 1 | 2 | 4 | 13 | 47 | 198 | 5.888 | 3,75e6 | 6,75e12 | 1,16e21 |

---

## 10. Logros

32 logros. **Cada uno da +2 % al multiplicador global M, para siempre.** Se comprueban una vez por segundo de simulación.
Lista completa en [LOGROS.md](LOGROS.md).

---

## 12. Tiempo fuera y estabilidad

| Fase | Cómo se calcula |
|---|---|
| 0–2 h | Simulación real, pasos de 0,5 s |
| 2–12 h | Simulación real, pasos de 1 s |
| 12 h – 7 días | Si la última hora simulada fue estable: `producción media de esa hora × tiempo restante`. Si no, nada. |
| más de 7 días | Cuenta como 7 días |

**Indicador de estabilidad** (HUD y ▤ → Ahora): 0 en tensión, 0 infecciones (> 35 %), ≥ 10 min sin roturas y ≥ 10 min
sin sanguijuelas saciadas.

**Prueba AFK** (`npm run probe:deep -- 26 SEMILLA --afk=60`): el bot juega 1 hora, se prepara (sube las Guardias a nivel
3 y arregla lo que está en tensión) y deja de tocar nada durante 25 horas:

| Semilla | Al irse | Primeros 30 min | De 0,5 h a 24 h |
|---|---|---|---|
| 1 | 3 en tensión | 5 roturas (los 3 fallos de diseño) | **0 roturas**, 115,7 E/s constantes |
| 2 | 3 en tensión | 6 roturas | **0 roturas**, 115,7 E/s |
| 3 | 4 en tensión | 6 roturas | **0 roturas**, 115,7 E/s |
| 4 | 4 en tensión | 6 roturas | **0 roturas**, 115,7 E/s |

Lo que estaba mal diseñado reventó enseguida, y lo que quedó era estable y aguantó un día entero sin intervención.
Exactamente la regla: **diseña bien y dura**.

## 11. Ritmo medido

### Un ciclo (`npm run probe`)
Un bot «atento pero simple» (golpea, remienda, purifica y ahorra para el Corazón; **nunca** fabrica vitriolo):

```
  5 min   ~100 E/s     Corazón nivel 1
 15 min   ~450 E/s     Corazón nivel 2
 25 min  ~1.250 E/s    ← muro: el nivel 3 del Corazón cuesta 303.750
 35 min   1M en el ciclo → primera Metamorfosis posible
```

Es un **suelo**, no un objetivo: un jugador que monte una línea de vitriolo debería superarlo por órdenes de magnitud.

### Muchos ciclos (`npm run probe:deep -- 24`)
Un bot más listo con la cadena completa (vitriolo incluido, con Cruce y Ganglios). Detecta el cuello de botella real,
metamorfosea cuando su mutágeno por minuto deja de mejorar, desciende solo tras ciclos limpios y compra Hipertrofia
primero. Juega 24 horas seguidas sin parar:

| Ciclo | Hora aprox. | Profundidad | α | Pico E/s | Mutágeno del ciclo |
|---|---|---|---|---|---|
| 1 | 1 h | 0 | 1,00 | 1,2K | 1 |
| 7 | 2 h | 6 | 1,10 | 9K | 3 |
| 13 | 2,7 h | 12 | 1,15 | 3e5 | 35 |
| 19 | 3,5 h | 18 | 1,25 | 1e8 | 841 |
| 31 | 5 h | 30 | 1,35 | 2e14 | 5,8e5 |
| 61 | 9 h | 35 | 1,40 | 4e15 | 7,7e6 |
| 121 | 16 h | 35 | 1,45 | 1,6e18 | 3,2e7 |
| 175 | 24 h | 36 | 1,45 | 3e16–1e19 | ~1e7–1e8 |

La profundidad se estabiliza sola en torno a 35 y α sube despacio: los muros funcionan. Una persona jugará más despacio
que un bot que actúa cada segundo durante 24 horas, así que en tiempo real esto equivale a semanas de juego.
