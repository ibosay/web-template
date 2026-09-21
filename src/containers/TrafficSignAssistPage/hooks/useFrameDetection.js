import { useEffect, useRef, useState } from 'react';

/**
 * Runs the detector over the camera picture, frame by frame.
 *
 * Every frame is copied onto a small off-screen canvas first. The detector does not need a sharp
 * picture — it needs a red ring and the digits inside it — and shrinking the frame is what keeps
 * the work per frame small enough for a phone that is also running the screen and the GPS.
 *
 * The rate is deliberately low. A sign stays in view for several seconds as the car approaches it,
 * so looking eight times a second is plenty, and it leaves the phone cool enough to keep going for
 * a whole drive.
 */

export const DEFAULT_FRAME_OPTIONS = {
  // Size the frame is shrunk to before it is analysed.
  analysisWidth: 384,
  analysisHeight: 288,
  // How often the detector runs, per second.
  framesPerSecond: 8,
};

/**
 * @param {Object} params
 * @param {Object} params.videoRef - Ref to the `<video>` element showing the camera
 * @param {Object} params.detector - A detector with a `detect` method
 * @param {boolean} params.isActive - Whether the detection should run
 * @param {Function} params.onDetections - Called with `(detections, frameInfo)` after every frame
 * @param {Object} [params.options] - see DEFAULT_FRAME_OPTIONS
 * @returns {Object} `{ framesPerSecond, lastDurationMs }` for the debug panel
 */
const useFrameDetection = ({
  videoRef,
  detector,
  isActive,
  onDetections,
  options = DEFAULT_FRAME_OPTIONS,
}) => {
  const [stats, setStats] = useState({ framesPerSecond: 0, lastDurationMs: 0 });
  const canvasRef = useRef(null);
  // The callback is read out of a ref so that a new callback does not restart the loop on every
  // render of the page.
  const onDetectionsRef = useRef(onDetections);
  onDetectionsRef.current = onDetections;

  useEffect(() => {
    if (!isActive || !detector) {
      return undefined;
    }

    if (!canvasRef.current) {
      canvasRef.current = document.createElement('canvas');
      canvasRef.current.width = options.analysisWidth;
      canvasRef.current.height = options.analysisHeight;
    }
    const canvas = canvasRef.current;
    // `willReadFrequently` tells the browser to keep the canvas where reading it back is cheap.
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) {
      return undefined;
    }

    let frameRequest = null;
    let isCancelled = false;
    let lastRunAt = 0;
    let framesInSecond = 0;
    let secondStartedAt = 0;

    const minimumGap = 1000 / options.framesPerSecond;

    const step = now => {
      if (isCancelled) {
        return;
      }
      frameRequest = window.requestAnimationFrame(step);

      const video = videoRef.current;
      if (!video || video.readyState < 2 || video.videoWidth === 0) {
        return;
      }
      if (now - lastRunAt < minimumGap) {
        return;
      }
      lastRunAt = now;

      const startedAt = performance.now();
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
      const detections = detector.detect(imageData);
      const duration = performance.now() - startedAt;

      onDetectionsRef.current(detections, {
        width: canvas.width,
        height: canvas.height,
        durationMs: duration,
      });

      framesInSecond++;
      if (now - secondStartedAt >= 1000) {
        setStats({
          framesPerSecond: framesInSecond,
          lastDurationMs: Math.round(duration),
        });
        framesInSecond = 0;
        secondStartedAt = now;
      }
    };

    frameRequest = window.requestAnimationFrame(step);

    return () => {
      isCancelled = true;
      if (frameRequest !== null) {
        window.cancelAnimationFrame(frameRequest);
      }
    };
  }, [
    isActive,
    detector,
    videoRef,
    options.analysisWidth,
    options.analysisHeight,
    options.framesPerSecond,
  ]);

  return stats;
};

export default useFrameDetection;
