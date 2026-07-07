import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';

const SOCKET_URL = 'http://localhost:3001';

interface Landmark {
  x: number;
  y: number;
  z: number;
}

interface HandData {
  handedness: string;
  landmarks: Landmark[];
  gesture: string;
}

interface Point {
  x: number;
  y: number;
}

interface RenderableHand {
  handedness: string;
  gesture: string;
  points: Point[];
}

type HandsInstance = InstanceType<Window['Hands']>;
type CameraInstance = InstanceType<Window['Camera']>;

const HAND_CONNECTIONS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],       // thumb
  [0, 5], [5, 6], [6, 7], [7, 8],        // index
  [5, 9], [9, 10], [10, 11], [11, 12],   // middle
  [9, 13], [13, 14], [14, 15], [15, 16],  // ring
  [13, 17], [17, 18], [18, 19], [19, 20], // pinky
  [0, 17],                                 // palm edge
];

const HAND_COLORS: Record<string, string> = {
  Left: '#00FFFF',
  Right: '#FF6B6B',
};

function classifyGesture(landmarks: Landmark[]): string {
  const isFingerUp = (tip: number, pip: number) =>
    landmarks[tip].y < landmarks[pip].y;

  const indexUp = isFingerUp(8, 6);
  const middleUp = isFingerUp(12, 10);
  const ringUp = isFingerUp(16, 14);
  const pinkyUp = isFingerUp(20, 18);

  const thumbTip = landmarks[4];
  const indexMcp = landmarks[5];
  const thumbDist = Math.hypot(
    thumbTip.x - indexMcp.x,
    thumbTip.y - indexMcp.y,
  );
  const thumbUp = thumbDist > 0.07;

  const fingers = [indexUp, middleUp, ringUp, pinkyUp];
  const count = fingers.filter(Boolean).length;

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
  const socketRef = useRef<Socket | null>(null);
  const [hands, setHands] = useState<RenderableHand[]>([]);
  const [closed, setClosed] = useState(false);
  const closeRef = useRef(false);

  const closeWindow = useRef(() => {
    if (closeRef.current) return;
    closeRef.current = true;
    setClosed(true);
    if (document.fullscreenElement) {
      document.exitFullscreen();
    }
    window.close();
    setTimeout(() => {
      window.location.href = 'about:blank';
    }, 300);
  });

  useEffect(() => {
    const socket = io(SOCKET_URL);
    socketRef.current = socket;

    socket.on('render_hand', (data: HandData[]) => {
      setHands(
        data.map((h) => ({
          handedness: h.handedness,
          gesture: h.gesture,
          points: h.landmarks.map((lm) => ({
            x: (1 - lm.x) * window.innerWidth,
            y: lm.y * window.innerHeight,
          })),
        })),
      );
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let disposed = false;
    let handsInstance: HandsInstance | null = null;
    let camera: CameraInstance | null = null;

    try {
      handsInstance = new window.Hands({
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
          const handsData: HandData[] = results.multiHandLandmarks.map(
            (landmarks, i) => ({
              handedness: results.multiHandedness[i]?.label ?? `Hand ${i}`,
              landmarks,
              gesture: classifyGesture(landmarks),
            }),
          );

          if (handsData.some((h) => h.gesture === 'MIDDLE')) {
            closeWindow.current();
          }

          setHands(
            handsData.map((h) => ({
              handedness: h.handedness,
              gesture: h.gesture,
              points: h.landmarks.map((lm) => ({
                x: (1 - lm.x) * window.innerWidth,
                y: lm.y * window.innerHeight,
              })),
            })),
          );

          socketRef.current?.emit('hand_data', handsData);
        } else {
          setHands([]);
        }
      });

      camera = new window.Camera(video, {
        onFrame: async () => {
          await handsInstance!.send({ image: video });
        },
        width: 1280,
        height: 720,
      });

      camera.start().catch((err: unknown) => {
        console.error('[camera] error:', err);
      });
    } catch (err) {
      console.error('[mediapipe] init error:', err);
    }

    return () => {
      disposed = true;
    };
  }, []);

  if (closed) {
    return (
      <div
        style={{
          width: '100vw',
          height: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#000',
          color: '#FF6B6B',
          fontFamily: 'monospace',
          fontSize: 32,
          fontWeight: 700,
        }}
      >
        Cerrando...
      </div>
    );
  }

  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        overflow: 'hidden',
        position: 'relative',
        background: '#111',
      }}
    >
      <video
        ref={videoRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          opacity: 0.6,
          transform: 'scaleX(-1)',
        }}
        playsInline
      />

      <svg
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
        }}
      >
        {hands.map((hand) => {
          const color = HAND_COLORS[hand.handedness] ?? '#888';
          return (
            <g key={hand.handedness}>
              {HAND_CONNECTIONS.map(([i, j]) => (
                <line
                  key={`${i}-${j}`}
                  x1={hand.points[i]?.x}
                  y1={hand.points[i]?.y}
                  x2={hand.points[j]?.x}
                  y2={hand.points[j]?.y}
                  stroke={color}
                  strokeWidth={1.5}
                  strokeLinecap="round"
                  opacity={0.7}
                />
              ))}
              {hand.points.map((pt, i) => (
                <circle
                  key={i}
                  cx={pt.x}
                  cy={pt.y}
                  r={4}
                  fill={color}
                />
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
              position: 'absolute',
              top: 16,
              [isRight ? 'right' : 'left']: 16,
              padding: '6px 14px',
              borderRadius: 8,
              background: `${color}22`,
              border: `1px solid ${color}`,
              color,
              fontFamily: 'monospace',
              fontSize: 14,
              fontWeight: 700,
              pointerEvents: 'none',
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
