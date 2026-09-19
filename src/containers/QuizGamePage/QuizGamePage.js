import React, { useEffect, useState } from 'react';
import { compose } from 'redux';
import { Capacitor } from '@capacitor/core';
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

const isNativeApp = () =>
  typeof window !== 'undefined' &&
  (Capacitor.isNativePlatform() || window.location.search.includes('nativeApp=1'));

// Modules from the same directory
import { CATEGORY_ALL, drawQuestions } from './quizQuestions';
import { calculateAnswerPoints, loadHighScores, saveHighScore } from './quizScoring';
import { defaultProgression, loadProgression, saveRoundProgression } from './quizProgression';
import { loadAchievements, unlockAchievements } from './quizAchievements';
import StartScreen from './StartScreen/StartScreen';
import QuestionScreen from './QuestionScreen/QuestionScreen';
import ResultScreen from './ResultScreen/ResultScreen';
import css from './QuizGamePage.module.css';

// The screens the game moves through.
const SCREEN_START = 'start';
const SCREEN_QUESTION = 'question';
const SCREEN_RESULT = 'result';

/**
 * Quiz game page.
 *
 * The player picks a category on the start screen and then answers a round of questions. Every
 * question has 4 answer options and a countdown: a correct answer is worth a base score plus a
 * bonus for the remaining time and for correct answers in a row. The result screen shows the score,
 * a summary of the round, and the best score of the category.
 *
 * This page renders its content on the client side only (no data is loaded from the Marketplace
 * API), so the game state is kept in component state instead of a Redux duck.
 *
 * @param {Object} props
 * @param {boolean} props.scrollingDisabled - Whether the scrolling is disabled
 * @returns {JSX.Element} quiz game page component
 */
export const QuizGamePageComponent = props => {
  const config = useConfiguration();
  const intl = useIntl();
  const { scrollingDisabled } = props;
  const nativeApp = isNativeApp();

  const [screen, setScreen] = useState(SCREEN_START);
  const [categoryId, setCategoryId] = useState(CATEGORY_ALL);
  const [questions, setQuestions] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState([]);
  const [selectedOptionIndex, setSelectedOptionIndex] = useState(null);
  const [isTimedOut, setIsTimedOut] = useState(false);
  const [lastPoints, setLastPoints] = useState(0);
  const [streak, setStreak] = useState(0);
  const [highScores, setHighScores] = useState({});
  const [isNewHighScore, setIsNewHighScore] = useState(false);
  const [progression, setProgression] = useState(defaultProgression);
  const [roundXp, setRoundXp] = useState(0);
  const [roundBestStreak, setRoundBestStreak] = useState(0);
  const [achievements, setAchievements] = useState([]);

  // The high scores are stored in the browser of the player, so they can only be read after mount.
  useEffect(() => {
    setHighScores(loadHighScores());
    setProgression(loadProgression());
    setAchievements(loadAchievements());
  }, []);

  const currentQuestion = questions[currentIndex];
  const hasAnswered = selectedOptionIndex !== null || isTimedOut;
  const isLastQuestion = currentIndex === questions.length - 1;
  const totalPoints = answers.reduce((sum, answer) => sum + answer.points, 0);

  const startRound = () => {
    setQuestions(drawQuestions(categoryId));
    setCurrentIndex(0);
    setAnswers([]);
    setSelectedOptionIndex(null);
    setIsTimedOut(false);
    setLastPoints(0);
    setStreak(0);
    setRoundXp(0);
    setRoundBestStreak(0);
    setIsNewHighScore(false);
    setScreen(SCREEN_QUESTION);
  };

  const handleAnswer = (optionIndex, secondsLeft) => {
    if (hasAnswered) {
      return;
    }
    const isCorrect = optionIndex === currentQuestion.correctOptionIndex;
    const newStreak = isCorrect ? streak + 1 : 0;
    const points = isCorrect ? calculateAnswerPoints({ secondsLeft, streak: newStreak }) : 0;

    setSelectedOptionIndex(optionIndex);
    setStreak(newStreak);
    setRoundBestStreak(previous => Math.max(previous, newStreak));
    setLastPoints(points);
    setAnswers([...answers, { questionId: currentQuestion.id, isCorrect, points }]);
  };

  const handleTimeout = () => {
    if (hasAnswered) {
      return;
    }
    setIsTimedOut(true);
    setStreak(0);
    setLastPoints(0);
    setAnswers([...answers, { questionId: currentQuestion.id, isCorrect: false, points: 0 }]);
  };

  const finishRound = () => {
    const previousHighScore = highScores[categoryId] || 0;
    setHighScores(saveHighScore(highScores, categoryId, totalPoints));
    setIsNewHighScore(totalPoints > previousHighScore);
    const correctCount = answers.filter(answer => answer.isCorrect).length;
    const saved = saveRoundProgression({
      progression,
      correctCount,
      totalPoints,
      bestStreak: roundBestStreak,
    });
    setProgression(saved.progression);
    setRoundXp(saved.xpEarned);
    setAchievements(unlockAchievements({
      unlocked: achievements,
      progression: saved.progression,
      correctCount,
      totalQuestions: answers.length,
      bestStreak: roundBestStreak,
    }));
    setScreen(SCREEN_RESULT);
  };

  const handleNextQuestion = () => {
    if (isLastQuestion) {
      finishRound();
      return;
    }
    setCurrentIndex(currentIndex + 1);
    setSelectedOptionIndex(null);
    setIsTimedOut(false);
    setLastPoints(0);
  };

  const handleSelectCategory = newCategoryId => {
    setCategoryId(newCategoryId);
    setIsNewHighScore(false);
  };

  const title = intl.formatMessage(
    { id: 'QuizGamePage.schemaTitle' },
    { marketplaceName: config.marketplaceName }
  );

  const gameContent =
    screen === SCREEN_QUESTION && currentQuestion ? (
      <QuestionScreen
        key={currentQuestion.id}
        question={currentQuestion}
        questionNumber={currentIndex + 1}
        totalQuestions={questions.length}
        totalPoints={totalPoints}
        streak={streak}
        selectedOptionIndex={selectedOptionIndex}
        isTimedOut={isTimedOut}
        lastPoints={lastPoints}
        isLastQuestion={isLastQuestion}
        onAnswer={handleAnswer}
        onTimeout={handleTimeout}
        onNext={handleNextQuestion}
      />
    ) : screen === SCREEN_RESULT ? (
      <ResultScreen
        categoryId={categoryId}
        answers={answers}
        totalPoints={totalPoints}
        highScore={highScores[categoryId]}
        isNewHighScore={isNewHighScore}
        progression={progression}
        achievements={achievements}
        xpEarned={roundXp}
        onPlayAgain={startRound}
        onBackToStart={() => setScreen(SCREEN_START)}
      />
    ) : (
      <StartScreen
        categoryId={categoryId}
        highScores={highScores}
        progression={progression}
        achievements={achievements}
        onSelectCategory={handleSelectCategory}
        onStart={startRound}
      />
    );

  return (
    <Page title={title} scrollingDisabled={scrollingDisabled}>
      <LayoutSingleColumn
        mainColumnClassName={css.layoutWrapperMain}
        topbar={nativeApp ? null : <TopbarContainer />}
        footer={nativeApp ? null : <FooterContainer />}
      >
        <div className={nativeApp ? css.nativeRoot : css.root}>
          {nativeApp ? null : (
            <>
              <H1 className={css.title}>{intl.formatMessage({ id: 'QuizGamePage.title' })}</H1>
              <p className={css.subtitle}>{intl.formatMessage({ id: 'QuizGamePage.subtitle' })}</p>
            </>
          )}
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
