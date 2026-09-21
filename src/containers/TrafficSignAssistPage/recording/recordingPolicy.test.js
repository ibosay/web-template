import {
  createRecordingState,
  DEFAULT_RECORDING_OPTIONS,
  isRecordingFull,
  noteKeptFrame,
  shouldKeepFrame,
} from './recordingPolicy';

/**
 * Runs a list of frames past the rule. Every frame is `{ at, detected }` with `at` in seconds.
 *
 * @returns {Array<number>} the seconds at which a frame was kept
 */
const run = (frames, options = DEFAULT_RECORDING_OPTIONS) => {
  let state = createRecordingState();
  const kept = [];

  frames.forEach(({ at, detected = false }) => {
    const nowMs = at * 1000;
    if (shouldKeepFrame(state, { nowMs, hasDetections: detected }, options)) {
      state = noteKeptFrame(state, nowMs);
      kept.push(at);
    }
  });

  return kept;
};

/** A drive of `seconds` seconds at eight frames a second. */
const drive = (seconds, detectedBetween = []) => {
  const frames = [];
  for (let i = 0; i < seconds * 8; i++) {
    const at = i / 8;
    const detected = detectedBetween.some(([from, to]) => at >= from && at <= to);
    frames.push({ at, detected });
  }
  return frames;
};

describe('shouldKeepFrame', () => {
  it('always keeps the first frame', () => {
    expect(run([{ at: 0 }])).toEqual([0]);
  });

  it('samples a quiet stretch sparsely', () => {
    // Ten seconds with nothing to see: one frame every three seconds, plus the first.
    expect(run(drive(10))).toEqual([0, 3, 6, 9]);
  });

  it('keeps frames closely together while a sign is in view', () => {
    const kept = run(drive(4, [[1, 3]]));

    // The sign is in view from second 1 to 3, which is where the frames bunch up. Once it is out
    // of view the wider sampling gap takes over again, so nothing more is kept in this drive.
    expect(kept).toEqual([0, 1, 1.5, 2, 2.5, 3]);
  });

  it('records a stretch where the detector saw nothing at all', () => {
    // This is the point of sampling: a sign that was driven past leaves a frame behind, so a miss
    // can be found later instead of going unnoticed.
    expect(run(drive(7)).length).toBeGreaterThan(1);
  });

  it('stops once the recording is full', () => {
    const kept = run(drive(600), { ...DEFAULT_RECORDING_OPTIONS, maxFrames: 5 });

    expect(kept).toHaveLength(5);
  });

  it('does not keep a frame when the recording is full, however interesting it is', () => {
    const full = { frameCount: DEFAULT_RECORDING_OPTIONS.maxFrames, lastKeptAt: 0 };

    expect(shouldKeepFrame(full, { nowMs: 999999, hasDetections: true })).toBe(false);
  });
});

describe('noteKeptFrame', () => {
  it('counts the frame and remembers when it was kept', () => {
    const state = noteKeptFrame(createRecordingState(), 1234);

    expect(state).toEqual({ frameCount: 1, lastKeptAt: 1234 });
  });

  it('leaves the state it was given alone', () => {
    const before = createRecordingState();
    noteKeptFrame(before, 1234);

    expect(before).toEqual({ frameCount: 0, lastKeptAt: null });
  });
});

describe('isRecordingFull', () => {
  it('is false while there is room', () => {
    expect(isRecordingFull({ frameCount: 10, lastKeptAt: 0 })).toBe(false);
  });

  it('is true at the limit', () => {
    expect(
      isRecordingFull({ frameCount: DEFAULT_RECORDING_OPTIONS.maxFrames, lastKeptAt: 0 })
    ).toBe(true);
  });
});
