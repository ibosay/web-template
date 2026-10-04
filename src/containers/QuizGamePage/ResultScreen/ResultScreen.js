import React, { useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Share } from '@capacitor/share';

// Contexts, configs, and util modules
import { useIntl } from '../../../util/reactIntl';

// Shared components
import { H2, PrimaryButton, SecondaryButton } from '../../../components';

// Modules from parent directory
import { categoryLabelId, questionTextId } from '../quizQuestions';
import { levelFromXp, xpIntoLevel, XP_PER_LEVEL } from '../quizProgression';
import { ACHIEVEMENTS } from '../quizAchievements';

// Modules from the same directory
import css from './ResultScreen.module.css';

// The share of correct answers that is needed for the different result messages.
const GREAT_RESULT_THRESHOLD = 0.8;
const GOOD_RESULT_THRESHOLD = 0.5;

/**
 * Returns the translation key of the feedback message that matches the given result.
 *
 * @param {number} correctCount - Number of correct answers
 * @param {number} totalQuestions - Number of questions in the round
 * @returns {string} translation key
 */
const resultFeedbackId = (correctCount, totalQuestions) => {
  const ratio = totalQuestions > 0 ? correctCount / totalQuestions : 0;
  return ratio >= GREAT_RESULT_THRESHOLD
    ? 'QuizGamePage.resultFeedbackGreat'
    : ratio >= GOOD_RESULT_THRESHOLD
    ? 'QuizGamePage.resultFeedbackGood'
    : 'QuizGamePage.resultFeedbackTryAgain';
};

/**
 * Result screen of the quiz game: the final score, a summary of the answers, and the options to
 * play the same category again or to go back to the start screen.
 *
 * @param {Object} props
 * @param {string} props.categoryId - The category that was played
 * @param {Array<Object>} props.answers - The given answers of the round
 * @param {number} props.totalPoints - The final score
 * @param {number} props.highScore - The best score of this category
 * @param {boolean} props.isNewHighScore - Whether this round set a new high score
 * @param {Function} props.onPlayAgain - Called when the player starts a new round
 * @param {Function} props.onBackToStart - Called when the player returns to the start screen
 * @returns {JSX.Element} result screen
 */
