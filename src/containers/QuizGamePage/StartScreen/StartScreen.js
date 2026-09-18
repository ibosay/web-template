import React from 'react';
import classNames from 'classnames';

// Contexts, configs, and util modules
import { useIntl } from '../../../util/reactIntl';

// Shared components
import { H2, PrimaryButton } from '../../../components';

// Modules from parent directory
import { categoryLabelId, QUESTIONS_PER_ROUND, QUIZ_CATEGORIES } from '../quizQuestions';
import { SECONDS_PER_QUESTION } from '../quizScoring';

// Modules from the same directory
import css from './StartScreen.module.css';

/**
 * Start screen of the quiz game. The player picks a category and starts a round.
 *
 * @param {Object} props
 * @param {string} props.categoryId - The currently picked category
 * @param {Object} props.highScores - High score per category id
 * @param {Function} props.onSelectCategory - Called with a category id when the player picks one
 * @param {Function} props.onStart - Called when the player starts the round
 * @returns {JSX.Element} start screen
 */
const StartScreen = props => {
  const intl = useIntl();
  const { categoryId, highScores, onSelectCategory, onStart } = props;

  const highScore = highScores[categoryId];

  return (
    <section className={css.root}>
      <H2 className={css.heading}>{intl.formatMessage({ id: 'QuizGamePage.startHeading' })}</H2>
      <p className={css.rules}>
        {intl.formatMessage(
          { id: 'QuizGamePage.startRules' },
          { questionCount: QUESTIONS_PER_ROUND, seconds: SECONDS_PER_QUESTION }
        )}
      </p>

      <fieldset className={css.categories}>
        <legend className={css.categoriesLegend}>
          {intl.formatMessage({ id: 'QuizGamePage.categoryLegend' })}
        </legend>
        <div className={css.categoryButtons}>
          {QUIZ_CATEGORIES.map(category => (
            <button
              key={category}
              className={classNames(css.categoryButton, {
                [css.categoryButtonSelected]: category === categoryId,
              })}
              type="button"
              aria-pressed={category === categoryId}
              onClick={() => onSelectCategory(category)}
            >
              {intl.formatMessage({ id: categoryLabelId(category) })}
            </button>
          ))}
        </div>
      </fieldset>

      {highScore ? (
        <p className={css.highScore}>
          {intl.formatMessage({ id: 'QuizGamePage.highScore' }, { points: highScore })}
        </p>
      ) : null}

      <PrimaryButton className={css.startButton} type="button" onClick={onStart}>
        {intl.formatMessage({ id: 'QuizGamePage.startGame' })}
      </PrimaryButton>
    </section>
  );
};

export default StartScreen;
