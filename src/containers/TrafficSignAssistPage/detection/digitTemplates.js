/**
 * Reference shapes of the digits 0-9 as they appear on Austrian speed limit signs.
 *
 * Road signs use one narrow, very regular typeface (DIN 1451 style), which is what makes a
 * template comparison work at all: every "5" on every sign in the country has the same shape, so a
 * hand drawn reference is enough and no training data is needed.
 *
 * Every template is drawn on the same small grid. A recognised digit is scaled to that grid and
 * compared cell by cell, see `digitRecognition.js`.
 */

/** Width of the grid a digit is compared on. */
export const TEMPLATE_WIDTH = 10;

/** Height of the grid a digit is compared on. */
export const TEMPLATE_HEIGHT = 14;

// '#' is ink, '.' is background.
const TEMPLATE_ART = {
  0: [
    '..######..',
    '.##....##.',
    '##......##',
    '##......##',
    '##......##',
    '##......##',
    '##......##',
    '##......##',
    '##......##',
    '##......##',
    '##......##',
    '##......##',
    '.##....##.',
    '..######..',
  ],
  1: [
    '...####...',
    '.######...',
    '##..###...',
    '....###...',
    '....###...',
    '....###...',
    '....###...',
    '....###...',
    '....###...',
    '....###...',
    '....###...',
    '....###...',
    '....###...',
    '....###...',
  ],
  2: [
    '..######..',
    '.##....##.',
    '##......##',
    '##......##',
    '........##',
    '.......##.',
    '......##..',
    '.....##...',
    '....##....',
    '...##.....',
    '..##......',
    '.##.......',
    '##########',
    '##########',
  ],
  3: [
    '..######..',
    '.##....##.',
    '##......##',
    '........##',
    '.......##.',
    '....#####.',
    '....#####.',
    '.......##.',
    '........##',
    '##......##',
    '##......##',
    '##......##',
    '.##....##.',
    '..######..',
  ],
  4: [
    '......###.',
    '.....####.',
    '....##.##.',
    '...##..##.',
    '..##...##.',
    '.##....##.',
    '##.....##.',
    '##########',
    '##########',
    '.......##.',
    '.......##.',
    '.......##.',
    '.......##.',
    '.......##.',
  ],
  5: [
    '##########',
    '##########',
    '##........',
    '##........',
    '##........',
    '########..',
    '.##....##.',
    '........##',
    '........##',
    '........##',
    '##......##',
    '##......##',
    '.##....##.',
    '..######..',
  ],
  6: [
    '...#####..',
    '..##...##.',
    '.##.....##',
    '##........',
    '##........',
    '##.#####..',
    '###....##.',
    '##......##',
    '##......##',
    '##......##',
    '##......##',
    '##......##',
    '.##....##.',
    '..######..',
  ],
  7: [
    '##########',
    '##########',
    '.......##.',
    '......##..',
    '......##..',
    '.....##...',
    '.....##...',
    '....##....',
    '....##....',
    '...##.....',
    '...##.....',
    '..##......',
    '..##......',
    '.##.......',
  ],
  8: [
    '..######..',
    '.##....##.',
    '##......##',
    '##......##',
    '.##....##.',
    '..######..',
    '..######..',
    '.##....##.',
    '##......##',
    '##......##',
    '##......##',
    '##......##',
    '.##....##.',
    '..######..',
  ],
  9: [
    '..######..',
    '.##....##.',
    '##......##',
    '##......##',
    '##......##',
    '##......##',
    '.##....###',
    '..#####.##',
    '........##',
    '........##',
    '.......##.',
    '##.....##.',
    '.##...##..',
    '..#####...',
  ],
};

