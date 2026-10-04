const STORAGE_KEY = 'quizGameProgression';
export const XP_PER_LEVEL = 500;

export const defaultProgression = {
  totalXp: 0,
  roundsPlayed: 0,
  correctAnswers: 0,
  bestStreak: 0,
};

const safeNonNegativeNumber = value =>
  typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0;

export const levelFromXp = xp => Math.floor(safeNonNegativeNumber(xp) / XP_PER_LEVEL) + 1;
export const xpIntoLevel = xp => safeNonNegativeNumber(xp) % XP_PER_LEVEL;
export const xpForRound = (correctCount, totalPoints) =>
  Math.floor(safeNonNegativeNumber(correctCount)) * 50 +
  Math.floor(safeNonNegativeNumber(totalPoints) / 20);

const normalizeProgression = value => ({
  totalXp: safeNonNegativeNumber(value?.totalXp),
  roundsPlayed: Math.floor(safeNonNegativeNumber(value?.roundsPlayed)),
  correctAnswers: Math.floor(safeNonNegativeNumber(value?.correctAnswers)),
  bestStreak: Math.floor(safeNonNegativeNumber(value?.bestStreak)),
});

export const loadProgression = () => {
  if (typeof window === 'undefined') return { ...defaultProgression };
  try {
    const value = JSON.parse(window.localStorage.getItem(STORAGE_KEY));
    return value && typeof value === 'object'
      ? normalizeProgression({ ...defaultProgression, ...value })
      : { ...defaultProgression };
  } catch (e) {
    return { ...defaultProgression };
  }
};

export const saveRoundProgression = ({ progression, correctCount, totalPoints, bestStreak }) => {
  const current = normalizeProgression(progression || defaultProgression);
  const safeCorrectCount = Math.floor(safeNonNegativeNumber(correctCount));
  const safeBestStreak = Math.floor(safeNonNegativeNumber(bestStreak));
  const xpEarned = xpForRound(safeCorrectCount, totalPoints);
  const next = {
    totalXp: current.totalXp + xpEarned,
    roundsPlayed: current.roundsPlayed + 1,
    correctAnswers: current.correctAnswers + safeCorrectCount,
    bestStreak: Math.max(current.bestStreak, safeBestStreak),
  };
  if (typeof window !== 'undefined') {
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch (e) {}
  }
  return { progression: next, xpEarned };
};
