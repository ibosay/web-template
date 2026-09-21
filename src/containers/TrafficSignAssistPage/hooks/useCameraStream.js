import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Opens the rear camera and hands back a video element to draw frames from.
 *
 * The picture never leaves the phone: the stream goes into a `<video>` element, single frames are
 * copied onto a canvas, and the canvas is what the detector reads. Nothing is uploaded and nothing
 * is recorded.
 */

/**
 * @param {Object} [params]
 * @param {number} [params.width] - Ideal width to ask the camera for
 * @param {number} [params.height] - Ideal height to ask the camera for
 * @returns {Object} `{ videoRef, isSupported, isRunning, error, start, stop }`
 */
const useCameraStream = ({ width = 1280, height = 720 } = {}) => {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState(null);

  const isSupported =
    typeof navigator !== 'undefined' &&
    !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);

  const stop = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsRunning(false);
  }, []);

  const start = useCallback(async () => {
    if (!isSupported || streamRef.current) {
      return;
    }
    setError(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        // `environment` is the camera on the back of the phone, the one pointing at the road.
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: width },
          height: { ideal: height },
        },
        audio: false,
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        // Safari needs the play call, and it only succeeds because `start` is called from a tap.
        await videoRef.current.play();
      }
      setIsRunning(true);
    } catch (e) {
      setError(e);
      setIsRunning(false);
    }
  }, [isSupported, width, height]);

  useEffect(() => stop, [stop]);

  return { videoRef, isSupported, isRunning, error, start, stop };
};

export default useCameraStream;
