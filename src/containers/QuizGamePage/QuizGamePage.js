import React, { useState } from 'react';
import { compose } from 'redux';
import { connect } from 'react-redux';
import classNames from 'classnames';

// Contexts, configs, and util modules
import { useConfiguration } from '../../context/configurationContext';
import { useIntl } from '../../util/reactIntl';
import { isScrollingDisabled } from '../../ducks/ui.duck';

// Shared components
import {
  H1,
  H2,
  IconCheckmark,
  IconClose,
  LayoutSingleColumn,
  Page,
  PrimaryButton,
  SecondaryButton,
} from '../../components';

// Modules from parent directory
import TopbarContainer from '../TopbarContainer/TopbarContainer';
import FooterContainer from '../FooterContainer/FooterContainer';

// Modules from the same directory
import {
  QUIZ_QUESTIONS,
  OPTIONS_PER_QUESTION,
  questionOptionId,
  questionTextId,
  shuffle,
} from './quizQuestions';
import css from './QuizGamePage.module.css';

// The share of correct answers that is needed for the different result messages.
const GREAT_RESULT_THRESHOLD = 0.8;
const GOOD_RESULT_THRESHOLD = 0.5;

/**
 * Returns the translation key of the feedback message that matches the given result.
 *
 * @param {number} score - Number of correct answers
 * @param {number} total - Number of questions
 * @returns {string} translation key
 */
const resultFeedbackId = (score, total) => {
  const ratio = total > 0 ? score / total : 0;
  return ratio >= GREAT_RESULT_THRESHOLD
    ? 'QuizGamePage.resultFeedbackGreat'
    : ratio >= GOOD_RESULT_THRESHOLD
    ? 'QuizGamePage.resultFeedbackGood'
    : 'QuizGamePage.resultFeedbackTryAgain';
};

/**
 * A single answer option. After the player has answered, the correct option is always highlighted
 * and a wrong selection is marked as such.
 *
 * @param {Object} props
 * @param {string} props.label - The text of the option
 * @param {boolean} props.isSelected - Whether the player picked this option
 * @param {boolean} props.isCorrect - Whether this is the correct option
 * @param {boolean} props.hasAnswered - Whether the current question is already answered
 * @param {Function} props.onSelect - Called when the player picks this option
 * @returns {JSX.Element} answer option button
 */
const AnswerOption = props => {
  const { label, isSelected, isCorrect, hasAnswered, onSelect } = props;

  const showAsCorrect = hasAnswered && isCorrect;
  const showAsIncorrect = hasAnswered && isSelected && !isCorrect;

  const classes = classNames(css.option, {
    [css.optionCorrect]: showAsCorrect,
    [css.optionIncorrect]: showAsIncorrect,
  });

  return (
    <li className={css.optionItem}>
      <button
        className={classes}
        type="button"
        disabled={hasAnswered}
        aria-pressed={isSelected}
        onClick={onSelect}
      >
        <span className={css.optionLabel}>{label}</span>
        {showAsCorrect ? <IconCheckmark className={css.optionIcon} size="small" /> : null}
        {showAsIncorrect ? <IconClose className={css.optionIcon} size="small" /> : null}
      </button>
    </li>
  );
};

/**
 * Quiz game page: the player gets a question with 4 answer options, picks one, gets immediate
 * feedback, and sees the final score after the last question.
 *
 * This page renders its content on the client side only (no data is loaded from the API),
 * so the game state is kept in component state instead of a Redux duck.
 *
 * @param {Object} props
 * @param {boolean} props.scrollingDisabled - Whether the scrolling is disabled
 * @returns {JSX.Element} quiz game page component
 */
