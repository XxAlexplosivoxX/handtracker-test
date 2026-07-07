/// <reference types="vite/client" />

export {};

declare global {
  interface Window {
    Hands: new (config: {
      locateFile: (file: string) => string;
    }) => {
      setOptions(options: {
        maxNumHands: number;
        modelComplexity: number;
        minDetectionConfidence: number;
        minTrackingConfidence: number;
      }): void;
      onResults(
        callback: (results: {
          multiHandLandmarks: { x: number; y: number; z: number }[][];
          multiHandedness: { label: string; score: number }[];
        }) => void,
      ): void;
      send(inputs: { image: HTMLVideoElement }): Promise<void>;
    };
    Camera: new (
      element: HTMLVideoElement,
      config: { onFrame: () => Promise<void>; width: number; height: number },
    ) => { start(): Promise<void> };
  }
}
