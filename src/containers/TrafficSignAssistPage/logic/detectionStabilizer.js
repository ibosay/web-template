/**
 * Turns the noisy, per frame output of the detector into signs worth reacting to.
 *
 * A detector that runs on a live camera is wrong now and then: a red jacket on a cyclist, a tail
 * light in the rain, a poster. Speaking every one of those would make the assistant useless within
 * a minute. A real sign, on the other hand, stays in view for many frames as the car approaches
 * it. So a sign counts as seen only once it has turned up in several of the last few frames.
 *
 * All functions are pure: the state is passed in and a new state comes back. That keeps the rule
 * testable without a camera.
 */

export const DEFAULT_STABILIZER_OPTIONS = {
  // How many of the most recent frames are looked at …
  windowSize: 6,
  // … and in how many of them the same sign has to appear.
  minHits: 3,
  // Detections the detector is not sure about never get to vote.
  minConfidence: 0.7,
};

/**
 * Name under which a detection is counted. Two "50" signs in different frames are the same sign as
 * far as the vote is concerned, a "50" and a "60" are not.
 *
 * @param {Object} detection - A detection from the detector
 * @returns {string} the key
 */
export const detectionKey = detection =>
  detection.limitKmh === null || detection.limitKmh === undefined
    ? detection.type
    : `${detection.type}:${detection.limitKmh}`;

/**
 * The state the vote starts from.
 *
 * @returns {Object} an empty stabilizer state
 */
export const createStabilizerState = () => ({ frames: [] });

/**
 * Adds the detections of one frame and reports which signs are now confirmed.
 *
 * @param {Object} state - The current state, from `createStabilizerState`
 * @param {Array<Object>} detections - What the detector found in this frame
 * @param {Object} [options] - see DEFAULT_STABILIZER_OPTIONS
 * @returns {{state: Object, confirmed: Array<Object>}} the new state and the confirmed signs, most
 *   confident first
 */
export const pushFrame = (state, detections, options = DEFAULT_STABILIZER_OPTIONS) => {
  const trusted = detections.filter(detection => detection.confidence >= options.minConfidence);
  const frames = [...state.frames, trusted].slice(-options.windowSize);

  // How many frames each sign turned up in, and the clearest look at it.
  const hits = new Map();
  const best = new Map();

  frames.forEach(frame => {
    const countedInThisFrame = new Set();

    frame.forEach(detection => {
      const key = detectionKey(detection);
      if (!countedInThisFrame.has(key)) {
        countedInThisFrame.add(key);
        hits.set(key, (hits.get(key) || 0) + 1);
      }
      const previous = best.get(key);
      if (!previous || detection.confidence > previous.confidence) {
        best.set(key, detection);
      }
    });
  });

  const confirmed = [...hits.entries()]
    .filter(([, count]) => count >= options.minHits)
    .map(([key]) => best.get(key))
    .sort((a, b) => b.confidence - a.confidence);

  return { state: { frames }, confirmed };
};
