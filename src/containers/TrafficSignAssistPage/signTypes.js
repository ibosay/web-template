/**
 * The traffic signs the assistant knows about.
 *
 * The first version covers the two sign groups that matter most while driving: Austrian speed
 * limits ("Geschwindigkeitsbeschränkung", StVO § 52/10a) and stop signs ("Halt", StVO § 52/24).
 * Both follow the Vienna Convention, so the detector works on the shape and the colour of the
 * sign rather than on anything Austria specific:
 *
 * - a speed limit is a white disc with a red ring and black digits,
 * - a stop sign is a solid red octagon with white letters.
 *
 * Adding a sign group later means adding a type here, teaching the detector how to recognise it,
 * and deciding in `logic/assistantState.js` what should be announced for it.
 */

/** A white disc with a red ring and a number in it. */
export const SIGN_SPEED_LIMIT = 'speedLimit';

/** A solid red octagon. */
export const SIGN_STOP = 'stop';

export const SIGN_TYPES = [SIGN_SPEED_LIMIT, SIGN_STOP];

/**
 * The speed limits that are actually posted in Austria. The digit recognition is allowed to return
 * one of these numbers only, which throws away a lot of misreadings for free: a misread "60" can
 * never turn into a "68", because 68 is not a limit that exists.
 */
export const ALLOWED_SPEED_LIMITS = [5, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 130];

/**
 * Returns whether the given number is a speed limit that can be posted in Austria.
 *
 * @param {number} limitKmh - The recognised number
 * @returns {boolean} true if the number is a plausible speed limit
 */
export const isAllowedSpeedLimit = limitKmh => ALLOWED_SPEED_LIMITS.includes(limitKmh);

/**
 * The translation key for the name of a sign type.
 *
 * @param {string} signType - One of SIGN_TYPES
 * @returns {string} translation key
 */
export const signLabelId = signType => `TrafficSignAssistPage.sign_${signType}`;
