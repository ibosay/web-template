import { ACHIEVEMENTS, unlockAchievements } from './quizAchievements';

describe('quizAchievements', () => {
  const ids = ACHIEVEMENTS.map(item => item.id);

  it('has unique achievement ids', () => {
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('unlocks first round after playing once', () => {
    const unlocked = unlockAchievements({
      unlocked: [],
      progression: { roundsPlayed: 1 },
      correctCount: 1,
      totalQuestions: 6,
      bestStreak: 1,
    });
    expect(unlocked).toContain('firstRound');
  });

  it('unlocks perfect round and streak achievements', () => {
    const unlocked = unlockAchievements({
      unlocked: [],
      progression: { roundsPlayed: 1 },
      correctCount: 6,
      totalQuestions: 6,
      bestStreak: 3,
    });
    expect(unlocked).toEqual(expect.arrayContaining(['firstRound', 'perfectRound', 'streak3']));
  });

  it('unlocks ten rounds without removing existing achievements', () => {
    const unlocked = unlockAchievements({
      unlocked: ['firstRound'],
      progression: { roundsPlayed: 10 },
      correctCount: 2,
      totalQuestions: 6,
      bestStreak: 1,
    });
    expect(unlocked).toEqual(expect.arrayContaining(['firstRound', 'tenRounds']));
  });
});
