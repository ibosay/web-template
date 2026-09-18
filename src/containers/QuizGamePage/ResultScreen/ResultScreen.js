import React from 'react';

// Contexts, configs, and util modules
import { useIntl } from '../../../util/reactIntl';

// Shared components
import { H2, PrimaryButton, SecondaryButton } from '../../../components';

// Modules from parent directory
import { categoryLabelId, questionTextId } from '../quizQuestions';

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
  const {
    categoryId,
    answers,
    totalPoints,
    highScore,
    isNewHighScore,
    onPlayAgain,
    onBackToStart,
  } = props;

  const totalQuestions = answers.length;
  const correctCount = answers.filter(answer => answer.isCorrect).length;

  return (
    <section className={css.root}>
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
        <SecondaryButton className={css.actionButton} type="button" onClick={onBackToStart}>
          {intl.formatMessage({ id: 'QuizGamePage.backToStart' })}
        </SecondaryButton>
      </div>
    </section>
  );
};

export default ResultScreen;
