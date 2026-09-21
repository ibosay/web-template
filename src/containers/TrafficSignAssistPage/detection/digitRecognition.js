/**
 * Reads the number out of the white disc of a speed limit sign.
 *
 * The steps are: cut out the inside of the sign, decide for every pixel whether it is ink or
 * background, group the ink into digits, scale every digit onto the reference grid, and compare it
 * with the templates in `digitTemplates.js`.
 *
 * Everything works on plain pixel data, so it can be tested without a browser.
 */

import { DEFAULT_ANALYSIS_OPTIONS, findBlobs, isSignRed, luminance } from './imageAnalysis';
import {
  DIGIT_TEMPLATES,
  normalizeToTemplateGrid,
  TEMPLATE_HEIGHT,
  TEMPLATE_WIDTH,
} from './digitTemplates';

export const DEFAULT_DIGIT_OPTIONS = {
  // Reading the number needs to know what sign red looks like, because the red of the ring has to
  // be kept out of the ink — see `buildInkMask`. Carrying the analysis options along means a caller
  // that relies on these defaults gets a working red test, instead of one that quietly passes
  // everything.
  ...DEFAULT_ANALYSIS_OPTIONS,

  // Where the threshold between the black digits and the white disc sits, as a share of the
  // brightness range that is actually present. A relative threshold keeps working in a dark tunnel
  // and in bright sunlight, where an absolute one would fail.
  inkThreshold: 0.55,

  // A digit reaches over most of the height of the disc, which rules out dirt and the shadow of
  // the rim.
  minDigitHeightRatio: 0.42,

  // Digits are taller than they are wide. "1" is the narrowest, "0" the widest.
  minDigitAspectRatio: 0.12,
  maxDigitAspectRatio: 1.15,

  // A digit has to look at least this similar to its template, and it has to be this much more
  // similar to the best template than to the second best one. Without the margin, a blurred "8"
  // happily turns into a "3".
  minDigitScore: 0.76,
  minDigitMargin: 0.035,

  // Austrian limits have two or three digits; "5" and "10" exist as well, so one is allowed too.
  maxDigits: 3,
};

/**
 * Compares one scaled digit with every template.
 *
 * @param {Float32Array} cells - Ink share per cell, TEMPLATE_WIDTH * TEMPLATE_HEIGHT entries
 * @returns {{digit: number|null, score: number, margin: number}} best match and how clear it was
 */
export const matchDigit = cells => {
  let bestDigit = null;
  let bestScore = -1;
  let secondScore = -1;

  Object.keys(DIGIT_TEMPLATES).forEach(key => {
    const template = DIGIT_TEMPLATES[key];
    let difference = 0;
    for (let i = 0; i < cells.length; i++) {
      difference += Math.abs(cells[i] - template[i]);
    }
    const score = 1 - difference / cells.length;

    if (score > bestScore) {
      secondScore = bestScore;
      bestScore = score;
      bestDigit = Number(key);
    } else if (score > secondScore) {
      secondScore = score;
    }
  });

  return { digit: bestDigit, score: bestScore, margin: bestScore - secondScore };
};

/**
 * Scales one digit cut out of a frame onto the reference grid, the same way the templates were
 * scaled. Re-exported so that the normalisation can be tested on its own.
 */
export const scaleToTemplateGrid = normalizeToTemplateGrid;

/**
 * Marks the dark pixels inside the disc of a sign.
 *
 * Red pixels are left out on purpose. The disc is round but its bounding box is square, so the
 * corners of the box always fall on the red ring around the disc — and sign red is darker than the
 * white of the disc. Without this, the ring would be read as ink, run into the digits, and there
 * would be nothing left to recognise.
 *
 * @param {Object} imageData - `{ data, width, height }` of the whole frame
 * @param {Object} rect - `{ x0, y0, x1, y1 }` of the inside of the sign
 * @param {Object} [options] - see DEFAULT_DIGIT_OPTIONS
 * @returns {{ink: Uint8Array, width: number, height: number}} ink mask of the region
 */
export const buildInkMask = (imageData, rect, options = DEFAULT_DIGIT_OPTIONS) => {
  const { data, width } = imageData;
  const regionWidth = rect.x1 - rect.x0 + 1;
  const regionHeight = rect.y1 - rect.y0 + 1;
  const values = new Float32Array(regionWidth * regionHeight);

  // -1 marks a pixel that belongs to the ring rather than to the disc.
  let min = 1;
  let max = 0;
  for (let y = 0; y < regionHeight; y++) {
    for (let x = 0; x < regionWidth; x++) {
      const offset = ((rect.y0 + y) * width + (rect.x0 + x)) * 4;
      const r = data[offset];
      const g = data[offset + 1];
      const b = data[offset + 2];

      if (isSignRed(r, g, b, options)) {
        values[y * regionWidth + x] = -1;
        continue;
      }

      const value = luminance(r, g, b);
      values[y * regionWidth + x] = value;
      if (value < min) min = value;
      if (value > max) max = value;
    }
  }

  const ink = new Uint8Array(values.length);
  // A disc of one flat colour has nothing to read, so an almost flat region yields no ink at all.
  if (max - min > 0.12) {
    const threshold = min + (max - min) * options.inkThreshold;
    for (let i = 0; i < values.length; i++) {
      ink[i] = values[i] >= 0 && values[i] < threshold ? 1 : 0;
    }
  }

  return { ink, width: regionWidth, height: regionHeight };
};

/**
 * Reads the number inside the disc of a speed limit sign.
 *
 * @param {Object} imageData - `{ data, width, height }` of the whole frame
 * @param {Object} rect - `{ x0, y0, x1, y1 }` of the inside of the sign
 * @param {Object} [options] - see DEFAULT_DIGIT_OPTIONS
 * @returns {{value: number|null, confidence: number, digits: Array<Object>}} the number, how sure
 *   the reading is (the weakest of its digits), and the single digits for debugging
 */
export const readNumber = (imageData, rect, options = DEFAULT_DIGIT_OPTIONS) => {
  const empty = { value: null, confidence: 0, digits: [] };

  const { ink, width: regionWidth, height: regionHeight } = buildInkMask(imageData, rect, options);
  if (regionWidth < TEMPLATE_WIDTH || regionHeight < TEMPLATE_HEIGHT) {
    return empty;
  }

  const minHeight = regionHeight * options.minDigitHeightRatio;
  const candidates = findBlobs(ink, regionWidth, regionHeight, 4)
    .filter(blob => {
      const aspectRatio = blob.width / blob.height;
      return (
        blob.height >= minHeight &&
        aspectRatio >= options.minDigitAspectRatio &&
        aspectRatio <= options.maxDigitAspectRatio
      );
    })
    // Read the digits the way they are written.
    .sort((a, b) => a.x0 - b.x0);

  if (candidates.length === 0 || candidates.length > options.maxDigits) {
    return empty;
  }

  const digits = [];
  let confidence = 1;

  for (let i = 0; i < candidates.length; i++) {
    const cells = scaleToTemplateGrid(ink, regionWidth, candidates[i]);
    const match = matchDigit(cells);

    if (
      match.digit === null ||
      match.score < options.minDigitScore ||
      match.margin < options.minDigitMargin
    ) {
      return empty;
    }
    digits.push(match);
    confidence = Math.min(confidence, match.score);
  }

  const value = Number(digits.map(digit => digit.digit).join(''));
  return { value, confidence, digits };
};
