/**
 * Draws traffic signs into plain pixel buffers.
 *
 * The tests of the detector need pictures of signs. Generating them keeps the test suite free of
 * binary fixtures and lets every test state exactly what it shows: a 50 sign, 40 pixels wide, out
 * of focus, against a grey sky.
 *
 * The geometry follows the Austrian StVO: a speed limit sign is a disc whose red ring is a tenth
 * of the diameter wide, with a number about half as tall as the sign; a stop sign is a regular
 * octagon with white letters.
 */

import { DIGIT_TEMPLATES, TEMPLATE_HEIGHT, TEMPLATE_WIDTH } from './digitTemplates';

const SIGN_RED = [200, 16, 18];
const SIGN_WHITE = [244, 244, 240];
const SIGN_BLACK = [26, 26, 26];

/** How much of the radius of a speed limit sign is white disc, the rest is the red ring. */
const DISC_RATIO = 0.8;

/** Height of the number, as a share of the diameter of the sign. */
const DIGIT_HEIGHT_RATIO = 0.52;

/** How much of the white disc the number may take up sideways. */
const NUMBER_MAX_WIDTH_RATIO = 0.86;

/**
 * Creates an image filled with one colour.
 *
 * @param {number} width - Width in pixels
 * @param {number} height - Height in pixels
 * @param {Array<number>} [background] - `[r, g, b]`
 * @returns {{data: Uint8ClampedArray, width: number, height: number}} the image
 */
export const createImage = (width, height, background = [130, 140, 150]) => {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = background[0];
    data[i * 4 + 1] = background[1];
    data[i * 4 + 2] = background[2];
    data[i * 4 + 3] = 255;
  }
  return { data, width, height };
};

/**
 * Draws a shape into an image, with 3x3 subpixel sampling so that edges come out smooth. A real
 * camera never delivers hard edges, and a detector that only works on hard ones would be useless.
 *
 * @param {Object} image - The image to draw into
 * @param {Function} colourAt - Called with `(x, y)`, returns `[r, g, b]` or null for transparent
 */
export const paint = (image, colourAt) => {
  const { data, width, height } = image;
  const samples = 3;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let covered = 0;

      for (let sy = 0; sy < samples; sy++) {
        for (let sx = 0; sx < samples; sx++) {
          const colour = colourAt(x + (sx + 0.5) / samples, y + (sy + 0.5) / samples);
          if (colour) {
            r += colour[0];
            g += colour[1];
            b += colour[2];
            covered++;
          }
        }
      }

      if (covered > 0) {
        const total = samples * samples;
        const alpha = covered / total;
        const offset = (y * width + x) * 4;
        data[offset] = (r / covered) * alpha + data[offset] * (1 - alpha);
        data[offset + 1] = (g / covered) * alpha + data[offset + 1] * (1 - alpha);
        data[offset + 2] = (b / covered) * alpha + data[offset + 2] * (1 - alpha);
      }
    }
  }
};

/**
 * Lays the digits of a number out inside the white disc.
 *
 * @param {number} value - The number on the sign
 * @param {number} centreX - Centre of the sign
 * @param {number} centreY - Centre of the sign
 * @param {number} diameter - Diameter of the sign
 * @returns {Array<Object>} one box per digit, `{ digit, x0, y0, width, height }`
 */
const layOutNumber = (value, centreX, centreY, diameter) => {
  const digits = String(value)
    .split('')
    .map(Number);
  const digitHeight = diameter * DIGIT_HEIGHT_RATIO;
  const gap = digitHeight * 0.08;

  // Wide numbers are set narrower so that they still fit on the disc, exactly as they are on a
  // real sign.
  const naturalWidth = digitHeight * (TEMPLATE_WIDTH / TEMPLATE_HEIGHT);
  const maxWidth = diameter * DISC_RATIO * NUMBER_MAX_WIDTH_RATIO;
  const naturalTotal = digits.length * naturalWidth + (digits.length - 1) * gap;
  const squeeze = naturalTotal > maxWidth ? maxWidth / naturalTotal : 1;

  const digitWidth = naturalWidth * squeeze;
  const totalWidth = digits.length * digitWidth + (digits.length - 1) * gap * squeeze;
  let cursorX = centreX - totalWidth / 2;

  return digits.map(digit => {
    const box = {
      digit,
      x0: cursorX,
      y0: centreY - digitHeight / 2,
      width: digitWidth,
      height: digitHeight,
    };
    cursorX += digitWidth + gap * squeeze;
    return box;
  });
};

/**
 * Whether a point falls on the ink of a laid out number.
 *
 * @param {Array<Object>} boxes - Digit boxes from `layOutNumber`
 * @param {number} x - Point to test
 * @param {number} y - Point to test
 * @returns {boolean} true if the point is on a stroke of a digit
 */
const isNumberInk = (boxes, x, y) => {
  for (let i = 0; i < boxes.length; i++) {
    const box = boxes[i];
    if (x < box.x0 || x >= box.x0 + box.width || y < box.y0 || y >= box.y0 + box.height) {
      continue;
    }
    const cellX = Math.min(
      TEMPLATE_WIDTH - 1,
      Math.floor(((x - box.x0) / box.width) * TEMPLATE_WIDTH)
    );
    const cellY = Math.min(
      TEMPLATE_HEIGHT - 1,
      Math.floor(((y - box.y0) / box.height) * TEMPLATE_HEIGHT)
    );
    if (DIGIT_TEMPLATES[box.digit][cellY * TEMPLATE_WIDTH + cellX] === 1) {
      return true;
    }
  }
  return false;
};

