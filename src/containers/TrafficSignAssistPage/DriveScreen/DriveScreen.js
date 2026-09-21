import React from 'react';
import classNames from 'classnames';

// Contexts, configs, and util modules
import { useIntl } from '../../../util/reactIntl';

// Shared components
import { SecondaryButton } from '../../../components';

// Modules from parent directory
import { signLabelId, SIGN_STOP } from '../signTypes';

// Modules from the same directory
import css from './DriveScreen.module.css';

/**
 * The screen during the drive: the camera picture, the limit in force, and the current speed.
 *
 * The two numbers are large on purpose. A glance has to be enough — anything that needs reading
 * does not belong on a screen in a moving car.
 *
 * @param {Object} props
 * @param {Function} props.videoRef - Ref callback for the `<video>` element the camera is shown in
 * @param {Object} props.overlayRef - Ref for the `<canvas>` the debug boxes are drawn on
 * @param {number|null} props.limitKmh - The limit in force, or null if none is known
 * @param {number|null} props.speedKmh - The current speed, or null while the GPS has none
 * @param {boolean} props.isOverLimit - Whether the car is over the limit
 * @param {Object} [props.lastSign] - The sign that was recognised last
 * @param {Object} props.gps - The state of `useGpsSpeed`
 * @param {Object} [props.cameraError] - The error of the last attempt to open the camera
 * @param {boolean} props.wasCameraInterrupted - Whether the system took the camera away mid-drive
 * @param {Object} props.frameStats - Frames per second and time per frame of the detector
 * @param {boolean} props.isDebugVisible - Whether the boxes and the numbers are shown
 * @param {Object} props.recorder - The recorder, from `useFrameRecorder`
 * @param {Function} props.onToggleDebug - Called when the driver shows or hides the debug view
 * @param {Function} props.onStop - Called when the driver stops the assistant
 * @returns {JSX.Element} drive screen
 */
const DriveScreen = props => {
  const intl = useIntl();
  const {
    videoRef,
    overlayRef,
    limitKmh,
    speedKmh,
    isOverLimit,
    lastSign,
    gps,
    cameraError,
    wasCameraInterrupted,
    frameStats,
    isDebugVisible,
    recorder,
    onToggleDebug,
    onStop,
  } = props;

  const hasSpeed = typeof speedKmh === 'number';
  const isWaitingForGps = gps.isSupported && !hasSpeed;

  return (
    <section className={css.root}>
      <div className={css.viewport}>
        {/* `playsInline` keeps iOS from opening the camera in its own full screen player, and
            `autoPlay` starts the preview without relying on a play() call. */}
        <video ref={videoRef} className={css.video} autoPlay muted playsInline />
        <canvas
          ref={overlayRef}
          className={classNames(css.overlay, { [css.overlayHidden]: !isDebugVisible })}
        />

        <div className={css.hud}>
          <div
            className={classNames(css.limitSign, { [css.limitSignEmpty]: limitKmh === null })}
            aria-label={
              limitKmh === null
                ? intl.formatMessage({ id: 'TrafficSignAssistPage.noLimit' })
                : intl.formatMessage(
                    { id: 'TrafficSignAssistPage.limitLabel' },
                    { limit: limitKmh }
                  )
            }
          >
            <span className={css.limitValue}>{limitKmh === null ? '–' : limitKmh}</span>
          </div>

          <div className={classNames(css.speed, { [css.speedOver]: isOverLimit })}>
            <span className={css.speedValue}>{hasSpeed ? Math.round(speedKmh) : '–'}</span>
            <span className={css.speedUnit}>
              {intl.formatMessage({ id: 'TrafficSignAssistPage.kmh' })}
            </span>
          </div>
        </div>

        {lastSign && lastSign.type === SIGN_STOP ? (
          <div className={css.stopBanner} role="status">
            {intl.formatMessage({ id: 'TrafficSignAssistPage.stopAhead' })}
          </div>
        ) : null}
      </div>

      <div className={css.status} role="status">
        {wasCameraInterrupted ? (
          <span className={css.statusError}>
            {intl.formatMessage({ id: 'TrafficSignAssistPage.cameraInterrupted' })}
          </span>
        ) : cameraError ? (
          <span className={css.statusError}>
            {intl.formatMessage({ id: 'TrafficSignAssistPage.cameraError' })}
          </span>
        ) : isWaitingForGps ? (
          <span>{intl.formatMessage({ id: 'TrafficSignAssistPage.waitingForGps' })}</span>
        ) : (
          <span>{intl.formatMessage({ id: 'TrafficSignAssistPage.running' })}</span>
        )}
      </div>

      {isDebugVisible ? (
        <dl className={css.debug}>
          <div className={css.debugRow}>
            <dt>{intl.formatMessage({ id: 'TrafficSignAssistPage.debugFps' })}</dt>
            <dd>{frameStats.framesPerSecond}</dd>
          </div>
          <div className={css.debugRow}>
            <dt>{intl.formatMessage({ id: 'TrafficSignAssistPage.debugFrameTime' })}</dt>
            <dd>{frameStats.lastDurationMs} ms</dd>
          </div>
          <div className={css.debugRow}>
            <dt>{intl.formatMessage({ id: 'TrafficSignAssistPage.debugGpsAccuracy' })}</dt>
            <dd>{gps.accuracy === null ? '–' : `${Math.round(gps.accuracy)} m`}</dd>
          </div>
          <div className={css.debugRow}>
            <dt>{intl.formatMessage({ id: 'TrafficSignAssistPage.debugLastSign' })}</dt>
            <dd>
              {lastSign
                ? intl.formatMessage({ id: signLabelId(lastSign.type) }) +
                  (lastSign.limitKmh === null ? '' : ` ${lastSign.limitKmh}`)
                : '–'}
            </dd>
          </div>
        </dl>
      ) : null}

      {recorder.isSupported ? (
        <div className={css.recording}>
          <SecondaryButton
            className={css.actionButton}
            type="button"
            disabled={recorder.isFull}
            onClick={recorder.isRecording ? recorder.stop : recorder.start}
          >
            {intl.formatMessage({
              id: recorder.isRecording
                ? 'TrafficSignAssistPage.recordStop'
                : 'TrafficSignAssistPage.recordStart',
            })}
          </SecondaryButton>
          <span className={classNames(css.recordCount, { [css.recordCountFull]: recorder.isFull })}>
            {intl.formatMessage(
              {
                id: recorder.isFull
                  ? 'TrafficSignAssistPage.recordFull'
                  : 'TrafficSignAssistPage.recordCount',
              },
              { count: recorder.frameCount }
            )}
          </span>
        </div>
      ) : null}

      <div className={css.actions}>
        <SecondaryButton className={css.actionButton} type="button" onClick={onToggleDebug}>
          {intl.formatMessage({
            id: isDebugVisible
              ? 'TrafficSignAssistPage.hideDebug'
              : 'TrafficSignAssistPage.showDebug',
          })}
        </SecondaryButton>
        <SecondaryButton className={css.actionButton} type="button" onClick={onStop}>
          {intl.formatMessage({ id: 'TrafficSignAssistPage.stop' })}
        </SecondaryButton>
      </div>
    </section>
  );
};

export default DriveScreen;
