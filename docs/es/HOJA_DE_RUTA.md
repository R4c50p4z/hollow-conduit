# Hoja de ruta y registro de cambios

## Registro de cambios

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
2. **iOS nativo:** el guardado con Preferences y la vibración ya están integrados; falta generar el proyecto
   (`npx cap add ios`, requiere Mac con Xcode), el icono y la pantalla de carga.
3. **Presión como recurso:** que las líneas entre el 70 % y el 85 % de presión vayan ×1,5 más rápido, para que jugar al
   límite sea una decisión deliberada (techo de habilidad).
4. **Segunda capa de prestigio:** «Esporulación», que permitiría llevarse un plano de construcción entre cavernas.
5. **Web Worker** para el simulador si la rejilla crece.

