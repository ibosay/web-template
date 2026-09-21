import React, { useCallback, useMemo, useRef, useState } from 'react';
import { compose } from 'redux';
import { connect } from 'react-redux';

// Contexts, configs, and util modules
import { useConfiguration } from '../../context/configurationContext';
import { useIntl } from '../../util/reactIntl';
import { isScrollingDisabled } from '../../ducks/ui.duck';

// Shared components
import { H1, LayoutSingleColumn, Page } from '../../components';

// Modules from parent directory
import TopbarContainer from '../TopbarContainer/TopbarContainer';
import FooterContainer from '../FooterContainer/FooterContainer';

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
import useGpsSpeed from './hooks/useGpsSpeed';
import useSpeech from './hooks/useSpeech';
import useWakeLock from './hooks/useWakeLock';
import StartScreen from './StartScreen/StartScreen';
import DriveScreen from './DriveScreen/DriveScreen';
import css from './TrafficSignAssistPage.module.css';

/** Which announcement is spoken with which wording. */
const ANNOUNCEMENT_MESSAGE_IDS = {
  [ANNOUNCE_SPEED_LIMIT]: 'TrafficSignAssistPage.speakSpeedLimit',
  [ANNOUNCE_STOP]: 'TrafficSignAssistPage.speakStop',
  [ANNOUNCE_OVERSPEED]: 'TrafficSignAssistPage.speakOverspeed',
};

/** Colours of the boxes the detector drew, for the debug overlay. */
const BOX_COLOURS = { speedLimit: '#38bdf8', stop: '#f87171' };

/**
 * Traffic sign assistant.
 *
 * Reads Austrian speed limits and stop signs from the rear camera while driving, remembers the
 * limit in force, compares it with the speed from the GPS and warns out loud.
 *
 * Everything runs on the phone: the camera picture is analysed frame by frame in the browser, is
 * never uploaded and never stored, and the voice is the one built into the phone. That is also why
 * it keeps working in a valley without a signal.
 *
 * How the pieces fit together:
 *
 * 1. `useCameraStream` opens the rear camera,
 * 2. `useFrameDetection` shrinks every frame and hands it to the detector,
 * 3. `detection/signDetector` finds signs in that single frame,
 * 4. `logic/detectionStabilizer` only lets through what several frames in a row agree on,
 * 5. `logic/assistantState` keeps the limit in force and decides what is worth saying,
 * 6. `useSpeech` says it.
 *
 * Steps 3 to 5 are plain functions without a browser in them, which is where the tests are.
 *
 * @param {Object} props
 * @param {boolean} props.scrollingDisabled - Whether the scrolling is disabled
 * @returns {JSX.Element} traffic sign assistant page
 */
export const TrafficSignAssistPageComponent = props => {
  const config = useConfiguration();
  const intl = useIntl();
  const { scrollingDisabled } = props;

  const [isDriving, setIsDriving] = useState(false);
  const [isDebugVisible, setIsDebugVisible] = useState(false);
  // Only what is actually on screen lives in React state. The detector runs eight times a second,
  // and re-rendering the page that often would be wasteful, so its state is kept in refs.
  const [hud, setHud] = useState({ limitKmh: null, isOver: false });
  const [lastSign, setLastSign] = useState(null);

  const assistantRef = useRef(createAssistantState());
  const stabilizerRef = useRef(createStabilizerState());
  const overlayRef = useRef(null);

  const detector = useMemo(() => createDetector(), []);
  const camera = useCameraStream();
  const gps = useGpsSpeed();
  // The warnings are spoken in the language of the app. Austrian German gets the Austrian voice
  // where the phone has one, which reads "30" and "130" the way they are said here.
  const locale = intl.locale || '';
  const speechLanguage = locale.toLowerCase().startsWith('de') ? 'de-AT' : locale || 'de-AT';
  const speech = useSpeech({ language: speechLanguage });
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
    [drawOverlay, intl, isDebugVisible, speech, speedKmh]
  );

  const frameStats = useFrameDetection({
    videoRef: camera.videoRef,
    detector,
    isActive: isDriving && camera.isRunning,
    onDetections: handleDetections,
  });

  const handleStart = useCallback(async () => {
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
      setIsDriving(true);
    } else {
      gps.stop();
    }
  }, [camera, detector, gps, intl, speech]);

  const handleStop = useCallback(() => {
    setIsDriving(false);
    camera.stop();
    gps.stop();
    speech.cancel();
  }, [camera, gps, speech]);

  const title = intl.formatMessage(
    { id: 'TrafficSignAssistPage.schemaTitle' },
    { marketplaceName: config.marketplaceName }
  );

  return (
    <Page title={title} scrollingDisabled={scrollingDisabled}>
      <LayoutSingleColumn
        mainColumnClassName={css.layoutWrapperMain}
        topbar={<TopbarContainer />}
        footer={<FooterContainer />}
      >
        <div className={css.root}>
          <H1 className={css.title}>{intl.formatMessage({ id: 'TrafficSignAssistPage.title' })}</H1>
          <p className={css.subtitle}>
            {intl.formatMessage({ id: 'TrafficSignAssistPage.subtitle' })}
          </p>

          {isDriving ? (
            <DriveScreen
              videoRef={camera.registerVideo}
              overlayRef={overlayRef}
              limitKmh={hud.limitKmh}
              speedKmh={speedKmh}
              isOverLimit={hud.isOver}
              lastSign={lastSign}
              gps={gps}
              cameraError={camera.error}
              frameStats={frameStats}
              isDebugVisible={isDebugVisible}
              onToggleDebug={() => setIsDebugVisible(visible => !visible)}
              onStop={handleStop}
            />
          ) : (
            <StartScreen
              isCameraSupported={camera.isSupported}
              isGpsSupported={gps.isSupported}
              isSpeechSupported={speech.isSupported}
              cameraError={camera.error}
              onStart={handleStart}
            />
          )}
        </div>
      </LayoutSingleColumn>
    </Page>
  );
};

const mapStateToProps = state => {
  return {
    scrollingDisabled: isScrollingDisabled(state),
  };
};

const TrafficSignAssistPage = compose(connect(mapStateToProps))(TrafficSignAssistPageComponent);

export default TrafficSignAssistPage;
