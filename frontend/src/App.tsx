import { useEffect, useRef, useState } from 'react';

interface Point {
  x: number;
  y: number;
}

interface RenderableHand {
  handedness: string;
  gesture: string;
  points: Point[];
}


const HAND_CONNECTIONS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];

const HAND_COLORS: Record<string, string> = {
  Left: '#00FFFF',
  Right: '#FF6B6B',
};

function classifyGesture(landmarks: { x: number; y: number; z: number }[]): string {
  const isUp = (tip: number, pip: number) => landmarks[tip].y < landmarks[pip].y;

  const indexUp = isUp(8, 6);
  const middleUp = isUp(12, 10);
  const ringUp = isUp(16, 14);
  const pinkyUp = isUp(20, 18);
  const thumbUp = Math.hypot(
    landmarks[4].x - landmarks[5].x,
    landmarks[4].y - landmarks[5].y,
  ) > 0.07;

  const count = [indexUp, middleUp, ringUp, pinkyUp].filter(Boolean).length;

  if (count === 0 && !thumbUp) return 'FIST';
  if (count === 0 && thumbUp) return 'THUMBS_UP';
  if (count === 1 && indexUp) return 'POINT';
  if (count === 1 && middleUp) return 'MIDDLE';
  if (count === 1 && pinkyUp) return 'PINKY';
  if (count === 2 && indexUp && middleUp) return 'PEACE';
  if (count === 2 && indexUp && pinkyUp) return 'ROCK';
  if (count === 3) return 'THREE';
  if (count === 4 && !thumbUp) return 'FOUR';
  if (count === 4 && thumbUp) return 'OPEN';
  return '---';
}

function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [hands, setHands] = useState<RenderableHand[]>([]);
  const [closed, setClosed] = useState(false);
  const [status, setStatus] = useState('Cargando...');
  const closeRef = useRef(false);

  function handleClose() {
    if (closeRef.current) return;
    closeRef.current = true;
    setClosed(true);
    if (document.fullscreenElement) document.exitFullscreen();
    window.close();
    setTimeout(() => { window.location.href = 'about:blank'; }, 300);
  }

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (typeof window.Hands === 'undefined' || typeof window.Camera === 'undefined') {
      setStatus('Error: MediaPipe no cargó. Revisá conexión o bloqueadores.');
      return;
    }

    let disposed = false;

    try {
      const handsInstance = new window.Hands({
        locateFile: (file) =>
          `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
      });

      handsInstance.setOptions({
        maxNumHands: 2,
        modelComplexity: 1,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });

      handsInstance.onResults((results) => {
        if (disposed) return;

        if (results.multiHandLandmarks.length > 0) {
<<<<<<< HEAD
          const cw = window.innerWidth;
          const ch = window.innerHeight;
          const vw = video.videoWidth || 640;
          const vh = video.videoHeight || 480;
          const scale = Math.max(cw / vw, ch / vh);
          const rw = vw * scale;
          const rh = vh * scale;
          const ox = (cw - rw) / 2;
          const oy = (ch - rh) / 2;

          for (let i = 0; i < results.multiHandLandmarks.length; i++) {
            const lm = results.multiHandLandmarks[i];
            const hand = results.multiHandedness[i]?.label ?? `Hand ${i}`;
            const gesture = classifyGesture(lm);

            if (gesture === 'MIDDLE') handleClose();

            data.push({
              color: COLORS[hand] ?? '#888',
              gesture,
              isRight: hand === 'Right',
              pts: lm.map((p) => ({
                x: (1 - p.x) * rw + ox,
                y: p.y * rh + oy,
              })),
            });
          }
=======
          const data: RenderableHand[] = results.multiHandLandmarks.map(
            (landmarks, i) => ({
              handedness: results.multiHandedness[i]?.label ?? `Hand ${i}`,
              gesture: classifyGesture(landmarks),
              points: landmarks.map((lm) => ({
                x: (1 - lm.x) * window.innerWidth,
                y: lm.y * window.innerHeight,
              })),
            }),
          );

          if (data.some((h) => h.gesture === 'MIDDLE')) handleClose();
          setHands(data);
        } else {
          setHands([]);
>>>>>>> parent of b8cf636 (Optimize: canvas rendering, modelComplexity 0, 640x480)
        }
      });

      setStatus('Solicitando cámara...');

      const camera = new window.Camera(video, {
        onFrame: async () => { await handsInstance.send({ image: video }); },
        width: 1280,
        height: 720,
      });

      camera.start()
        .then(() => setStatus(''))
        .catch(() => setStatus('Error: No se pudo acceder a la cámara.'));
    } catch {
      setStatus('Error al inicializar MediaPipe.');
    }

    return () => { disposed = true; };
  }, []);

  if (closed) {
    return (
      <div style={{
        width: '100vw', height: '100vh', display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        background: '#000', color: '#FF6B6B',
        fontFamily: 'monospace', fontSize: 32, fontWeight: 700,
      }}>
        Cerrando...
      </div>
    );
  }

  return (
    <div style={{
      width: '100vw', height: '100vh', overflow: 'hidden',
      position: 'relative', background: '#111',
    }}>
      <video
        ref={videoRef}
        style={{
          position: 'absolute', top: 0, left: 0,
          width: '100%', height: '100%', objectFit: 'cover',
          opacity: 0.6, transform: 'scaleX(-1)',
        }}
        playsInline
      />

      {status && (
        <div style={{
          position: 'absolute', top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          color: '#fff', fontFamily: 'monospace', fontSize: 18,
          textAlign: 'center', padding: 20,
          background: 'rgba(0,0,0,0.7)', borderRadius: 8, maxWidth: 400,
        }}>
          {status}
        </div>
      )}

      <svg style={{
        position: 'absolute', top: 0, left: 0,
        width: '100%', height: '100%', pointerEvents: 'none',
      }}>
        {hands.map((hand) => {
          const color = HAND_COLORS[hand.handedness] ?? '#888';
          return (
            <g key={hand.handedness}>
              {HAND_CONNECTIONS.map(([i, j]) => (
                <line
                  key={`${i}-${j}`}
                  x1={hand.points[i]?.x} y1={hand.points[i]?.y}
                  x2={hand.points[j]?.x} y2={hand.points[j]?.y}
                  stroke={color} strokeWidth={1.5}
                  strokeLinecap="round" opacity={0.7}
                />
              ))}
              {hand.points.map((pt, i) => (
                <circle key={i} cx={pt.x} cy={pt.y} r={4} fill={color} />
              ))}
            </g>
          );
        })}
      </svg>

      {hands.map((hand) => {
        const color = HAND_COLORS[hand.handedness] ?? '#888';
        const isRight = hand.handedness === 'Right';
        return (
          <div
            key={`label-${hand.handedness}`}
            style={{
              position: 'absolute', top: 16,
              [isRight ? 'right' : 'left']: 16,
              padding: '6px 14px', borderRadius: 8,
              background: `${color}22`, border: `1px solid ${color}`,
              color, fontFamily: 'monospace',
              fontSize: 14, fontWeight: 700, pointerEvents: 'none',
            }}
          >
            {hand.handedness}: {hand.gesture}
          </div>
        );
      })}
    </div>
  );
}

export default App;
