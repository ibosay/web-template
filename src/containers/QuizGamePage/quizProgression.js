const STORAGE_KEY = 'quizGameProgression';
export const XP_PER_LEVEL = 500;

export const defaultProgression = {
  totalXp: 0,
  roundsPlayed: 0,
  correctAnswers: 0,
  bestStreak: 0,
};

export const levelFromXp = xp => Math.floor(Math.max(0, xp) / XP_PER_LEVEL) + 1;
export const xpIntoLevel = xp => Math.max(0, xp) % XP_PER_LEVEL;
export const xpForRound = (correctCount, totalPoints) =>
  Math.max(0, correctCount) * 50 + Math.floor(Math.max(0, totalPoints) / 20);

export const loadProgression = () => {
  if (typeof window === 'undefined') return defaultProgression;
  try {
    const value = JSON.parse(window.localStorage.getItem(STORAGE_KEY));
    return value && typeof value === 'object' ? { ...defaultProgression, ...value } : defaultProgression;
  } catch (e) {
    return defaultProgression;
  }
};

export const saveRoundProgression = ({ progression, correctCount, totalPoints, bestStreak }) => {
  const xpEarned = xpForRound(correctCount, totalPoints);
  const next = {
    totalXp: progression.totalXp + xpEarned,
    roundsPlayed: progression.roundsPlayed + 1,
    correctAnswers: progression.correctAnswers + correctCount,
    bestStreak: Math.max(progression.bestStreak, bestStreak),
  };
  if (typeof window !== 'undefined') {
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch (e) {}
  }
  return { progression: next, xpEarned };
};
