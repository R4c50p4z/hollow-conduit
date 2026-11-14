# Hoja de ruta y registro de cambios

## Registro de cambios

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
- **Objetivos guiados:** 9 objetivos para la primera sesión, desactivables en Ajustes.
- **iOS:** guardado con el plugin Preferences (iOS puede borrar `localStorage`) y vibración háptica al golpear, en cada
  oleada, al conseguir un logro y al reventar algo.
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
6. **Sonido:** latido del Corazón ligado a la producción, chasquidos al reventar.
