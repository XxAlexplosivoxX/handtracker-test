# HandTracker AR — Realidad Aumentada en el Navegador

Seguimiento de manos en tiempo real usando MediaPipe + React + Canvas 2D + Three.js.
Sin backend, sin dependencias pesadas. 100% client-side.

## Stack

| Capa | Tecnología |
|---|---|
| Framework | React 19 + Vite 8 + TypeScript 6 |
| Hand tracking | MediaPipe Hands vía CDN (`@mediapipe/hands`) |
| Cámara | `getUserMedia` directo + RAF loop (sin MediaPipe Camera) |
| Renderizado 2D | Canvas 2D (esqueleto de manos) |
| Renderizado 3D | Three.js (modelos GLB, overlay transparente) |
| Modelos 3D | GLB en `public/3D_models/`, cargados con `GLTFLoader` |
| Física | Gravedad, resorte, rebote de suelo, damping |
| Despliegue | GitHub Pages vía Actions |
| Paquetes | pnpm |

## ¿Qué hace?

- Abrís la página, das permiso de cámara
- MediaPipe detecta hasta 2 manos en tiempo real
- Se dibuja el esqueleto (21 landmarks + conexiones) sobre un canvas
- Modelo 3D (GLB) superpuesto en 3D con Three.js sobre el video
- **Pinza (pinch)** para agarrar y mover el modelo
- **Dos pinzas** para escalar el modelo (más cerca → más chico, más lejos → más grande)
- El puño (`FIST`) no interactúa con el modelo
- Clasifica gestos: `FIST`, `OPEN`, `POINT`, `PEACE`, `ROCK`, `THUMBS_UP`, `MIDDLE`, etc.
- Si hacés el gesto `MIDDLE` (dedo medio) por 3 segundos, se cierra la ventana
- Selector de cámara si hay 2+ cámaras disponibles
- Selector de modelo 3D entre varios GLB

## Interacción

| Gesto | Efecto |
|---|---|
| Pinza (1 mano) | Agarrar y mover el modelo |
| Pinza (2 manos) | Escalar: juntar → achicar, separar → agrandar (2× a 6×) |
| Puño | Nada (sin colisión, sin agarre) |
| Middle 3s | Cierra la ventana |

### Física

- Gravedad aplicada constantemente
- Resorte devuelve el modelo a su posición inicial al soltarlo
- Amortiguación aérea y límite de velocidad
- Rebote contra el "suelo" (parte inferior del viewport)

## Tamaño

- Escala base: 3× (modelo comienza 3 veces más grande que el tamaño de referencia)
- Rango ajustable con dos pinzas: **2× a 6×**

## Tiempo de desarrollo

~20 commits, ~3 horas desde 0 hasta producción en GitHub Pages.
Sin backend. Stack mínimo: React + Vite + CDN scripts + Canvas + Three.js.

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
├── index.html              # CDN scripts de MediaPipe
├── vite.config.ts          # base dinámico (BASE_URL)
├── public/3D_models/
│   ├── maxwell.glb
│   ├── tralalero.glb
│   └── torre_maya_optimized.glb
├── src/
│   ├── App.tsx              # Lógica principal: cámara → MediaPipe → Canvas + Three.js
│   └── vite-env.d.ts        # Tipos globales de MediaPipe (Window.Hands, Window.Camera)
```

## Gestos detectados

`FIST`, `THUMBS_UP`, `POINT`, `MIDDLE`, `PINKY`, `PEACE`, `ROCK`, `THREE`, `FOUR`, `OPEN`

## Decisiones técnicas

- **`getUserMedia` directo en vez de MediaPipe Camera**: más confiable al cambiar de cámara; no necesita reiniciar el efecto ni la escena Three.js.
- **Three.js para modelos 3D**: necesario para cargar GLB con materiales, luces, sombras; se renderiza como overlay transparente entre el video y el Canvas 2D.
- **GLB en `public/`**: Vite los copia a `dist/` sin transformar; URLs resueltas con `import.meta.env.BASE_URL` para compatibilidad con GitHub Pages.
- **Pinza agarra, puño no hace nada**: evita confusión entre gestos; `isPinching` se asegura de que el gesto no sea `FIST`.
- **`modelComplexity: 0`**: modelo Lite ~3× más rápido sin pérdida apreciable de precisión.
- **Física con resorte**: da sensación táctil natural sin necesidad de colisiones.
