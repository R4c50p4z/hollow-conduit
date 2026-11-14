# Estadísticas: qué mide cada número

El panel se abre con el botón **▤** del HUD. Tiene seis pestañas:

| Pestaña | Qué muestra | De dónde sale |
|---|---|---|
| **Ahora** | Foto en directo de tu red: el Corazón, el estado de cada parte, los cuellos de botella y la amenaza | Se calcula al vuelo (`snapshot()` en `src/sim/stats.ts`). No se guarda. |
| **Ciclo** | Contadores desde la última metamorfosis, más los récords del ciclo | `stats.run`. Se pone a cero al metamorfosear. |
| **Total** | Los mismos contadores para toda la partida, más los récords históricos | `stats.life`. No se borra nunca (salvo «Borrar partida»). |
| **Gráficas** | Series temporales de la última hora del ciclo, con vista de tabla | `stats.history`, una muestra cada 10 s y 360 como máximo. |
| **Ciclos** | Tabla con cada ciclo terminado | `stats.runs`, los últimos 100. |
| **Logros** | Los 32 logros, cuáles tienes y el bonus total | `achievements`. |
| **Exportar** | Descarga o comparte tus datos | Ver «Exportar» al final |

> Todos los contadores son **sumas exactas** que el motor actualiza en el momento en que ocurre cada cosa (no son
> estimaciones). Un test comprueba que `producido = consumido + en tránsito` cuadra al céntimo en una red sin pérdidas.

En las filas por recurso verás cuatro valores con un cuadradito de color: **icor · esporas · bilis · vitriolo**, en ese
orden.

---

## Pestaña «Ahora»

### Corazón
| Estadística | Qué es | Cómo usarla |
|---|---|---|
| **Esencia/s** | Producción actual `E/s` | — |
| **Esencia acumulada** | Lo que tienes para gastar | — |
| **Esencia en este ciclo** | Lo producido desde la última metamorfosis. Decide cuánto mutágeno sacas. | Necesitas 1M para metamorfosear |
| **Exponente α** | `1 + 0,05 · Hipertrofia` | Cada +0,05 eleva *todo* el rendimiento a una potencia mayor |
| **Multiplicador global M** | `(1 + 0,1·mutágeno sin gastar) · (1 + 0,02·logros)` | — |
| **Tope de ingesta por recurso** | `8 · 2^nivel del Corazón` | Si una ingesta llega al 100 % del tope, mejora el Corazón |
| **Ingesta · recurso** | Unidades/s que entran, % del tope y **factor** `(1+x)^(w·α)` | El factor es el ×N del HUD: cuánto multiplica ese recurso |

### Reparto del rendimiento del Corazón
Una barra que muestra **qué parte del logaritmo de tu producción aporta cada recurso**:
`aporte_r = w_r·α·log₁₀(1+x_r) / Σ`. Como el Corazón multiplica, cada recurso **suma** en escala logarítmica.
- Una barra muy dominada por un color indica que te falta variedad.
- Con 1/s de cada recurso, el reparto ideal sería icor 19 %, esporas 10 %, bilis 29 % y vitriolo 42 % (es decir,
  proporcional a los pesos).

### Red
| Estadística | Qué es |
|---|---|
| **Estructuras** | Total (sin el Corazón), desglosado por tipo con la **suma de niveles** de ese tipo |
| **Nivel más alto** | La estructura más mejorada |
| **Con flujo** | Estructuras que están moviendo fluido sanamente (salida > 0,05/s y sin tensión). **Estas se autolimpian de podredumbre.** |
| **Estancadas** | El resto: paradas, selladas, atascadas o sin entrada. **Aquí crece la podredumbre.** |
| **Selladas** | Apagadas a mano |
| **Vetas explotadas / Lechos usados** | Cuántos de los recursos del mapa estás aprovechando |
| **Esencia invertida** | Suma de lo gastado en las estructuras que siguen en pie (construcción + mejoras) |
| **Caudal total de vasos** | Suma del caudal máximo de todos tus conductos, ganglios y cruces |
| **Extracción teórica** | Lo que darían tus sangradores y esporangios si nada se atascara. Compárala con la ingesta: la diferencia es lo que pierdes por atascos o lo que va a refinado |
| **Fluido en tránsito** | Unidades que hay ahora mismo dentro de la red |

