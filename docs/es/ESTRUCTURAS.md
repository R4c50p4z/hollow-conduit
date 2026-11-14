# Estructuras: ficha técnica

Todos los valores son de nivel 0. **Cada nivel duplica** ritmos, caudales y capacidades (×2^nivel). La podredumbre los
reduce ×(1 − 0,75·r).

## Resumen

| Estructura | Terreno | Coste base | Crec./copia | Función |
|---|---|---|---|---|
| **Sangrador de veta** | veta | 10 | ×1,18 | Extrae icor: 1,0 · riqueza /s |
| **Esporangio** | lecho de esporas | 25 | ×1,22 | Extrae esporas: 0,8 · riqueza /s |
| **Conducto** | roca | 2 | ×1,04 | Lleva un fluido en su dirección a 6/s |
| **Ganglio** | roca | 8 | ×1,10 | Reparte a todos los lados que no le alimentan, 8/s |
| **Cruce** | roca | 12 | ×1,12 | Dos flujos se cruzan sin mezclarse, 6/s por carril |
| **Digestor** | roca | 60 | ×1,25 | 2 icor → 1 bilis, 0,5 transmutaciones/s |
| **Matriz Catalítica** | roca | 400 | ×1,30 | 1 bilis + 2 esporas → 1 vitriolo, 0,25/s |
| **Guardia de Espinas** | roca | 150 | ×1,45 | Quema 0,3 esporas/s → 1 daño/s a sanguijuelas (5×5) |
| **Cauterizador** | roca | 250 | ×1,50 | Quema 0,25 bilis/s → −0,05 podredumbre/s (5×5) |
| **El Corazón** | — | — | — | Sintetiza esencia. Tope 8/s por recurso |

«Crec./copia» es lo que se encarece cada estructura adicional del mismo tipo. Si una revienta o la arrasas, el contador
baja y la siguiente sale más barata.

---

## Costes de construcción (según cuántas tengas ya)

| Estructura | 1.ª | 2.ª | 3.ª | 5.ª | 10.ª |
|---|---|---|---|---|---|
| Sangrador | 10 | 11,8 | 13,9 | 19,4 | 44,4 |
| Esporangio | 25 | 30,5 | 37,2 | 55,4 | 150 |
| Conducto | 2 | 2,1 | 2,2 | 2,3 | 2,8 |
| Ganglio | 8 | 8,8 | 9,7 | 11,7 | 18,9 |
| Cruce | 12 | 13,4 | 15,1 | 18,9 | 33,3 |
| Digestor | 60 | 75 | 93,8 | 146 | 447 |
| Matriz | 400 | 520 | 676 | 1.142 | 4.242 |
| Guardia | 150 | 218 | 315 | 663 | 4.250 |
| Cauterizador | 250 | 375 | 563 | 1.266 | 9.611 |

## Costes de mejora (por nivel)

Fórmula: `máx(1, coste_base) · base_nivel · crecimiento_nivel^nivel_actual`. El Corazón lleva además una rampa
supraexponencial: `× 1,1^(t(t−1)/2)`. Sus siguientes niveles: 6→7 = 5,20e12, 7→8 = 4,15e14, 8→9 = 3,64e16.

| Estructura | 0→1 | 1→2 | 2→3 | 3→4 | 4→5 | 5→6 |
|---|---|---|---|---|---|---|
| Sangrador | 50 | 400 | 3.200 | 25.600 | 204.800 | 1,64e6 |
| Esporangio | 125 | 1.000 | 8.000 | 64.000 | 512.000 | 4,10e6 |
| Conducto | 12 | 84 | 588 | 4.116 | 28.812 | 201.684 |
| Ganglio | 48 | 336 | 2.352 | 16.464 | 115.248 | 806.736 |
| Cruce | 72 | 504 | 3.528 | 24.696 | 172.872 | 1,21e6 |
| Digestor | 300 | 2.700 | 24.300 | 218.700 | 1,97e6 | 1,77e7 |
| Matriz | 2.000 | 20.000 | 200.000 | 2,00e6 | 2,00e7 | 2,00e8 |
| Guardia | 600 | 4.800 | 38.400 | 307.200 | 2,46e6 | 1,97e7 |
| Cauterizador | 1.000 | 8.000 | 64.000 | 512.000 | 4,10e6 | 3,28e7 |
| **Corazón** | 150 | 6.750 | 334.125 | 1,82e7 | 1,09e9 | 7,18e10 |

---

## Fichas

