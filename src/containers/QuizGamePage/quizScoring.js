/**
 * Scoring rules and high score storage for the quiz game.
 */

// How much time the player has for a single question.
export const SECONDS_PER_QUESTION = 20;

// A correct answer is always worth this many points.
export const POINTS_FOR_CORRECT_ANSWER = 100;

// Every second that is left on the clock adds this many points.
export const POINTS_PER_SECOND_LEFT = 5;

// Every correct answer in a row after the first one adds this many points…
export const POINTS_PER_STREAK_STEP = 25;
// …up to this many steps.
export const MAX_STREAK_STEPS = 4;

// The high scores are stored per category in the browser of the player.
const HIGH_SCORES_KEY = 'quizGameHighScores';

/**
 * Calculates the points of a single correct answer: a base score, a bonus for the remaining time,
 * and a bonus for answering several questions correctly in a row.
 *
 * @param {Object} params
 * @param {number} params.secondsLeft - Seconds that were left on the clock
 * @param {number} params.streak - Number of correct answers in a row, including this one
 * @returns {number} points for this answer
 */
export const calculateAnswerPoints = ({ secondsLeft, streak }) => {
  const timeBonus = Math.max(0, secondsLeft) * POINTS_PER_SECOND_LEFT;
  const streakSteps = Math.min(Math.max(0, streak - 1), MAX_STREAK_STEPS);
  const streakBonus = streakSteps * POINTS_PER_STREAK_STEP;
  return POINTS_FOR_CORRECT_ANSWER + timeBonus + streakBonus;
};

/**
 * Reads the stored high scores. Returns an empty object if there are none, or if the storage is not
 * available (e.g. on the server or when the player has disabled it).
 *
 * @returns {Object} high score per category id
 */
export const loadHighScores = () => {
  if (typeof window === 'undefined') {
    return {};
  }
  try {
    const stored = window.localStorage.getItem(HIGH_SCORES_KEY);
    const parsed = stored ? JSON.parse(stored) : {};
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.entries(parsed).reduce((scores, [categoryId, score]) => {
      if (typeof score === 'number' && Number.isFinite(score) && score >= 0) {
        scores[categoryId] = Math.floor(score);
      }
      return scores;
    }, {});
  } catch (e) {
    return {};
  }
};

/**
 * Stores the given score if it beats the previously stored score of the category.
 *
 * @param {Object} highScores - The currently known high scores
 * @param {string} categoryId - The category that was played
 * @param {number} points - The score of the finished round
 * @returns {Object} the updated high scores
 */
export const saveHighScore = (highScores, categoryId, points) => {
  const safeScores = highScores && typeof highScores === 'object' && !Array.isArray(highScores)
    ? highScores
    : {};
  const safePoints =
    typeof points === 'number' && Number.isFinite(points) ? Math.max(0, Math.floor(points)) : 0;
  const previous =
    typeof safeScores[categoryId] === 'number' && Number.isFinite(safeScores[categoryId])
      ? Math.max(0, safeScores[categoryId])
      : 0;
  if (!categoryId || safePoints <= previous) {
    return safeScores;
  }

  const updated = { ...safeScores, [categoryId]: safePoints };
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(HIGH_SCORES_KEY, JSON.stringify(updated));
    } catch (e) {
      // Storing the high score is a nice-to-have, so a failure is ignored on purpose.
    }
  }
  return updated;
};
