import {
  buildMaskInRect,
  buildRedMask,
  findBlobs,
  insetRect,
  isSignRed,
  luminance,
  maskRatioInRect,
  meanLuminanceInRect,
  rgbToHsv,
  touchesBorder,
  translateRect,
} from './imageAnalysis';
import { createImage, drawStopSign, paint } from './syntheticSigns';

/** Builds a mask by hand from drawn rows, so a test can state the shape it means. */
const maskFromArt = rows => {
  const width = rows[0].length;
  const mask = new Uint8Array(width * rows.length);
  rows.forEach((row, y) => {
    for (let x = 0; x < width; x++) {
      mask[y * width + x] = row[x] === '#' ? 1 : 0;
    }
  });
  return { mask, width, height: rows.length };
};

describe('rgbToHsv', () => {
  it('reports red at hue 0', () => {
    expect(rgbToHsv(255, 0, 0).hue).toEqual(0);
  });

  it('reports green and blue at their own hues', () => {
    expect(rgbToHsv(0, 255, 0).hue).toEqual(120);
    expect(rgbToHsv(0, 0, 255).hue).toEqual(240);
  });

  it('reports grey as unsaturated', () => {
    expect(rgbToHsv(128, 128, 128).saturation).toEqual(0);
  });

  it('reports black without dividing by zero', () => {
    expect(rgbToHsv(0, 0, 0)).toEqual({ hue: 0, saturation: 0, value: 0 });
  });
});

describe('isSignRed', () => {
  it('accepts the red of a traffic sign', () => {
    expect(isSignRed(200, 16, 18)).toBe(true);
  });

  it('accepts sign red in the shade', () => {
    expect(isSignRed(110, 14, 16)).toBe(true);
  });

  it('rejects white, grey and black', () => {
    expect(isSignRed(244, 244, 240)).toBe(false);
    expect(isSignRed(128, 128, 128)).toBe(false);
    expect(isSignRed(10, 10, 10)).toBe(false);
  });

  it('rejects the blue of a motorway sign and the green of a field', () => {
    expect(isSignRed(20, 60, 160)).toBe(false);
    expect(isSignRed(60, 140, 50)).toBe(false);
  });

  it('rejects a washed out pink', () => {
    expect(isSignRed(230, 190, 190)).toBe(false);
  });
});

describe('luminance', () => {
  it('runs from black to white', () => {
    expect(luminance(0, 0, 0)).toEqual(0);
    expect(luminance(255, 255, 255)).toEqual(1);
  });

  it('weighs green the most, as the eye does', () => {
    expect(luminance(0, 255, 0)).toBeGreaterThan(luminance(255, 0, 0));
    expect(luminance(255, 0, 0)).toBeGreaterThan(luminance(0, 0, 255));
  });
});

describe('findBlobs', () => {
  it('finds nothing in an empty mask', () => {
    const { mask, width, height } = maskFromArt(['....', '....']);

    expect(findBlobs(mask, width, height)).toEqual([]);
  });

  it('measures a solid square', () => {
    const { mask, width, height } = maskFromArt(['....', '.##.', '.##.', '....']);
    const [blob] = findBlobs(mask, width, height);

    expect(blob).toMatchObject({ x0: 1, y0: 1, x1: 2, y1: 2, area: 4, extent: 1 });
  });

  it('keeps two separate areas apart', () => {
    const { mask, width, height } = maskFromArt(['#..#', '#..#']);

    expect(findBlobs(mask, width, height)).toHaveLength(2);
  });

  it('joins pixels that touch on an edge, not only on a corner', () => {
    // A diagonal is two blobs under a 4-neighbourhood.
    const { mask, width, height } = maskFromArt(['#.', '.#']);

    expect(findBlobs(mask, width, height)).toHaveLength(2);
  });

  it('drops areas below the minimum size', () => {
    const { mask, width, height } = maskFromArt(['#..##', '...##']);

    expect(findBlobs(mask, width, height, 4)).toHaveLength(1);
  });

  it('gives a ring a much lower extent than a solid block', () => {
    const ring = maskFromArt(['####', '#..#', '#..#', '####']);
    const solid = maskFromArt(['####', '####', '####', '####']);

    const [ringBlob] = findBlobs(ring.mask, ring.width, ring.height);
    const [solidBlob] = findBlobs(solid.mask, solid.width, solid.height);

    expect(ringBlob.extent).toBeLessThan(0.8);
    expect(solidBlob.extent).toEqual(1);
  });

  it('measures a drawn octagon at the 83% a regular one fills', () => {
    const image = createImage(44, 44, [255, 255, 255]);
    drawStopSign(image, { centreX: 22, centreY: 22, size: 36 });
    const [blob] = findBlobs(buildRedMask(image), 44, 44, 20);

    // The white letters take a little off the 0.828 of a bare octagon.
    expect(blob.extent).toBeGreaterThan(0.7);
    expect(blob.extent).toBeLessThan(0.83);
  });
});

