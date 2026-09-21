/**
 * Serves the built preview. Small enough to keep here, which spares the skill a dependency on
 * whatever static server happens to be installed.
 */
const fs = require('fs');
const http = require('http');
const path = require('path');

const { DIST_DIR, PORT } = require('./paths');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

const server = http.createServer((request, response) => {
  const requested = decodeURIComponent(request.url.split('?')[0]);
  const relative = requested === '/' ? 'index.html' : requested.replace(/^\/+/, '');
  const file = path.join(DIST_DIR, relative);

  // Never serve anything from outside the build directory.
  if (!file.startsWith(DIST_DIR) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    response.writeHead(404).end('not found');
    return;
  }

  response.writeHead(200, {
    'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
  });
  fs.createReadStream(file).pipe(response);
});

server.listen(PORT, '127.0.0.1', () => console.log(`http://127.0.0.1:${PORT}/`));
