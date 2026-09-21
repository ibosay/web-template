/**
 * Finds traffic signs in a single camera frame.
 *
 * The detector looks for red areas and then decides what shape they form. The decisive difference
 * between the two signs of this version is what sits inside the red:
 *
 * - a speed limit is a red *ring*: the red fills roughly a third of its bounding box, and inside
 *   it lies a bright disc that the ring fully encloses — the white disc with the number,
 * - a stop sign is a *solid* red octagon: the red fills roughly 80% of its bounding box and there
 *   is no enclosed bright disc, because the middle of the sign is red as well.
 *
 * The white disc is searched for instead of being derived from the bounding box. On a real
 * Austrian sign the number is about half as tall as the whole sign and nearly as wide as the
 * disc, so a fixed inset would either cut the digits off or reach into the red ring. Finding the
 * disc also survives a sign photographed at an angle, where a fixed inset would not.
 *
 * This is a deliberately simple, dependency free baseline. It runs on every phone, needs no model
 * download and works offline, but a trained network beats it on dirty signs, at dusk and at long
 * range. `createDetector` keeps the detector behind a small interface so that a trained model can
 * take its place later without touching the rest of the app.
 */

import { isAllowedSpeedLimit, SIGN_SPEED_LIMIT, SIGN_STOP } from '../signTypes';
import {
  buildMaskInRect,
  buildRedMask,
  DEFAULT_ANALYSIS_OPTIONS,
  findBlobs,
  insetRect,
  isSignRed,
  luminance,
  maskRatioInRect,
  touchesBorder,
  translateRect,
} from './imageAnalysis';
import { DEFAULT_DIGIT_OPTIONS, readNumber } from './digitRecognition';

export const DEFAULT_DETECTOR_OPTIONS = {
  ...DEFAULT_ANALYSIS_OPTIONS,
  ...DEFAULT_DIGIT_OPTIONS,

  // How much of its bounding box the red fills. A ring fills far less than a solid octagon, which
  // is what separates the two sign shapes before anything else is looked at. An Austrian speed
  // limit sign has a ring about a tenth of its diameter wide, which covers about 28% of the
  // bounding box; a regular octagon covers 83%.
  ringMinExtent: 0.18,
  ringMaxExtent: 0.62,
  octagonMinExtent: 0.62,
  octagonMaxExtent: 0.97,

  // The bright disc inside the ring has to make up at least this much of the bounding box, and be
  // at least this wide compared to the whole sign. Together they rule out a small bright speck in
  // an otherwise red area.
  discMinAreaRatio: 0.18,
  discMinWidthRatio: 0.45,

  // What counts as the white of the disc. It only has to be brighter than the red around it, so
  // the bar is low enough for dusk and for a sign in the shade.
  discMinLuminance: 0.33,

  // The middle of a stop sign, as a share cut off on every side of the bounding box, and how much
  // of it has to be red.
  stopCentreInset: 0.28,
  stopMinCentreRed: 0.45,

  // A stop sign carries white letters, and this is the share of its middle they have to cover. A
  // plain red disc — a ball, a painted panel, a tail light — fills its bounding box almost exactly
  // as well as an octagon does, so the shape alone cannot tell them apart. The letters can.
  stopMinCentreBright: 0.06,
  stopBrightLuminance: 0.55,
};

/**
 * Finds the bright disc that a red ring encloses.
 *
 * @param {Object} imageData - `{ data, width, height }` of the frame
 * @param {Object} box - `{ x0, y0, x1, y1 }` of the red ring
 * @param {Object} options - see DEFAULT_DETECTOR_OPTIONS
 * @returns {Object|null} `{ x0, y0, x1, y1 }` of the disc in frame coordinates, or null
 */
export const findEnclosedDisc = (imageData, box, options) => {
  const isDiscPixel = (r, g, b) =>
    luminance(r, g, b) >= options.discMinLuminance && !isSignRed(r, g, b, options);

  const { mask, width: areaWidth, height: areaHeight } = buildMaskInRect(
    imageData,
    box,
    isDiscPixel
  );

  const boxArea = areaWidth * areaHeight;
  const candidates = findBlobs(mask, areaWidth, areaHeight, 1)
    // The ring has to enclose the disc on every side.
    .filter(blob => !touchesBorder(blob, areaWidth, areaHeight))
    .filter(
      blob =>
        blob.area >= boxArea * options.discMinAreaRatio &&
        blob.width >= areaWidth * options.discMinWidthRatio &&
        blob.height >= areaHeight * options.discMinWidthRatio
    )
    .sort((a, b) => b.area - a.area);

  if (candidates.length === 0) {
    return null;
  }

  const disc = candidates[0];
  return translateRect({ x0: disc.x0, y0: disc.y0, x1: disc.x1, y1: disc.y1 }, box);
};