describe('buildRedMask', () => {
  it('marks only the red pixels', () => {
    const image = createImage(4, 1, [255, 255, 255]);
    paint(image, x => (x < 2 ? [200, 16, 18] : null));
    const mask = buildRedMask(image);

    expect(Array.from(mask)).toEqual([1, 1, 0, 0]);
  });
});

describe('maskRatioInRect and meanLuminanceInRect', () => {
  it('measures the share of a rectangle that is marked', () => {
    const { mask, width } = maskFromArt(['##..', '##..']);

    expect(maskRatioInRect(mask, width, { x0: 0, y0: 0, x1: 3, y1: 1 })).toEqual(0.5);
    expect(maskRatioInRect(mask, width, { x0: 0, y0: 0, x1: 1, y1: 1 })).toEqual(1);
  });

  it('measures the brightness of a rectangle', () => {
    const image = createImage(2, 2, [255, 255, 255]);

    expect(meanLuminanceInRect(image, { x0: 0, y0: 0, x1: 1, y1: 1 })).toEqual(1);
  });
});

describe('insetRect', () => {
  it('shrinks a rectangle towards its centre', () => {
    expect(insetRect({ x0: 0, y0: 0, x1: 9, y1: 9 }, 0.2)).toEqual({
      x0: 2,
      y0: 2,
      x1: 7,
      y1: 7,
    });
  });

  it('never turns a rectangle inside out', () => {
    const tiny = insetRect({ x0: 5, y0: 5, x1: 6, y1: 6 }, 0.9);

    expect(tiny.x0).toBeLessThanOrEqual(tiny.x1);
    expect(tiny.y0).toBeLessThanOrEqual(tiny.y1);
  });
});

describe('buildMaskInRect', () => {
  it('uses coordinates of the rectangle, not of the frame', () => {
    const image = createImage(10, 10, [0, 0, 0]);
    paint(image, (x, y) => (x >= 4 && x < 6 && y >= 4 && y < 6 ? [255, 255, 255] : null));

    const { mask, width, height } = buildMaskInRect(
      image,
      { x0: 4, y0: 4, x1: 5, y1: 5 },
      (r, g, b) => luminance(r, g, b) > 0.5
    );

    expect(width).toEqual(2);
    expect(height).toEqual(2);
    expect(Array.from(mask)).toEqual([1, 1, 1, 1]);
  });
});

describe('touchesBorder', () => {
  it('is true for a blob that runs into the edge', () => {
    expect(touchesBorder({ x0: 0, y0: 2, x1: 3, y1: 4 }, 10, 10)).toBe(true);
    expect(touchesBorder({ x0: 2, y0: 2, x1: 9, y1: 4 }, 10, 10)).toBe(true);
  });

  it('is false for a blob that is fully enclosed', () => {
    expect(touchesBorder({ x0: 1, y0: 1, x1: 8, y1: 8 }, 10, 10)).toBe(false);
  });
});

describe('translateRect', () => {
  it('moves a rectangle back into frame coordinates', () => {
    expect(translateRect({ x0: 1, y0: 2, x1: 3, y1: 4 }, { x0: 10, y0: 20 })).toEqual({
      x0: 11,
      y0: 22,
      x1: 13,
      y1: 24,
    });
  });
});
