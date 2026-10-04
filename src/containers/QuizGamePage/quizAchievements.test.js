import { ACHIEVEMENTS, loadAchievements, unlockAchievements } from './quizAchievements';

describe('quizAchievements', () => {
  const ids = ACHIEVEMENTS.map(item => item.id);

  beforeEach(() => {
    window.localStorage.clear();
  });

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

  it('filters unknown and duplicate stored achievements', () => {
    window.localStorage.setItem(
      'quizGameAchievements',
      JSON.stringify(['firstRound', 'firstRound', 'madeUpAchievement', 123])
    );
    expect(loadAchievements()).toEqual(['firstRound']);
  });

  it('handles damaged stored achievement JSON', () => {
    window.localStorage.setItem('quizGameAchievements', 'not-json');
    expect(loadAchievements()).toEqual([]);
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

  it('unlocks advanced long-term achievements', () => {
    const unlocked = unlockAchievements({
      unlocked: [],
      progression: { roundsPlayed: 12, correctAnswers: 55, totalXp: 2100 },
      correctCount: 4,
      totalQuestions: 6,
      bestStreak: 5,
    });
    expect(unlocked).toEqual(
      expect.arrayContaining(['firstRound', 'tenRounds', 'fiftyCorrect', 'streak5', 'level5'])
    );
  });

  it('sanitizes invalid unlock inputs', () => {
    const unlocked = unlockAchievements({
      unlocked: ['unknown', 'firstRound'],
      progression: null,
      correctCount: NaN,
      totalQuestions: Infinity,
      bestStreak: -10,
    });
    expect(unlocked).toEqual(['firstRound']);
  });
});
