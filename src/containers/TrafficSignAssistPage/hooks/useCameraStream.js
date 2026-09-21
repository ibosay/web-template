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
  const [wasInterrupted, setWasInterrupted] = useState(false);

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

  /**
   * Starts the picture again if it was paused, and reports a camera that was taken away.
   *
   * Both happen on a phone, and iOS in particular: switching apps pauses the video element, and
   * nothing starts it again by itself — the detector would keep reading the same frozen frame and
   * the assistant would go quiet without anything on screen saying why. The system may also hand
   * the camera to another app, which ends the track for good.
   */
  const watchStream = useCallback(() => {
    const video = videoRef.current;
    if (streamRef.current && video && video.paused) {
      const played = video.play();
      if (played && typeof played.catch === 'function') {
        played.catch(() => {});
      }
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
    setWasInterrupted(false);
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
    setWasInterrupted(false);

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
      // `stop()` on a track does not fire this, so it only ever means the system took the camera.
      stream.getVideoTracks().forEach(track => {
        track.addEventListener('ended', () => {
          setWasInterrupted(true);
          setIsRunning(false);
        });
      });
      attach();
      setIsRunning(true);
      return true;
    } catch (e) {
      setError(e);
      setIsRunning(false);
      return false;
    }
  }, [attach, isSupported, width, height]);

  useEffect(() => {
    if (typeof document === 'undefined') {
      return undefined;
    }
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        watchStream();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [watchStream]);

  useEffect(() => stop, [stop]);

  return { videoRef, registerVideo, isSupported, isRunning, wasInterrupted, error, start, stop };
};

export default useCameraStream;