### Salud
| Estadística | Qué es |
|---|---|
| **Presión media / máxima** | Media y pico de llenado de los vasos y productores |
| **Sobrepresionadas** | Cuántas estructuras están **en tensión** (llenas y empujadas por una bomba bloqueada). Son las que están perdiendo integridad ahora mismo. |
| **Integridad media / estructura más débil** | — |
| **Agrietadas** | Integridad < 50 % |
| **Podredumbre media / peor** | Sobre todas las casillas del mapa |
| **Casillas con podredumbre** | r > 5 % |
| **Podredumbre grave** | r > 50 % (ahí no se puede construir) |

### Peores cuellos de botella
Las 5 estructuras **en tensión** con más presión, con sus coordenadas `(columna, fila)` contando desde 1 en la esquina superior
izquierda. **El cuello de botella real suele estar justo después del último de la lista**, siguiendo el flujo: es lo que
no da abasto.

### Amenaza
| Estadística | Qué es |
|---|---|
| **Sanguijuelas ahora** y **su vida total** | — |
| **Próxima oleada** | Cuántas vendrán, con cuánta vida cada una, y cuándo. Calculado con tu producción actual. |
| **Semillas de entropía / min** | Frecuencia esperada de podredumbre aleatoria: `60 · 0,004 · (1 + 0,5·log₁₀(1+E)) · 1,15^prof.` |
| **Mutágeno si metamorfoseas ahora** | — |

---

## Pestañas «Ciclo» y «Total»

Las dos tienen los mismos contadores. **Ciclo** cuenta desde la última metamorfosis y **Total** desde siempre.

### Récords (solo en Ciclo)
Pico de esencia/s, máxima esencia acumulada, **pico de ingesta** por recurso, máximo de sanguijuelas a la vez y
profundidad.

### Récords (solo en Total)
Esencia total, mejor esencia/s de siempre, número de metamorfosis, profundidad, mutágeno ganado en total, **metamorfosis
más rápida**, ciclo más largo, **tiempo simulado sin conexión**, sesiones (veces que has abierto el juego) y logros.

### Flujo de recursos
| Estadística | Qué cuenta |
|---|---|
| **Tiempo** | Tiempo de simulación transcurrido (incluye el simulado sin conexión) |
| **Producido** | Todo lo extraído **más** lo fabricado por recetas (la bilis y el vitriolo cuentan aquí al crearse) |
| **Dado al Corazón** | Lo que el Corazón ha comido |
| **Usado en recetas** | Lo que entró en digestores y matrices (el icor que se convirtió en bilis, etc.) |
| **Quemado como combustible** | Esporas de Guardias y bilis de Cauterizadores |
| **Chupado por sanguijuelas** | Contenido robado de tus estructuras |
| **Derramado** | Perdido en roturas, purgas y al arrasar |
| **Eficiencia de entrega** | `(Dado al Corazón + Usado en recetas + Quemado) / Producido`. Lo que llegó a algún sitio útil. **Por encima del 95 % es una red sana.** Lo que falta es derrame, robo o fluido que sigue en tránsito. |
| **Transmutaciones** | Total de recetas completadas por digestores y matrices |

### Economía
| Estadística | Qué cuenta |
|---|---|
| **Esencia ganada** | Todo lo producido por el Corazón |
| **Esencia/s media** | `Esencia ganada / Tiempo` |
| **Gastado en construir / mejorar / remendar / purificar** | Desglose del gasto |
| **Recuperado al arrasar** | El 50 % devuelto al demoler |
| **Perdido por sanguijuelas en el Corazón** | El 1 %/s robado de tu esencia acumulada |

> Truco: si «Gastado en remendar» + «Gastado en purificar» es una parte grande del gasto total, estás pagando un
> **impuesto de mantenimiento** por un mal diseño. Arregla la causa (atascos, estancamiento) en vez del síntoma.

### Construcción
Construidas (con desglose por tipo), mejoras, arrasadas, remiendos, purgas, purificaciones, sellados/aperturas y giros.

