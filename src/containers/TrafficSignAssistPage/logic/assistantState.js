/**
 * What the assistant remembers and when it says something.
 *
 * This is the part of the app that decides, and it is deliberately free of camera, GPS and speech:
 * `update` takes the current state plus what just happened and returns the new state together with
 * the announcements to speak. That makes every rule below testable by passing in a time and a
 * speed, with no car involved.
 *
 * An announcement is a translation key and its values, not a finished sentence, so the spoken
 * language follows the language of the app.
 */

import { SIGN_SPEED_LIMIT, SIGN_STOP } from '../signTypes';

export const DEFAULT_RULE_OPTIONS = {
  // How much over the limit is still not worth a warning. Austrian enforcement leaves a small
  // margin, and warning at exactly the limit would make the assistant nag on every slight rise.
  toleranceKmh: 5,
  tolerancePercent: 0.03,

  // Being over the limit for a moment — overtaking, a downhill stretch — is not warned about. Only
  // staying over it is.
  overspeedDelayMs: 4000,

  // How long before the same warning may be repeated.
  overspeedRepeatMs: 25000,
  stopRepeatMs: 20000,

  // A speed limit is forgotten after this long. The assistant cannot yet read the signs that end a
  // limit ("Ende der Geschwindigkeitsbeschränkung"), nor the ones on a motorway exit, so a limit
  // that has not been seen again for a while is dropped rather than trusted. Forgetting it means
  // no warning; keeping it would mean wrong warnings, which is worse.
  limitMaxAgeMs: 8 * 60 * 1000,
};

/** An announcement that a new speed limit is now in force. */
export const ANNOUNCE_SPEED_LIMIT = 'speedLimit';

/** An announcement that a stop sign is coming up. */
export const ANNOUNCE_STOP = 'stop';

/** An announcement that the car has been over the limit for a while. */
export const ANNOUNCE_OVERSPEED = 'overspeed';

/**
 * The state the assistant starts from.
 *
 * @returns {Object} an empty assistant state
 */
export const createAssistantState = () => ({
  /** The limit currently in force, or null if none is known. */
  limitKmh: null,
  /** When that limit was last seen. */
  limitSeenAt: null,
  /** Current speed in km/h, or null while the GPS has not reported one. */
  speedKmh: null,
  /** Since when the car has been over the limit, or null if it is not. */
  overspeedSince: null,
  /** When each kind of announcement was last spoken. */
  lastAnnouncedAt: {},
});

/**
 * How far over the limit the car may be before it counts as too fast.
 *
 * @param {number} limitKmh - The limit in force
 * @param {Object} [options] - see DEFAULT_RULE_OPTIONS
 * @returns {number} the speed from which a warning is due, in km/h
 */
export const warningThreshold = (limitKmh, options = DEFAULT_RULE_OPTIONS) =>
  limitKmh + Math.max(options.toleranceKmh, limitKmh * options.tolerancePercent);

/**
 * Advances the assistant by one step.
 *
 * @param {Object} state - The current state
 * @param {Object} input
 * @param {number} input.nowMs - The current time, in milliseconds
 * @param {Array<Object>} [input.confirmedSigns] - Signs the stabilizer confirmed in this step
 * @param {number|null} [input.speedKmh] - The current speed, or null if the GPS has none
 * @param {Object} [options] - see DEFAULT_RULE_OPTIONS
 * @returns {{state: Object, announcements: Array<Object>}} the new state and what to say, in the
 *   order it should be said
 */
export const update = (state, input, options = DEFAULT_RULE_OPTIONS) => {
  const { nowMs, confirmedSigns = [], speedKmh } = input;
  const announcements = [];

  let limitKmh = state.limitKmh;
  let limitSeenAt = state.limitSeenAt;
  let overspeedSince = state.overspeedSince;
  const lastAnnouncedAt = { ...state.lastAnnouncedAt };

  const mayAnnounce = (kind, repeatMs) => {
    const last = lastAnnouncedAt[kind];
    return last === undefined || nowMs - last >= repeatMs;
  };

  // A stop sign is announced whenever one is seen, but not over and over for the same sign.
  const stopSign = confirmedSigns.find(sign => sign.type === SIGN_STOP);
  if (stopSign && mayAnnounce(ANNOUNCE_STOP, options.stopRepeatMs)) {
    announcements.push({ kind: ANNOUNCE_STOP });
    lastAnnouncedAt[ANNOUNCE_STOP] = nowMs;
  }

  // Of several speed limits in view, the clearest one wins: `confirmedSigns` is sorted by
  // confidence.
  const limitSign = confirmedSigns.find(sign => sign.type === SIGN_SPEED_LIMIT);
  if (limitSign) {
    const isNewLimit = limitSign.limitKmh !== limitKmh;
    limitSeenAt = nowMs;

    if (isNewLimit) {
      limitKmh = limitSign.limitKmh;
      // A new limit starts its own story: whether the car is too fast for it is decided from now.
      overspeedSince = null;
      delete lastAnnouncedAt[ANNOUNCE_OVERSPEED];
      announcements.push({ kind: ANNOUNCE_SPEED_LIMIT, values: { limit: limitKmh } });
      lastAnnouncedAt[ANNOUNCE_SPEED_LIMIT] = nowMs;
    }
  } else if (limitKmh !== null && nowMs - limitSeenAt >= options.limitMaxAgeMs) {
    limitKmh = null;
    limitSeenAt = null;
    overspeedSince = null;
  }

  const currentSpeed = speedKmh === undefined ? state.speedKmh : speedKmh;

  if (limitKmh !== null && currentSpeed !== null && currentSpeed !== undefined) {
    if (currentSpeed > warningThreshold(limitKmh, options)) {
      if (overspeedSince === null) {
        overspeedSince = nowMs;
      }
      const longEnough = nowMs - overspeedSince >= options.overspeedDelayMs;
      if (longEnough && mayAnnounce(ANNOUNCE_OVERSPEED, options.overspeedRepeatMs)) {
        announcements.push({
          kind: ANNOUNCE_OVERSPEED,
          values: { limit: limitKmh, speed: Math.round(currentSpeed) },
        });
        lastAnnouncedAt[ANNOUNCE_OVERSPEED] = nowMs;
      }
    } else {
      overspeedSince = null;
    }
  } else {
    overspeedSince = null;
  }

  return {
    state: { limitKmh, limitSeenAt, speedKmh: currentSpeed, overspeedSince, lastAnnouncedAt },
    announcements,
  };
};

/**
 * Whether the car is currently over the limit. Used to colour the speed on screen, which reacts
 * immediately, unlike the spoken warning that waits a few seconds.
 *
 * @param {Object} state - The current state
 * @param {Object} [options] - see DEFAULT_RULE_OPTIONS
 * @returns {boolean} true if the car is too fast
 */
export const isOverLimit = (state, options = DEFAULT_RULE_OPTIONS) =>
  state.limitKmh !== null &&
  state.speedKmh !== null &&
  state.speedKmh !== undefined &&
  state.speedKmh > warningThreshold(state.limitKmh, options);
