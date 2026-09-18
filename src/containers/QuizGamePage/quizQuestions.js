/**
 * Question data for the quiz game.
 *
 * The actual copy texts live in the translation files (e.g. src/translations/en.json) so that they
 * can be translated and overridden with hosted translations. This file only holds the structure of
 * the quiz: which questions exist, which category they belong to, and which of the 4 options is the
 * correct one.
 *
 * To add a question:
 *   1. add an entry to QUIZ_QUESTIONS below
 *   2. add the matching "QuizGamePage.question.{id}.text" and "QuizGamePage.question.{id}.option{1-4}"
 *      keys to every translation file
 */

// Categories the player can pick from on the start screen.
export const CATEGORY_ALL = 'all';
export const CATEGORY_GEOGRAPHY = 'geography';
export const CATEGORY_SCIENCE = 'science';
export const CATEGORY_CULTURE = 'culture';
export const CATEGORY_HISTORY = 'history';

export const QUIZ_CATEGORIES = [
  CATEGORY_ALL,
  CATEGORY_GEOGRAPHY,
  CATEGORY_SCIENCE,
  CATEGORY_CULTURE,
  CATEGORY_HISTORY,
];

// Every question has this many answer options.
export const OPTIONS_PER_QUESTION = 4;

// How many questions are played in a single round.
export const QUESTIONS_PER_ROUND = 6;

/**
 * The question bank of the quiz.
 * correctOptionIndex is a zero-based index pointing to the correct option.
 */
export const QUIZ_QUESTIONS = [
  // Geography
  { id: 'capitalOfFrance', category: CATEGORY_GEOGRAPHY, correctOptionIndex: 2 },
  { id: 'largestOcean', category: CATEGORY_GEOGRAPHY, correctOptionIndex: 3 },
  { id: 'continentCount', category: CATEGORY_GEOGRAPHY, correctOptionIndex: 2 },
  { id: 'highestMountain', category: CATEGORY_GEOGRAPHY, correctOptionIndex: 1 },
  { id: 'greatBarrierReef', category: CATEGORY_GEOGRAPHY, correctOptionIndex: 1 },
  { id: 'capitalOfJapan', category: CATEGORY_GEOGRAPHY, correctOptionIndex: 3 },

  // Science
  { id: 'redPlanet', category: CATEGORY_SCIENCE, correctOptionIndex: 1 },
  { id: 'waterFormula', category: CATEGORY_SCIENCE, correctOptionIndex: 1 },
  { id: 'photosynthesisGas', category: CATEGORY_SCIENCE, correctOptionIndex: 1 },
  { id: 'hardestMineral', category: CATEGORY_SCIENCE, correctOptionIndex: 1 },
  { id: 'bloodPump', category: CATEGORY_SCIENCE, correctOptionIndex: 2 },
  { id: 'largestPlanet', category: CATEGORY_SCIENCE, correctOptionIndex: 1 },

  // Art and culture
  { id: 'monaLisa', category: CATEGORY_CULTURE, correctOptionIndex: 0 },
  { id: 'romeoAndJuliet', category: CATEGORY_CULTURE, correctOptionIndex: 1 },
  { id: 'odeToJoy', category: CATEGORY_CULTURE, correctOptionIndex: 2 },
  { id: 'starryNight', category: CATEGORY_CULTURE, correctOptionIndex: 0 },
  { id: 'olympicRings', category: CATEGORY_CULTURE, correctOptionIndex: 1 },
  { id: 'chessboardSquares', category: CATEGORY_CULTURE, correctOptionIndex: 2 },

  // History
  { id: 'moonLanding', category: CATEGORY_HISTORY, correctOptionIndex: 1 },
  { id: 'berlinWallFall', category: CATEGORY_HISTORY, correctOptionIndex: 1 },
  { id: 'firstWorldWarStart', category: CATEGORY_HISTORY, correctOptionIndex: 1 },
  { id: 'printingPress', category: CATEGORY_HISTORY, correctOptionIndex: 0 },
  { id: 'frenchRevolution', category: CATEGORY_HISTORY, correctOptionIndex: 1 },
  { id: 'gizaPyramids', category: CATEGORY_HISTORY, correctOptionIndex: 2 },
];

/**
 * Translation key for the name of a category.
 *
 * @param {string} categoryId - The id of the category
 * @returns {string} translation key
 */
export const categoryLabelId = categoryId => `QuizGamePage.category.${categoryId}`;

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

/**
 * Picks the questions for one round in random order.
 * Note: this is only called when the player starts a round, so the randomness does not affect
 * server-side rendering.
 *
 * @param {string} categoryId - The picked category, or CATEGORY_ALL for questions from all categories
 * @param {number} count - How many questions to pick
 * @returns {Array<Object>} the questions of the round
 */
export const drawQuestions = (categoryId, count = QUESTIONS_PER_ROUND) => {
  const pool =
    categoryId === CATEGORY_ALL
      ? QUIZ_QUESTIONS
      : QUIZ_QUESTIONS.filter(question => question.category === categoryId);
  return shuffle(pool).slice(0, count);
};
