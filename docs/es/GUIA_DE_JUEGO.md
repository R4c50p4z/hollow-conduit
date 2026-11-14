# Guía de juego

## La idea en una frase

Construyes una red de tuberías orgánicas bajo tierra que lleva fluidos hasta un **Corazón**. El Corazón los convierte en
**esencia**, y la esencia sirve para construir más. La gracia es que **el Corazón multiplica los recursos entre sí**, así
que una red variada rinde exponencialmente más que una grande y monótona. Mientras tanto, todo lo que diseñes mal se
atasca, se pudre o se lo comen las sanguijuelas.

No es un idle de tocar la pantalla para ganar. Solo tocas para **defenderte**: golpear sanguijuelas, remendar, purificar
o purgar. Y todo eso es la respuesta a un fallo que tu diseño permitió.

---

## La pantalla

```
┌──────────────────────────────────────────┐
│ 1,25K  +48/s        oleada 3 en 1:12     │  ← esencia, esencia/s y aviso de oleada
│                      [▤] [Metamorfosis]  │  ← ▤ = estadísticas
│ ICOR     ESPORAS    BILIS     VITRIOLO   │
│ ▬▬▬▬     ▬          ▬▬                   │  ← ingesta del Corazón respecto a su tope
│ ×6,2     ×1,4       ×2,1      ×1,0       │  ← cuánto multiplica cada recurso
├──────────────────────────────────────────┤
│                                          │
│            la caverna (9×13)             │
│                                          │
├──────────────────────────────────────────┤
│ [Conducto][Ganglio][Cruce][Sangrador]... │  ← herramientas con su coste
│ texto de ayuda       [↓] [◎] [⚙] [?]     │  ← orientación, capa, ajustes, ayuda
└──────────────────────────────────────────┘
```

- **Los ×N de arriba son la clave del juego.** Cada uno es el factor por el que ese recurso multiplica la producción. Si
  ves ×1,0 en vitriolo, te estás dejando el multiplicador más grande sin usar.
- **◎ (capa):** alterna entre normal, **P** (presión de cada estructura en %) y **R** (podredumbre de cada casilla en %).
  Úsala para encontrar atascos.
- **⚙ (ajustes):** idioma (castellano/inglés), notación numérica (sufijos 1,5M o científica 1,5e6), objetivos guiados
  y sonido.
- **Barra de objetivo** (bajo el HUD): te dice el siguiente paso durante la primera sesión (9 objetivos). Se oculta con
  ✕ o desde Ajustes.

### Sonido
Todo el sonido se genera al vuelo, sin archivos. El **latido del Corazón se acelera con tu producción** (de ~38
pulsaciones por minuto en reposo hasta 132), así que puedes «oír» cómo va tu red. Además: chasquido grave cuando algo
revienta, rumor lejano cuando llega una oleada, chapoteo al golpear y campanilla al conseguir un logro. En el iPhone
también vibra. iOS solo permite sonido tras el primer toque en la pantalla.

### El terreno

| Lo que ves | Qué es | Qué se construye encima |
|---|---|---|
| Losas oscuras | Roca desnuda | Conductos, ganglios, cruces, procesadores y defensas |
| Grietas rojas | **Veta de icor** | Solo Sangradores |
| Puntos ámbar | **Lecho de esporas** | Solo Esporangios |
| Agujeros negros con borde rojo | **Madriguera** | Nada. De aquí salen las sanguijuelas |

Cada caverna tiene 6 vetas, 4 lechos y 3 madrigueras, colocados al azar. Las vetas tienen una **riqueza** de 0,6 a 1,5
(tócalas para verla), que multiplica lo que extraes. **Las vetas ricas valen oro.**

---

## Controles

| Gesto | Qué hace |
|---|---|
| Elegir herramienta y tocar una casilla vacía | Construye mirando hacia la flecha de orientación |
| Elegir **Conducto** y **arrastrar** | Tiende una tubería siguiendo el dedo. Cada tramo apunta al siguiente. |
| Tocar una sanguijuela | La golpeas |
| Tocar cualquier otra cosa | Abre el inspector |
| Tocar dos veces la misma casilla | Cierra el inspector |

