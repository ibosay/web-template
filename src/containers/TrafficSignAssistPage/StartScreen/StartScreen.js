import React from 'react';
import classNames from 'classnames';

// Contexts, configs, and util modules
import { useIntl } from '../../../util/reactIntl';

// Shared components
import { H2, PrimaryButton, SecondaryButton } from '../../../components';

// Modules from the same directory
import css from './StartScreen.module.css';

/**
 * What the assistant needs in order to work. The camera is the only one it cannot do without: with
 * no GPS there are no speed warnings but signs are still announced, and with no speech synthesis
 * the signs still show up on screen.
 */
const requirementRows = ({ isCameraSupported, isGpsSupported, isSpeechSupported }) => [
  { id: 'camera', isAvailable: isCameraSupported, isRequired: true },
  { id: 'gps', isAvailable: isGpsSupported, isRequired: false },
  { id: 'speech', isAvailable: isSpeechSupported, isRequired: false },
];

/**
 * The screen before the drive: what the assistant does, what it needs, and what it is not.
 *
 * @param {Object} props
 * @param {boolean} props.isCameraSupported - Whether the browser can open a camera
 * @param {boolean} props.isGpsSupported - Whether the browser can report a position
 * @param {boolean} props.isSpeechSupported - Whether the browser can speak
 * @param {Object} [props.cameraError] - The error of the last attempt to open the camera
 * @param {number} props.recordedFrameCount - How many frames a previous drive left behind
 * @param {Function} props.onStart - Called when the driver starts the assistant
 * @param {Function} props.onReview - Called when the driver wants to look at that recording
 * @returns {JSX.Element} start screen
 */
const StartScreen = props => {
  const intl = useIntl();
  const {
    isCameraSupported,
    isGpsSupported,
    isSpeechSupported,
    cameraError,
    recordedFrameCount,
    onStart,
    onReview,
  } = props;

  const rows = requirementRows({ isCameraSupported, isGpsSupported, isSpeechSupported });

  return (
    <section className={css.root}>
      <H2 className={css.heading}>
        {intl.formatMessage({ id: 'TrafficSignAssistPage.startHeading' })}
      </H2>
      <p className={css.lead}>{intl.formatMessage({ id: 'TrafficSignAssistPage.startLead' })}</p>

      <ul className={css.requirements}>
        {rows.map(row => (
          <li
            key={row.id}
            className={classNames(css.requirement, {
              [css.requirementMissing]: !row.isAvailable,
            })}
          >
            <span className={css.requirementMark} aria-hidden="true">
              {row.isAvailable ? '✓' : '—'}
            </span>
            <span>
              {intl.formatMessage({ id: `TrafficSignAssistPage.requirement_${row.id}` })}
              {!row.isAvailable ? (
                <span className={css.requirementNote}>
                  {' '}
                  {intl.formatMessage({
                    id: row.isRequired
                      ? 'TrafficSignAssistPage.requirementMissingRequired'
                      : 'TrafficSignAssistPage.requirementMissingOptional',
                  })}
                </span>
              ) : null}
            </span>
          </li>
        ))}
      </ul>

      {cameraError ? (
        <p className={css.error}>
          {intl.formatMessage({ id: 'TrafficSignAssistPage.cameraError' })}
        </p>
      ) : null}

      <div className={css.safety} role="note">
        <strong className={css.safetyHeading}>
          {intl.formatMessage({ id: 'TrafficSignAssistPage.safetyHeading' })}
        </strong>
        <p className={css.safetyText}>
          {intl.formatMessage({ id: 'TrafficSignAssistPage.safetyText' })}
        </p>
      </div>

      <PrimaryButton
        className={css.startButton}
        type="button"
        disabled={!isCameraSupported}
        onClick={onStart}
      >
        {intl.formatMessage({ id: 'TrafficSignAssistPage.start' })}
      </PrimaryButton>

      <p className={css.hint}>{intl.formatMessage({ id: 'TrafficSignAssistPage.startHint' })}</p>

      {recordedFrameCount > 0 ? (
        <SecondaryButton className={css.reviewButton} type="button" onClick={onReview}>
          {intl.formatMessage(
            { id: 'TrafficSignAssistPage.reviewOpen' },
            { count: recordedFrameCount }
          )}
        </SecondaryButton>
      ) : null}
    </section>
  );
};

export default StartScreen;
