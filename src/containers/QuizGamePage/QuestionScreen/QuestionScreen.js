import React, { useEffect, useRef, useState } from 'react';
import classNames from 'classnames';
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { App } from '@capacitor/app';

// Contexts, configs, and util modules
import { useIntl } from '../../../util/reactIntl';

// Shared components
import { H2, IconCheckmark, IconClose, PrimaryButton } from '../../../components';

// Modules from parent directory
import { OPTIONS_PER_QUESTION, questionOptionId, questionTextId } from '../quizQuestions';
import { SECONDS_PER_QUESTION } from '../quizScoring';

// Modules from the same directory
import css from './QuestionScreen.module.css';

// When fewer seconds than this are left, the countdown is highlighted.
const LOW_TIME_SECONDS = 5;

const nativeHaptic = async (type, isCorrect = false, enabled = true) => {
  if (!enabled || !Capacitor.isNativePlatform()) return;
  try {
    if (type === 'answer') {
      await Haptics.notification({
        type: isCorrect ? NotificationType.Success : NotificationType.Error,
      });
    } else {
      await Haptics.impact({ style: ImpactStyle.Light });
    }
  } catch (e) {
    // Haptics are optional and should never interrupt gameplay.
  }
};

/**
 * A single answer option. After the player has answered, the correct option is always highlighted
 * and a wrong selection is marked as such.
 *
 * @param {Object} props
 * @param {number} props.optionIndex - Zero-based index of the option
 * @param {string} props.label - The text of the option
 * @param {boolean} props.isSelected - Whether the player picked this option
 * @param {boolean} props.isCorrect - Whether this is the correct option
 * @param {boolean} props.hasAnswered - Whether the current question is already answered
 * @param {Function} props.onSelect - Called when the player picks this option
 * @returns {JSX.Element} answer option button
 */
const AnswerOption = props => {
  const { optionIndex, label, isSelected, isCorrect, hasAnswered, onSelect } = props;

  const showAsCorrect = hasAnswered && isCorrect;
  const showAsIncorrect = hasAnswered && isSelected && !isCorrect;

  const classes = classNames(css.option, {
    [css.optionCorrect]: showAsCorrect,
    [css.optionIncorrect]: showAsIncorrect,
    [css.optionDimmed]: hasAnswered && !showAsCorrect && !showAsIncorrect,
  });

  return (
    <li className={css.optionItem}>
      <button
        className={classes}
        type="button"
        disabled={hasAnswered}
        aria-pressed={isSelected}
        onClick={() => {
          nativeHaptic('tap', false, hapticsEnabled);
          onSelect();
        }}
      >
        <span className={css.optionKey} aria-hidden="true">
          {optionIndex + 1}
        </span>
        <span className={css.optionLabel}>{label}</span>
        {showAsCorrect ? <IconCheckmark className={css.optionIcon} size="small" /> : null}
        {showAsIncorrect ? <IconClose className={css.optionIcon} size="small" /> : null}
      </button>
    </li>
  );
};

/**
 * Question screen of the quiz game: shows the running score, a countdown, the current question with
 * 4 answer options, and the feedback for the given answer.
 *
 * The countdown is kept in this component. The parent renders this component with the question id
 * as key, so that the countdown restarts on every question.
 *
 * @param {Object} props
 * @param {Object} props.question - The current question
 * @param {number} props.questionNumber - One-based number of the current question
 * @param {number} props.totalQuestions - Number of questions in the round
 * @param {number} props.totalPoints - The score so far
 * @param {number} props.streak - Number of correct answers in a row
 * @param {number|null} props.selectedOptionIndex - The option the player picked, or null
 * @param {boolean} props.isTimedOut - Whether the time ran out before an answer was given
 * @param {number} props.lastPoints - Points that the current answer was worth
 * @param {boolean} props.isLastQuestion - Whether this is the last question of the round
 * @param {Function} props.onAnswer - Called with the picked option index and the remaining seconds
 * @param {Function} props.onTimeout - Called when the time runs out
 * @param {Function} props.onNext - Called when the player moves on
 * @param {Function} props.onQuit - Called when the player wants to leave the round
 * @returns {JSX.Element} question screen
 */
