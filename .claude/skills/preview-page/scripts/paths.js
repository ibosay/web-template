/**
 * Where everything lives. The repository root is derived from this file rather than written down,
 * so the skill keeps working wherever the repository is checked out.
 */
const os = require('os');
const path = require('path');

/** The repository root: .claude/skills/preview-page/scripts -> up four. */
const REPO = path.resolve(__dirname, '..', '..', '..', '..');

/** Build output and generated files. Kept out of the repository on purpose. */
const WORK_DIR = path.join(os.tmpdir(), 'preview-page');

const config = {
  REPO,
  WORK_DIR,
  DIST_DIR: path.join(WORK_DIR, 'dist'),
  ENTRY_FILE: path.join(WORK_DIR, 'entry.generated.js'),
  VIDEO_FILE: path.join(WORK_DIR, 'drive.y4m'),
  SHOTS_DIR: path.join(WORK_DIR, 'shots'),

  /** Which container to mount, and in which language. */
  PAGE: process.env.PAGE || 'TrafficSignAssistPage',
  LOCALE: process.env.LOCALE || 'de',
  PORT: Number(process.env.PORT || 8099),
};

/**
 * Loads playwright, which is usually installed globally rather than in the repository.
 *
 * @returns {Object} the playwright module
 */
config.requirePlaywright = () => {
  const candidates = [
    'playwright',
    '/opt/node22/lib/node_modules/playwright',
    '/usr/lib/node_modules/playwright',
    '/usr/local/lib/node_modules/playwright',
  ];
  for (const candidate of candidates) {
    try {
      // eslint-disable-next-line import/no-dynamic-require, global-require
      return require(candidate);
    } catch (e) {
      // Try the next one.
    }
  }
  throw new Error(
    'playwright was not found. Install it, or point NODE_PATH at the directory holding it.'
  );
};

module.exports = config;
