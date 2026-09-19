import React, { act } from 'react';
import '@testing-library/jest-dom';

import { renderWithProviders as render, testingLibrary } from '../../util/testHelpers';

import { QUESTIONS_PER_ROUND, QUIZ_QUESTIONS, questionOptionId } from './quizQuestions';
import { SECONDS_PER_QUESTION } from './quizScoring';
import { QuizGamePageComponent } from './QuizGamePage';

const { fireEvent, screen, userEvent } = testingLibrary;

// By default, the test setup renders translation keys as such. Here we add real messages for the
// ones that take values, so that the tests can check the formatted content.
const messages = {
  'QuizGamePage.progress': 'Question {current} of {totalQuestions}',
  'QuizGamePage.feedbackCorrect': 'Correct! +{points}',
  'QuizGamePage.feedbackIncorrect': 'The correct answer is {correctAnswer}',
  'QuizGamePage.feedbackTimeout': 'Time is up. The correct answer is {correctAnswer}',
  'QuizGamePage.resultCorrectCount': '{correctCount} of {totalQuestions} correct',
  'QuizGamePage.highScore': 'Best score {points}',
  'QuizGamePage.newHighScore': 'New best score in {category}',
};

const renderQuizGamePage = () =>
  render(<QuizGamePageComponent scrollingDisabled={false} />, { messages });

// The questions of a round are drawn at random, so the tests read the current question from the
// heading and look up the correct option from the question bank.
const getCurrentQuestion = () => {
  const heading = screen.getByRole('heading', { level: 2 });
  const questionId = heading.textContent.replace('QuizGamePage.question.', '').replace('.text', '');
  return QUIZ_QUESTIONS.find(question => question.id === questionId);
};

const optionName = (question, optionIndex) => questionOptionId(question.id, optionIndex);
const correctOptionName = question => optionName(question, question.correctOptionIndex);
const incorrectOptionName = question => optionName(question, (question.correctOptionIndex + 1) % 4);

const startGame = () =>
  userEvent.click(screen.getByRole('button', { name: 'QuizGamePage.startGame' }));

const answerAndContinue = async (isLastQuestion, pickCorrect = true) => {
  const question = getCurrentQuestion();
  const name = pickCorrect ? correctOptionName(question) : incorrectOptionName(question);
  await userEvent.click(screen.getByRole('button', { name }));
  await userEvent.click(
    screen.getByRole('button', {
      name: isLastQuestion ? 'QuizGamePage.showResult' : 'QuizGamePage.nextQuestion',
    })
  );
};

describe('QuizGamePageComponent', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('starts on the start screen with the category options', async () => {
    await act(async () => {
      renderQuizGamePage();
    });

    expect(screen.getByText('QuizGamePage.startHeading')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'QuizGamePage.category.all' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(
      screen.getByRole('button', { name: 'QuizGamePage.category.history' })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'QuizGamePage.startGame' })).toBeInTheDocument();
  });

  it('shows a question with 4 answer options after starting', async () => {
    await act(async () => {
      renderQuizGamePage();
    });
    await startGame();

    expect(screen.getByText(`Question 1 of ${QUESTIONS_PER_ROUND}`)).toBeInTheDocument();

    const question = getCurrentQuestion();
    [0, 1, 2, 3].forEach(optionIndex => {
      expect(screen.getByRole('button', { name: optionName(question, optionIndex) })).toBeEnabled();
    });
  });

  it('gives feedback and locks the options when the answer is correct', async () => {
    await act(async () => {
      renderQuizGamePage();
    });
    await startGame();

    const question = getCurrentQuestion();
    await userEvent.click(screen.getByRole('button', { name: correctOptionName(question) }));

    expect(screen.getByText(/^Correct! \+\d+$/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: correctOptionName(question) })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'QuizGamePage.nextQuestion' })).toBeInTheDocument();
  });

  it('reveals the correct answer when the answer is wrong', async () => {
    await act(async () => {
      renderQuizGamePage();
    });
    await startGame();

    const question = getCurrentQuestion();
    await userEvent.click(screen.getByRole('button', { name: incorrectOptionName(question) }));

    expect(
      screen.getByText(`The correct answer is ${correctOptionName(question)}`)
    ).toBeInTheDocument();
  });

  it('answers with the number keys', async () => {
    await act(async () => {
      renderQuizGamePage();
    });
    await startGame();

    const question = getCurrentQuestion();
    await act(async () => {
      fireEvent.keyDown(window, { key: String(question.correctOptionIndex + 1) });
    });

    expect(screen.getByText(/^Correct! \+\d+$/)).toBeInTheDocument();
  });

  it('counts a question as wrong when the time runs out', async () => {
    jest.useFakeTimers();
    try {
      await act(async () => {
        renderQuizGamePage();
      });
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'QuizGamePage.startGame' }));
      });

      const question = getCurrentQuestion();
      // The countdown schedules the next tick on every render, so the timers are advanced one
      // second at a time to let React render in between.
      for (let second = 0; second <= SECONDS_PER_QUESTION; second++) {
        await act(async () => {
          jest.advanceTimersByTime(1000);
        });
      }

      expect(
        screen.getByText(`Time is up. The correct answer is ${correctOptionName(question)}`)
      ).toBeInTheDocument();
      expect(screen.getByRole('button', { name: correctOptionName(question) })).toBeDisabled();
    } finally {
      jest.useRealTimers();
    }
  });

  it('shows the result and stores a high score after the last question', async () => {
    await act(async () => {
      renderQuizGamePage();
    });
    await startGame();

    for (let i = 0; i < QUESTIONS_PER_ROUND; i++) {
      await answerAndContinue(i === QUESTIONS_PER_ROUND - 1);
    }

    expect(screen.getByText('QuizGamePage.resultTitle')).toBeInTheDocument();
    expect(
      screen.getByText(`${QUESTIONS_PER_ROUND} of ${QUESTIONS_PER_ROUND} correct`)
    ).toBeInTheDocument();
    expect(screen.getByText('New best score in QuizGamePage.category.all')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'QuizGamePage.playAgain' })).toBeInTheDocument();

    const storedHighScores = JSON.parse(window.localStorage.getItem('quizGameHighScores'));
    expect(storedHighScores.all).toBeGreaterThan(0);
  });

  it('returns to the start screen from the result screen', async () => {
    await act(async () => {
      renderQuizGamePage();
    });
    await startGame();

    for (let i = 0; i < QUESTIONS_PER_ROUND; i++) {
      await answerAndContinue(i === QUESTIONS_PER_ROUND - 1, false);
    }

    expect(screen.getByText(`0 of ${QUESTIONS_PER_ROUND} correct`)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'QuizGamePage.backToStart' }));
    expect(screen.getByText('QuizGamePage.startHeading')).toBeInTheDocument();
  });
});
