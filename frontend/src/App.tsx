import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const CONNECTIONS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];

const COLORS: Record<string, string> = { Left: '#00FFFF', Right: '#FF6B6B' };
const PINCH_THRESHOLD = 0.065;

const MODEL_LIST = [
  { name: 'Maxwell', file: 'maxwell.glb' },
  { name: 'Tralalero', file: 'tralalero.glb' },
  { name: 'Torre Maya', file: 'torre_maya_optimized.glb' },
];

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

function isPinching(lm: { x: number; y: number; z: number }[], gesture: string): boolean {
  if (gesture === 'FIST') return false;
  return Math.hypot(lm[4].x - lm[8].x, lm[4].y - lm[8].y) < PINCH_THRESHOLD;
}

function drawHand(
  ctx: CanvasRenderingContext2D,
  pts: { x: number; y: number }[],
  color: string,
  gesture: string,
  isRight: boolean,
  isPinch: boolean,
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
  const label = isPinch ? '🤏 PINZAR' : gesture === 'FIST' ? '✊ AGARRAR' : gesture;
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
const MODEL_SCALE = 0.5;

function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState('Cargando...');
  const [closed, setClosed] = useState(false);
  const closeRef = useRef(false);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState('');
  const [modelIdx, setModelIdx] = useState(0);
  const switchCameraRef = useRef<((id: string) => Promise<boolean>) | undefined>(undefined);
  const switchModelRef = useRef<((idx: number) => Promise<void>) | undefined>(undefined);

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

    if (!window.Hands) {
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
      isPinch: boolean;
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

    // --- Model group ---
    const modelGroup = new THREE.Group();
    modelGroup.position.set(0.7, 0, -0.3);
    scene.add(modelGroup);

    const ringMat = new THREE.MeshBasicMaterial({ color: 0x88ddff, transparent: true, opacity: 0 });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.04, 8, 24), ringMat);
    ring.rotation.x = Math.PI / 2;
    modelGroup.add(ring);

    const modelChild = new THREE.Group();
    modelGroup.add(modelChild);

    let isGrabbed = false;
    let grabHandIdx = -1;
    let targetPos = new THREE.Vector3(0, 0, 0);
    let pinchStartDist = 0;
    let pinchStartBaseScale = 3;
    let baseScale = 3;
    const velocity = new THREE.Vector3();
    const gravity = new THREE.Vector3(0, -0.002, 0);

    // --- Model loading ---
    const loader = new GLTFLoader();
    const modelCache = new Map<string, THREE.Group>();
    let loadQueue: Promise<void>[] = [];

    for (const m of MODEL_LIST) {
      const url = `${import.meta.env.BASE_URL}3D_models/${m.file}`;
      loadQueue.push(
        loader.loadAsync(url).then((gltf) => {
          const group = new THREE.Group();
          group.add(gltf.scene);
          const box = new THREE.Box3().setFromObject(group);
          const size = box.getSize(new THREE.Vector3());
          const maxDim = Math.max(size.x, size.y, size.z);
          if (maxDim > 0) {
            const s = MODEL_SCALE / maxDim;
            group.scale.setScalar(s);
          }
          const center = box.getCenter(new THREE.Vector3());
          group.position.set(-center.x * (maxDim > 0 ? MODEL_SCALE / maxDim : 1), 0, 0);
          modelCache.set(m.name, group);
        }).catch(() => {
          // fallback: show a simple box
          const g = new THREE.Group();
          const boxMesh = new THREE.Mesh(
            new THREE.BoxGeometry(0.18, 0.18, 0.18),
            new THREE.MeshPhysicalMaterial({ color: 0xff4444, metalness: 0.3, roughness: 0.5 }),
          );
          g.add(boxMesh);
          modelCache.set(m.name, g);
        }),
      );
    }

    Promise.all(loadQueue).then(() => {
      if (disposed) return;
      const first = modelCache.get(MODEL_LIST[0].name);
      if (first) modelChild.add(first);
    });

    switchModelRef.current = async (idx: number) => {
      while (modelChild.children.length > 0) modelChild.remove(modelChild.children[0]);
      await Promise.all(loadQueue);
      const m = modelCache.get(MODEL_LIST[idx].name);
      if (m) modelChild.add(m);
    };

    // --- Resize ---
    function resize() {
      cv.width = window.innerWidth;
      cv.height = window.innerHeight;
      threeCam.aspect = window.innerWidth / window.innerHeight;
      threeCam.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    }
    resize();
    window.addEventListener('resize', resize);

    // --- RAF loop ---
    function draw() {
      if (disposed) return;
      ctx.clearRect(0, 0, cv.width, cv.height);
      for (const h of handsData) drawHand(ctx, h.pts, h.color, h.gesture, h.isRight, h.isPinch);

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

      const grabScale = isGrabbed ? 1.35 : 1;
      const targetScale = baseScale * grabScale;
      modelGroup.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), 0.08);

      if (isGrabbed) {
        modelGroup.position.lerp(targetPos, 0.12);
        ringMat.opacity += (0.5 - ringMat.opacity) * 0.08;
        ring.scale.setScalar(1 + Math.sin(Date.now() / 300) * 0.1);
        modelChild.rotation.y += 0.03;
        velocity.set(0, 0, 0);
      } else if (pinchStartDist > 0) {
        ringMat.color.setHSL(0.6, 1, 0.6);
        ringMat.opacity += (0.4 - ringMat.opacity) * 0.1;
        modelChild.rotation.y += 0.008;
      } else {
        // --- Physics ---
        const defPos = new THREE.Vector3(0.7, 0, -0.3);
        const spring = new THREE.Vector3().copy(defPos).sub(modelGroup.position).multiplyScalar(0.004);
        velocity.add(spring);

        velocity.add(gravity);

        const groundY = -0.6;
        if (modelGroup.position.y <= groundY) {
          modelGroup.position.y = groundY;
          if (velocity.y < -0.01) velocity.y *= -0.3;
          else velocity.y = 0;
        }

        velocity.multiplyScalar(0.98);

        if (velocity.length() > 0.05) velocity.multiplyScalar(0.5);

        modelGroup.position.add(velocity);

        ringMat.opacity += (0 - ringMat.opacity) * 0.05;
        ring.scale.setScalar(1);
        modelChild.rotation.y += 0.008;
      }

      renderer.render(scene, threeCam);
      animId = requestAnimationFrame(draw);
    }
    animId = requestAnimationFrame(draw);

    // --- MediaPipe Hands setup ---
    const hands = new window.Hands({
      locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${f}`,
    });
    hands.setOptions({
      maxNumHands: 2, modelComplexity: 0,
      minDetectionConfidence: 0.5, minTrackingConfidence: 0.5,
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

        type HandInfo = {
          i: number; gesture: string; isPinch: boolean;
          palmPos: THREE.Vector3; pinchPos: THREE.Vector3;
        };
        const hands3d: HandInfo[] = [];

        function lmToWorld(lm: { x: number; y: number; z: number }): THREE.Vector3 {
          const sx = (1 - lm.x) * rw + ox;
          const sy = lm.y * rh + oy;
          return new THREE.Vector3(
            (sx / window.innerWidth) * visibleW - visibleW / 2,
            -(sy / window.innerHeight) * visibleH + visibleH / 2,
            -lm.z * 8,
          );
        }

        for (let i = 0; i < results.multiHandLandmarks.length; i++) {
          const lm = results.multiHandLandmarks[i];
          const hand = results.multiHandedness[i]?.label ?? `Hand ${i}`;
          const gesture = classifyGesture(lm);
          const pinch = isPinching(lm, gesture);
          if (gesture === 'MIDDLE') hasMiddle = true;

          let pcx = 0, pcy = 0, pcz = 0;
          for (const idx of PALM_INDICES) { pcx += lm[idx].x; pcy += lm[idx].y; pcz += lm[idx].z; }
          pcx /= 5; pcy /= 5; pcz /= 5;

          handsData.push({
            color: COLORS[hand] ?? '#888', gesture, isPinch: pinch, isRight: hand === 'Right',
            pts: lm.map((p) => ({ x: (1 - p.x) * rw + ox, y: p.y * rh + oy })),
          });

          hands3d.push({
            i, gesture, isPinch: pinch,
            palmPos: lmToWorld({ x: pcx, y: pcy, z: pcz }),
            pinchPos: lmToWorld({
              x: (lm[4].x + lm[8].x) / 2,
              y: (lm[4].y + lm[8].y) / 2,
              z: (lm[4].z + lm[8].z) / 2,
            }),
          });
        }

        if (hasMiddle) {
          if (shutdownStart === 0) shutdownStart = Date.now();
          const elapsed = (Date.now() - shutdownStart) / 1000;
          if (elapsed >= 3) handleClose();
          countdown = Math.max(0, Math.ceil(3 - elapsed));
        } else { shutdownStart = 0; countdown = 0; }

        const isHolding = (h: HandInfo) => h.isPinch;
        let grabbedThisFrame = false;

        for (const h of hands3d) {
          if (!isGrabbed && isHolding(h)) {
            const pos = h.gesture === 'FIST' ? h.palmPos : h.pinchPos;
            if (pos.distanceTo(modelGroup.position) < GRAB_DISTANCE) {
              isGrabbed = true; grabHandIdx = h.i; targetPos.copy(pos); grabbedThisFrame = true; break;
            }
          }
          if (isGrabbed && grabHandIdx === h.i) {
            if (isHolding(h)) {
              targetPos.copy(h.gesture === 'FIST' ? h.palmPos : h.pinchPos);
              grabbedThisFrame = true;
            } else {
              isGrabbed = false; grabHandIdx = -1;
            }
            break;
          }
        }

        if (isGrabbed && !grabbedThisFrame) {
          isGrabbed = false; grabHandIdx = -1;
        }

        // --- Scale via two-hand pinch ---
        if (!isGrabbed && hands3d.length >= 2) {
          const pinching = hands3d.filter((h) => h.isPinch);
          if (pinching.length >= 2) {
            const d = pinching[0].pinchPos.distanceTo(pinching[1].pinchPos);
            if (pinchStartDist === 0) {
              pinchStartDist = d;
              pinchStartBaseScale = baseScale;
            } else {
              baseScale = Math.max(2, Math.min(6, pinchStartBaseScale * (d / pinchStartDist)));
            }
            ringMat.color.setHSL(0.6, 1, 0.6);
            ringMat.opacity += (0.4 - ringMat.opacity) * 0.1;
          } else {
            pinchStartDist = 0;
          }
        } else {
          pinchStartDist = 0;
        }

        if (pinchStartDist === 0 && !isGrabbed) ringMat.color.setHex(0x88ddff);
      } else if (isGrabbed) {
        isGrabbed = false; grabHandIdx = -1;
      }
    });

    // --- Camera management ---
    async function startCamera(id: string): Promise<boolean> {
      const v = video;
      if (!v) return false;
      const stream = v.srcObject as MediaStream | null;
      if (stream) { stream.getTracks().forEach((t) => t.stop()); v.srcObject = null; }
      try {
        const userStream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480, ...(id ? { deviceId: { exact: id } } : {}) },
        });
        v.srcObject = userStream;
        await v.play();
        if (!disposed) setStatus('');
        return true;
      } catch {
        if (!disposed) setStatus('Error: no se pudo acceder a la cámara.');
        return false;
      }
    }

    startCamera(deviceId).then((ok) => {
      if (!ok || disposed) return;
      navigator.mediaDevices.enumerateDevices()
        .then((devices) => {
          const vd = devices.filter((d) => d.kind === 'videoinput');
          if (vd.length > 0) setCameras(vd);
        })
        .catch(() => {});
    });

    let framePending = false;
    async function sendFrame() {
      if (disposed || framePending || !video) return;
      framePending = true;
      try {
        if (video.readyState >= 2) await hands.send({ image: video });
      } catch {
        // ignore send errors
      }
      framePending = false;
    }

    function onFrame() {
      if (disposed) return;
      sendFrame();
      requestAnimationFrame(onFrame);
    }
    requestAnimationFrame(onFrame);

    switchCameraRef.current = async (id: string): Promise<boolean> => {
      setStatus('Cambiando cámara...');
      const ok = await startCamera(id);
      if (ok) setDeviceId(id);
      return ok;
    };

    return () => {
      disposed = true;
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
      renderer.dispose();
      container.remove();
      const stream = video.srcObject as MediaStream | null;
      if (stream) { stream.getTracks().forEach((t) => t.stop()); video.srcObject = null; }
    };
  }, []);

  async function handleCameraChange(id: string) {
    await switchCameraRef.current?.(id);
  }

  async function handleModelChange(idx: number) {
    setModelIdx(idx);
    await switchModelRef.current?.(idx);
  }

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
      <div style={{
        position: 'absolute', bottom: 16, left: 16, zIndex: 10,
        display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap',
      }}>
        {cameras.length > 1 && (
          <select
            value={deviceId}
            onChange={(e) => handleCameraChange(e.target.value)}
            style={{
              background: 'rgba(0,0,0,0.75)', color: '#ccc',
              fontFamily: 'monospace', fontSize: 12,
              border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: 6, padding: '5px 8px', cursor: 'pointer',
              maxWidth: 160,
            }}
          >
            {cameras.map((cam) => (
              <option key={cam.deviceId} value={cam.deviceId}>
                {cam.label || `Cámara ${cam.deviceId.slice(0, 8)}…`}
              </option>
            ))}
          </select>
        )}
        {MODEL_LIST.map((m, i) => (
          <button
            key={m.name}
            onClick={() => handleModelChange(i)}
            style={{
              background: i === modelIdx ? 'rgba(68,170,255,0.3)' : 'rgba(0,0,0,0.65)',
              color: i === modelIdx ? '#88ddff' : '#999',
              fontFamily: 'monospace', fontSize: 11,
              border: i === modelIdx ? '1px solid #44aaff' : '1px solid rgba(255,255,255,0.12)',
              borderRadius: 6, padding: '5px 10px', cursor: 'pointer',
              opacity: 0.85,
            }}
          >
            {m.name}
          </button>
        ))}
      </div>
    </div>
  );
}

export default App;
