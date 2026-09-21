import { useCallback, useEffect, useRef } from 'react';

/**
 * Keeps the screen on while the assistant is running.
 *
 * A phone in a holder locks its screen after half a minute, and a locked screen stops the camera.
 * The wake lock is also lost whenever the app goes into the background, so it is taken again as
 * soon as the page becomes visible.
 *
 * Browsers without the API simply do not get the lock — the assistant still works, the screen just
 * goes dark on its own.
 */

/**
 * @param {boolean} isActive - Whether the screen should be kept on
 */
const useWakeLock = isActive => {
  const lockRef = useRef(null);

  const release = useCallback(() => {
    if (lockRef.current) {
      lockRef.current.release().catch(() => {});
      lockRef.current = null;
    }
  }, []);

  const request = useCallback(async () => {
    if (typeof navigator === 'undefined' || !navigator.wakeLock || lockRef.current) {
      return;
    }
    try {
      lockRef.current = await navigator.wakeLock.request('screen');
      lockRef.current.addEventListener('release', () => {
        lockRef.current = null;
      });
    } catch (e) {
      // Keeping the screen on is a comfort, not a requirement.
    }
  }, []);

  useEffect(() => {
    if (!isActive) {
      release();
      return undefined;
    }

    request();

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        request();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      release();
    };
  }, [isActive, request, release]);
};

export default useWakeLock;
