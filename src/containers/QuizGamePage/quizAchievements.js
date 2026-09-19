const STORAGE_KEY = 'quizGameAchievements';

export const ACHIEVEMENTS = [
  { id: 'firstRound', icon: '◆', labelId: 'QuizGamePage.achievement.firstRound' },
  { id: 'perfectRound', icon: '★', labelId: 'QuizGamePage.achievement.perfectRound' },
  { id: 'streak3', icon: '⚡', labelId: 'QuizGamePage.achievement.streak3' },
  { id: 'tenRounds', icon: '✦', labelId: 'QuizGamePage.achievement.tenRounds' },
];

export const loadAchievements = () => {
  if (typeof window === 'undefined') return [];
  try {
    const value = JSON.parse(window.localStorage.getItem(STORAGE_KEY));
    return Array.isArray(value) ? value : [];
  } catch (e) {
    return [];
  }
};

export const unlockAchievements = ({ unlocked, progression, correctCount, totalQuestions, bestStreak }) => {
  const next = new Set(unlocked);
  if (progression.roundsPlayed >= 1) next.add('firstRound');
  if (totalQuestions > 0 && correctCount === totalQuestions) next.add('perfectRound');
  if (bestStreak >= 3) next.add('streak3');
  if (progression.roundsPlayed >= 10) next.add('tenRounds');
  const ids = Array.from(next);
  if (typeof window !== 'undefined') {
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ids)); } catch (e) {}
  }
  return ids;
};
