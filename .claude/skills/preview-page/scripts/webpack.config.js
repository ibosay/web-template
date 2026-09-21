/**
 * Builds one page of this template into a bundle that runs on its own in a browser.
 *
 * The whole app cannot be started without Sharetribe credentials: `hasMandatoryConfigs` in
 * src/util/configHelpers.js gates every page behind hosted assets fetched from the API, and
 * without them the app renders its maintenance screen and nothing else. A single page does not
 * need any of that, so it is mounted on `TestProvider` — the same providers the repository's own
 * tests use — and everything else about it is real.
 *
 * The loader rules come from `demo/webpackRules.js`, which the installable demo uses as well, so
 * the two builds cannot drift apart. That file explains why each rule is there.
 */
const path = require('path');

const { definePlugin, resolve, rules } = require('../../../../demo/webpackRules');
const { DIST_DIR, ENTRY_FILE, PORT, REPO, WORK_DIR } = require('./paths');

module.exports = {
  mode: 'development',
  devtool: false,
  entry: ENTRY_FILE,
  output: { path: DIST_DIR, filename: 'bundle.js', publicPath: '/' },
  context: REPO,
  resolve,
  plugins: [
    definePlugin({
      NODE_ENV: 'development',
      REACT_APP_ENV: 'development',
      REACT_APP_MARKETPLACE_NAME: 'Preview',
      REACT_APP_MARKETPLACE_ROOT_URL: `http://127.0.0.1:${PORT}`,
    }),
  ],
  // The generated entry lives in the work directory, so babel has to look there too.
  module: { rules: rules([WORK_DIR]) },
};
