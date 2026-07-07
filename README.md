# HandTracker AR — Realidad Aumentada en el Navegador

Seguimiento de manos en tiempo real usando MediaPipe + React + Canvas.
Sin backend, sin dependencias pesadas. 100% client-side.

## Stack

| Capa | Tecnología |
|---|---|
| Framework | React 19 + Vite 8 + TypeScript 6 |
| Hand tracking | MediaPipe Hands vía CDN (`@mediapipe/hands`) |
| Cámara | MediaPipe Camera Utils vía CDN |
| Renderizado | Canvas 2D (sin SVG, sin DOM) |
| Despliegue | GitHub Pages vía Actions |
| Paquetes | pnpm |

## ¿Qué hace?

- Abrís la página, das permiso de cámara
- MediaPipe detecta hasta 2 manos en tiempo real
- Se dibuja el esqueleto (21 landmarks + conexiones) sobre un canvas
- Clasifica gestos básicos: `FIST`, `OPEN`, `POINT`, `PEACE`, `ROCK`, `THUMBS_UP`, `MIDDLE`, etc.
- Si hacés el gesto `MIDDLE` (dedo medio), se cierra la ventana, no es joda XDDDDD

## Tiempo de desarrollo

~15 commits, ~2 horas desde 0 hasta producción en GitHub Pages.
Sin backend. Stack mínimo: React + Vite + CDN scripts + Canvas.

## Cómo correrlo

```bash
cd frontend
pnpm install
pnpm dev        # http://localhost:5173
```

## Deploy

El workflow de GitHub Actions (`deploy.yml`) construye y despliega automáticamente.

## Archivos clave

```
frontend/
├── index.html          # CDN scripts de MediaPipe
├── vite.config.ts      # base dinámico (BASE_URL)
├── src/
│   ├── App.tsx          # Lógica principal: cámara → MediaPipe → Canvas
│   └── vite-env.d.ts    # Tipos globales de MediaPipe (Window.Hands, Window.Camera)
```

## Gestos detectados

`FIST`, `THUMBS_UP`, `POINT`, `MIDDLE`, `PINKY`, `PEACE`, `ROCK`, `THREE`, `FOUR`, `OPEN`
