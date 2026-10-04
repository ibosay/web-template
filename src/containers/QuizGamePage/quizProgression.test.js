import {
  defaultProgression,
  levelFromXp,
  loadProgression,
  saveRoundProgression,
  xpForRound,
  xpIntoLevel,
  XP_PER_LEVEL,
} from './quizProgression';

describe('quizProgression', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });
  it('starts at level one and advances every XP threshold', () => {
    expect(levelFromXp(0)).toBe(1);
    expect(levelFromXp(XP_PER_LEVEL - 1)).toBe(1);
    expect(levelFromXp(XP_PER_LEVEL)).toBe(2);
  });

  it('reports XP inside the current level', () => {
    expect(xpIntoLevel(0)).toBe(0);
    expect(xpIntoLevel(XP_PER_LEVEL + 125)).toBe(125);
  });

  it('calculates round XP from correct answers and score', () => {
    expect(xpForRound(4, 1200)).toBe(260);
    expect(xpForRound(-1, -20)).toBe(0);
    expect(xpForRound(NaN, Infinity)).toBe(0);
    expect(xpForRound(2.9, 100.9)).toBe(105);
  });

  it('keeps level helpers safe for invalid XP', () => {
    expect(levelFromXp(NaN)).toBe(1);
    expect(levelFromXp(Infinity)).toBe(1);
    expect(xpIntoLevel(NaN)).toBe(0);
    expect(xpIntoLevel(-500)).toBe(0);
  });

  it('sanitizes damaged persisted progression data', () => {
    window.localStorage.setItem(
      'quizGameProgression',
      JSON.stringify({ totalXp: -10, roundsPlayed: '5', correctAnswers: Infinity, bestStreak: 2.9 })
    );
    expect(loadProgression()).toEqual({
      totalXp: 0,
      roundsPlayed: 0,
      correctAnswers: 0,
      bestStreak: 2,
    });
  });

  it('saves a round from a safe normalized progression', () => {
    const result = saveRoundProgression({
      progression: { totalXp: -100, roundsPlayed: -3, correctAnswers: -4, bestStreak: -1 },
      correctCount: 3,
      totalPoints: 1000,
      bestStreak: 3,
    });
    expect(result.progression).toEqual({
      totalXp: 200,
      roundsPlayed: 1,
      correctAnswers: 3,
      bestStreak: 3,
    });
    expect(result.xpEarned).toBe(200);
  });

  it('keeps a stable default progression shape', () => {
    expect(defaultProgression).toEqual({
      totalXp: 0,
      roundsPlayed: 0,
      correctAnswers: 0,
      bestStreak: 0,
    });
  });
});
