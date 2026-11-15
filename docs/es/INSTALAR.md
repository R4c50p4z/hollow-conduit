# Instalar el juego en el iPhone (sin Mac, sin Xcode)

El juego es una **app web instalable**. Se publica en una web gratuita con HTTPS y desde Safari se añade a la pantalla de
inicio: se abre a pantalla completa con su icono y **funciona sin conexión**.

## 1. Publicarlo (una sola vez, ~5 minutos)

El repositorio es **privado**, así que lo más sencillo es **Netlify**, que es gratis con repos privados:

1. Entra en netlify.com y regístrate **con tu cuenta de GitHub**.
2. **Add new site → Import an existing project → GitHub**, autoriza el acceso y elige `hollow-conduit`.
3. En *Branch to deploy* elige `claude/quirky-mendel-gsequh` (es donde está todo el trabajo).
4. No toques nada más: el archivo `netlify.toml` del repo ya le dice cómo compilarlo. Pulsa **Deploy**.
5. En un minuto tendrás una dirección del tipo `https://algo-aleatorio.netlify.app`. En *Site configuration → Change
   site name* puedes ponerle un nombre más bonito.

A partir de ahí, **cada vez que se suba un cambio a esa rama, Netlify publica la versión nueva sola.**

> **Alternativas.** **Cloudflare Pages** también es gratis con repos privados: comando de compilación `npm run build`,
> carpeta `dist`. Si algún día haces público el repo, **GitHub Pages** ya está configurado
> (`.github/workflows/pages.yml`); solo hay que activar *Settings → Pages → Source: GitHub Actions*.
>
> Mientras el repo sea privado, ese flujo de GitHub solo **compila y pasa los tests** en cada cambio (verás un ✓ verde en
> GitHub), y se salta la publicación. Es normal.

## 2. Instalarlo en el iPhone

1. Abre la dirección en **Safari** (tiene que ser Safari).
2. Pulsa el botón **Compartir** (el cuadrado con la flecha).
3. **Añadir a pantalla de inicio** → Añadir.
4. Ábrelo desde el icono del Corazón. Ya está.

## Cómo se comporta

| | |
|---|---|
| **Pantalla completa** | Sí, sin barras de Safari |
| **Sin conexión** | Sí, tras abrirlo una vez con conexión |
| **Guardado** | Automático en el iPhone, cada 10 s y al salir |
| **Actualizaciones** | Llegan solas la próxima vez que lo abras con conexión |
| **Tiempo fuera** | Se simula al volver a abrirlo (hasta 12 h reales y, si la red era estable, hasta 7 días) |
| **Sonido** | Sí (tras el primer toque) |
| **Vibración** | No: iOS no deja vibrar a las webs |

## Cuidado con la partida

La partida vive **dentro de la app instalada**. Se pierde si:
- **borras la app** de la pantalla de inicio, o
- borras los datos de Safari (*Ajustes → Safari → Borrar historial y datos*).

Abrir la dirección en Safari normal **no** comparte la partida con la app instalada: son dos almacenes distintos. Juega
siempre desde el icono.

## Probarlo en el ordenador

```bash
npm install
npm run build
npm run preview    # http://localhost:4173
```
