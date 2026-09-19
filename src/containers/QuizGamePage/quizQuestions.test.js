import enMessages from '../../translations/en.json';

import {
  CATEGORY_ALL,
  CATEGORY_GEOGRAPHY,
  OPTIONS_PER_QUESTION,
  QUESTIONS_PER_ROUND,
  QUIZ_CATEGORIES,
  QUIZ_QUESTIONS,
  categoryLabelId,
  drawQuestions,
  questionOptionId,
  questionTextId,
} from './quizQuestions';

describe('quizQuestions', () => {
  it('has unique question ids', () => {
    const ids = QUIZ_QUESTIONS.map(question => question.id);
    expect(new Set(ids).size).toEqual(ids.length);
  });

  it('has a known category and a valid correct option for every question', () => {
    QUIZ_QUESTIONS.forEach(question => {
      expect(QUIZ_CATEGORIES).toContain(question.category);
      expect(question.correctOptionIndex).toBeGreaterThanOrEqual(0);
      expect(question.correctOptionIndex).toBeLessThan(OPTIONS_PER_QUESTION);
    });
  });

  it('has a default translation for every question, option, and category', () => {
    QUIZ_CATEGORIES.forEach(category => {
      expect(enMessages[categoryLabelId(category)]).toBeDefined();
    });

    QUIZ_QUESTIONS.forEach(question => {
      expect(enMessages[questionTextId(question.id)]).toBeDefined();
      for (let optionIndex = 0; optionIndex < OPTIONS_PER_QUESTION; optionIndex++) {
        expect(enMessages[questionOptionId(question.id, optionIndex)]).toBeDefined();
      }
    });
  });

  it('has enough questions in every category for a full round', () => {
    QUIZ_CATEGORIES.filter(category => category !== CATEGORY_ALL).forEach(category => {
      const questionsInCategory = QUIZ_QUESTIONS.filter(question => question.category === category);
      expect(questionsInCategory.length).toBeGreaterThanOrEqual(QUESTIONS_PER_ROUND);
    });
  });

  describe('drawQuestions', () => {
    it('draws the requested number of questions', () => {
      expect(drawQuestions(CATEGORY_ALL)).toHaveLength(QUESTIONS_PER_ROUND);
      expect(drawQuestions(CATEGORY_ALL, 3)).toHaveLength(3);
    });

    it('draws questions from the given category only', () => {
      drawQuestions(CATEGORY_GEOGRAPHY).forEach(question => {
        expect(question.category).toEqual(CATEGORY_GEOGRAPHY);
      });
    });

    it('draws every question only once', () => {
      const ids = drawQuestions(CATEGORY_ALL).map(question => question.id);
      expect(new Set(ids).size).toEqual(ids.length);
    });
  });
});
