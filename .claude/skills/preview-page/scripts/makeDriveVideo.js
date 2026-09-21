/**
 * Renders a short drive as a Y4M video, which Chromium can play through its fake camera.
 *
 * The signs are drawn by the app's own generator (detection/syntheticSigns.js), so what the
 * detector sees here has the geometry it was built against: a speed limit whose red ring is a
 * tenth of the diameter wide, and a regular octagon with white letters.
 */
// babel-preset-react-app refuses to run without this, and says so unhelpfully.
process.env.NODE_ENV = process.env.NODE_ENV || 'development';

const fs = require('fs');
const path = require('path');
const babel = require('@babel/core');

const { REPO, VIDEO_FILE, WORK_DIR } = require('./paths');

// The app's sources are ES modules. Loading them through babel keeps this script free of a copy
// of the drawing code. Relative imports resolve against the importing file, not against this one,
// so each module is handed its own `require`.
const cache = new Map();

const loadModule = absolutePath => {
  const filename = require.resolve(absolutePath);
  if (cache.has(filename)) {
    return cache.get(filename);
  }

  const { code } = babel.transformFileSync(filename, {
    presets: [path.join(REPO, 'config/babel-preset-react-app')],
    configFile: false,
    babelrc: false,
  });

  const module = { exports: {} };
  cache.set(filename, module.exports);
  const localRequire = request =>
    request.startsWith('.')
      ? loadModule(path.resolve(path.dirname(filename), request))
      : require(request);

  new Function('module', 'exports', 'require', code)(module, module.exports, localRequire);
  cache.set(filename, module.exports);
  return module.exports;
};

const { createImage, drawSpeedLimitSign, drawStopSign, paint } = loadModule(
  path.join(REPO, 'src/containers/TrafficSignAssistPage/detection/syntheticSigns.js')
);

const WIDTH = 640;
const HEIGHT = 480;
const FPS = 10;

/** Sky, a treeline and asphalt. Nothing red in it, so every red area is a sign. */
const drawScene = image => {
  paint(image, (x, y) => {
    if (y < HEIGHT * 0.42) {
      const t = y / (HEIGHT * 0.42);
      return [150 - 40 * t, 175 - 30 * t, 205 - 20 * t];
    }
    if (y < HEIGHT * 0.5) {
      return [70, 92, 58];
    }
    const t = (y - HEIGHT * 0.5) / (HEIGHT * 0.5);
    return [96 + 26 * t, 96 + 26 * t, 98 + 26 * t];
  });
  paint(image, (x, y) =>
    y > HEIGHT * 0.52 && Math.abs(x - WIDTH / 2) < 4 + (y - HEIGHT * 0.5) * 0.05 && y % 40 < 24
      ? [226, 226, 214]
      : null
  );
};

const clamp = value => Math.max(0, Math.min(255, value));

const rgbaToI420 = image => {
  const { data } = image;
  const luma = Buffer.alloc(WIDTH * HEIGHT);
  const blueDiff = Buffer.alloc((WIDTH / 2) * (HEIGHT / 2));
  const redDiff = Buffer.alloc((WIDTH / 2) * (HEIGHT / 2));

  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const o = (y * WIDTH + x) * 4;
      luma[y * WIDTH + x] = clamp(0.299 * data[o] + 0.587 * data[o + 1] + 0.114 * data[o + 2]);
    }
  }
  // Colour is stored at half resolution, averaged over each 2x2 block.
  for (let y = 0; y < HEIGHT / 2; y++) {
    for (let x = 0; x < WIDTH / 2; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (let dy = 0; dy < 2; dy++) {
        for (let dx = 0; dx < 2; dx++) {
          const o = ((y * 2 + dy) * WIDTH + (x * 2 + dx)) * 4;
          r += data[o];
          g += data[o + 1];
          b += data[o + 2];
        }
      }
      r /= 4;
      g /= 4;
      b /= 4;
      const i = y * (WIDTH / 2) + x;
      blueDiff[i] = clamp(-0.169 * r - 0.331 * g + 0.5 * b + 128);
      redDiff[i] = clamp(0.5 * r - 0.419 * g - 0.081 * b + 128);
    }
  }
  return Buffer.concat([luma, blueDiff, redDiff]);
};

// A 50 sign comes closer, then a stop sign does, both growing the way a sign grows when you drive
// towards it. Chromium loops the file, so this repeats for as long as the page is open.
const SEGMENTS = [
  { kind: 'speedLimit', limit: 50, frames: 26 },
  { kind: 'none', frames: 6 },
  { kind: 'stop', frames: 26 },
  { kind: 'none', frames: 6 },
];

const parts = [Buffer.from(`YUV4MPEG2 W${WIDTH} H${HEIGHT} F${FPS}:1 Ip A1:1 C420mpeg2\n`)];
let frameCount = 0;

SEGMENTS.forEach(segment => {
  for (let i = 0; i < segment.frames; i++) {
    const image = createImage(WIDTH, HEIGHT, [0, 0, 0]);
    drawScene(image);

    if (segment.kind !== 'none') {
      const t = i / segment.frames;
      const size = Math.round(46 + t * 104);
      const centreX = Math.round(WIDTH * 0.7 + t * WIDTH * 0.12);
      const centreY = Math.round(HEIGHT * 0.38 - t * HEIGHT * 0.04);

      if (segment.kind === 'speedLimit') {
        drawSpeedLimitSign(image, { limit: segment.limit, centreX, centreY, diameter: size });
      } else {
        drawStopSign(image, { centreX, centreY, size });
      }
    }

    parts.push(Buffer.from('FRAME\n'), rgbaToI420(image));
    frameCount++;
  }
});

fs.mkdirSync(WORK_DIR, { recursive: true });
fs.writeFileSync(VIDEO_FILE, Buffer.concat(parts));
console.log(
  `${frameCount} frames -> ${VIDEO_FILE} (${(fs.statSync(VIDEO_FILE).size / 1e6).toFixed(1)} MB)`
);
