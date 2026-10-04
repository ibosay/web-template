import {
  MAX_STREAK_STEPS,
  POINTS_FOR_CORRECT_ANSWER,
  POINTS_PER_SECOND_LEFT,
  POINTS_PER_STREAK_STEP,
  calculateAnswerPoints,
  loadHighScores,
  saveHighScore,
} from './quizScoring';

describe('calculateAnswerPoints', () => {
  it('gives the base score when the time is up and there is no streak', () => {
    expect(calculateAnswerPoints({ secondsLeft: 0, streak: 1 })).toEqual(POINTS_FOR_CORRECT_ANSWER);
  });

  it('adds a bonus for the remaining time', () => {
    expect(calculateAnswerPoints({ secondsLeft: 10, streak: 1 })).toEqual(
      POINTS_FOR_CORRECT_ANSWER + 10 * POINTS_PER_SECOND_LEFT
    );
  });

  it('adds a bonus for every correct answer in a row after the first one', () => {
    expect(calculateAnswerPoints({ secondsLeft: 0, streak: 3 })).toEqual(
      POINTS_FOR_CORRECT_ANSWER + 2 * POINTS_PER_STREAK_STEP
    );
  });

  it('caps the streak bonus', () => {
    expect(calculateAnswerPoints({ secondsLeft: 0, streak: 99 })).toEqual(
      POINTS_FOR_CORRECT_ANSWER + MAX_STREAK_STEPS * POINTS_PER_STREAK_STEP
    );
  });

  it('caps the time bonus at the question time limit', () => {
    expect(calculateAnswerPoints({ secondsLeft: 999, streak: 1 })).toEqual(
      POINTS_FOR_CORRECT_ANSWER + 20 * POINTS_PER_SECOND_LEFT
    );
  });

  it('handles invalid scoring input safely', () => {
    expect(calculateAnswerPoints()).toEqual(POINTS_FOR_CORRECT_ANSWER);
    expect(calculateAnswerPoints({ secondsLeft: NaN, streak: Infinity })).toEqual(
      POINTS_FOR_CORRECT_ANSWER
    );
  });
});

describe('high scores', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('returns an empty object when nothing is stored', () => {
    expect(loadHighScores()).toEqual({});
  });

  it('stores a score and reads it back', () => {
    const updated = saveHighScore({}, 'geography', 500);
    expect(updated).toEqual({ geography: 500 });
    expect(loadHighScores()).toEqual({ geography: 500 });
  });

  it('keeps the previous score when the new one is not better', () => {
    const previous = saveHighScore({}, 'geography', 500);
    const updated = saveHighScore(previous, 'geography', 300);
    expect(updated).toEqual({ geography: 500 });
    expect(loadHighScores()).toEqual({ geography: 500 });
  });

  it('ignores stored data that is not valid JSON', () => {
    window.localStorage.setItem('quizGameHighScores', 'not json');
    expect(loadHighScores()).toEqual({});
  });

  it('filters invalid persisted scores', () => {
    window.localStorage.setItem(
      'quizGameHighScores',
      JSON.stringify({ geography: 500.9, science: -10, history: '900' })
    );
    expect(loadHighScores()).toEqual({ geography: 500 });
  });

  it('does not store invalid or negative new scores', () => {
    expect(saveHighScore({}, 'geography', -10)).toEqual({});
    expect(saveHighScore({}, 'geography', NaN)).toEqual({});
    expect(loadHighScores()).toEqual({});
  });
});
