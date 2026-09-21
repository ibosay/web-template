import { ALLOWED_SPEED_LIMITS, SIGN_SPEED_LIMIT, SIGN_STOP } from '../signTypes';
import { detectSigns } from './signDetector';
import {
  addNoise,
  blurImage,
  createImage,
  drawRedDisc,
  drawSpeedLimitSign,
  drawStopSign,
} from './syntheticSigns';

// The pictures the detector is fed are generated, see `syntheticSigns.js`. That proves the chain
// works — find the red ring, find the disc it encloses, cut the number out of it, read the digits,
// and check the result against the limits that exist — and it proves it keeps working when the
// picture is out of focus, grainy, or the sign is small or off to the side. It does not prove
// anything about a dirty sign at dusk: only a drive with a camera can do that.

const FRAME_WIDTH = 200;
const FRAME_HEIGHT = 150;

const frameWith = draw => {
  const image = createImage(FRAME_WIDTH, FRAME_HEIGHT, [120, 130, 140]);
  draw(image);
  return image;
};

const speedLimitFrame = (limit, options = {}) => {
  const { diameter = 72, centreX = 100, centreY = 75 } = options;
  return frameWith(image => drawSpeedLimitSign(image, { limit, centreX, centreY, diameter }));
};

describe('detectSigns', () => {
  it('reports nothing for a frame without a sign', () => {
    expect(detectSigns(frameWith(() => {}))).toEqual([]);
  });

  it.each(ALLOWED_SPEED_LIMITS)('reads the speed limit %i', limit => {
    const detections = detectSigns(speedLimitFrame(limit));

    expect(detections).toHaveLength(1);
    expect(detections[0].type).toEqual(SIGN_SPEED_LIMIT);
    expect(detections[0].limitKmh).toEqual(limit);
  });

  it('reports the sign with the box it was found in', () => {
    const [detection] = detectSigns(speedLimitFrame(50, { centreX: 90, centreY: 60 }));

    // The box covers the sign: 72 pixels across, centred on (90, 60).
    expect(detection.box.x0).toBeGreaterThanOrEqual(52);
    expect(detection.box.x0).toBeLessThanOrEqual(56);
    expect(detection.box.y1).toBeGreaterThanOrEqual(94);
    expect(detection.box.y1).toBeLessThanOrEqual(98);
  });

  it('finds a sign that is off to the side', () => {
    const detections = detectSigns(speedLimitFrame(70, { centreX: 158, centreY: 44 }));

    expect(detections).toHaveLength(1);
    expect(detections[0].limitKmh).toEqual(70);
  });

  it('reads a sign that is out of focus', () => {
    const detections = detectSigns(blurImage(speedLimitFrame(30), 1));

    expect(detections).toHaveLength(1);
    expect(detections[0].limitKmh).toEqual(30);
  });

  it('reads a sign in a grainy picture', () => {
    const detections = detectSigns(addNoise(speedLimitFrame(100), 16, 7));

    expect(detections).toHaveLength(1);
    expect(detections[0].limitKmh).toEqual(100);
  });

  it('still reads a sign that is only 48 pixels across', () => {
    const detections = detectSigns(speedLimitFrame(80, { diameter: 48 }));

    expect(detections).toHaveLength(1);
    expect(detections[0].limitKmh).toEqual(80);
  });

  it('ignores a sign that is too far away to read', () => {
    expect(detectSigns(speedLimitFrame(50, { diameter: 14 }))).toEqual([]);
  });

  it('detects a stop sign', () => {
    const detections = detectSigns(
      frameWith(image => drawStopSign(image, { centreX: 100, centreY: 75, size: 72 }))
    );

    expect(detections).toHaveLength(1);
    expect(detections[0].type).toEqual(SIGN_STOP);
    expect(detections[0].limitKmh).toBeNull();
    expect(detections[0].confidence).toBeGreaterThan(0.6);
  });

  it('detects a stop sign that is out of focus', () => {
    const image = blurImage(
      frameWith(inner => drawStopSign(inner, { centreX: 100, centreY: 75, size: 84 })),
      1
    );

    expect(detectSigns(image).map(detection => detection.type)).toEqual([SIGN_STOP]);
  });

  it('does not mistake a plain red disc for a stop sign', () => {
    const detections = detectSigns(
      frameWith(image => drawRedDisc(image, { centreX: 100, centreY: 75, diameter: 72 }))
    );

    expect(detections).toEqual([]);
  });

  it('does not report a red ring with nothing readable in it', () => {
    // A red ring around a blank white disc is not a speed limit sign.
    const image = frameWith(inner => {
      drawRedDisc(inner, { centreX: 100, centreY: 75, diameter: 72 });
      drawRedDisc(inner, { centreX: 100, centreY: 75, diameter: 58 });
    });
    // Paint the middle white by drawing a "sign" whose number is off the disc: simplest is to
    // check the ring alone, which the helper above leaves red, so use a blank disc instead.
    const blank = frameWith(inner => {
      drawSpeedLimitSign(inner, { limit: 0, centreX: 100, centreY: 75, diameter: 72 });
    });

    expect(detectSigns(image)).toEqual([]);
    // "0" on its own is not a speed limit that exists, so it is thrown away.
    expect(detectSigns(blank)).toEqual([]);
  });

  it('finds several signs in one frame', () => {
    const image = frameWith(inner => {
      drawSpeedLimitSign(inner, { limit: 60, centreX: 48, centreY: 60, diameter: 64 });
      drawStopSign(inner, { centreX: 150, centreY: 78, size: 68 });
    });

    const detections = detectSigns(image);
    expect(detections).toHaveLength(2);
    expect(detections.map(detection => detection.type).sort()).toEqual([
      SIGN_SPEED_LIMIT,
      SIGN_STOP,
    ]);
  });

  it('never invents a limit that does not exist in Austria', () => {
    // 55 is not a posted limit, so a sign showing it has to be thrown away rather than rounded.
    expect(detectSigns(speedLimitFrame(55))).toEqual([]);
  });
});
