/**
 * Low level image analysis for the traffic sign detector.
 *
 * Everything in this file works on plain pixel data (`{ data, width, height }`, the shape of a
 * canvas `ImageData`) and returns plain objects. Nothing here touches the DOM, so the whole
 * analysis can be unit tested with generated images.
 */

/**
 * Thresholds of the analysis. They are exported so that they can be tuned against real footage
 * later without editing the algorithm itself.
 */
export const DEFAULT_ANALYSIS_OPTIONS = {
  // A pixel counts as "sign red" when its hue is close to red and it is saturated and bright
  // enough. Austrian signs use a strong red (close to RAL 3020), but a windscreen, rain, and low
  // sun wash the colour out, so the bounds are deliberately generous.
  redHueDegrees: 20,
  redMinSaturation: 0.34,
  redMinValue: 0.16,

  // Blobs smaller than this share of the frame are ignored: they are too far away to be worth
  // announcing and are the main source of false positives.
  minBlobAreaRatio: 0.0006,

  // A sign is roughly as wide as it is tall. Anything clearly off is not a sign.
  minAspectRatio: 0.55,
  maxAspectRatio: 1.8,
};

/**
 * Converts one RGB pixel to the hue/saturation/value pieces the red test needs.
 *
 * @param {number} r - Red, 0-255
 * @param {number} g - Green, 0-255
 * @param {number} b - Blue, 0-255
 * @returns {{hue: number, saturation: number, value: number}} hue in degrees, rest 0-1
 */
export const rgbToHsv = (r, g, b) => {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;

  let hue = 0;
  if (delta !== 0) {
    if (max === r) {
      hue = 60 * (((g - b) / delta) % 6);
    } else if (max === g) {
      hue = 60 * ((b - r) / delta + 2);
    } else {
      hue = 60 * ((r - g) / delta + 4);
    }
  }
  if (hue < 0) {
    hue += 360;
  }

  return { hue, saturation: max === 0 ? 0 : delta / max, value: max / 255 };
};

/**
 * Whether a pixel has the red of a traffic sign.
 *
 * @param {number} r - Red, 0-255
 * @param {number} g - Green, 0-255
 * @param {number} b - Blue, 0-255
 * @param {Object} [options] - Analysis options, see DEFAULT_ANALYSIS_OPTIONS
 * @returns {boolean} true for sign red
 */
export const isSignRed = (r, g, b, options = DEFAULT_ANALYSIS_OPTIONS) => {
  const { hue, saturation, value } = rgbToHsv(r, g, b);
  const isRedHue = hue <= options.redHueDegrees || hue >= 360 - options.redHueDegrees;
  return isRedHue && saturation >= options.redMinSaturation && value >= options.redMinValue;
};

/**
 * Relative brightness of a pixel, 0 (black) to 1 (white).
 *
 * @param {number} r - Red, 0-255
 * @param {number} g - Green, 0-255
 * @param {number} b - Blue, 0-255
 * @returns {number} luminance between 0 and 1
 */
export const luminance = (r, g, b) => (0.299 * r + 0.587 * g + 0.114 * b) / 255;

/**
 * Marks every red pixel of the image.
 *
 * @param {Object} imageData - `{ data, width, height }`, RGBA like a canvas ImageData
 * @param {Object} [options] - Analysis options, see DEFAULT_ANALYSIS_OPTIONS
 * @returns {Uint8Array} one byte per pixel, 1 for red
 */
export const buildRedMask = (imageData, options = DEFAULT_ANALYSIS_OPTIONS) => {
  const { data, width, height } = imageData;
  const mask = new Uint8Array(width * height);

  for (let i = 0; i < mask.length; i++) {
    const offset = i * 4;
    if (isSignRed(data[offset], data[offset + 1], data[offset + 2], options)) {
      mask[i] = 1;
    }
  }
  return mask;
};

/**
 * Groups the marked pixels of a mask into connected areas ("blobs"), using 4-neighbourhood
 * flood fill. Every pixel is visited once, so this stays fast enough for a live camera frame.
 *
 * @param {Uint8Array} mask - One byte per pixel, 1 for a pixel that belongs to a blob
 * @param {number} width - Width of the mask
 * @param {number} height - Height of the mask
 * @param {number} [minArea] - Blobs with fewer pixels than this are dropped
 * @returns {Array<Object>} blobs with `{ x0, y0, x1, y1, width, height, area, extent }`
 */
export const findBlobs = (mask, width, height, minArea = 1) => {
  const visited = new Uint8Array(mask.length);
  const stack = new Int32Array(mask.length);
  const blobs = [];

  for (let start = 0; start < mask.length; start++) {
    if (mask[start] !== 1 || visited[start] === 1) {
      continue;
    }

    let stackSize = 0;
    stack[stackSize++] = start;
    visited[start] = 1;

    let area = 0;
    let x0 = width;
    let y0 = height;
    let x1 = -1;
    let y1 = -1;

    while (stackSize > 0) {
      const index = stack[--stackSize];
      const x = index % width;
      const y = (index - x) / width;

      area++;
      if (x < x0) x0 = x;
      if (y < y0) y0 = y;
      if (x > x1) x1 = x;
      if (y > y1) y1 = y;

      // Left, right, up, down.
      if (x > 0 && mask[index - 1] === 1 && visited[index - 1] === 0) {
        visited[index - 1] = 1;
        stack[stackSize++] = index - 1;
      }
      if (x < width - 1 && mask[index + 1] === 1 && visited[index + 1] === 0) {
        visited[index + 1] = 1;
        stack[stackSize++] = index + 1;
      }
      if (y > 0 && mask[index - width] === 1 && visited[index - width] === 0) {
        visited[index - width] = 1;
        stack[stackSize++] = index - width;
      }
      if (y < height - 1 && mask[index + width] === 1 && visited[index + width] === 0) {
        visited[index + width] = 1;
        stack[stackSize++] = index + width;
      }
    }

    if (area >= minArea) {
      const blobWidth = x1 - x0 + 1;
      const blobHeight = y1 - y0 + 1;
      blobs.push({
        x0,
        y0,
        x1,
        y1,
        width: blobWidth,
        height: blobHeight,
        area,
        // How much of the bounding box the blob fills. This is what tells a solid octagon
        // (fills roughly 80%) apart from a ring (fills roughly 45%).
        extent: area / (blobWidth * blobHeight),
      });
    }
  }

  return blobs;
};

