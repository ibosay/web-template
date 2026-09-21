/**
 * Builds the preview bundle.
 *
 * webpack is driven through its Node API rather than the command line, because webpack-cli is not
 * a dependency of this repository — scripts/build.js does the same. Calling the `webpack` binary
 * directly stops and asks whether to install the CLI, which looks exactly like a hang when it is
 * waiting on a pipe.
 */
// babel-preset-react-app refuses to run without this, and says so unhelpfully.
process.env.NODE_ENV = process.env.NODE_ENV || 'development';

const fs = require('fs');
const path = require('path');
const webpack = require('webpack');

const { DIST_DIR, ENTRY_FILE, LOCALE, PAGE, REPO, WORK_DIR } = require('./paths');
const config = require('./webpack.config');

const pageFile = path.join(REPO, 'src', 'containers', PAGE, `${PAGE}.js`);
if (!fs.existsSync(pageFile)) {
  console.error(`No such page: ${pageFile}\nSet PAGE to a directory under src/containers.`);
  process.exit(1);
}

// Page containers export the unconnected component as `<Name>Component`, which is what to mount:
// the connected default export would need a store that has already loaded marketplace data.
const entry = `import React from 'react';
import { createRoot } from 'react-dom/client';

// Carries the CSS variables every page style refers to.
import '${REPO}/src/styles/marketplaceDefaults.css';

import { TestProvider } from '${REPO}/src/util/testHelpers';
import { ${PAGE}Component as Page } from '${pageFile}';
import messages from '${REPO}/src/translations/${LOCALE}.json';

createRoot(document.getElementById('root')).render(
  <TestProvider messages={messages}>
    <Page scrollingDisabled={false} />
  </TestProvider>
);
`;

fs.mkdirSync(WORK_DIR, { recursive: true });
fs.mkdirSync(DIST_DIR, { recursive: true });
fs.writeFileSync(ENTRY_FILE, entry);
fs.copyFileSync(path.join(__dirname, 'index.html'), path.join(DIST_DIR, 'index.html'));

console.log(`Building ${PAGE} (${LOCALE}) …`);
webpack(config, (err, stats) => {
  if (err) {
    console.error('FATAL', err);
    process.exit(1);
  }
  console.log(stats.toString({ colors: false, modules: false, chunks: false, errorDetails: true }));
  if (stats.hasErrors()) {
    process.exit(1);
  }
  console.log(`\nBundle: ${DIST_DIR}`);
});