Desde el **inspector** puedes **Mejorar**, **Girar**, **Remendar** (repara integridad), **Sellar** (apaga la estructura;
un conducto sellado es una válvula), **Purgar** (la vacía al instante a cambio de podredumbre), **Purificar** (quita la
podredumbre de la casilla) y **Arrasar** (demoler; recuperas el 50 % de lo invertido).

---

## Los primeros 30 minutos

### Minuto 0–2: la primera línea
1. Empiezas con **40 de esencia**. Busca la **veta más cercana al Corazón**.
2. Elige **Sangrador**, ajusta la flecha para que apunte hacia donde irá el conducto y toca la veta.
3. Elige **Conducto** y arrastra desde la casilla de al lado del sangrador hasta tocar el Corazón.
4. Verás el icor (rojo) correr por el tubo. Ya produces ~1 esencia/s.

> ⚠️ **Nunca pongas un sangrador sin salida.** Se llena en 4 segundos, sube a 100 % de presión y revienta en unos 3
> minutos, dejando podredumbre. Es el error número uno.

### Minuto 2–8: ensanchar
- Pon más sangradores en otras vetas y **únelos a la misma línea**: un conducto acepta entradas por los lados.
- Un conducto de nivel 0 mueve **6 unidades/s**. Cinco sangradores normales caben en una línea; si te pasas, la línea se
  atasca y todo lo de detrás sube de presión.
- **Pon un Esporangio** en un lecho y llévalo al Corazón **por otro lado**. Un conducto solo lleva un fluido, así que
  cada recurso necesita su propia entrada al Corazón (tiene 4 lados: uno por recurso).

### Minuto 8–15: el primer refinado
- Construye un **Digestor** (2 icor → 1 bilis) en la línea de icor y saca la bilis por **otro lado** del Corazón.
- Ojo, el digestor de nivel 0 solo procesa **1 icor/s**. Si le mandas más, se atasca. O le mandas solo lo que puede
  comer, o lo mejoras, o usas un **Ganglio** para repartir.
- Fíjate en el HUD: aparece un **×2** o más debajo de BILIS. Tu producción se multiplica.

### Minuto 4: primera oleada
- A los **4:00** sale la primera sanguijuela de una madriguera. Va a la estructura más cercana y se engancha.
- **Tócala para golpearla** (1 de daño por toque). Al principio tienen ~4 de vida.
- Si no la matas, chupa el contenido, roe la integridad y deja podredumbre. A los 45 s de comer se marcha saciada.

### Regla de oro de las ramas
**No tiendas una rama hasta tener su destino.** Una rama que acaba en nada se llena, entra en tensión y revienta. En
las pruebas, el bot que construía las ramas hacia la Matriz antes de poder pagarla se gastaba toda la esencia en
remiendos.

### Minuto 15–30: defensa y escalado
- Las sanguijuelas se hacen más fuertes cuanto más produces. Hacia los 15–20 minutos los toques no bastan: construye
  una **Guardia de Espinas** cerca de las madrigueras y pásale esporas. Funciona **en línea**: guarda 4 esporas de
  reserva y deja pasar el resto. Puedes ponerla en mitad de la línea de esporas que va al Corazón.
- **Mejora el Corazón.** Cada nivel duplica su tope de ingesta (8 → 16 → 32/s por recurso). Cuando las barras del HUD
  están llenas, el Corazón es tu cuello de botella.
- Construye la **Matriz Catalítica** (1 bilis + 2 esporas → 1 vitriolo). El vitriolo tiene el peso más alto (2,2): es
  el mayor multiplicador del juego.

### Al llegar a 1M de esencia en el ciclo
Se ilumina **Metamorfosis**. Puedes reiniciar la caverna a cambio de **mutágeno** permanente (ver más abajo).

