/**
 * Draws the app icons.
 *
 * The icon is a speed limit sign, drawn by the app's own generator, so the thing on the home
 * screen and the thing the detector was built against are the same drawing. PNG is written here
 * rather than pulled in as a dependency: with zlib in Node it is a header, one deflated block and
 * a checksum, and the checksum already exists in the app as part of the ZIP export.
 */
process.env.NODE_ENV = process.env.NODE_ENV || 'development';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const babel = require('@babel/core');

const REPO = path.resolve(__dirname, '..');
const OUT_DIR = path.join(__dirname, 'icons');

// The app's sources are ES modules; load them through babel so this plain script can use them.
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

const SIGNS = path.join(REPO, 'src/containers/TrafficSignAssistPage/detection/syntheticSigns.js');
const ZIP = path.join(REPO, 'src/containers/TrafficSignAssistPage/recording/zipArchive.js');

const { createImage, drawSpeedLimitSign } = loadModule(SIGNS);
const { crc32 } = loadModule(ZIP);

/** One PNG chunk: length, type, data, checksum. */
const pngChunk = (type, data) => {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);

  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(typeAndData), 0);

  return Buffer.concat([length, typeAndData, checksum]);
};

/**
 * Encodes RGBA pixels as a PNG.
 *
 * @param {Uint8ClampedArray} pixels - RGBA, four bytes per pixel
 * @param {number} width - Width in pixels
 * @param {number} height - Height in pixels
 * @returns {Buffer} the PNG file
 */
const encodePng = (pixels, width, height) => {
  // Every scanline is preceded by its filter type; 0 means the bytes are stored as they are.
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    Buffer.from(pixels.buffer, y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bits per channel
  header[9] = 6; // colour type 6: RGBA
  header[10] = 0; // deflate
  header[11] = 0; // adaptive filtering
  header[12] = 0; // no interlacing

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
};

/**
 * Draws one icon: a speed limit sign on a dark square.
 *
 * The sign covers 62% of the square, which keeps it inside the safe area a maskable icon is
 * cropped to on Android.
 *
 * @param {number} size - Width and height in pixels
 * @returns {Buffer} the PNG file
 */
const drawIcon = size => {
  const image = createImage(size, size, [31, 41, 55]);
  drawSpeedLimitSign(image, {
    limit: 50,
    centreX: size / 2,
    centreY: size / 2,
    diameter: Math.round(size * 0.62),
  });
  return encodePng(image.data, size, size);
};

fs.mkdirSync(OUT_DIR, { recursive: true });
[192, 512].forEach(size => {
  const file = path.join(OUT_DIR, `icon-${size}.png`);
  fs.writeFileSync(file, drawIcon(size));
  console.log(`${file} (${(fs.statSync(file).size / 1024).toFixed(1)} kB)`);
});
// iOS uses its own tag and ignores the manifest icons.
const appleFile = path.join(OUT_DIR, 'apple-touch-icon.png');
fs.writeFileSync(appleFile, drawIcon(180));
console.log(`${appleFile} (${(fs.statSync(appleFile).size / 1024).toFixed(1)} kB)`);
