/**
 * Builds the installable demo.
 *
 * webpack runs through its Node API because webpack-cli is not a dependency of this repository —
 * the binary would stop and ask whether to install it, waiting on stdin.
 *
 * Afterwards the icons are copied in and the service worker is written with the list of files
 * webpack actually emitted, so the precache can never name a file that is not there.
 */
process.env.NODE_ENV = process.env.NODE_ENV || 'production';

const { execFileSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const webpack = require('webpack');

const config = require('./webpack.config');

const DIST = config.output.path;
const ICONS = path.join(__dirname, 'icons');

console.log('Drawing the icons …');
execFileSync(process.execPath, [path.join(__dirname, 'makeIcons.js')], { stdio: 'inherit' });

console.log('Building …');
webpack(config, (err, stats) => {
  if (err) {
    console.error('FATAL', err);
    process.exit(1);
  }
  if (stats.hasErrors()) {
    console.error(stats.toString({ colors: false, errorDetails: true }));
    process.exit(1);
  }

  // The manifest and the icons are static, so they are copied rather than bundled.
  fs.copyFileSync(
    path.join(__dirname, 'manifest.webmanifest'),
    path.join(DIST, 'manifest.webmanifest')
  );
  fs.mkdirSync(path.join(DIST, 'icons'), { recursive: true });
  fs.readdirSync(ICONS).forEach(name =>
    fs.copyFileSync(path.join(ICONS, name), path.join(DIST, 'icons', name))
  );

  // Precache whatever ended up in the build, so the list cannot drift from the files.
  const collect = (dir, prefix = '') =>
    fs
      .readdirSync(dir, { withFileTypes: true })
      .flatMap(entry =>
        entry.isDirectory()
          ? collect(path.join(dir, entry.name), `${prefix}${entry.name}/`)
          : [`${prefix}${entry.name}`]
      );
  const assets = collect(DIST).filter(name => name !== 'serviceWorker.js');
  const precache = ['./', ...assets.map(name => `./${name}`)];

  const version = crypto
    .createHash('sha1')
    .update(assets.join('|'))
    .digest('hex')
    .slice(0, 8);
  const serviceWorker = fs
    .readFileSync(path.join(__dirname, 'serviceWorker.template.js'), 'utf8')
    .replace(/__PRECACHE__/g, JSON.stringify(precache, null, 2))
    .replace(/__VERSION__/g, version);
  fs.writeFileSync(path.join(DIST, 'serviceWorker.js'), serviceWorker);

  const total = assets.reduce((sum, name) => sum + fs.statSync(path.join(DIST, name)).size, 0);
  console.log(stats.toString({ colors: false, modules: false, chunks: false }));
  console.log(`\n${assets.length} files, ${(total / 1024 / 1024).toFixed(2)} MB -> ${DIST}`);
  console.log(`Service worker version ${version}, precaching ${precache.length} entries.`);
});
