import React, { act } from 'react';
import '@testing-library/jest-dom';

import { renderWithProviders as render, testingLibrary } from '../../util/testHelpers';

import { QUIZ_QUESTIONS, questionOptionId, questionTextId } from './quizQuestions';
import { QuizGamePageComponent } from './QuizGamePage';

const { screen, userEvent } = testingLibrary;

// By default, the test setup renders translation keys as such. Here we add real messages for the
// ones that take values, so that the tests can check the formatted content.
const messages = {
  'QuizGamePage.feedbackIncorrect': 'The correct answer is {correctAnswer}',
  'QuizGamePage.progress': 'Question {current} of {totalQuestions}',
  'QuizGamePage.resultScore': 'Score {score} of {totalQuestions}',
};

const renderQuizGamePage = () =>
  render(<QuizGamePageComponent scrollingDisabled={false} />, { messages });

const firstQuestion = QUIZ_QUESTIONS[0];
const optionText = (question, optionIndex) => questionOptionId(question.id, optionIndex);
const correctOptionText = question => optionText(question, question.correctOptionIndex);
const incorrectOptionText = question => optionText(question, (question.correctOptionIndex + 1) % 4);

describe('QuizGamePageComponent', () => {
  it('renders the first question with 4 answer options', async () => {
    await act(async () => {
      renderQuizGamePage();
    });

    expect(screen.getByText(questionTextId(firstQuestion.id))).toBeInTheDocument();
    expect(screen.getByText(`Question 1 of ${QUIZ_QUESTIONS.length}`)).toBeInTheDocument();

    [0, 1, 2, 3].forEach(optionIndex => {
      expect(
        screen.getByRole('button', { name: optionText(firstQuestion, optionIndex) })
      ).toBeEnabled();
    });
  });

  it('gives feedback and locks the options when the answer is correct', async () => {
    await act(async () => {
      renderQuizGamePage();
    });

    await userEvent.click(screen.getByRole('button', { name: correctOptionText(firstQuestion) }));

    expect(screen.getByText('QuizGamePage.feedbackCorrect')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: correctOptionText(firstQuestion) })).toBeDisabled();
    expect(screen.getByText('QuizGamePage.score')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'QuizGamePage.nextQuestion' })).toBeInTheDocument();
  });

  it('reveals the correct answer when the answer is wrong', async () => {
    await act(async () => {
      renderQuizGamePage();
    });

    await userEvent.click(screen.getByRole('button', { name: incorrectOptionText(firstQuestion) }));

    expect(
      screen.getByText(`The correct answer is ${correctOptionText(firstQuestion)}`)
    ).toBeInTheDocument();
  });

  it('shows the score on the result screen after the last question', async () => {
    await act(async () => {
      renderQuizGamePage();
    });

    for (let i = 0; i < QUIZ_QUESTIONS.length; i++) {
      const question = QUIZ_QUESTIONS[i];
      const isLastQuestion = i === QUIZ_QUESTIONS.length - 1;

      await userEvent.click(screen.getByRole('button', { name: correctOptionText(question) }));
      await userEvent.click(
        screen.getByRole('button', {
          name: isLastQuestion ? 'QuizGamePage.showResult' : 'QuizGamePage.nextQuestion',
        })
      );
    }

    expect(screen.getByText('QuizGamePage.resultTitle')).toBeInTheDocument();
    expect(
      screen.getByText(`Score ${QUIZ_QUESTIONS.length} of ${QUIZ_QUESTIONS.length}`)
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'QuizGamePage.playAgain' })).toBeInTheDocument();
  });
});
