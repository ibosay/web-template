const STORAGE_KEY = 'quizGameAchievements';

export const ACHIEVEMENTS = [
  { id: 'firstRound', icon: '◆', labelId: 'QuizGamePage.achievement.firstRound' },
  { id: 'perfectRound', icon: '★', labelId: 'QuizGamePage.achievement.perfectRound' },
  { id: 'streak3', icon: '⚡', labelId: 'QuizGamePage.achievement.streak3' },
  { id: 'tenRounds', icon: '✦', labelId: 'QuizGamePage.achievement.tenRounds' },
  { id: 'fiftyCorrect', icon: '✓', labelId: 'QuizGamePage.achievement.fiftyCorrect' },
  { id: 'streak5', icon: '⚡', labelId: 'QuizGamePage.achievement.streak5' },
  { id: 'level5', icon: '⬟', labelId: 'QuizGamePage.achievement.level5' },
];

const validAchievementIds = new Set(ACHIEVEMENTS.map(item => item.id));

const safeCount = value =>
  typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;

const safeAmount = value =>
  typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0;

const sanitizeAchievements = value =>
  Array.isArray(value)
    ? Array.from(new Set(value.filter(id => typeof id === 'string' && validAchievementIds.has(id))))
    : [];

export const loadAchievements = () => {
  if (typeof window === 'undefined') return [];
  try {
    const value = JSON.parse(window.localStorage.getItem(STORAGE_KEY));
    return sanitizeAchievements(value);
  } catch (e) {
    return [];
  }
};

export const unlockAchievements = ({ unlocked, progression, correctCount, totalQuestions, bestStreak }) => {
  const next = new Set(sanitizeAchievements(unlocked));
  const safeProgression = progression && typeof progression === 'object' ? progression : {};
  const roundsPlayed = safeCount(safeProgression.roundsPlayed);
  const safeCorrectCount = safeCount(correctCount);
  const safeTotalQuestions = safeCount(totalQuestions);
  const safeBestStreak = safeCount(bestStreak);
  const correctAnswers = safeCount(safeProgression.correctAnswers);
  const totalXp = safeAmount(safeProgression.totalXp);
  if (roundsPlayed >= 1) next.add('firstRound');
  if (safeTotalQuestions > 0 && safeCorrectCount === safeTotalQuestions) next.add('perfectRound');
  if (safeBestStreak >= 3) next.add('streak3');
  if (roundsPlayed >= 10) next.add('tenRounds');
  if (correctAnswers >= 50) next.add('fiftyCorrect');
  if (safeBestStreak >= 5) next.add('streak5');
  if (totalXp >= 2000) next.add('level5');
  const ids = Array.from(next);
  if (typeof window !== 'undefined') {
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ids)); } catch (e) {}
  }
  return ids;
};