/**
 * Scales one region of a mask onto the reference grid. Every cell gets the share of ink of the
 * pixels it covers, so a thick stroke and a thin stroke of the same digit end up close together.
 *
 * Both the templates here and the digits cut out of a camera frame go through this same function,
 * which is what makes them comparable: each is stretched from its own tight ink box onto the same
 * grid. Stretching both axes throws the width of a digit away on purpose — road signs set wide
 * numbers such as "130" in a narrower typeface so that they still fit on the disc, and a
 * comparison that kept the width would reject exactly those.
 *
 * @param {Uint8Array|Float32Array} mask - Ink per pixel, 1 or 0
 * @param {number} maskWidth - Width of the mask
 * @param {Object} box - `{ x0, y0, x1, y1 }` of the ink, inclusive bounds
 * @returns {Float32Array} ink share per cell, TEMPLATE_WIDTH * TEMPLATE_HEIGHT entries
 */
export const normalizeToTemplateGrid = (mask, maskWidth, box) => {
  const boxWidth = box.x1 - box.x0 + 1;
  const boxHeight = box.y1 - box.y0 + 1;
  const cells = new Float32Array(TEMPLATE_WIDTH * TEMPLATE_HEIGHT);

  for (let cellY = 0; cellY < TEMPLATE_HEIGHT; cellY++) {
    const fromY = box.y0 + Math.floor((cellY * boxHeight) / TEMPLATE_HEIGHT);
    const toY = Math.max(
      fromY,
      box.y0 + Math.ceil(((cellY + 1) * boxHeight) / TEMPLATE_HEIGHT) - 1
    );

    for (let cellX = 0; cellX < TEMPLATE_WIDTH; cellX++) {
      const fromX = box.x0 + Math.floor((cellX * boxWidth) / TEMPLATE_WIDTH);
      const toX = Math.max(
        fromX,
        box.x0 + Math.ceil(((cellX + 1) * boxWidth) / TEMPLATE_WIDTH) - 1
      );

      let inked = 0;
      let total = 0;
      for (let y = fromY; y <= toY; y++) {
        for (let x = fromX; x <= toX; x++) {
          total++;
          if (mask[y * maskWidth + x] === 1) {
            inked++;
          }
        }
      }
      cells[cellY * TEMPLATE_WIDTH + cellX] = total === 0 ? 0 : inked / total;
    }
  }

  return cells;
};

/**
 * Smallest rectangle that holds every inked pixel of a mask.
 *
 * @param {Uint8Array} mask - Ink per pixel
 * @param {number} width - Width of the mask
 * @param {number} height - Height of the mask
 * @returns {Object|null} `{ x0, y0, x1, y1 }`, or null if there is no ink
 */
const inkBounds = (mask, width, height) => {
  let x0 = width;
  let y0 = height;
  let x1 = -1;
  let y1 = -1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (mask[y * width + x] === 1) {
        if (x < x0) x0 = x;
        if (y < y0) y0 = y;
        if (x > x1) x1 = x;
        if (y > y1) y1 = y;
      }
    }
  }

  return x1 < 0 ? null : { x0, y0, x1, y1 };
};

/**
 * Turns the drawn templates into the grids the comparison works on. Every template is normalised
 * from its own ink box, the same way a digit from a camera frame is.
 *
 * @returns {Object} digit (as a number) to a Float32Array of TEMPLATE_WIDTH * TEMPLATE_HEIGHT
 */
const buildTemplates = () => {
  const templates = {};

  Object.keys(TEMPLATE_ART).forEach(digit => {
    const rows = TEMPLATE_ART[digit];
    const art = new Uint8Array(TEMPLATE_WIDTH * TEMPLATE_HEIGHT);

    for (let y = 0; y < TEMPLATE_HEIGHT; y++) {
      for (let x = 0; x < TEMPLATE_WIDTH; x++) {
        art[y * TEMPLATE_WIDTH + x] = rows[y][x] === '#' ? 1 : 0;
      }
    }

    const bounds = inkBounds(art, TEMPLATE_WIDTH, TEMPLATE_HEIGHT);
    templates[Number(digit)] = normalizeToTemplateGrid(art, TEMPLATE_WIDTH, bounds);
  });

  return templates;
};

/** Digit (0-9) to its reference grid. */
export const DIGIT_TEMPLATES = buildTemplates();