const QuestionScreen = props => {
  const intl = useIntl();
  const {
    question,
    questionNumber,
    totalQuestions,
    totalPoints,
    streak,
    selectedOptionIndex,
    isTimedOut,
    lastPoints,
    isLastQuestion,
    onAnswer,
    onTimeout,
    onNext,
    onQuit,
    hapticsEnabled = true,
  } = props;

  const [secondsLeft, setSecondsLeft] = useState(SECONDS_PER_QUESTION);
  const [isAppActive, setIsAppActive] = useState(true);
  const wasInactiveRef = useRef(false);
  const answeredRef = useRef(false);

  const hasAnswered = selectedOptionIndex !== null || isTimedOut;
  const isCorrect = selectedOptionIndex === question.correctOptionIndex;

  // Keep the latest callbacks in refs, so that the countdown is not restarted when the parent
  // passes new function instances on re-render.
  const callbacksRef = useRef({ onAnswer, onTimeout, onNext });
  useEffect(() => {
    callbacksRef.current = { onAnswer, onTimeout, onNext };
  });

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return undefined;
    let listener;
    let disposed = false;
    App.addListener('appStateChange', ({ isActive }) => {
      if (!isActive) {
        wasInactiveRef.current = true;
      }
      setIsAppActive(isActive);
    }).then(handle => {
      if (disposed) {
        handle.remove();
      } else {
        listener = handle;
      }
    });
    return () => {
      disposed = true;
      if (listener) listener.remove();
    };
  }, []);

  useEffect(() => {
    if (isAppActive && wasInactiveRef.current) {
      wasInactiveRef.current = false;
      setSecondsLeft(previous => Math.max(0, previous));
    }
  }, [isAppActive]);

  // Countdown: tick once a second until the question is answered or the time runs out.
  useEffect(() => {
    if (hasAnswered || !isAppActive) {
      return undefined;
    }
    if (secondsLeft <= 0) {
      callbacksRef.current.onTimeout();
      return undefined;
    }
    const timeoutId = setTimeout(() => setSecondsLeft(seconds => seconds - 1), 1000);
    return () => clearTimeout(timeoutId);
  }, [secondsLeft, hasAnswered, isAppActive]);

  // Keyboard shortcuts: 1–4 pick an answer, Enter moves on.
  useEffect(() => {
    const handleKeyDown = event => {
      if (event.key === 'Enter' && hasAnswered) {
        callbacksRef.current.onNext();
        return;
      }
      const optionIndex = Number(event.key) - 1;
      const isOptionKey =
        Number.isInteger(optionIndex) && optionIndex >= 0 && optionIndex < OPTIONS_PER_QUESTION;
      if (isOptionKey && !hasAnswered && !answeredRef.current) {
        answeredRef.current = true;
        callbacksRef.current.onAnswer(optionIndex, secondsLeft);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [hasAnswered, secondsLeft]);

  const correctAnswer = intl.formatMessage({
    id: questionOptionId(question.id, question.correctOptionIndex),
  });

  useEffect(() => {
    if (hasAnswered) {
      nativeHaptic('answer', isCorrect, hapticsEnabled);
    }
  }, [hasAnswered, isCorrect, hapticsEnabled]);

  const feedback = !hasAnswered ? null : isCorrect ? (
    <span className={css.feedbackCorrect}>
      {intl.formatMessage({ id: 'QuizGamePage.feedbackCorrect' }, { points: lastPoints })}
    </span>
  ) : (
    <span className={css.feedbackIncorrect}>
      {isTimedOut
        ? intl.formatMessage({ id: 'QuizGamePage.feedbackTimeout' }, { correctAnswer })
        : intl.formatMessage({ id: 'QuizGamePage.feedbackIncorrect' }, { correctAnswer })}
    </span>
  );

  const timeLeftRatio = Math.max(0, secondsLeft) / SECONDS_PER_QUESTION;
  const isLowOnTime = !hasAnswered && secondsLeft <= LOW_TIME_SECONDS;

  return (
    <section className={css.root}>
      <div className={css.topActions}>
        <button className={css.quitButton} type="button" onClick={onQuit}>
          <span aria-hidden="true">×</span>
          <span>{intl.formatMessage({ id: 'QuizGamePage.leaveRound' })}</span>
        </button>
      </div>
      <div className={css.statusRow}>
        <span className={css.progress}>
          {intl.formatMessage(
            { id: 'QuizGamePage.progress' },
            { current: questionNumber, totalQuestions }
          )}
        </span>
        {streak > 1 ? (
          <span className={css.streak}>
            {intl.formatMessage({ id: 'QuizGamePage.streak' }, { streak })}
          </span>
        ) : null}
        <span className={css.score}>
          {intl.formatMessage({ id: 'QuizGamePage.score' }, { points: totalPoints })}
        </span>
      </div>

      <div className={css.timer}>
        <div
          className={classNames(css.timerBar, { [css.timerBarLow]: isLowOnTime })}
          style={{ width: `${timeLeftRatio * 100}%` }}
        />
      </div>
      <span className={classNames(css.timerLabel, { [css.timerLabelLow]: isLowOnTime })}>
        {intl.formatMessage(
          { id: 'QuizGamePage.secondsLeft' },
          { seconds: Math.max(0, secondsLeft) }
        )}
      </span>

      <H2 className={css.question}>{intl.formatMessage({ id: questionTextId(question.id) })}</H2>

      <ul className={css.options}>
        {Array.from({ length: OPTIONS_PER_QUESTION }, (_, optionIndex) => (
          <AnswerOption
            key={questionOptionId(question.id, optionIndex)}
            optionIndex={optionIndex}
            label={intl.formatMessage({ id: questionOptionId(question.id, optionIndex) })}
            isSelected={selectedOptionIndex === optionIndex}
            isCorrect={question.correctOptionIndex === optionIndex}
            hasAnswered={hasAnswered}
            onSelect={() => {
              if (answeredRef.current || hasAnswered) return;
              answeredRef.current = true;
              onAnswer(optionIndex, secondsLeft);
            }}
          />
        ))}
      </ul>

      <div className={css.feedback} role="status">
        {feedback}
      </div>

      {hasAnswered ? (
        <PrimaryButton className={css.nextButton} type="button" onClick={onNext}>
          {isLastQuestion
            ? intl.formatMessage({ id: 'QuizGamePage.showResult' })
            : intl.formatMessage({ id: 'QuizGamePage.nextQuestion' })}
        </PrimaryButton>
      ) : null}
    </section>
  );
};

export default QuestionScreen;