const ResultScreen = props => {
  const intl = useIntl();
  const [shareStatus, setShareStatus] = useState(null);
  const {
    categoryId,
    answers,
    totalPoints,
    highScore,
    isNewHighScore,
    progression,
    newAchievements = [],
    xpEarned,
    roundDurationSeconds = 0,
    onPlayAgain,
    onBackToStart,
  } = props;

  const totalQuestions = answers.length;
  const correctCount = answers.filter(answer => answer.isCorrect).length;
  const accuracy = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;
  const level = levelFromXp(progression.totalXp);
  const levelXp = xpIntoLevel(progression.totalXp);
  const previousXp = Math.max(0, progression.totalXp - xpEarned);
  const previousLevel = levelFromXp(previousXp);
  const leveledUp = level > previousLevel;
  const xpPercent = Math.min(100, (levelXp / XP_PER_LEVEL) * 100);
  const minutes = Math.floor(roundDurationSeconds / 60);
  const seconds = roundDurationSeconds % 60;
  const durationLabel = `${minutes}:${String(seconds).padStart(2, '0')}`;
  const shareResult = async () => {
    setShareStatus(null);
    const text = intl.formatMessage(
      { id: 'QuizGamePage.shareText' },
      { points: totalPoints, correct: correctCount, total: totalQuestions, time: durationLabel }
    );
    try {
      if (Capacitor.isNativePlatform()) {
        await Share.share({ title: intl.formatMessage({ id: 'QuizGamePage.title' }), text });
      } else if (navigator.share) {
        await navigator.share({ text });
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(text);
        setShareStatus('copied');
      } else {
        setShareStatus('unavailable');
      }
    } catch (e) {
      // Closing the native share sheet is not an error for the player.
    }
  };

  return (
    <section className={css.root}>
      <div className={css.trophy}>★</div>
      <H2 className={css.heading}>{intl.formatMessage({ id: 'QuizGamePage.resultTitle' })}</H2>

      <p className={css.points}>
        {intl.formatMessage({ id: 'QuizGamePage.resultPoints' }, { points: totalPoints })}
      </p>
      <p className={css.correctCount}>
        {intl.formatMessage(
          { id: 'QuizGamePage.resultCorrectCount' },
          { correctCount, totalQuestions }
        )}
      </p>
      <div className={css.resultStats}>
        <div><span>{intl.formatMessage({ id: 'QuizGamePage.correctLabel' })}</span><strong>{correctCount}/{totalQuestions}</strong></div>
        <div><span>{intl.formatMessage({ id: 'QuizGamePage.accuracyLabel' })}</span><strong>{accuracy}%</strong></div>
        <div><span>{intl.formatMessage({ id: 'QuizGamePage.xpLabel' })}</span><strong>+{xpEarned}</strong></div>
        <div><span>{intl.formatMessage({ id: 'QuizGamePage.durationLabel' })}</span><strong>{durationLabel}</strong></div>
      </div>
      <div className={css.levelCard}>
        <div className={css.levelBadge}>{level}</div>
        <div className={css.levelText}>
          <span>{intl.formatMessage({ id: 'QuizGamePage.level' }, { level })}</span>
          <strong>{levelXp}/{XP_PER_LEVEL} XP · {intl.formatMessage({ id: 'QuizGamePage.rounds' }, { count: progression.roundsPlayed })}</strong>
          <div className={css.xpTrack}><div className={css.xpFill} style={{ width: `${xpPercent}%` }} /></div>
        </div>
      </div>

      {leveledUp ? (
        <div className={css.levelUp}>{intl.formatMessage({ id: 'QuizGamePage.levelUp' }, { level })}</div>
      ) : null}

      {newAchievements.length > 0 ? (
        <div className={css.unlocks}>
          <strong>{intl.formatMessage({ id: 'QuizGamePage.achievementUnlocked' })}</strong>
          {newAchievements.map(id => {
            const achievement = ACHIEVEMENTS.find(item => item.id === id);
            return achievement ? (
              <div key={id} className={css.unlockItem}>
                <span>{achievement.icon}</span>
                <span>{intl.formatMessage({ id: achievement.labelId })}</span>
              </div>
            ) : null;
          })}
        </div>
      ) : null}

      <p className={css.feedback}>
        {intl.formatMessage({ id: resultFeedbackId(correctCount, totalQuestions) })}
      </p>

      {isNewHighScore ? (
        <p className={css.newHighScore}>
          {intl.formatMessage(
            { id: 'QuizGamePage.newHighScore' },
            { category: intl.formatMessage({ id: categoryLabelId(categoryId) }) }
          )}
        </p>
      ) : highScore ? (
        <p className={css.highScore}>
          {intl.formatMessage({ id: 'QuizGamePage.highScore' }, { points: highScore })}
        </p>
      ) : null}

      <ul className={css.summary}>
        {answers.map(answer => (
          <li key={answer.questionId} className={css.summaryItem}>
            <span className={answer.isCorrect ? css.summaryCorrect : css.summaryIncorrect}>
              {intl.formatMessage({
                id: answer.isCorrect
                  ? 'QuizGamePage.summaryCorrect'
                  : 'QuizGamePage.summaryIncorrect',
              })}
            </span>
            <span className={css.summaryQuestion}>
              {intl.formatMessage({ id: questionTextId(answer.questionId) })}
            </span>
          </li>
        ))}
      </ul>

      <div className={css.actions}>
        <PrimaryButton className={css.actionButton} type="button" onClick={onPlayAgain}>
          {intl.formatMessage({ id: 'QuizGamePage.playAgain' })}
        </PrimaryButton>
        <SecondaryButton className={css.actionButton} type="button" onClick={shareResult}>
          {intl.formatMessage({ id: 'QuizGamePage.shareResult' })}
        </SecondaryButton>
        {shareStatus ? (
          <p className={css.shareStatus} role="status">
            {intl.formatMessage({
              id:
                shareStatus === 'copied'
                  ? 'QuizGamePage.shareCopied'
                  : 'QuizGamePage.shareUnavailable',
            })}
          </p>
        ) : null}
        <SecondaryButton className={css.actionButton} type="button" onClick={onBackToStart}>
          {intl.formatMessage({ id: 'QuizGamePage.backToStart' })}
        </SecondaryButton>
      </div>
    </section>
  );
};

export default ResultScreen;