### Sangrador de veta
- **Solo sobre vetas.** Extrae `1,0 · riqueza · 2^nivel · 1,4^Fecundidad` icor/s.
- Búfer de salida: 4 · 2^nivel. Empuja hasta 20 · 2^nivel /s hacia su flecha.
- **Peligro:** si no puede sacar el icor, el búfer se llena y la presión sube al 100 %. Revienta en ~3 min.
- **Consejo:** usa primero las vetas de mayor riqueza (toca la veta para verla). Si necesitas parar uno, **Séllalo**: un
  sangrador sellado no acumula presión.

### Esporangio
- **Solo sobre lechos de esporas.** Extrae `0,8 · riqueza · 2^nivel` esporas/s.
- Las esporas valen poco en el Corazón (peso 0,5), pero son imprescindibles para el **vitriolo** y para alimentar las
  **Guardias**.

### Conducto
- Lleva **un solo fluido**. Si contiene icor, rechaza esporas hasta vaciarse del todo.
- Acepta entradas por **cualquier lado excepto su salida**: puedes unir varias líneas del mismo fluido.
- Caudal `6 · 2^nivel · 1,5^Vascular`, capacidad `12 · 2^nivel` (unos 2 s de caudal).
- **Sellar un conducto lo convierte en válvula:** ni acepta ni empuja.
- Al arrastrar con la herramienta Conducto, cada tramo se orienta hacia el siguiente.

### Ganglio
- Reparte su contenido **a partes iguales** entre todos los vecinos con estructura que **no le alimentan**. Si un lado no
  puede aceptar, lo que sobra se reparte entre los demás.
- Admite mezcla de fluidos, pero ojo: si el vecino es un conducto con otro fluido, no aceptará.
- Uso típico: partir una línea de icor entre el Corazón y un Digestor, o desviar esporas hacia una Guardia.
- **Ramas de desbordamiento:** si una salida del Ganglio se llena (por ejemplo, la rama que va a una Matriz más lenta), el
  Ganglio manda el resto a las demás. Esa rama llena queda **en reposo**, sin tensión, y no se daña.

### Cruce
- Lo que entra por un lado **sale por el opuesto**. Tiene cuatro carriles independientes de un fluido cada uno.
- Sirve para que una línea vertical y otra horizontal se crucen sin mezclarse.
- No tiene orientación (no se gira). Su presión es la del carril más lleno.

### Digestor
- Receta: **2 icor → 1 bilis**. A nivel 0 hace 0,5 transmutaciones/s, es decir, **come 1 icor/s y saca 0,5 bilis/s**.
- Solo acepta icor (hasta 8 · 2^nivel).
- Si no puede sacar la bilis, su salida se llena, entra en **tensión** y revienta. Si le entra más icor del que come, la
  tensión aparece en el sangrador que lo alimenta y sube por el conducto de entrada.

### Matriz Catalítica
- Receta: **1 bilis + 2 esporas → 1 vitriolo**. A nivel 0: 0,25/s (come 0,25 bilis + 0,5 esporas, saca 0,25 vitriolo).
- Necesita **dos entradas distintas**, así que llévale bilis por un lado y esporas por otro.
- El vitriolo tiene peso **2,2**, el mayor del juego. 0,5 vitriolo/s ya multiplica tu producción por 1,5^2,2 ≈ 2,4.

### Guardia de Espinas
- **En línea:** acepta esporas hasta el doble de su reserva. Se queda 4 · 2^nivel de reserva y **deja pasar el resto**
  hacia su flecha. Puedes ponerla en mitad de la línea de esporas que va al Corazón.
- Si hay una sanguijuela en su cuadrado de 5×5, quema `0,3 · 1,5^nivel` esporas/s y le hace `1 · 2^nivel` de daño/s
  (siempre a la de menos vida).
- Nunca sufre presión. Si lo de delante se atasca, la que se llena es la línea anterior.

### Cauterizador
- **En línea** como la Guardia, pero con **bilis**.
- Si hay podredumbre en su cuadrado de 5×5, quema `0,25 · 1,5^nivel` bilis/s y quita `0,05 · 2^nivel` de podredumbre/s
  en **cada** casilla del área.

### El Corazón
- Uno por caverna, abajo en el centro. Acepta los cuatro recursos por cualquier lado.
- Come hasta `8 · 2^nivel` /s **de cada recurso**. Su búfer guarda 3 s de tope; cuando se llena, el atasco retrocede.
- No revienta nunca. Si se le pega una sanguijuela, te roba el 1 % de la esencia por segundo.
- **Es la mejora más importante del juego:** su tope limita todo lo demás.