### Peligros
| Estadística | Qué cuenta |
|---|---|
| **Roturas** | Total, desglosado **por causa** (presión / podredumbre / sanguijuelas) y **por tipo** de estructura |
| **Tiempo-estructura sobrepresionado** | Suma, para cada estructura, del tiempo que pasó en tensión. Dos estructuras sobrepresionadas durante 1 minuto suman 2 minutos. |
| **Tiempo-casilla en podredumbre grave** | Lo mismo para casillas con r > 50 % |
| **Podredumbre purificada a mano / arrasada por cauterizadores / arrastrada por el flujo** | Cantidad total eliminada por cada vía, en «casillas completas» (1,0 = una casilla del 100 % al 0 %) |
| **Semillas de entropía** | Veces que la entropía sembró podredumbre |

### Defensa
| Estadística | Qué cuenta |
|---|---|
| **Oleadas** | — |
| **Sanguijuelas aparecidas / abatidas** | Las abatidas se desglosan **a golpes** y **por guardias** (según quién dio el último golpe) |
| **Huidas saciadas** | Se fueron tras 45 s comiendo |
| **Tasa de abatimiento** | `abatidas / aparecidas` |
| **Golpes / daño a golpes / daño de guardias** | El daño cuenta solo la vida realmente quitada (no el exceso sobre una sanguijuela ya muerta) |

---

## Pestaña «Gráficas»

Una muestra cada **10 s de simulación**, hasta **1 hora** (360 muestras). Se reinicia en cada ciclo.

| Gráfica | Qué muestra |
|---|---|
| Esencia/s (log₁₀) | 3 = 1.000/s, 6 = 1M/s… En escala log, una línea recta ascendente es **crecimiento exponencial** |
| Esencia acumulada (log₁₀) | Los «dientes de sierra» son compras grandes |
| Ingesta del Corazón: icor / esporas / bilis / vitriolo | Una gráfica por recurso (en pequeños múltiplos, para que se lean bien sin depender del color) |
| Presión media de los vasos (%) | Subidas = atascos que se están formando |
| Integridad media (%) | Caídas = daño acumulándose |
| Podredumbre media (%) | — |
| Sanguijuelas vivas | Los picos son las oleadas |
| Estructuras | Las caídas son roturas |

**Interacción:** pasa el dedo por una gráfica para ver el valor exacto y el momento. El botón **«Ver como tabla»**
muestra todas las muestras en una tabla (la más reciente arriba), útil para copiar datos.

---

## Pestaña «Ciclos»

Arriba, cuatro **gráficas entre ciclos** (a partir de 2 ciclos terminados): pico de esencia/s (log₁₀), mutágeno
obtenido (log₁₀), duración en minutos y profundidad de cada ciclo. Debajo, la tabla: una fila por cada metamorfosis con
número, profundidad en la que se jugó, duración, **pico de esencia/s**, **esencia total del ciclo**, mutágeno obtenido,
roturas y sanguijuelas abatidas. La más reciente arriba.

> Para comparar ciclos: «esencia del ciclo / duración» te da la esencia/s media, y «mutágeno / duración» tu eficiencia
> de prestigio. Ciclos más cortos con más mutágeno por minuto suelen ser la mejor estrategia una vez tienes Hipertrofia.

---

## Exportar

En la última pestaña puedes sacar tus datos del juego:

| Botón | Archivo | Contenido |
|---|---|---|
| Todas las estadísticas | `hollow-stats-FECHA.json` | Todo: contadores del ciclo y totales, récords, foto en directo, ciclos, mutaciones y logros |
| Series temporales | `hollow-series-FECHA.csv` | Una fila por muestra de 10 s: `t_s, rate_log10, essence_log10, intake_ichor…, rot_avg, pressure_avg, integrity_avg, leeches, structures` |
| Ciclos | `hollow-cycles-FECHA.csv` | Una fila por ciclo terminado |

En el iPhone se abre el menú de compartir (guardar en Archivos, AirDrop, Numbers…). En el navegador se descarga, y si no
se puede, se copia al portapapeles. Los CSV usan punto decimal y coma como separador, el formato estándar que abren
Excel, Numbers y Google Sheets.

## Muestras guardadas y privacidad

Todo se guarda **solo en tu dispositivo**, dentro de la partida (`localStorage`). Nada se envía a ningún servidor.
