import { SIGN_SPEED_LIMIT, SIGN_STOP } from '../signTypes';
import {
  ANNOUNCE_OVERSPEED,
  ANNOUNCE_SPEED_LIMIT,
  ANNOUNCE_STOP,
  createAssistantState,
  DEFAULT_RULE_OPTIONS,
  isOverLimit,
  update,
  warningThreshold,
} from './assistantState';

const limitSign = limitKmh => ({ type: SIGN_SPEED_LIMIT, limitKmh, confidence: 0.95 });
const stopSign = () => ({ type: SIGN_STOP, limitKmh: null, confidence: 0.95 });

const kinds = announcements => announcements.map(announcement => announcement.kind);

/**
 * Runs a list of steps through the assistant. Every step is `{ at, signs, speed }` with `at` in
 * seconds, which keeps the tests readable.
 */
const run = steps => {
  let state = createAssistantState();
  const spoken = [];

  steps.forEach(({ at, signs = [], speed }) => {
    const result = update(state, { nowMs: at * 1000, confirmedSigns: signs, speedKmh: speed });
    state = result.state;
    result.announcements.forEach(announcement => spoken.push({ at, ...announcement }));
  });

  return { state, spoken };
};

describe('warningThreshold', () => {
  it('leaves a fixed margin at low limits', () => {
    expect(warningThreshold(50)).toEqual(55);
  });

  it('leaves a larger margin at high limits', () => {
    // 3% of 130 is 3.9, so the fixed 5 km/h still wins.
    expect(warningThreshold(130)).toEqual(135);
  });
});

