/**
 * Question data for the quiz game.
 *
 * The actual copy texts live in the translation files (e.g. src/translations/en.json) so that they
 * can be translated and overridden with hosted translations. This file only holds the structure of
 * the quiz: which questions exist, and which of the 4 options is the correct one.
 *
 * To add a question:
 *   1. add an entry to QUIZ_QUESTIONS below
 *   2. add the matching "QuizGamePage.question.{id}.text" and "QuizGamePage.question.{id}.option{1-4}"
 *      keys to every translation file
 */

// Every question has this many answer options.
export const OPTIONS_PER_QUESTION = 4;

/**
 * The questions of the quiz.
 * correctOptionIndex is a zero-based index pointing to the correct option.
 */
export const QUIZ_QUESTIONS = [
  { id: 'capitalOfFrance', correctOptionIndex: 2 },
  { id: 'redPlanet', correctOptionIndex: 1 },
  { id: 'largestOcean', correctOptionIndex: 3 },
  { id: 'monaLisa', correctOptionIndex: 0 },
  { id: 'waterFormula', correctOptionIndex: 1 },
  { id: 'continentCount', correctOptionIndex: 2 },
  { id: 'highestMountain', correctOptionIndex: 1 },
  { id: 'moonLanding', correctOptionIndex: 1 },
];

/**
 * Translation key for the text of a question.
 *
 * @param {string} questionId - The id of the question
 * @returns {string} translation key
 */
export const questionTextId = questionId => `QuizGamePage.question.${questionId}.text`;

/**
 * Translation key for a single answer option of a question.
 *
 * @param {string} questionId - The id of the question
 * @param {number} optionIndex - Zero-based index of the option
 * @returns {string} translation key
 */
export const questionOptionId = (questionId, optionIndex) =>
  `QuizGamePage.question.${questionId}.option${optionIndex + 1}`;

/**
 * Returns a new array with the given items in random order (Fisher-Yates shuffle).
 * Note: this must only be called after a user interaction (e.g. when starting a new round), because
 * randomizing during the initial render would break server-side rendering hydration.
 *
 * @param {Array} items - The items to shuffle
 * @returns {Array} shuffled copy of the given items
 */
export const shuffle = items => {
  const shuffled = [...items];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};
