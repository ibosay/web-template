/**
 * Decides which frames of a drive are worth keeping.
 *
 * Keeping every frame would fill a phone in minutes, and keeping only the frames the detector
 * reacted to would record its successes and hide its failures. What is needed for tuning is both:
 * the frames where it saw a sign, densely, and a thin sample of everything else, so that a sign it
 * drove straight past still leaves a trace.
 *
 * The rule is a plain function of the clock and a counter, so it can be tested without a camera.
 */

export const DEFAULT_RECORDING_OPTIONS = {
  // A sign stays in view for seconds. Half a second apart is enough to catch it at several
  // distances without storing near-identical pictures.
  detectionGapMs: 500,

  // Everything else is sampled this often, which is what turns a missed sign into evidence
  // instead of silence.
  sampleGapMs: 3000,

  // An upper bound on what a drive may store, so that a forgotten recording cannot fill the phone.
  // At roughly 25 kB per frame this is about 15 MB.
  maxFrames: 600,
};

/**
 * The state the recording starts from.
 *
 * @returns {Object} an empty recording state
 */
export const createRecordingState = () => ({ frameCount: 0, lastKeptAt: null });

/**
 * Whether this frame should be stored.
 *
 * @param {Object} state - The current state, from `createRecordingState`
 * @param {Object} input
 * @param {number} input.nowMs - The current time, in milliseconds
 * @param {boolean} input.hasDetections - Whether the detector found something in this frame
 * @param {Object} [options] - see DEFAULT_RECORDING_OPTIONS
 * @returns {boolean} true if the frame is worth keeping
 */
export const shouldKeepFrame = (state, input, options = DEFAULT_RECORDING_OPTIONS) => {
  const { nowMs, hasDetections } = input;

  if (state.frameCount >= options.maxFrames) {
    return false;
  }
  if (state.lastKeptAt === null) {
    return true;
  }

  const sinceLastKept = nowMs - state.lastKeptAt;
  const gap = hasDetections ? options.detectionGapMs : options.sampleGapMs;
  return sinceLastKept >= gap;
};

/**
 * Records that a frame was kept.
 *
 * @param {Object} state - The current state
 * @param {number} nowMs - When the frame was kept
 * @returns {Object} the new state
 */
export const noteKeptFrame = (state, nowMs) => ({
  frameCount: state.frameCount + 1,
  lastKeptAt: nowMs,
});

/**
 * Whether the recording has reached the point where it stores nothing more.
 *
 * @param {Object} state - The current state
 * @param {Object} [options] - see DEFAULT_RECORDING_OPTIONS
 * @returns {boolean} true if the recording is full
 */
export const isRecordingFull = (state, options = DEFAULT_RECORDING_OPTIONS) =>
  state.frameCount >= options.maxFrames;