/**
 * Looks at one red area and decides whether it is a sign, and which one.
 *
 * @param {Object} blob - A red area from `findBlobs`
 * @param {Object} imageData - `{ data, width, height }` of the frame
 * @param {Uint8Array} redMask - The red mask of the frame
 * @param {Object} options - see DEFAULT_DETECTOR_OPTIONS
 * @returns {Object|null} a detection, or null if the area is not a sign
 */
const classifyBlob = (blob, imageData, redMask, options) => {
  const box = { x0: blob.x0, y0: blob.y0, x1: blob.x1, y1: blob.y1 };

  const looksLikeRing =
    blob.extent >= options.ringMinExtent && blob.extent <= options.ringMaxExtent;
  if (looksLikeRing) {
    const disc = findEnclosedDisc(imageData, box, options);
    if (disc) {
      const number = readNumber(imageData, disc, options);
      if (number.value !== null && isAllowedSpeedLimit(number.value)) {
        return {
          type: SIGN_SPEED_LIMIT,
          limitKmh: number.value,
          confidence: number.confidence,
          box,
        };
      }
    }
    return null;
  }

  const looksSolid =
    blob.extent >= options.octagonMinExtent && blob.extent <= options.octagonMaxExtent;
  if (looksSolid) {
    const centre = insetRect(box, options.stopCentreInset);
    const centreRed = maskRatioInRect(redMask, imageData.width, centre);
    const isLetterPixel = (r, g, b) =>
      luminance(r, g, b) >= options.stopBrightLuminance && !isSignRed(r, g, b, options);
    const letters = buildMaskInRect(imageData, centre, isLetterPixel);
    const letterRatio = letters.mask.reduce((sum, value) => sum + value, 0) / letters.mask.length;

    if (centreRed >= options.stopMinCentreRed && letterRatio >= options.stopMinCentreBright) {
      return {
        type: SIGN_STOP,
        limitKmh: null,
        // A solid octagon has no number to read, so how well the red fills the shape a regular
        // octagon would have (83% of its bounding box) is the only thing to be confident about.
        confidence: Math.min(1, blob.extent / 0.83),
        box,
      };
    }
  }

  return null;
};

/**
 * Finds every sign in one frame.
 *
 * @param {Object} imageData - `{ data, width, height }`, RGBA like a canvas ImageData
 * @param {Object} [options] - see DEFAULT_DETECTOR_OPTIONS
 * @returns {Array<Object>} detections `{ type, limitKmh, confidence, box }`, most confident first
 */
export const detectSigns = (imageData, options = DEFAULT_DETECTOR_OPTIONS) => {
  const { width, height } = imageData;
  const redMask = buildRedMask(imageData, options);
  const minArea = Math.max(24, Math.round(width * height * options.minBlobAreaRatio));

  return findBlobs(redMask, width, height, minArea)
    .filter(blob => {
      const aspectRatio = blob.width / blob.height;
      return aspectRatio >= options.minAspectRatio && aspectRatio <= options.maxAspectRatio;
    })
    .map(blob => classifyBlob(blob, imageData, redMask, options))
    .filter(Boolean)
    .sort((a, b) => b.confidence - a.confidence);
};

/**
 * Wraps the detection in the interface the page uses.
 *
 * Keeping the detector behind an object with a `detect` method is what makes it swappable: a
 * version built on a trained network loads its model in `prepare` and does the same job in
 * `detect`, and the rest of the app does not need to know the difference.
 *
 * @param {Object} [options] - see DEFAULT_DETECTOR_OPTIONS
 * @returns {{name: string, prepare: Function, detect: Function}} the detector
 */
export const createDetector = (options = DEFAULT_DETECTOR_OPTIONS) => ({
  name: 'shape',
  // Nothing to load: the shape detector is ready as soon as it exists.
  prepare: () => Promise.resolve(),
  detect: imageData => detectSigns(imageData, options),
});
