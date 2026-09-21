import { useCallback, useMemo, useRef, useState } from 'react';

// Contexts, configs, and util modules
import { useIntl } from '../../util/reactIntl';

// Modules from the same directory
import { createDetector } from './detection/signDetector';
import {
  ANNOUNCE_OVERSPEED,
  ANNOUNCE_SPEED_LIMIT,
  ANNOUNCE_STOP,
  createAssistantState,
  isOverLimit,
  update as updateAssistant,
} from './logic/assistantState';
import { createStabilizerState, pushFrame } from './logic/detectionStabilizer';
import useCameraStream from './hooks/useCameraStream';
import useFrameDetection from './hooks/useFrameDetection';
import useFrameRecorder from './hooks/useFrameRecorder';
import useGpsSpeed from './hooks/useGpsSpeed';
import useSpeech from './hooks/useSpeech';
import useWakeLock from './hooks/useWakeLock';

/**
 * The assistant itself: camera, detector, memory, speech and recording, wired together.
 *
 * It is kept apart from the page that shows it so that the same assistant can run in two places —
 * as a page of this marketplace, and as a standalone app installed on a phone (see `demo/`). Both
 * render the same screens; only the frame around them differs.
 */

/** The screens the assistant moves through. */
export const SCREEN_START = 'start';
export const SCREEN_DRIVE = 'drive';
export const SCREEN_REVIEW = 'review';

/** Which announcement is spoken with which wording. */
const ANNOUNCEMENT_MESSAGE_IDS = {
  [ANNOUNCE_SPEED_LIMIT]: 'TrafficSignAssistPage.speakSpeedLimit',
  [ANNOUNCE_STOP]: 'TrafficSignAssistPage.speakStop',
  [ANNOUNCE_OVERSPEED]: 'TrafficSignAssistPage.speakOverspeed',
};

/** Colours of the boxes the detector drew, for the debug overlay. */
const BOX_COLOURS = { speedLimit: '#38bdf8', stop: '#f87171' };

/**
 * Runs the assistant.
 *
 * @returns {Object} everything the screens need, plus the handlers that move between them
 */
const useTrafficSignAssistant = () => {
  const intl = useIntl();

  const [screen, setScreen] = useState(SCREEN_START);
  const [isDebugVisible, setIsDebugVisible] = useState(false);
  // Only what is actually on screen lives in React state. The detector runs eight times a second,
  // and re-rendering that often would be wasteful, so its state is kept in refs.
  const [hud, setHud] = useState({ limitKmh: null, isOver: false });
  const [lastSign, setLastSign] = useState(null);

  const assistantRef = useRef(createAssistantState());
  const stabilizerRef = useRef(createStabilizerState());
  const overlayRef = useRef(null);

  const detector = useMemo(() => createDetector(), []);
  const camera = useCameraStream();
  const recorder = useFrameRecorder({ videoRef: camera.videoRef });
  const gps = useGpsSpeed();
  // The warnings are spoken in the language of the app. Austrian German gets the Austrian voice
  // where the phone has one, which reads "30" and "130" the way they are said here.
  const locale = intl.locale || '';
  const speechLanguage = locale.toLowerCase().startsWith('de') ? 'de-AT' : locale || 'de-AT';
  const speech = useSpeech({ language: speechLanguage });

  const isDriving = screen === SCREEN_DRIVE;
  useWakeLock(isDriving);

  const speedKmh = gps.speedKmh;

  /** Draws the boxes the detector found over the camera picture. */
  const drawOverlay = useCallback((detections, frame) => {
    const canvas = overlayRef.current;
    if (!canvas) {
      return;
    }
    if (canvas.width !== frame.width || canvas.height !== frame.height) {
      canvas.width = frame.width;
      canvas.height = frame.height;
    }

    const context = canvas.getContext('2d');
    if (!context) {
      return;
    }
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.lineWidth = 3;
    context.font = '16px sans-serif';
    context.textBaseline = 'bottom';

    detections.forEach(detection => {
      const { box, type, limitKmh } = detection;
      context.strokeStyle = BOX_COLOURS[type] || '#ffffff';
      context.fillStyle = context.strokeStyle;
      context.strokeRect(box.x0, box.y0, box.x1 - box.x0, box.y1 - box.y0);
      context.fillText(limitKmh === null ? 'STOP' : String(limitKmh), box.x0, box.y0 - 2);
    });
  }, []);

  const handleDetections = useCallback(
    (detections, frame) => {
      if (isDebugVisible) {
        drawOverlay(detections, frame);
      }

      const vote = pushFrame(stabilizerRef.current, detections);
      stabilizerRef.current = vote.state;

      recorder.offerFrame({
        detections,
        speedKmh: speedKmh === undefined ? null : speedKmh,
        limitKmh: assistantRef.current.limitKmh,
      });

      const result = updateAssistant(assistantRef.current, {
        nowMs: Date.now(),
        confirmedSigns: vote.confirmed,
        speedKmh: speedKmh === undefined ? null : speedKmh,
      });
      assistantRef.current = result.state;

      result.announcements.forEach(announcement => {
        speech.speak(
          intl.formatMessage(
            { id: ANNOUNCEMENT_MESSAGE_IDS[announcement.kind] },
            announcement.values
          )
        );
      });

      if (vote.confirmed.length > 0) {
        const sign = vote.confirmed[0];
        setLastSign({ type: sign.type, limitKmh: sign.limitKmh, at: Date.now() });
      }

      // Mirror into React state only when the screen would actually change.
      const nextHud = { limitKmh: result.state.limitKmh, isOver: isOverLimit(result.state) };
      setHud(previous =>
        previous.limitKmh === nextHud.limitKmh && previous.isOver === nextHud.isOver
          ? previous
          : nextHud
      );
    },
    [drawOverlay, intl, isDebugVisible, recorder, speech, speedKmh]
  );

  const frameStats = useFrameDetection({
    videoRef: camera.videoRef,
    detector,
    isActive: isDriving && camera.isRunning,
    onDetections: handleDetections,
  });

  const start = useCallback(async () => {
    // The permission for the voice has to be asked for from the tap itself, which is why this
    // comes before the camera: after an await, iOS no longer counts it as a tap.
    speech.enable(intl.formatMessage({ id: 'TrafficSignAssistPage.speakReady' }));

    assistantRef.current = createAssistantState();
    stabilizerRef.current = createStabilizerState();
    setHud({ limitKmh: null, isOver: false });
    setLastSign(null);

    gps.start();
    await detector.prepare();
    // Stay on the start screen if the camera refused, because that is where the error is shown.
    const isCameraRunning = await camera.start();
    if (isCameraRunning) {
      setScreen(SCREEN_DRIVE);
    } else {
      gps.stop();
    }
  }, [camera, detector, gps, intl, speech]);

  const stop = useCallback(() => {
    setScreen(SCREEN_START);
    recorder.stop();
    camera.stop();
    gps.stop();
    speech.cancel();
  }, [camera, gps, recorder, speech]);

  return {
    screen,
    isDriving,
    hud,
    lastSign,
    speedKmh,
    camera,
    gps,
    speech,
    recorder,
    frameStats,
    overlayRef,
    isDebugVisible,
    start,
    stop,
    openReview: useCallback(() => setScreen(SCREEN_REVIEW), []),
    closeReview: useCallback(() => setScreen(SCREEN_START), []),
    toggleDebug: useCallback(() => setIsDebugVisible(visible => !visible), []),
  };
};

export default useTrafficSignAssistant;
