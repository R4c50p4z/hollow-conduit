# Mecánicas del juego (con fórmulas)

Este documento describe exactamente qué calcula el simulador. Las constantes están en `src/sim/config.ts` y las fórmulas
en `src/sim/formulas.ts`.

**Convenciones:** `x` = ingesta del Corazón en unidades/s, `t` = nivel (*tier*) de una estructura, `r` = podredumbre
(0–1), `p` = presión (0–1), `E` = esencia/s.

---

## 1. El reloj del simulador

- La simulación avanza en **pasos fijos de 0,1 s** (10 por segundo), sea cual sea la velocidad del móvil.
- Cuando el juego vuelve de segundo plano o se reabre, simula el tiempo perdido con pasos de **0,5 s**, hasta un máximo de
  **2 horas**.
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
| `M` | Multiplicador global | `(1 + 0,1 · mutágeno sin gastar) · (1 + 0,02 · logros)` |
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

Pero cada nivel del Corazón cuesta **×45** más que el anterior. Como 45 > 37, el tiempo que tarda en amortizarse cada
mejora del Corazón **crece**: eso es el muro. La Hipertrofia lo rompe. Con α = 1,2 un nivel completo vale 2^6,24 ≈ ×76,
que ya supera ×45, y la curva se dispara hasta que los peligros (que escalan con log₁₀ E) la alcanzan.

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

## 5. Presión e integridad

**Presión** (`p`):
- Conducto / Ganglio: contenido / capacidad.
- Cruce: el carril más lleno.
- Sangrador / Esporangio / Digestor / Matriz: búfer de salida / capacidad de salida. Que se llene la *entrada* de un
  procesador no le daña: le daña no poder sacar lo que produce.
- Corazón, Guardia y Cauterizador: **nunca** tienen presión (son sumideros con válvula; si se saturan, el problema pasa
  al conducto anterior).

**Pérdida de integridad por segundo:**
```
exceso  = (p − 0,85) / 0,15                      si p > 0,85
pérdida = ( exceso² / 180  +  [r > 0,6] / 400 ) · (1 + 2r) · 0,85^Quitina · 1,15^profundidad
```
- A presión 100 % sin podredumbre una estructura **revienta en 3 minutos**. Con podredumbre al 100 %, en 1 minuto.
- Por encima de 0,6 de podredumbre se pierde integridad aunque no haya presión.
- **Regeneración:** +1/300 por segundo (5 min de 0 a 100 %) si `p < 0,5` y nada la daña.

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
| Estructura **con flujo** (presión < 50 % y sacando > 0,05/s) | −0,002 (el flujo la arrastra) |
| Estructura **estancada** (parada, sellada o atascada) | `+0,01 · r · (1 − r)` (crecimiento logístico) |
| Guardia / Cauterizador | 0 (inertes) |
| Presión > 85 % | +0,004 adicional |
| Todas | `+0,0015 · Σ_vecinos (r_vecino − r)` (difusión) |

Además:
- **Entropía:** cada segundo, con probabilidad `0,004 · (1 + 0,5·log₁₀(1+E)) · 1,15^profundidad`, una estructura al
  azar recibe +0,25. **Una red más potente se corrompe más deprisa.** A 1.000 E/s es aproximadamente una semilla cada
  2 minutos.
- **Efectos:** caudal y producción × (1 − 0,75·r); daño a la integridad amplificado; no se puede construir con r ≥ 0,5.
- **Purificar a mano:** pone la casilla a 0 y cuesta `máx(5, 15 · E/s)` (15 segundos de producción).
- **Cauterizador:** quema 0,25 · 1,5^t de bilis/s para quitar `0,05 · 2^t` /s en un cuadrado de 5×5, y solo funciona si
  hay podredumbre que quemar.

> *Nota de diseño:* la primera versión hacía crecer la podredumbre en todas las casillas, y se comía el mapa entero en 12
> minutos hicieras lo que hicieras. Atarla al estancamiento la convierte en consecuencia directa de un mal diseño, y hace
> que dejar huecos sea una decisión con coste (más conducto, menos caudal) y beneficio (cortafuegos).

---

## 7. Sanguijuelas

**Oleadas:**
- Primera a los **4:00**. Después cada `máx(75, 200 · 0,96^oleada)` s: 192 s, 184 s… hasta 75 s a partir de la oleada 24.
- Cantidad: `1 + ⌊oleada/3⌋ + ⌊log₁₀(1+E)/2⌋`.

**Vida:**
```
vida = 4 · (1 + log₁₀(1+E))^1,5 · 1,05^oleada · 1,15^profundidad
```
Su fuerza sigue a **tu producción**, no al reloj. Ejemplos: a 0 E/s en la oleada 0 tienen 4 de vida; a 1.000 E/s en la
oleada 10, unas 52.

**Comportamiento:**
- Avanzan una casilla cada 1,5 s hacia la estructura más cercana (solo van a por el Corazón cuando no queda otra).
- Enganchadas: chupan el **25 %/s** del contenido, quitan **1 %/s** de integridad y añaden 0,01/s de podredumbre.
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

Al metamorfosear: caverna nueva (semilla nueva), esencia a 40, profundidad +1, se cierra el ciclo en las estadísticas.
Se conservan el mutágeno, las mutaciones, los logros y todas las estadísticas totales.

| Mutación | Efecto por nivel | Coste (mutágeno) | Máx. |
|---|---|---|---|
| Hipertrofia | α += 0,05 | 1 · 3^nivel | 20 |
| Memoria Vascular | caudal y capacidad de conductos/ganglios/cruces ×1,5 | 1 · 2,2^nivel | 30 |
| Fecundidad | extracción ×1,4 | 1 · 2,5^nivel | 30 |
| Catálisis | velocidad de procesadores ×1,35 | 2 · 2,5^nivel | 30 |
| Quitina | pérdida de integridad ×0,85 | 1 · 2^nivel | 15 |
| Garras | daño de golpe ×1,6 | 1 · 2^nivel | 25 |

---

## 10. Logros

32 logros. **Cada uno da +2 % al multiplicador global M, para siempre.** Se comprueban una vez por segundo de simulación.
Lista completa en [LOGROS.md](LOGROS.md).

---

## 11. Ritmo medido

El script `npm run probe` juega con un bot «atento pero simple» (golpea, remienda, purifica y ahorra para el Corazón;
**nunca** fabrica vitriolo):

```
  5 min   ~100 E/s     Corazón nivel 1
 15 min   ~450 E/s     Corazón nivel 2
 25 min  ~1.250 E/s    ← muro: el nivel 3 del Corazón cuesta 303.750
 35 min   1M en el ciclo → primera Metamorfosis posible
```

Es un **suelo**, no un objetivo: un jugador que monte una línea de vitriolo debería superarlo por órdenes de magnitud.