/**
 * Share of masked pixels inside a rectangle.
 *
 * @param {Uint8Array} mask - One byte per pixel
 * @param {number} width - Width of the mask
 * @param {Object} rect - `{ x0, y0, x1, y1 }`, inclusive bounds
 * @returns {number} share between 0 and 1
 */
export const maskRatioInRect = (mask, width, rect) => {
  const { x0, y0, x1, y1 } = rect;
  let marked = 0;
  let total = 0;

  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      total++;
      if (mask[y * width + x] === 1) {
        marked++;
      }
    }
  }
  return total === 0 ? 0 : marked / total;
};

/**
 * Average brightness inside a rectangle.
 *
 * @param {Object} imageData - `{ data, width, height }`
 * @param {Object} rect - `{ x0, y0, x1, y1 }`, inclusive bounds
 * @returns {number} average luminance between 0 and 1
 */
export const meanLuminanceInRect = (imageData, rect) => {
  const { data, width } = imageData;
  const { x0, y0, x1, y1 } = rect;
  let sum = 0;
  let total = 0;

  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const offset = (y * width + x) * 4;
      sum += luminance(data[offset], data[offset + 1], data[offset + 2]);
      total++;
    }
  }
  return total === 0 ? 0 : sum / total;
};

/**
 * Shrinks a rectangle towards its centre by a share of its size. Used to look at the inside of a
 * sign without catching its border.
 *
 * @param {Object} rect - `{ x0, y0, x1, y1 }`, inclusive bounds
 * @param {number} inset - Share to cut off on every side, e.g. 0.2 for 20%
 * @returns {Object} the smaller rectangle
 */
export const insetRect = (rect, inset) => {
  const rectWidth = rect.x1 - rect.x0 + 1;
  const rectHeight = rect.y1 - rect.y0 + 1;
  const dx = Math.floor(rectWidth * inset);
  const dy = Math.floor(rectHeight * inset);

  // Both sides are clamped against the side that was already moved, so that a large inset shrinks
  // the rectangle down to a single pixel instead of turning it inside out. An inside out rectangle
  // would measure as empty rather than fail, and quietly break the classification.
  const x0 = Math.min(rect.x0 + dx, rect.x1);
  const y0 = Math.min(rect.y0 + dy, rect.y1);

  return {
    x0,
    y0,
    x1: Math.max(rect.x1 - dx, x0),
    y1: Math.max(rect.y1 - dy, y0),
  };
};

/**
 * Builds a mask for one rectangle of the image, using a free pixel test.
 *
 * The mask uses coordinates of the rectangle, not of the frame, so it can be handed to
 * `findBlobs` directly.
 *
 * @param {Object} imageData - `{ data, width, height }`
 * @param {Object} rect - `{ x0, y0, x1, y1 }`, inclusive bounds
 * @param {Function} predicate - Called with `(r, g, b)`, returns true for a pixel of the mask
 * @returns {{mask: Uint8Array, width: number, height: number}} the mask of the rectangle
 */
export const buildMaskInRect = (imageData, rect, predicate) => {
  const { data, width } = imageData;
  const rectWidth = rect.x1 - rect.x0 + 1;
  const rectHeight = rect.y1 - rect.y0 + 1;
  const mask = new Uint8Array(rectWidth * rectHeight);

  for (let y = 0; y < rectHeight; y++) {
    for (let x = 0; x < rectWidth; x++) {
      const offset = ((rect.y0 + y) * width + (rect.x0 + x)) * 4;
      if (predicate(data[offset], data[offset + 1], data[offset + 2])) {
        mask[y * rectWidth + x] = 1;
      }
    }
  }

  return { mask, width: rectWidth, height: rectHeight };
};

/**
 * Whether a blob touches the border of the area it was found in. The white disc of a speed limit
 * sign is fully enclosed by the red ring, so a blob that runs into the border is something else,
 * for example the sky next to the sign.
 *
 * @param {Object} blob - A blob from `findBlobs`
 * @param {number} width - Width of the area the blob was found in
 * @param {number} height - Height of the area the blob was found in
 * @returns {boolean} true if the blob reaches the border
 */
export const touchesBorder = (blob, width, height) =>
  blob.x0 === 0 || blob.y0 === 0 || blob.x1 === width - 1 || blob.y1 === height - 1;

/**
 * Moves a rectangle that is relative to an area back into frame coordinates.
 *
 * @param {Object} rect - `{ x0, y0, x1, y1 }` relative to the area
 * @param {Object} origin - `{ x0, y0 }` of the area within the frame
 * @returns {Object} the rectangle in frame coordinates
 */
export const translateRect = (rect, origin) => ({
  x0: rect.x0 + origin.x0,
  y0: rect.y0 + origin.y0,
  x1: rect.x1 + origin.x0,
  y1: rect.y1 + origin.y0,
});
