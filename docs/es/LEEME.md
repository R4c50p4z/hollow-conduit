# Documentación en castellano: *Las Esporas de la Ruina*

Bienvenido a la Oquedad. Esta carpeta explica **todo** el juego en castellano: cómo se juega, cada mecánica con sus
fórmulas exactas, cada estructura con sus números, qué significa cada estadística y cómo está construido el código.

| Documento | Para qué sirve |
|---|---|
| [INSTALAR.md](INSTALAR.md) | Cómo publicarlo gratis e instalarlo en el iPhone sin Mac ni Xcode. **Empieza aquí si quieres jugarlo ya.** |
| [GUIA_DE_JUEGO.md](GUIA_DE_JUEGO.md) | Cómo se juega, paso a paso. Los primeros 30 minutos, errores típicos y estrategia. **Empieza aquí para aprender a jugar.** |
| [MECANICAS.md](MECANICAS.md) | Todas las reglas del simulador con sus fórmulas: el Corazón, el flujo, la presión, la podredumbre, las sanguijuelas y la metamorfosis. |
| [ESTRUCTURAS.md](ESTRUCTURAS.md) | Ficha técnica de cada estructura: costes, caudales, capacidades y tablas de mejora. |
| [ESTADISTICAS.md](ESTADISTICAS.md) | Cada estadística del panel ▤: qué mide, cómo se calcula y cómo leerla para optimizar. |
| [LOGROS.md](LOGROS.md) | Los 32 logros, cómo conseguirlos y su recompensa. |
| [ARQUITECTURA.md](ARQUITECTURA.md) | Cómo está hecho por dentro (para seguir desarrollándolo). |
| [HOJA_DE_RUTA.md](HOJA_DE_RUTA.md) | Registro de cambios y próximos pasos. |

> **Fuente de verdad:** todos los números salen de `src/sim/config.ts` y todas las fórmulas de
> `src/sim/formulas.ts`. Si cambias una constante, esta documentación deja de estar al día en ese punto.
> Las cifras de aquí corresponden a la versión 0.2.

## Glosario rápido

| Término | Inglés (en el código) | Qué es |
|---|---|---|
| Esencia | essence | La moneda. La produce el Corazón. |
| Icor | ichor | Fluido rojo que se sangra de las vetas. Recurso básico. |
| Esporas | spore | Recurso básico que dan los lechos de esporas. También es combustible de las Guardias. |
| Bilis | bile | Recurso refinado (2 icor → 1 bilis). También es combustible de los Cauterizadores. |
| Vitriolo | vitriol | Recurso refinado de segundo nivel (1 bilis + 2 esporas → 1 vitriolo). El más valioso. |
| Presión | pressure | Lo lleno que está un vaso (0–100 %). Por encima del 85 % daña la estructura. |
| Integridad | integrity | La «vida» de una estructura. A 0 revienta. |
| Podredumbre | rot | Corrupción que crece en estructuras estancadas y se extiende. |
| Sanguijuela | leech | Parásito que sale de las madrigueras y se come tu red. |
| Metamorfosis | metamorphosis | El *prestigio*: reinicias la caverna a cambio de mutágeno. |
| Mutágeno | mutagen | Moneda permanente para comprar mutaciones. |
| Profundidad | depth | Número de metamorfosis hechas. Más profundidad, más peligro y más recompensa. |
| Ciclo | run / cycle | Una partida entre dos metamorfosis. |
| Nivel | tier | Nivel de mejora de una estructura. Cada nivel duplica su rendimiento. |
