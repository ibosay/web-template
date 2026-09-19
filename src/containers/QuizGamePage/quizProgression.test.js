import { defaultProgression, levelFromXp, xpForRound, xpIntoLevel, XP_PER_LEVEL } from './quizProgression';

describe('quizProgression', () => {
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
