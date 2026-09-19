import React from 'react';
import classNames from 'classnames';

// Contexts, configs, and util modules
import { useIntl } from '../../../util/reactIntl';

// Shared components
import { H2, PrimaryButton } from '../../../components';

// Modules from parent directory
import { categoryLabelId, QUESTIONS_PER_ROUND, QUIZ_CATEGORIES } from '../quizQuestions';
import { SECONDS_PER_QUESTION } from '../quizScoring';
import { levelFromXp, xpIntoLevel, XP_PER_LEVEL } from '../quizProgression';
import { ACHIEVEMENTS } from '../quizAchievements';

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
  const { categoryId, highScores, progression, achievements, onSelectCategory, onStart } = props;
  const level = levelFromXp(progression.totalXp);
  const levelXp = xpIntoLevel(progression.totalXp);

  const highScore = highScores[categoryId];
  const languageOptions = [
    ['de', 'DE'],
    ['en', 'EN'],
    ['ru', 'RU'],
    ['es', 'ES'],
    ['fr', 'FR'],
  ];
  const activeLanguage =
    typeof window !== 'undefined'
      ? window.localStorage.getItem('quizGameLanguage') ||
        (window.navigator.language || 'en').split('-')[0]
      : 'en';
  const changeLanguage = language => {
    window.localStorage.setItem('quizGameLanguage', language);
    window.location.reload();
  };
  const categoryIcons = {
    all: '✦',
    geography: '◎',
    science: '⚗',
    art: '◆',
    history: '⌛',
  };

  return (
    <section className={css.root}>
      <div className={css.languagePicker} aria-label="Language">
        {languageOptions.map(([code, label]) => (
          <button
            key={code}
            type="button"
            className={classNames(css.languageButton, {
              [css.languageButtonActive]: activeLanguage === code,
            })}
            onClick={() => changeLanguage(code)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className={css.hero}>
        <div className={css.logoMark}>Q</div>
        <div>
          <span className={css.eyebrow}>{intl.formatMessage({ id: 'QuizGamePage.arena' })}</span>
          <H2 className={css.heading}>{intl.formatMessage({ id: 'QuizGamePage.startHeading' })}</H2>
        </div>
      </div>
      <div className={css.playerCard}>
        <div className={css.playerLevel}>{level}</div>
        <div className={css.playerProgress}>
          <div className={css.playerProgressTop}>
            <strong>{intl.formatMessage({ id: 'QuizGamePage.level' }, { level })}</strong>
            <span>{levelXp}/{XP_PER_LEVEL} XP</span>
          </div>
          <div className={css.xpTrack}><div className={css.xpFill} style={{ width: `${(levelXp / XP_PER_LEVEL) * 100}%` }} /></div>
          <span className={css.playerMeta}>{intl.formatMessage({ id: 'QuizGamePage.playerMeta' }, { rounds: progression.roundsPlayed, correct: progression.correctAnswers, streak: progression.bestStreak })}</span>
        </div>
      </div>

      <div className={css.achievements}>
        {ACHIEVEMENTS.map(item => (
          <div key={item.id} className={classNames(css.achievement, { [css.achievementUnlocked]: achievements.includes(item.id) })}>
            <span>{item.icon}</span>
            <small>{intl.formatMessage({ id: item.labelId })}</small>
          </div>
        ))}
      </div>

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
              <span className={css.categoryIcon}>{categoryIcons[category] || '•'}</span>
              <span>{intl.formatMessage({ id: categoryLabelId(category) })}</span>
            </button>
          ))}
        </div>
      </fieldset>

      <div className={css.stats}>
        <div>
          <span className={css.statLabel}>{intl.formatMessage({ id: 'QuizGamePage.bestScoreLabel' })}</span>
          <strong className={css.statValue}>{highScore || 0}</strong>
        </div>
        <div>
          <span className={css.statLabel}>{intl.formatMessage({ id: 'QuizGamePage.roundLabel' })}</span>
          <strong className={css.statValue}>{QUESTIONS_PER_ROUND}</strong>
        </div>
        <div>
          <span className={css.statLabel}>{intl.formatMessage({ id: 'QuizGamePage.timeLabel' })}</span>
          <strong className={css.statValue}>{SECONDS_PER_QUESTION}s</strong>
        </div>
      </div>

      <PrimaryButton className={css.startButton} type="button" onClick={onStart}>
        {intl.formatMessage({ id: 'QuizGamePage.startGame' })}
      </PrimaryButton>
    </section>
  );
};

export default StartScreen;
