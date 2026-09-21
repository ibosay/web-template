import {
  DIGIT_TEMPLATES,
  normalizeToTemplateGrid,
  TEMPLATE_HEIGHT,
  TEMPLATE_WIDTH,
} from './digitTemplates';
import { buildInkMask, matchDigit, readNumber } from './digitRecognition';
import { createImage, drawSpeedLimitSign, paint } from './syntheticSigns';

/** The inside of a speed limit sign drawn on its own, the way the detector hands it over. */
const discOf = limit => {
  const image = createImage(64, 64, [200, 16, 18]);
  drawSpeedLimitSign(image, { limit, centreX: 32, centreY: 32, diameter: 64 });
  // The disc of a 64 pixel sign reaches to 0.8 of its radius.
  return { image, rect: { x0: 7, y0: 7, x1: 56, y1: 56 } };
};

describe('matchDigit', () => {
  it.each(Object.keys(DIGIT_TEMPLATES).map(Number))(
    'recognises the template of %i itself',
    digit => {
      const match = matchDigit(DIGIT_TEMPLATES[digit]);

      expect(match.digit).toEqual(digit);
      expect(match.score).toEqual(1);
    }
  );

  it('gives every digit a clear lead over the next best one', () => {
    Object.keys(DIGIT_TEMPLATES).forEach(digit => {
      expect(matchDigit(DIGIT_TEMPLATES[digit]).margin).toBeGreaterThan(0.04);
    });
  });

  it('is unsure about an empty grid', () => {
    const empty = new Float32Array(TEMPLATE_WIDTH * TEMPLATE_HEIGHT);

    expect(matchDigit(empty).score).toBeLessThan(0.8);
  });
});

describe('normalizeToTemplateGrid', () => {
  it('scales a shape up onto the whole grid', () => {
    // A 2x2 block of ink fills the grid completely once it is stretched.
    const mask = new Uint8Array([1, 1, 1, 1]);
    const cells = normalizeToTemplateGrid(mask, 2, { x0: 0, y0: 0, x1: 1, y1: 1 });

    expect(Array.from(cells).every(cell => cell === 1)).toBe(true);
  });

  it('treats a narrow shape and a wide one alike', () => {
    // The same drawing, once 4 and once 12 pixels wide: road signs squeeze wide numbers, so the
    // comparison has to ignore how wide a digit is.
    const narrow = new Uint8Array(4 * 4).fill(0);
    const wide = new Uint8Array(12 * 4).fill(0);
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 2; x++) {
        narrow[y * 4 + x] = 1;
      }
      for (let x = 0; x < 6; x++) {
        wide[y * 12 + x] = 1;
      }
    }

    const a = normalizeToTemplateGrid(narrow, 4, { x0: 0, y0: 0, x1: 3, y1: 3 });
    const b = normalizeToTemplateGrid(wide, 12, { x0: 0, y0: 0, x1: 11, y1: 3 });

    expect(Array.from(a)).toEqual(Array.from(b));
  });
});

describe('buildInkMask', () => {
  it('leaves the red of the ring out of the ink', () => {
    // A red field with one black bar in it: only the bar is ink. Without leaving red out, the whole
    // field would be ink, because sign red is darker than the white of a disc.
    const image = createImage(20, 20, [200, 16, 18]);
    paint(image, (x, y) => (x >= 8 && x < 12 ? [20, 20, 20] : null));
    paint(image, (x, y) => (x < 4 ? [244, 244, 240] : null));

    const { ink, width } = buildInkMask(image, { x0: 0, y0: 0, x1: 19, y1: 19 });

    // The black bar is ink …
    expect(ink[10 * width + 9]).toEqual(1);
    // … the red field is not, and neither is the white.
    expect(ink[10 * width + 6]).toEqual(0);
    expect(ink[10 * width + 1]).toEqual(0);
  });

  it('finds no ink on a surface of one flat colour', () => {
    const image = createImage(20, 20, [244, 244, 240]);
    const { ink } = buildInkMask(image, { x0: 0, y0: 0, x1: 19, y1: 19 });

    expect(Array.from(ink).every(value => value === 0)).toBe(true);
  });
});

describe('readNumber', () => {
  it.each([5, 30, 50, 80, 100, 130])('reads %i off the disc of a sign', limit => {
    const { image, rect } = discOf(limit);
    const result = readNumber(image, rect);

    expect(result.value).toEqual(limit);
    expect(result.confidence).toBeGreaterThan(0.8);
    expect(result.digits).toHaveLength(String(limit).length);
  });

  it('reads nothing off a blank disc', () => {
    const image = createImage(64, 64, [244, 244, 240]);
    const result = readNumber(image, { x0: 7, y0: 7, x1: 56, y1: 56 });

    expect(result.value).toBeNull();
    expect(result.confidence).toEqual(0);
  });

  it('reads nothing off a region too small to hold a digit', () => {
    const { image } = discOf(50);

    expect(readNumber(image, { x0: 0, y0: 0, x1: 5, y1: 5 }).value).toBeNull();
  });

  it('refuses a number with more digits than a limit has', () => {
    const image = createImage(64, 64, [244, 244, 240]);
    drawSpeedLimitSign(image, { limit: 1234, centreX: 32, centreY: 32, diameter: 64 });

    expect(readNumber(image, { x0: 7, y0: 7, x1: 56, y1: 56 }).value).toBeNull();
  });
});