---

## Los tres peligros, y cómo sobrevivir a cada uno

### 1. Presión (atascos)
**Síntoma:** brillo naranja-rojo pulsante sobre una estructura y grietas que aparecen. Eso es **tensión**.
**Causa:** un productor no puede sacar lo que produce porque algo de más adelante no da abasto: un conducto lento, un
procesador lento, un Corazón saturado o un callejón sin salida. Estar lleno sin más **no** daña: una rama llena junto a
un Ganglio que puede mandar el resto a otro sitio está en reposo y es segura.
**Solución:** pon la capa **P**, sigue la línea hasta el primer punto que **no** está lleno (ahí está el cuello de
botella) y mejóralo o reparte el flujo con un Ganglio. En una emergencia, **Sella** el productor o **Purga** el tramo.

### 2. Podredumbre
**Síntoma:** manchas verde-negruzcas con filamentos.
**Regla de oro:** **lo que fluye se limpia solo, lo estancado se pudre.** Un conducto con flujo sano limpia 0,002/s; uno
atascado, sellado o parado cría podredumbre que se extiende a las estructuras vecinas.
**Solución:** arregla el atasco y la podredumbre se irá sola. Para focos graves, **Purifica** (cuesta 15 s de tu producción)
o construye un **Cauterizador** alimentado con bilis. **La roca desnuda es un cortafuegos:** dejar huecos entre partes de
la red impide que una infección se extienda por todo.

### 3. Sanguijuelas
**Síntoma:** gusanos rojos con barra de vida.
**Regla:** su vida crece con el **logaritmo de tu producción**. Cuanto más fuerte eres, más fuertes vienen.
**Solución:** golpes al principio y **Guardias de Espinas** con esporas a partir de entonces. Mejorar una Guardia duplica
su daño. Colócalas cubriendo el camino entre madrigueras y red (alcance: cuadrado de 5×5 alrededor).

---

## Dejarla sola: jugar sin estrés

**Si diseñas bien la red, aguanta sola indefinidamente.** El peligro viene de los fallos de diseño, nunca del paso del
tiempo:

- Las sanguijuelas **no se hacen más fuertes con el tiempo**. Su vida depende solo de tu producción y de la profundidad
  que elegiste. Si tus defensas aguantan una oleada, aguantan todas.
- El tamaño de las oleadas tiene techo.
- El desgaste aleatorio (entropía) existe y lo verás, pero **se cura solo** y nunca puede, por sí solo, causar una
  infección. Tampoco cae nunca sobre el Corazón.
- Un productor que no puede sacar su producción **se queda quieto** sin dañarse. Lo que revienta son los conductos
  forzados (callejones sin salida y cuellos de botella).

### El indicador ✓ Estable
En el HUD verás **✓ Estable** o **⚠ n**. Está estable cuando se cumplen las cuatro condiciones:
1. 0 estructuras en tensión.
2. 0 infecciones de podredumbre (casillas con estructura por encima del 35 %).
3. Ninguna rotura en los últimos 10 minutos.
4. Ninguna sanguijuela huida saciada en los últimos 10 minutos (si alguna se va saciada, tu defensa no da abasto).

Tócalo y verás cuál falla.

### Receta para una red que dure para siempre
1. **Ningún conducto en tensión.** Usa la capa P: nada debe brillar en naranja-rojo. Deja **margen**: un tronco al 100 %
   exacto de su capacidad puede atascarse con cualquier pequeña bajada de caudal. Apunta a un 75 % como máximo.
2. **Un puesto de defensa en cada madriguera:** un Esporangio que alimente una Guardia de Espinas pegada a la madriguera.
   Las espinas la protegen: sobre ella las sanguijuelas muerden al 25 % y no pueden robarle las esporas. Es un pararrayos,
   porque atrae a las sanguijuelas y las mata. Súbela de nivel hasta que **ninguna se escape saciada**.
