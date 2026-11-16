# Hoja de ruta y registro de cambios

## Registro de cambios

### v0.6: lecciones de Mindustry (prioridades 2 y 3)
- **Tendido asistido** (búsqueda de camino con penalización de giros) y **Deshacer** (reembolso del 100 % en 10 s).
- **Cambio de fluido** con resto < 2 % (se derrama) en vez de esperar al vaciado total.
- **Mejorar arrastrando** con coste total antes de confirmar.
- **Planos**: se guardan al metamorfosear y se reaplican como planes en la caverna nueva.
- **Ruinas** reconstruibles 10 min y **reconstrucción automática** opcional (solo podredumbre/sanguijuelas, tope 10 %/h).
- **Cicatrizante** (cura con icor) y **Depósito** (conducto ×4 de capacidad).
- **Vista previa** al colocar (casillas válidas + cifras reales + aviso de proporción), **anillo** en el productor que
  origina una tensión, «produce/entrega» en la ficha y **madrigueras que laten** los 30 s antes de una oleada.
- Pruebas AFK de 24 h sin cambios en el equilibrio.

### v0.5: lecciones de Mindustry (prioridad 1)
- **Ganglio con modo prioridad** (compuerta de desbordamiento): todo por el lado al que apunta y el sobrante a los demás.
  Resuelve la trampa Digestor → una sola Matriz.
- **Estado de cada pieza:** punto de color en la caverna y motivo exacto en la ficha (sin salida, otro fluido, lleno,
  le falta…).
- **«¿Aguanta sin mí?»:** simulación de 30 min con sanguijuelas sobre una copia de la partida, con veredicto.
- Informe completo en `reports/Mindustry lecciones de diseño logístico.md`. Siguiente: prioridad 2 de ese informe.

### v0.4: periodo de gracia y tutorial
- **Periodo de gracia:** sin sanguijuelas durante los primeros 2 días de juego (cuenta el tiempo total, también con la
  app cerrada, y sobrevive a la metamorfosis). El HUD muestra lo que queda y se puede terminar antes en ⚙ Ajustes. Los
  objetivos de sanguijuelas esperan a que acabe.
- Fuera de casa, la producción constante solo se acredita hasta el final de la gracia: una red que no se ha enfrentado a
  sanguijuelas aún no ha demostrado ser estable.
- **Tutorial en el juego:** 13 páginas con **demostraciones en vivo** que ejecutan el motor real. Se abre en la primera
  partida y con el botón **?**. Un test comprueba que cada demostración enseña lo que dice su texto.

### v0.3.1: app web instalable
- Se instala desde Safari en la pantalla de inicio, a pantalla completa y con icono propio, y funciona sin conexión.
- Despliegue listo para Netlify (gratis con repos privados) y GitHub Pages. Guía en `INSTALAR.md`.
- Se descarta la app nativa (Xcode). El código de Capacitor queda dormido, sin coste.

### v0.3: diseña bien y dura para siempre
- **Las sanguijuelas ya no se fortalecen con el tiempo**, solo con tu producción y la profundidad. El tamaño de las
  oleadas tiene techo.
- **Espinas:** sobre una Guardia las sanguijuelas muerden al 25 % y no pueden robarle las esporas.
- **Productores bloqueados:** se quedan quietos sin dañarse. Las roturas por presión quedan para los conductos forzados.
- **Podredumbre con umbral de no retorno (35 %)** y contagio entre estructuras. La entropía no puede cruzar el umbral
  ni cae sobre el Corazón.
- **Tiempo fuera:** 12 h simuladas paso a paso y, si la red era estable, producción constante hasta 7 días.
- **Indicador ✓ Estable** en el HUD y sección de estabilidad en las estadísticas.
- Probado: cuatro semillas, 24 h AFK, 0 roturas tras el arranque.
- A vigilar: con buenos diseños, descender de profundidad ya casi no se castiga, y la progresión activa a largo plazo
  es más rápida (α 1,45 a las 8 h frente a las 24 h de antes).

### v0.2: castellano, estadísticas y logros
- **Idiomas:** castellano e inglés, con cambio en caliente desde ⚙ Ajustes o la ayuda. Detecta el idioma del móvil la
  primera vez. Coma decimal en castellano.
- **Notación numérica** configurable: sufijos (1,5M) o científica (1,5e6).
- **Panel de estadísticas** (▤) con seis pestañas: Ahora, Ciclo, Total, Gráficas, Ciclos y Logros. Más de 70 métricas,
  10 gráficas con lectura al tacto y vista de tabla.
- **32 logros**, cada uno con +2 % de esencia permanente.
- **Cruce:** estructura nueva para que dos líneas se crucen sin mezclarse.
- **Guardias y Cauterizadores en línea:** guardan una reserva y dejan pasar el resto. Antes, alimentarlos directamente
  acababa siempre reventando la línea.
- **Tensión:** la presión solo daña cuando nace en un productor bloqueado. Las ramas de desbordamiento llenas ya no se
  rompen.
- **Equilibrado a largo plazo**, gracias a un bot de muchos ciclos (`npm run probe:deep`): rampa supraexponencial del
  Corazón y de las mutaciones, tope suave del mutágeno sin gastar y profundidad elegible (Descender/Permanecer).
- **Exportar estadísticas:** JSON completo, CSV de series temporales y CSV de ciclos.
- **Gráficas entre ciclos** (pestaña Ciclos): pico de esencia/s, mutágeno, duración y profundidad de cada ciclo.
- **Sonido procedural** (Web Audio, sin archivos): latido del Corazón ligado a la producción, roturas, oleadas, golpes,
  construcción y logros. Se puede silenciar.
- **Objetivos guiados:** 9 objetivos para la primera sesión, desactivables en Ajustes.
- **iOS:** guardado con el plugin Preferences (iOS puede borrar `localStorage`) y vibración háptica al golpear, en cada
  oleada, al conseguir un logro y al reventar algo.
- **Interfaz compacta:** la caverna gana espacio (casilla de 15→24 px en iPhone SE, 29→37 px en Pro Max).
- Guardado v2 con migración automática desde v1.
- Documentación completa en castellano (esta carpeta).

### v0.1: prototipo
- Simulador determinista: flujo, presión, podredumbre, sanguijuelas y metamorfosis.
- Interfaz para iPhone con arte procedural en canvas.
- Bot de equilibrado. El bot destapó tres bloqueos sin salida y un error de difusión, ya corregidos.

## Próximos pasos (por prioridad)

1. **Equilibrado con personas.** Los bots dan un suelo (1 ciclo) y una curva de 24 h (muchos ciclos), pero no hay
   sustituto de jugarlo de verdad.
2. **Copia de seguridad de la partida:** exportar/importar el guardado como texto, para no perderlo si se borra la app.
3. **Presión como recurso:** que las líneas entre el 70 % y el 85 % de presión vayan ×1,5 más rápido, para que jugar al
   límite sea una decisión deliberada (techo de habilidad).
4. **Segunda capa de prestigio:** «Esporulación», que permitiría llevarse un plano de construcción entre cavernas.
5. **Web Worker** para el simulador si la rejilla crece.

