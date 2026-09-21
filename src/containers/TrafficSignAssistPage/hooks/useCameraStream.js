import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Opens the rear camera and hands back a video element to draw frames from.
 *
 * The picture never leaves the phone: the stream goes into a `<video>` element, single frames are
 * copied onto a canvas, and the canvas is what the detector reads. Nothing is uploaded and nothing
 * is recorded.
 *
 * The stream and the element do not arrive in a fixed order. The camera is asked for while the
 * start screen is still up, so the element does not exist yet, and it is mounted only once the
 * drive screen renders. `registerVideo` is therefore a ref callback: whichever of the two arrives
 * last attaches the stream. Assigning it once, right after `getUserMedia` resolves, would attach it
 * to nothing and leave the viewport black for good.
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

  /** Attaches the stream to the element, as soon as both exist. */
  const attach = useCallback(() => {
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!video || !stream || video.srcObject === stream) {
      return;
    }
    video.srcObject = stream;
    // The element also carries `autoPlay`, which is what starts the preview on the browsers that
    // do not count this call as coming from the tap that opened the camera.
    const played = video.play();
    if (played && typeof played.catch === 'function') {
      played.catch(() => {});
    }
  }, []);

  /** Ref callback for the `<video>` element. */
  const registerVideo = useCallback(
    node => {
      videoRef.current = node;
      attach();
    },
    [attach]
  );

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

  /**
   * Opens the camera.
   *
   * @returns {Promise<boolean>} whether the camera is now running
   */
  const start = useCallback(async () => {
    if (!isSupported) {
      return false;
    }
    if (streamRef.current) {
      return true;
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
      attach();
      setIsRunning(true);
      return true;
    } catch (e) {
      setError(e);
      setIsRunning(false);
      return false;
    }
  }, [attach, isSupported, width, height]);

  useEffect(() => stop, [stop]);

  return { videoRef, registerVideo, isSupported, isRunning, error, start, stop };
};

export default useCameraStream;
