/**
 * Pixel data and helpers for the PixelSword component.
 *
 * The sprite is stored as rows of single-character color keys, which keeps the
 * art readable and easy to tweak by hand. Both the sword and the fire around it
 * are rendered as 1x1 rects on the same pixel grid, so everything stays aligned
 * on whole pixels at any scale.
 */

// Size of the pixel grid that holds the sword and the flames around it.
export const CANVAS_WIDTH = 26;
export const CANVAS_HEIGHT = 46;

// Top-left corner of the sword sprite within the canvas. The sprite is pushed
// down to leave room for the flames that rise above the blade tip.
export const SWORD_X = 3;
export const SWORD_Y = 8;

// Color key -> color. Keys are used in the SWORD_PIXELS rows below.
export const SWORD_COLORS = {
  l: '#eaf4ff', // blade highlight (left edge)
  b: '#a8bdd4', // blade steel
  d: '#74899f', // fuller, the groove along the middle of the blade
  D: '#4c5f76', // blade shadow (right edge)
  g: '#e0a233', // guard and pommel, gold
  G: '#9c5f1c', // guard and pommel, dark gold
  h: '#7a4622', // grip leather
  H: '#4c2a14', // grip leather, dark wrap
  e: '#ff7a1a', // ember set in the pommel
};

// The sword sprite: 20 x 36 pixels, tip up. A dot marks a transparent pixel.
export const SWORD_PIXELS = [
  '.........l..........',
  '.........lD.........',
  '........lbD.........',
  '........lbdD........',
  '........lbdD........',
  '........lbdD........',
  '........lbdD........',
  '........lbdD........',
  '........lbdD........',
  '........lbdD........',
  '........lbdD........',
  '........lbdD........',
  '........lbdD........',
  '........lbdD........',
  '........lbdD........',
  '........lbdD........',
  '........lbdD........',
  '........lbdD........',
  '........lbdD........',
  '........lbdD........',
  '........lbdD........',
  '........lbdD........',
  '........lbdD........',
  '........lbdD........',
  '........lbdD........',
  '........lbdD........',
  '....GggggggggggG....',
  '.......GggggG.......',
  '........HhhH........',
  '........HHHH........',
  '........HhhH........',
  '........HHHH........',
  '........HhhH........',
  '......GggeeggG......',
  '.......GggggG.......',
  '........GGGG........',
];

// Blade pixels get an extra overlay that makes the steel glow with the fire.
const BLADE_KEYS = ['l', 'b', 'd', 'D'];

// Color the blade takes on from the heat of the flames.
export const EMBER_COLOR = '#ff6a1a';

// Flame palette, from the cool tips down to the white-hot core.
export const FLAME_COLORS = {
  f1: '#ff2d00',
  f2: '#ff7a10',
  f3: '#ffc21e',
  f4: '#fff0a8',
};

// The flames are drawn as one tongue per column, starting at the guard and
// rising along the blade. The columns in the middle are hidden behind the
// blade, so what shows is the fire licking up both edges and the plume that
// shoots past the tip.
const FLAME_X_START = 9;
const FLAME_BASE_Y = SWORD_Y + 26; // the guard row of the sprite
const FLAME_MAX_HEIGHT = 32;

/**
 * Relative height (0-1) of each flame tongue, one array per animation frame.
 * The columns over the blade burn highest, the outermost ones stay low, and
 * the peaks shift from frame to frame to make the fire flicker.
 */
export const FLAME_FRAMES = [
  [0.24, 0.52, 0.88, 1.0, 0.94, 0.86, 0.46, 0.22],
  [0.32, 0.42, 0.96, 0.9, 1.0, 0.72, 0.38, 0.28],
  [0.2, 0.58, 0.78, 0.98, 0.88, 0.94, 0.52, 0.18],
  [0.28, 0.48, 0.9, 0.94, 1.0, 0.8, 0.42, 0.26],
];

// Embers that break loose above the flames, one set per animation frame.
const SPARK_FRAMES = [
  [[12, 2], [16, 8], [10, 14]],
  [[14, 1], [11, 6], [17, 12]],
  [[16, 3], [12, 9], [10, 16]],
  [[13, 2], [17, 7], [10, 11]],
];

/**
 * Pick a flame color for a pixel, based on how far it is from the tip of its
 * tongue: tips are deep red and the base is white-hot.
 *
 * @param {number} distanceFromTip 0 at the tip of the tongue, 1 at the base
 * @returns {string} key of FLAME_COLORS
 */
const flameColorKey = distanceFromTip => {
  if (distanceFromTip < 0.22) {
    return 'f1';
  } else if (distanceFromTip < 0.5) {
    return 'f2';
  } else if (distanceFromTip < 0.78) {
    return 'f3';
  }
  return 'f4';
};

/**
 * Turn the sprite rows into drawable pixels, positioned on the canvas.
 *
 * @returns {Array<{x: number, y: number, color: string, isBlade: boolean}>} sword pixels
 */
export const getSwordPixels = () => {
  return SWORD_PIXELS.reduce((pixels, row, rowIndex) => {
    const rowPixels = row.split('').reduce((result, key, columnIndex) => {
      const color = SWORD_COLORS[key];
      return color
        ? [
            ...result,
            {
              x: SWORD_X + columnIndex,
              y: SWORD_Y + rowIndex,
              color,
              isBlade: BLADE_KEYS.includes(key),
            },
          ]
        : result;
    }, []);
    return [...pixels, ...rowPixels];
  }, []);
};

/**
 * Build the flame pixels of a single animation frame: one tongue per column
 * plus the embers that float above them.
 *
 * @param {number} frameIndex index of the frame in FLAME_FRAMES
 * @returns {Array<{x: number, y: number, color: string}>} flame pixels
 */
export const getFlamePixels = frameIndex => {
  const frame = FLAME_FRAMES[frameIndex] || [];
  const tongues = frame.reduce((pixels, relativeHeight, columnIndex) => {
    const height = Math.round(relativeHeight * FLAME_MAX_HEIGHT);
    const x = FLAME_X_START + columnIndex;
    const columnPixels = Array.from({ length: height }, (_, i) => ({
      x,
      y: FLAME_BASE_Y - height + i,
      color: FLAME_COLORS[flameColorKey(height > 1 ? i / (height - 1) : 1)],
    }));
    return [...pixels, ...columnPixels];
  }, []);

  // Only the embers that float free of the flames are drawn. The rest are
  // swallowed by a tongue that has grown past them in this frame.
  const burning = new Set(tongues.map(({ x, y }) => `${x}-${y}`));
  const sparks = (SPARK_FRAMES[frameIndex] || [])
    .filter(([x, y]) => !burning.has(`${x}-${y}`))
    .map(([x, y]) => ({ x, y, color: FLAME_COLORS.f2 }));

  return [...tongues, ...sparks];
};
