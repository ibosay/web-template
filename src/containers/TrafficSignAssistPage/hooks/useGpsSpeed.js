import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Reports how fast the phone is moving, from GPS.
 *
 * Most phones fill in `coords.speed` themselves, which is the better number because it comes from
 * the doppler shift of the satellite signal rather than from two positions. Some do not, so the
 * speed is worked out from the distance between two fixes as a fallback.
 */

/** Below this, GPS noise looks like walking speed while the car stands still. */
const STANDSTILL_KMH = 3;

/** Fixes this inaccurate are thrown away rather than turned into a speed. */
const MAX_ACCURACY_METRES = 60;

/** Distance in metres between two points on the earth. */
const distanceBetween = (from, to) => {
  const earthRadius = 6371000;
  const toRadians = degrees => (degrees * Math.PI) / 180;

  const dLat = toRadians(to.latitude - from.latitude);
  const dLon = toRadians(to.longitude - from.longitude);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(from.latitude)) *
      Math.cos(toRadians(to.latitude)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

/**
 * @returns {Object} `{ isSupported, isTracking, speedKmh, accuracy, error, start, stop }`
 */
const useGpsSpeed = () => {
  const [isTracking, setIsTracking] = useState(false);
  const [speedKmh, setSpeedKmh] = useState(null);
  const [accuracy, setAccuracy] = useState(null);
  const [error, setError] = useState(null);

  const watchIdRef = useRef(null);
  const previousFixRef = useRef(null);

  const isSupported = typeof navigator !== 'undefined' && !!navigator.geolocation;

  const stop = useCallback(() => {
    if (watchIdRef.current !== null) {
      if (typeof navigator !== 'undefined' && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
      watchIdRef.current = null;
    }
    previousFixRef.current = null;
    setIsTracking(false);
    setSpeedKmh(null);
  }, []);

  const start = useCallback(() => {
    if (!isSupported || watchIdRef.current !== null) {
      return;
    }
    setError(null);

    watchIdRef.current = navigator.geolocation.watchPosition(
      position => {
        const { coords, timestamp } = position;
        setAccuracy(coords.accuracy);
        setIsTracking(true);

        if (coords.accuracy > MAX_ACCURACY_METRES) {
          return;
        }

        let kmh = null;
        if (typeof coords.speed === 'number' && !Number.isNaN(coords.speed)) {
          kmh = coords.speed * 3.6;
        } else {
          const previous = previousFixRef.current;
          const seconds = previous ? (timestamp - previous.timestamp) / 1000 : 0;
          // Under a second the distance is mostly noise, over ten the car has long since changed
          // speed.
          if (previous && seconds >= 1 && seconds <= 10) {
            kmh = (distanceBetween(previous.coords, coords) / seconds) * 3.6;
          }
        }

        previousFixRef.current = { coords, timestamp };

        if (kmh !== null) {
          setSpeedKmh(kmh < STANDSTILL_KMH ? 0 : kmh);
        }
      },
      positionError => {
        setError(positionError);
        setIsTracking(false);
      },
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 20000 }
    );
  }, [isSupported]);

  useEffect(() => stop, [stop]);

  return { isSupported, isTracking, speedKmh, accuracy, error, start, stop };
};

export default useGpsSpeed;
