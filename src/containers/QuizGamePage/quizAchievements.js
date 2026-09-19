const STORAGE_KEY = 'quizGameAchievements';

export const ACHIEVEMENTS = [
  { id: 'firstRound', icon: '◆', labelId: 'QuizGamePage.achievement.firstRound' },
  { id: 'perfectRound', icon: '★', labelId: 'QuizGamePage.achievement.perfectRound' },
  { id: 'streak3', icon: '⚡', labelId: 'QuizGamePage.achievement.streak3' },
  { id: 'tenRounds', icon: '✦', labelId: 'QuizGamePage.achievement.tenRounds' },
];

const validAchievementIds = new Set(ACHIEVEMENTS.map(item => item.id));

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
  const roundsPlayed = Number.isFinite(safeProgression.roundsPlayed) ? Math.max(0, safeProgression.roundsPlayed) : 0;
  const safeCorrectCount = Number.isFinite(correctCount) ? Math.max(0, correctCount) : 0;
  const safeTotalQuestions = Number.isFinite(totalQuestions) ? Math.max(0, totalQuestions) : 0;
  const safeBestStreak = Number.isFinite(bestStreak) ? Math.max(0, bestStreak) : 0;
  if (roundsPlayed >= 1) next.add('firstRound');
  if (safeTotalQuestions > 0 && safeCorrectCount === safeTotalQuestions) next.add('perfectRound');
  if (safeBestStreak >= 3) next.add('streak3');
  if (roundsPlayed >= 10) next.add('tenRounds');
  const ids = Array.from(next);
  if (typeof window !== 'undefined') {
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ids)); } catch (e) {}
  }
  return ids;
};
