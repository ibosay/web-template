import { SIGN_SPEED_LIMIT, SIGN_STOP } from '../signTypes';
import {
  createStabilizerState,
  DEFAULT_STABILIZER_OPTIONS,
  detectionKey,
  pushFrame,
} from './detectionStabilizer';

const limit = (limitKmh, confidence = 0.95) => ({
  type: SIGN_SPEED_LIMIT,
  limitKmh,
  confidence,
  box: { x0: 0, y0: 0, x1: 10, y1: 10 },
});

const stop = (confidence = 0.95) => ({
  type: SIGN_STOP,
  limitKmh: null,
  confidence,
  box: { x0: 0, y0: 0, x1: 10, y1: 10 },
});

/** Feeds several frames in a row and returns what was confirmed in the last one. */
const feed = (frames, options = DEFAULT_STABILIZER_OPTIONS) =>
  frames.reduce((previous, detections) => pushFrame(previous.state, detections, options), {
    state: createStabilizerState(),
    confirmed: [],
  });

describe('detectionKey', () => {
  it('tells two different limits apart', () => {
    expect(detectionKey(limit(50))).not.toEqual(detectionKey(limit(60)));
  });

  it('gives the same limit the same key', () => {
    expect(detectionKey(limit(50, 0.8))).toEqual(detectionKey(limit(50, 0.99)));
  });

  it('uses the plain type for a sign without a number', () => {
    expect(detectionKey(stop())).toEqual(SIGN_STOP);
  });
});

describe('pushFrame', () => {
  it('confirms nothing from a single frame', () => {
    expect(feed([[limit(50)]]).confirmed).toEqual([]);
  });

  it('confirms a sign once it has been seen in enough frames', () => {
    const { confirmed } = feed([[limit(50)], [limit(50)], [limit(50)]]);

    expect(confirmed).toHaveLength(1);
    expect(confirmed[0].limitKmh).toEqual(50);
  });

  it('ignores a sign that only flickered up once', () => {
    const { confirmed } = feed([[limit(50)], [], [], [], [], []]);

    expect(confirmed).toEqual([]);
  });

  it('ignores detections the detector was unsure about', () => {
    const { confirmed } = feed([[limit(50, 0.4)], [limit(50, 0.4)], [limit(50, 0.4)]]);

    expect(confirmed).toEqual([]);
  });

  it('counts a sign once per frame, even if the detector reports it twice', () => {
    const { confirmed } = feed([[limit(50), limit(50)], [limit(50), limit(50)]]);

    expect(confirmed).toEqual([]);
  });

  it('reports the clearest look at a confirmed sign', () => {
    const { confirmed } = feed([[limit(50, 0.8)], [limit(50, 0.97)], [limit(50, 0.85)]]);

    expect(confirmed[0].confidence).toEqual(0.97);
  });

  it('forgets a sign that has left the window', () => {
    // Three hits confirm it, then six frames without it push it out again.
    const { confirmed } = feed([[limit(50)], [limit(50)], [limit(50)], [], [], [], [], [], []]);

    expect(confirmed).toEqual([]);
  });

  it('confirms several different signs at once', () => {
    const { confirmed } = feed([[limit(50), stop()], [limit(50), stop()], [limit(50), stop()]]);

    expect(confirmed.map(detection => detection.type).sort()).toEqual([
      SIGN_SPEED_LIMIT,
      SIGN_STOP,
    ]);
  });

  it('sorts the confirmed signs by confidence', () => {
    const { confirmed } = feed([
      [limit(50, 0.8), stop(0.99)],
      [limit(50, 0.8), stop(0.99)],
      [limit(50, 0.8), stop(0.99)],
    ]);

    expect(confirmed[0].type).toEqual(SIGN_STOP);
  });

  it('keeps only as many frames as the window is wide', () => {
    const frames = new Array(20).fill([limit(50)]);
    const { state } = feed(frames);

    expect(state.frames).toHaveLength(DEFAULT_STABILIZER_OPTIONS.windowSize);
  });
});