describe('update', () => {
  it('remembers a speed limit and says it once', () => {
    const { state, spoken } = run([
      { at: 0, signs: [limitSign(50)] },
      { at: 1, signs: [] },
      { at: 2, signs: [limitSign(50)] },
    ]);

    expect(state.limitKmh).toEqual(50);
    expect(kinds(spoken)).toEqual([ANNOUNCE_SPEED_LIMIT]);
    expect(spoken[0].values).toEqual({ limit: 50 });
  });

  it('says the new limit when it changes', () => {
    const { state, spoken } = run([
      { at: 0, signs: [limitSign(100)] },
      { at: 10, signs: [limitSign(70)] },
    ]);

    expect(state.limitKmh).toEqual(70);
    expect(spoken.map(announcement => announcement.values.limit)).toEqual([100, 70]);
  });

  it('announces a stop sign', () => {
    const { spoken } = run([{ at: 0, signs: [stopSign()] }]);

    expect(kinds(spoken)).toEqual([ANNOUNCE_STOP]);
  });

  it('does not repeat a stop sign that is still in view', () => {
    const { spoken } = run([
      { at: 0, signs: [stopSign()] },
      { at: 1, signs: [stopSign()] },
      { at: 2, signs: [stopSign()] },
    ]);

    expect(kinds(spoken)).toEqual([ANNOUNCE_STOP]);
  });

  it('announces the next stop sign after the pause has passed', () => {
    const { spoken } = run([{ at: 0, signs: [stopSign()] }, { at: 60, signs: [stopSign()] }]);

    expect(kinds(spoken)).toEqual([ANNOUNCE_STOP, ANNOUNCE_STOP]);
  });

  it('keeps quiet while the speed is within the tolerance', () => {
    const { spoken } = run([
      { at: 0, signs: [limitSign(50)], speed: 0 },
      { at: 10, speed: 54 },
      { at: 20, speed: 55 },
    ]);

    expect(kinds(spoken)).toEqual([ANNOUNCE_SPEED_LIMIT]);
  });

  it('keeps quiet when the speed is over the limit only briefly', () => {
    const { spoken } = run([
      { at: 0, signs: [limitSign(50)], speed: 0 },
      { at: 10, speed: 70 },
      { at: 12, speed: 48 },
      { at: 20, speed: 48 },
    ]);

    expect(kinds(spoken)).toEqual([ANNOUNCE_SPEED_LIMIT]);
  });

  it('warns once the speed has stayed over the limit', () => {
    const { spoken } = run([
      { at: 0, signs: [limitSign(50)], speed: 0 },
      { at: 10, speed: 70 },
      { at: 15, speed: 70 },
    ]);

    expect(kinds(spoken)).toEqual([ANNOUNCE_SPEED_LIMIT, ANNOUNCE_OVERSPEED]);
    expect(spoken[1].values).toEqual({ limit: 50, speed: 70 });
  });

  it('does not repeat the warning on every step', () => {
    const { spoken } = run([
      { at: 0, signs: [limitSign(50)], speed: 0 },
      { at: 10, speed: 70 },
      { at: 15, speed: 70 },
      { at: 16, speed: 70 },
      { at: 20, speed: 70 },
    ]);

    expect(kinds(spoken).filter(kind => kind === ANNOUNCE_OVERSPEED)).toHaveLength(1);
  });

  it('warns again after the pause, if the speed is still too high', () => {
    const { spoken } = run([
      { at: 0, signs: [limitSign(50)], speed: 0 },
      { at: 10, speed: 70 },
      { at: 15, speed: 70 },
      { at: 45, speed: 70 },
    ]);

    expect(kinds(spoken).filter(kind => kind === ANNOUNCE_OVERSPEED)).toHaveLength(2);
  });

  it('warns right away for a new, lower limit the car is already too fast for', () => {
    const { spoken } = run([
      { at: 0, signs: [limitSign(100)], speed: 95 },
      { at: 10, signs: [limitSign(50)], speed: 95 },
      { at: 15, speed: 95 },
    ]);

    // The 50 sign resets the pause, so the warning comes a few seconds after the sign, not 25
    // seconds later because of the limit before it.
    expect(kinds(spoken)).toEqual([ANNOUNCE_SPEED_LIMIT, ANNOUNCE_SPEED_LIMIT, ANNOUNCE_OVERSPEED]);
  });

  it('says nothing about the speed while no limit is known', () => {
    const { spoken } = run([{ at: 0, speed: 180 }, { at: 10, speed: 180 }]);

    expect(spoken).toEqual([]);
  });

  it('says nothing about the speed while the GPS has no fix', () => {
    const { spoken } = run([
      { at: 0, signs: [limitSign(50)], speed: null },
      { at: 10, speed: null },
    ]);

    expect(kinds(spoken)).toEqual([ANNOUNCE_SPEED_LIMIT]);
  });

  it('forgets a limit it has not seen for a long time', () => {
    const tooOld = DEFAULT_RULE_OPTIONS.limitMaxAgeMs / 1000 + 1;
    const { state } = run([
      { at: 0, signs: [limitSign(50)], speed: 40 },
      { at: tooOld, speed: 40 },
    ]);

    expect(state.limitKmh).toBeNull();
  });

  it('keeps a limit that is seen again', () => {
    const almostTooOld = DEFAULT_RULE_OPTIONS.limitMaxAgeMs / 1000 - 1;
    const { state } = run([
      { at: 0, signs: [limitSign(50)], speed: 40 },
      { at: almostTooOld, signs: [limitSign(50)], speed: 40 },
      { at: almostTooOld + 10, speed: 40 },
    ]);

    expect(state.limitKmh).toEqual(50);
  });

  it('leaves the state alone when nothing happens', () => {
    const state = createAssistantState();
    const result = update(state, { nowMs: 1000 });

    expect(result.announcements).toEqual([]);
    expect(result.state.limitKmh).toBeNull();
  });
});

describe('isOverLimit', () => {
  it('is false while no limit is known', () => {
    expect(isOverLimit({ limitKmh: null, speedKmh: 200 })).toBe(false);
  });

  it('is false within the tolerance', () => {
    expect(isOverLimit({ limitKmh: 50, speedKmh: 55 })).toBe(false);
  });

  it('is true above the tolerance', () => {
    expect(isOverLimit({ limitKmh: 50, speedKmh: 56 })).toBe(true);
  });
});
