import { useCallback, useEffect, useRef, useState } from 'react';

// Contexts, configs, and util modules
import {
  clearFrames,
  countFrames,
  getFramePicture,
  isStorageAvailable,
  listFrameMeta,
  openStore,
  putFrame,
} from '../recording/frameStore';
import {
  createRecordingState,
  DEFAULT_RECORDING_OPTIONS,
  isRecordingFull,
  noteKeptFrame,
  shouldKeepFrame,
} from '../recording/recordingPolicy';
import { buildZip } from '../recording/zipArchive';

/**
 * Records a drive, so that what the detector saw can be looked at afterwards.
 *
 * This is the piece that turns a test drive into something to work with. Watching the assistant
 * from the driver's seat only ever yields an impression — "it did not see much" — which is not
 * enough to tune a threshold against. A few hundred frames with what the detector made of each of
 * them is.
 *
 * The pictures are kept at a higher resolution than the detector works at, because the same
 * recording is also the material a trained model would later be built from, and detail thrown away
 * now cannot be got back.
 */

export const DEFAULT_RECORDER_OPTIONS = {
  ...DEFAULT_RECORDING_OPTIONS,
  captureWidth: 640,
  captureHeight: 480,
  // Enough for a sign to stay readable, small enough for a few hundred frames on a phone.
  jpegQuality: 0.72,
};

/**
 * @param {Object} params
 * @param {Object} params.videoRef - Ref to the `<video>` element showing the camera
 * @param {Object} [params.options] - see DEFAULT_RECORDER_OPTIONS
 * @returns {Object} the recorder
 */
const useFrameRecorder = ({ videoRef, options = DEFAULT_RECORDER_OPTIONS }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [frameCount, setFrameCount] = useState(0);
  const [error, setError] = useState(null);

  const databaseRef = useRef(null);
  const canvasRef = useRef(null);
  const stateRef = useRef(createRecordingState());
  // One capture at a time: turning a frame into a JPEG is asynchronous, and the loop would
  // otherwise start the next one before this one is stored.
  const isCapturingRef = useRef(false);

  const isSupported = isStorageAvailable();

  const withDatabase = useCallback(async () => {
    if (!databaseRef.current) {
      databaseRef.current = await openStore();
    }
    return databaseRef.current;
  }, []);

  // Pick up a recording that is already stored, so that a drive survives a reload.
  useEffect(() => {
    if (!isSupported) {
      return;
    }
    let isCancelled = false;

    withDatabase()
      .then(countFrames)
      .then(count => {
        if (!isCancelled) {
          setFrameCount(count);
          stateRef.current = { frameCount: count, lastKeptAt: null };
        }
      })
      .catch(() => {});

    return () => {
      isCancelled = true;
    };
  }, [isSupported, withDatabase]);

  const start = useCallback(() => {
    setError(null);
    // Carry on from what is already stored rather than starting the count again.
    stateRef.current = { ...stateRef.current, lastKeptAt: null };
    setIsRecording(true);
  }, []);

  const stop = useCallback(() => setIsRecording(false), []);

  /**
   * Offers one frame to the recording. The rule in `recordingPolicy` decides whether it is kept.
   *
   * @param {Object} params
   * @param {Array<Object>} params.detections - What the detector found in this frame
   * @param {number|null} params.speedKmh - The speed at the time
   * @param {number|null} params.limitKmh - The limit in force at the time
   */
  const offerFrame = useCallback(
    ({ detections, speedKmh, limitKmh }) => {
      const video = videoRef.current;
      if (!isRecording || !isSupported || isCapturingRef.current || !video) {
        return;
      }
      if (video.readyState < 2 || video.videoWidth === 0) {
        return;
      }

      const nowMs = Date.now();
      const hasDetections = detections.length > 0;
      if (!shouldKeepFrame(stateRef.current, { nowMs, hasDetections }, options)) {
        return;
      }

      if (!canvasRef.current) {
        canvasRef.current = document.createElement('canvas');
        canvasRef.current.width = options.captureWidth;
        canvasRef.current.height = options.captureHeight;
      }
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');
      if (!context) {
        return;
      }

      isCapturingRef.current = true;
      // Claim the slot before the asynchronous part, so that the next frames are not also kept
      // while this one is still being turned into a JPEG.
      stateRef.current = noteKeptFrame(stateRef.current, nowMs);
      setFrameCount(stateRef.current.frameCount);

      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        async picture => {
          try {
            if (picture) {
              const database = await withDatabase();
              await putFrame(database, nowMs, picture, {
                recordedAt: nowMs,
                width: canvas.width,
                height: canvas.height,
                detections,
                speedKmh: speedKmh === undefined ? null : speedKmh,
                limitKmh: limitKmh === undefined ? null : limitKmh,
              });
            }
          } catch (e) {
            setError(e);
          } finally {
            isCapturingRef.current = false;
          }
        },
        'image/jpeg',
        options.jpegQuality
      );
    },
    [isRecording, isSupported, options, videoRef, withDatabase]
  );

  /** Reads the descriptions of every stored frame. */
  const loadFrameList = useCallback(async () => {
    const database = await withDatabase();
    return listFrameMeta(database);
  }, [withDatabase]);

  /** Reads one stored picture. */
  const loadFramePicture = useCallback(
    async id => {
      const database = await withDatabase();
      return getFramePicture(database, id);
    },
    [withDatabase]
  );

  const clear = useCallback(async () => {
    const database = await withDatabase();
    await clearFrames(database);
    stateRef.current = createRecordingState();
    setFrameCount(0);
  }, [withDatabase]);

  /**
   * Packs the recording into a ZIP and hands it to the browser to save: a folder of JPEGs next to
   * a manifest that says what the detector made of each of them.
   *
   * @returns {Promise<number>} how many frames were written
   */
  const exportRecording = useCallback(async () => {
    const database = await withDatabase();
    const meta = await listFrameMeta(database);

    const entries = [];
    const manifestFrames = [];

    for (let i = 0; i < meta.length; i++) {
      const frame = meta[i];
      const picture = await getFramePicture(database, frame.id);
      if (!picture) {
        continue;
      }
      const name = `frames/${String(i + 1).padStart(6, '0')}.jpg`;
      entries.push({ name, bytes: new Uint8Array(await picture.arrayBuffer()) });
      manifestFrames.push({ file: name, ...frame });
    }

    const manifest = {
      recordedWith: 'TrafficSignAssistPage',
      captureWidth: options.captureWidth,
      captureHeight: options.captureHeight,
      frameCount: manifestFrames.length,
      frames: manifestFrames,
    };
    entries.unshift({
      name: 'manifest.json',
      bytes: new TextEncoder().encode(JSON.stringify(manifest, null, 2)),
    });

    const zip = buildZip(entries);
    const url = URL.createObjectURL(new Blob([zip], { type: 'application/zip' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `fahrt-${new Date()
      .toISOString()
      .slice(0, 19)
      .replace(/[:T]/g, '-')}.zip`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    // Give the browser a moment to start the download before the data goes away.
    setTimeout(() => URL.revokeObjectURL(url), 10000);

    return manifestFrames.length;
  }, [options.captureHeight, options.captureWidth, withDatabase]);

  return {
    isSupported,
    isRecording,
    isFull: isRecordingFull(stateRef.current, options),
    frameCount,
    error,
    start,
    stop,
    offerFrame,
    clear,
    loadFrameList,
    loadFramePicture,
    exportRecording,
  };
};

export default useFrameRecorder;