3. **Ramas de desbordamiento en vez de callejones sin salida:** si algo puede llenarse, que haya un Ganglio antes para
   desviar el resto.
4. Espera a ver **✓ Estable** y vete tranquilo.

### Mientras no estás
- La caverna se simula **paso a paso hasta 12 horas**.
- Si en la última hora simulada tu red era estable (0 roturas, nada perdido), **sigue produciendo a ese ritmo** el resto
  del tiempo, **hasta 7 días**.
- Si no era estable, solo cuenta lo simulado. Una red frágil se derrumba de verdad mientras duermes.

En las pruebas con el bot, una red con puestos de defensa en las tres madrigueras mantuvo **115 E/s durante 24 horas
seguidas sin una sola rotura** y con más de 7.000 sanguijuelas abatidas, en las cuatro semillas probadas.

## La Metamorfosis (prestigio)

Cuando en un ciclo hayas producido **1M de esencia**, puedes metamorfosear:

- **Pierdes:** toda la caverna, las estructuras y la esencia. Empiezas en una caverna **nueva** con 40 de esencia.
- **Ganas:** mutágeno = ⌊(esencia del ciclo / 1M)^0,35 × 1,2^profundidad⌋. Con 1M sacas 1, con 100M unos 5 y con 1B unos 11.
- **Eliges:** **Descender** (+1 de profundidad: peligros ×1,15 y mutágeno futuro ×1,2) o **Permanecer** en la misma
  profundidad. Baja mientras tus ciclos salgan limpios; quédate cuando empiecen a reventar cosas.

El mutágeno se gasta en **mutaciones permanentes**. Las más importantes:

| Mutación | Por qué importa |
|---|---|
| **Hipertrofia** | Sube el exponente α del Corazón. Es la única que hace la curva *más exponencial*. Compra esta primero. |
| Memoria Vascular | Conductos más rápidos: menos atascos. |
| Fecundidad | Más extracción en todas las vetas. |
| Catálisis | Procesadores más rápidos. |
| Quitina | Tus estructuras aguantan más presión y podredumbre. |
| Garras | Tus golpes hacen más daño. |

> 💡 **El mutágeno sin gastar también rinde:** cada punto guardado da +10 % de esencia hasta 100 puntos (×11), y a partir
> de ahí crece con la raíz cuadrada. Decidir si gastarlo o guardarlo es parte de la estrategia.

---

## Al volver al juego

**El juego no se pausa.** Cuando vuelves, la caverna simula de verdad el tiempo que estuviste fuera (hasta 2 horas), con
peligros incluidos. Una red bien diseñada habrá producido mucho; una mal diseñada puede haber reventado. Verás un
informe con lo que pasó, y en **▤ Estadísticas → Total** queda registrado el tiempo simulado sin conexión.

---

## Consejos de optimización

1. **Variedad antes que volumen.** Pasar de 4 a 8 de icor multiplica por ~1,8. Añadir 1 de bilis multiplica por 2,8.
2. **Lee el reparto del Corazón** (▤ → Ahora → *Reparto del rendimiento*). Si un recurso se lleva el 80 %, los demás
   están infrautilizados.
3. **El Corazón tiene tope por recurso.** Cuando una barra del HUD está llena, mejorar ese recurso ya no sirve: mejora el
   Corazón o diversifica.
4. **Usa los Cruces** para que dos líneas se crucen sin mezclarse. La rejilla de 9×13 se llena enseguida.
5. **Cuello de botella = el primer vaso no lleno** siguiendo el flujo. Las estadísticas te dan los 5 peores.
6. **Deja cortafuegos** de roca desnuda entre zonas de la red.
7. **Mira la eficiencia de entrega** (▤ → Ciclo): por debajo del 95 % estás perdiendo recursos por derrames, roturas o
   sanguijuelas.
8. **Los logros dan +2 % de esencia cada uno**, para siempre. Hay 32: eso es un +64 % potencial.