/**
 * Draws an Austrian speed limit sign.
 *
 * @param {Object} image - The image to draw into
 * @param {Object} params
 * @param {number} params.limit - The number on the sign
 * @param {number} params.centreX - Centre of the sign
 * @param {number} params.centreY - Centre of the sign
 * @param {number} params.diameter - Diameter of the sign
 * @returns {Object} the image, so that calls can be chained
 */
export const drawSpeedLimitSign = (image, { limit, centreX, centreY, diameter }) => {
  const radius = diameter / 2;
  const discRadius = radius * DISC_RATIO;
  const boxes = layOutNumber(limit, centreX, centreY, diameter);

  paint(image, (x, y) => {
    const distance = Math.hypot(x - centreX, y - centreY);
    if (distance > radius) {
      return null;
    }
    if (distance > discRadius) {
      return SIGN_RED;
    }
    return isNumberInk(boxes, x, y) ? SIGN_BLACK : SIGN_WHITE;
  });

  return image;
};

/**
 * Draws a stop sign: a regular octagon with white letters on it.
 *
 * A regular octagon fits the square around it exactly when the corners are cut at `|u| + |v| > √2`
 * in coordinates that run from -1 to 1, which is what gives it its typical 83% fill.
 *
 * @param {Object} image - The image to draw into
 * @param {Object} params
 * @param {number} params.centreX - Centre of the sign
 * @param {number} params.centreY - Centre of the sign
 * @param {number} params.size - Width and height of the sign
 * @returns {Object} the image, so that calls can be chained
 */
export const drawStopSign = (image, { centreX, centreY, size }) => {
  const half = size / 2;

  // Four white blocks standing in for the letters S, T, O and P.
  const letterWidth = size * 0.07;
  const letterHeight = size * 0.25;
  const letterGap = size * 0.06;
  const lettersWidth = 4 * letterWidth + 3 * letterGap;
  const lettersLeft = centreX - lettersWidth / 2;
  const lettersTop = centreY - letterHeight / 2;

  const isLetter = (x, y) => {
    if (y < lettersTop || y >= lettersTop + letterHeight) {
      return false;
    }
    const offset = x - lettersLeft;
    if (offset < 0 || offset >= lettersWidth) {
      return false;
    }
    return offset % (letterWidth + letterGap) < letterWidth;
  };

  paint(image, (x, y) => {
    const u = (x - centreX) / half;
    const v = (y - centreY) / half;
    if (Math.abs(u) > 1 || Math.abs(v) > 1 || Math.abs(u) + Math.abs(v) > Math.SQRT2) {
      return null;
    }
    return isLetter(x, y) ? SIGN_WHITE : SIGN_RED;
  });

  return image;
};

/**
 * Blurs an image with a box blur, standing in for a sign that the camera did not focus on.
 *
 * @param {Object} image - The image to blur
 * @param {number} [radius] - Blur radius in pixels
 * @returns {Object} a new, blurred image
 */
export const blurImage = (image, radius = 1) => {
  const { data, width, height } = image;
  const output = new Uint8ClampedArray(data.length);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let count = 0;

      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const sampleX = x + dx;
          const sampleY = y + dy;
          if (sampleX < 0 || sampleY < 0 || sampleX >= width || sampleY >= height) {
            continue;
          }
          const offset = (sampleY * width + sampleX) * 4;
          r += data[offset];
          g += data[offset + 1];
          b += data[offset + 2];
          count++;
        }
      }

      const offset = (y * width + x) * 4;
      output[offset] = r / count;
      output[offset + 1] = g / count;
      output[offset + 2] = b / count;
      output[offset + 3] = 255;
    }
  }

  return { data: output, width, height };
};

/**
 * Adds repeatable noise, standing in for a grainy picture in poor light.
 *
 * @param {Object} image - The image to add noise to
 * @param {number} [amount] - Largest change per channel, 0-255
 * @param {number} [seed] - Seed, so that a test always gets the same noise
 * @returns {Object} a new, noisy image
 */
export const addNoise = (image, amount = 12, seed = 1) => {
  const output = new Uint8ClampedArray(image.data);
  let state = seed;

  for (let i = 0; i < output.length; i += 4) {
    // A small deterministic generator: tests must not depend on Math.random.
    state = (state * 1664525 + 1013904223) % 4294967296;
    const offset = ((state / 4294967296) * 2 - 1) * amount;
    output[i] += offset;
    output[i + 1] += offset;
    output[i + 2] += offset;
  }

  return { data: output, width: image.width, height: image.height };
};

/**
 * Draws a plain red disc: something red and round that is not a sign, such as a ball or a painted
 * panel. Used to check that the detector does not report it.
 *
 * @param {Object} image - The image to draw into
 * @param {Object} params
 * @param {number} params.centreX - Centre of the disc
 * @param {number} params.centreY - Centre of the disc
 * @param {number} params.diameter - Diameter of the disc
 * @returns {Object} the image, so that calls can be chained
 */
export const drawRedDisc = (image, { centreX, centreY, diameter }) => {
  const radius = diameter / 2;
  paint(image, (x, y) => (Math.hypot(x - centreX, y - centreY) <= radius ? SIGN_RED : null));
  return image;
};