export const QuizGamePageComponent = props => {
  const config = useConfiguration();
  const intl = useIntl();
  const { scrollingDisabled } = props;

  // The question order is randomized only when a new round is started, because randomizing on the
  // first render would cause a server-side rendering mismatch.
  const [questions, setQuestions] = useState(QUIZ_QUESTIONS);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedOptionIndex, setSelectedOptionIndex] = useState(null);
  const [score, setScore] = useState(0);
  const [isFinished, setIsFinished] = useState(false);

  const totalQuestions = questions.length;
  const currentQuestion = questions[currentIndex];
  const hasAnswered = selectedOptionIndex !== null;
  const isLastQuestion = currentIndex === totalQuestions - 1;

  const handleSelectOption = optionIndex => {
    if (hasAnswered) {
      return;
    }
    setSelectedOptionIndex(optionIndex);
    if (optionIndex === currentQuestion.correctOptionIndex) {
      setScore(score + 1);
    }
  };

  const handleNextQuestion = () => {
    if (isLastQuestion) {
      setIsFinished(true);
    } else {
      setCurrentIndex(currentIndex + 1);
    }
    setSelectedOptionIndex(null);
  };

  const handleRestart = () => {
    setQuestions(shuffle(QUIZ_QUESTIONS));
    setCurrentIndex(0);
    setSelectedOptionIndex(null);
    setScore(0);
    setIsFinished(false);
  };

  const title = intl.formatMessage(
    { id: 'QuizGamePage.schemaTitle' },
    { marketplaceName: config.marketplaceName }
  );

  const gameContent = isFinished ? (
    <section className={css.card}>
      <H2 className={css.resultTitle}>{intl.formatMessage({ id: 'QuizGamePage.resultTitle' })}</H2>
      <p className={css.resultScore}>
        {intl.formatMessage({ id: 'QuizGamePage.resultScore' }, { score, totalQuestions })}
      </p>
      <p className={css.resultFeedback}>
        {intl.formatMessage({ id: resultFeedbackId(score, totalQuestions) })}
      </p>
      <PrimaryButton className={css.actionButton} type="button" onClick={handleRestart}>
        {intl.formatMessage({ id: 'QuizGamePage.playAgain' })}
      </PrimaryButton>
    </section>
  ) : (
    <section className={css.card}>
      <div className={css.progressRow}>
        <span className={css.progress}>
          {intl.formatMessage(
            { id: 'QuizGamePage.progress' },
            { current: currentIndex + 1, totalQuestions }
          )}
        </span>
        <span className={css.score}>
          {intl.formatMessage({ id: 'QuizGamePage.score' }, { score })}
        </span>
      </div>

      <H2 className={css.question}>
        {intl.formatMessage({ id: questionTextId(currentQuestion.id) })}
      </H2>

      <ul className={css.options}>
        {Array.from({ length: OPTIONS_PER_QUESTION }, (_, optionIndex) => (
          <AnswerOption
            key={questionOptionId(currentQuestion.id, optionIndex)}
            label={intl.formatMessage({ id: questionOptionId(currentQuestion.id, optionIndex) })}
            isSelected={selectedOptionIndex === optionIndex}
            isCorrect={currentQuestion.correctOptionIndex === optionIndex}
            hasAnswered={hasAnswered}
            onSelect={() => handleSelectOption(optionIndex)}
          />
        ))}
      </ul>

      <div className={css.feedback} role="status">
        {hasAnswered
          ? selectedOptionIndex === currentQuestion.correctOptionIndex
            ? intl.formatMessage({ id: 'QuizGamePage.feedbackCorrect' })
            : intl.formatMessage(
                { id: 'QuizGamePage.feedbackIncorrect' },
                {
                  correctAnswer: intl.formatMessage({
                    id: questionOptionId(currentQuestion.id, currentQuestion.correctOptionIndex),
                  }),
                }
              )
          : null}
      </div>

      {hasAnswered ? (
        <PrimaryButton className={css.actionButton} type="button" onClick={handleNextQuestion}>
          {isLastQuestion
            ? intl.formatMessage({ id: 'QuizGamePage.showResult' })
            : intl.formatMessage({ id: 'QuizGamePage.nextQuestion' })}
        </PrimaryButton>
      ) : currentIndex > 0 ? (
        <SecondaryButton className={css.actionButton} type="button" onClick={handleRestart}>
          {intl.formatMessage({ id: 'QuizGamePage.restart' })}
        </SecondaryButton>
      ) : null}
    </section>
  );

  return (
    <Page title={title} scrollingDisabled={scrollingDisabled}>
      <LayoutSingleColumn
        mainColumnClassName={css.layoutWrapperMain}
        topbar={<TopbarContainer />}
        footer={<FooterContainer />}
      >
        <div className={css.root}>
          <H1 className={css.title}>{intl.formatMessage({ id: 'QuizGamePage.title' })}</H1>
          <p className={css.subtitle}>{intl.formatMessage({ id: 'QuizGamePage.subtitle' })}</p>
          {gameContent}
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

const QuizGamePage = compose(connect(mapStateToProps))(QuizGamePageComponent);

export default QuizGamePage;
