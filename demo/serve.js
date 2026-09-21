/**
 * Serves the built demo, for trying it on this machine before putting it anywhere.
 *
 * Plain HTTP is enough here, because a browser treats 127.0.0.1 as a secure context and hands out
 * the camera. A phone on the same network does not: there the page has to be served over HTTPS.
 */
const fs = require('fs');
const http = require('http');
const path = require('path');

const DIST = path.join(__dirname, 'dist');
const PORT = Number(process.env.PORT || 8100);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

if (!fs.existsSync(DIST)) {
  console.error('Nothing built yet. Run: node demo/build.js');
  process.exit(1);
}

http
  .createServer((request, response) => {
    const requested = decodeURIComponent(request.url.split('?')[0]).replace(/\/{2,}/g, '/');
    const relative = requested === '/' ? 'index.html' : requested.replace(/^\/+/, '');
    const file = path.join(DIST, relative);

    if (!file.startsWith(DIST) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      response.writeHead(404).end('not found');
      return;
    }
    response.writeHead(200, {
      'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
      // A service worker must not be served from a stale cache, or an update never arrives.
      'Cache-Control': relative === 'serviceWorker.js' ? 'no-cache' : 'public, max-age=3600',
    });
    fs.createReadStream(file).pipe(response);
  })
  .listen(PORT, '127.0.0.1', () => console.log(`http://127.0.0.1:${PORT}/`));
