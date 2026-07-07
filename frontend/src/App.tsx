import { useEffect, useRef, useState } from 'react';

const CONNECTIONS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];

const COLORS: Record<string, string> = { Left: '#00FFFF', Right: '#FF6B6B' };

function classifyGesture(lm: { x: number; y: number; z: number }[]): string {
  const u = (t: number, p: number) => lm[t].y < lm[p].y;
  const i = u(8, 6), m = u(12, 10), r = u(16, 14), p = u(20, 18);
  const t = Math.hypot(lm[4].x - lm[5].x, lm[4].y - lm[5].y) > 0.07;
  const n = [i, m, r, p].filter(Boolean).length;
  if (n === 0 && !t) return 'FIST';
  if (n === 0 && t) return 'THUMBS_UP';
  if (n === 1 && i) return 'POINT';
  if (n === 1 && m) return 'MIDDLE';
  if (n === 1 && p) return 'PINKY';
  if (n === 2 && i && m) return 'PEACE';
  if (n === 2 && i && p) return 'ROCK';
  if (n === 3) return 'THREE';
  if (n === 4 && !t) return 'FOUR';
  if (n === 4 && t) return 'OPEN';
  return '---';
}

function drawHand(
  ctx: CanvasRenderingContext2D,
  pts: { x: number; y: number }[],
  color: string,
  gesture: string,
  isRight: boolean,
) {
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 2;
  ctx.globalAlpha = 0.7;

  for (const [i, j] of CONNECTIONS) {
    const a = pts[i], b = pts[j];
    if (!a || !b) continue;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  ctx.globalAlpha = 1;
  for (const p of pts) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.font = 'bold 14px monospace';
  ctx.globalAlpha = 0.85;
  const label = `${gesture}`;
  const tw = ctx.measureText(label).width;
  const lx = isRight ? ctx.canvas.width - tw - 28 : 16;
  const ly = 36;
  ctx.fillStyle = `${color}22`;
  ctx.roundRect?.(lx - 6, ly - 28, tw + 28, 34, 8) ?? ctx.fillRect(lx - 6, ly - 28, tw + 28, 34);
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.roundRect?.(lx - 6, ly - 28, tw + 28, 34, 8) ?? ctx.strokeRect(lx - 6, ly - 28, tw + 28, 34);
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.globalAlpha = 1;
  ctx.fillText(label, lx + 10, ly - 4);
}

function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState('Cargando...');
  const [closed, setClosed] = useState(false);
  const closeRef = useRef(false);

  function handleClose() {
    if (closeRef.current) return;
    closeRef.current = true;
    setClosed(true);
    document.exitFullscreen?.();
    window.close();
    setTimeout(() => { window.location.href = 'about:blank'; }, 300);
  }

  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    if (!window.Hands || !window.Camera) {
      setStatus('Error: MediaPipe no cargó.');
      return;
    }

    const cv = canvas;
    const ctx = cv.getContext('2d')!;
    let disposed = false;
    let animId = 0;

    const data: {
      pts: { x: number; y: number }[];
      color: string;
      gesture: string;
      isRight: boolean;
    }[] = [];

    function resize() {
      cv.width = window.innerWidth;
      cv.height = window.innerHeight;
    }
    resize();
    window.addEventListener('resize', resize);

    function draw() {
      if (disposed) return;
      ctx.clearRect(0, 0, cv.width, cv.height);
      for (const h of data) drawHand(ctx, h.pts, h.color, h.gesture, h.isRight);
      animId = requestAnimationFrame(draw);
    }
    animId = requestAnimationFrame(draw);

    try {
      const hands = new window.Hands({
        locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${f}`,
      });

      hands.setOptions({
        maxNumHands: 2,
        modelComplexity: 0,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });

      hands.onResults((results) => {
        if (disposed) return;
        data.length = 0;

        if (results.multiHandLandmarks.length > 0) {
          const w = window.innerWidth;
          const h = window.innerHeight;

          for (let i = 0; i < results.multiHandLandmarks.length; i++) {
            const lm = results.multiHandLandmarks[i];
            const hand = results.multiHandedness[i]?.label ?? `Hand ${i}`;
            const gesture = classifyGesture(lm);

            if (gesture === 'MIDDLE') handleClose();

            data.push({
              color: COLORS[hand] ?? '#888',
              gesture,
              isRight: hand === 'Right',
              pts: lm.map((p) => ({ x: (1 - p.x) * w, y: p.y * h })),
            });
          }
        }
      });

      setStatus('Solicitando cámara...');

      const camera = new window.Camera(video, {
        onFrame: async () => { await hands.send({ image: video }); },
        width: 640,
        height: 480,
      });

      camera.start()
        .then(() => setStatus(''))
        .catch(() => setStatus('Error: cámara no disponible.'));
    } catch {
      setStatus('Error al iniciar MediaPipe.');
    }

    return () => {
      disposed = true;
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
    };
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
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute', top: 0, left: 0,
          width: '100%', height: '100%', pointerEvents: 'none',
        }}
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
    </div>
  );
}

export default App;
