import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

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
  const label = gesture === 'FIST' ? '✊ AGARRAR' : gesture;
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

const PALM_INDICES = [0, 5, 9, 13, 17] as const;
const GRAB_DISTANCE = 0.35;

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
    let shutdownStart = 0;
    let countdown = 0;

    const handsData: {
      pts: { x: number; y: number }[];
      color: string;
      gesture: string;
      isRight: boolean;
    }[] = [];

    // --- Three.js ---
    const container = document.createElement('div');
    container.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none';
    container.style.zIndex = '1';
    video.parentElement!.appendChild(container);

    const FOV = 50;
    const scene = new THREE.Scene();

    const threeCam = new THREE.PerspectiveCamera(FOV, window.innerWidth / window.innerHeight, 0.1, 20);
    threeCam.position.set(0, 0, 5);

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    container.appendChild(renderer.domElement);

    const ambient = new THREE.AmbientLight(0x404040, 0.8);
    scene.add(ambient);
    const dl = new THREE.DirectionalLight(0xffffff, 2.5);
    dl.position.set(2, 3, 4);
    scene.add(dl);
    const fl = new THREE.DirectionalLight(0x4488ff, 0.6);
    fl.position.set(-2, -1, 2);
    scene.add(fl);

    // --- Interactive Cube ---
    const cubeSize = 0.18;
    const cubeGeo = new THREE.BoxGeometry(cubeSize, cubeSize, cubeSize);
    const cubeMat = new THREE.MeshPhysicalMaterial({
      color: 0x44aaff,
      metalness: 0.3,
      roughness: 0.15,
      emissive: 0x44aaff,
      emissiveIntensity: 0.08,
      clearcoat: 0.3,
      clearcoatRoughness: 0.2,
    });
    const cube = new THREE.Mesh(cubeGeo, cubeMat);
    cube.position.set(0, 0, 0);
    scene.add(cube);

    const edgeGeo = new THREE.EdgesGeometry(cubeGeo);
    const edgeMat = new THREE.LineBasicMaterial({
      color: 0x88ddff,
      transparent: true,
      opacity: 0.4,
    });
    const edges = new THREE.LineSegments(edgeGeo, edgeMat);
    cube.add(edges);

    // Glow ring (shows when grabbed)
    const ringGeo = new THREE.TorusGeometry(cubeSize * 1.2, 0.015, 8, 24);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x88ddff,
      transparent: true,
      opacity: 0,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI / 2;
    cube.add(ring);

    let isGrabbed = false;
    let grabHandIdx = -1;
    let targetPos = new THREE.Vector3(0, 0, 0);
    let idleTime = 0;
    let releasePos = new THREE.Vector3(0, 0, 0);

    // --- Canvas ---
    function resize() {
      cv.width = window.innerWidth;
      cv.height = window.innerHeight;
      threeCam.aspect = window.innerWidth / window.innerHeight;
      threeCam.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    }
    resize();
    window.addEventListener('resize', resize);

    function draw() {
      if (disposed) return;
      ctx.clearRect(0, 0, cv.width, cv.height);
      for (const h of handsData) drawHand(ctx, h.pts, h.color, h.gesture, h.isRight);

      if (countdown > 0) {
        ctx.fillStyle = 'rgba(255, 0, 0, 0.15)';
        ctx.fillRect(0, 0, cv.width, cv.height);
        ctx.fillStyle = '#FF4444';
        ctx.font = 'bold 96px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${countdown}`, cv.width / 2, cv.height / 2 - 30);
        ctx.font = '18px monospace';
        ctx.fillStyle = '#ff8888';
        ctx.fillText('Soltá el gesto para cancelar', cv.width / 2, cv.height / 2 + 40);
        ctx.textAlign = 'start';
        ctx.textBaseline = 'alphabetic';
      }

      // --- Cube animation ---
      if (isGrabbed) {
        cube.position.lerp(targetPos, 0.12);
        cube.scale.lerp(new THREE.Vector3(1.35, 1.35, 1.35), 0.1);
        cubeMat.emissiveIntensity += (0.6 - cubeMat.emissiveIntensity) * 0.08;
        edgeMat.opacity += (0.8 - edgeMat.opacity) * 0.08;
        ringMat.opacity += (0.5 - ringMat.opacity) * 0.08;
        ring.scale.setScalar(1 + Math.sin(Date.now() / 300) * 0.1);
        cube.rotation.y += 0.03;
        cube.rotation.x += 0.01;
      } else {
        const t = Date.now() / 1000;
        cube.position.y = releasePos.y + Math.sin(t * 1.2 + idleTime) * 0.04;
        cube.position.x = releasePos.x + Math.cos(t * 0.9 + idleTime) * 0.02;
        cube.scale.lerp(new THREE.Vector3(1, 1, 1), 0.05);
        cubeMat.emissiveIntensity += (0.08 - cubeMat.emissiveIntensity) * 0.05;
        edgeMat.opacity += (0.4 - edgeMat.opacity) * 0.05;
        ringMat.opacity += (0 - ringMat.opacity) * 0.05;
        cube.rotation.y += 0.008;
        cube.rotation.x = Math.sin(t * 0.6) * 0.08;
      }

      renderer.render(scene, threeCam);
      animId = requestAnimationFrame(draw);
    }
    animId = requestAnimationFrame(draw);

    // --- MediaPipe ---
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
        handsData.length = 0;

        if (results.multiHandLandmarks.length > 0) {
          const cw = window.innerWidth;
          const ch = window.innerHeight;
          const vw = video.videoWidth || 640;
          const vh = video.videoHeight || 480;
          const scale = Math.max(cw / vw, ch / vh);
          const rw = vw * scale;
          const rh = vh * scale;
          const ox = (cw - rw) / 2;
          const oy = (ch - rh) / 2;
          let hasMiddle = false;

          const vFov = FOV * Math.PI / 180;
          const visibleH = 2 * Math.tan(vFov / 2) * 5;
          const visibleW = visibleH * (window.innerWidth / window.innerHeight);

          type HandInfo = { i: number; gesture: string; worldPos: THREE.Vector3 };
          const hands3d: HandInfo[] = [];

          for (let i = 0; i < results.multiHandLandmarks.length; i++) {
            const lm = results.multiHandLandmarks[i];
            const hand = results.multiHandedness[i]?.label ?? `Hand ${i}`;
            const gesture = classifyGesture(lm);
            if (gesture === 'MIDDLE') hasMiddle = true;

            let pcx = 0, pcy = 0, pcz = 0;
            for (const idx of PALM_INDICES) {
              pcx += lm[idx].x;
              pcy += lm[idx].y;
              pcz += lm[idx].z;
            }
            pcx /= 5; pcy /= 5; pcz /= 5;

            const sx = (1 - pcx) * rw + ox;
            const sy = pcy * rh + oy;
            const wx = (sx / window.innerWidth) * visibleW - visibleW / 2;
            const wy = -(sy / window.innerHeight) * visibleH + visibleH / 2;
            const wz = -pcz * 8;

            handsData.push({
              color: COLORS[hand] ?? '#888',
              gesture,
              isRight: hand === 'Right',
              pts: lm.map((p) => ({
                x: (1 - p.x) * rw + ox,
                y: p.y * rh + oy,
              })),
            });

            hands3d.push({ i, gesture, worldPos: new THREE.Vector3(wx, wy, wz) });
          }

          if (hasMiddle) {
            if (shutdownStart === 0) shutdownStart = Date.now();
            const elapsed = (Date.now() - shutdownStart) / 1000;
            if (elapsed >= 3) handleClose();
            countdown = Math.max(0, Math.ceil(3 - elapsed));
          } else {
            shutdownStart = 0;
            countdown = 0;
          }

          // --- Cube interaction ---
          let grabbedThisFrame = false;

          for (const h of hands3d) {
            const dist = h.worldPos.distanceTo(cube.position);

            if (!isGrabbed && h.gesture === 'FIST' && dist < GRAB_DISTANCE) {
              isGrabbed = true;
              grabHandIdx = h.i;
              targetPos.copy(h.worldPos);
              grabbedThisFrame = true;
              break;
            }

            if (isGrabbed && grabHandIdx === h.i) {
              if (h.gesture !== 'FIST') {
                isGrabbed = false;
                grabHandIdx = -1;
                releasePos.copy(cube.position);
                idleTime = Date.now() / 1000;
              } else {
                targetPos.copy(h.worldPos);
                grabbedThisFrame = true;
              }
              break;
            }
          }

          if (isGrabbed && !grabbedThisFrame) {
            isGrabbed = false;
            grabHandIdx = -1;
            releasePos.copy(cube.position);
            idleTime = Date.now() / 1000;
          }
        } else {
          if (isGrabbed) {
            isGrabbed = false;
            grabHandIdx = -1;
            releasePos.copy(cube.position);
            idleTime = Date.now() / 1000;
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
      renderer.dispose();
      container.remove();
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
          zIndex: 2,
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
