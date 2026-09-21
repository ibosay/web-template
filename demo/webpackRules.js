/**
 * The loader rules this template's own build uses, in a form other builds can reuse.
 *
 * Both the demo app here and the preview tool in `.claude/skills/preview-page` need to compile the
 * app's sources outside `scripts/build.js`, and each of these rules exists because leaving it out
 * fails in a way that does not name its cause. Keeping them in one place stops the two copies
 * drifting apart.
 *
 * They mirror `config/webpack.config.js` and `config/sharetribeWebpackConfig.js`.
 */
const path = require('path');
const webpack = require('webpack');

const REPO = path.resolve(__dirname, '..');

const postcssPlugins = [
  'postcss-import',
  'postcss-flexbugs-fixes',
  [
    'postcss-preset-env',
    {
      autoprefixer: { flexbox: 'no-2009' },
      features: {
        'custom-properties': false,
        'nesting-rules': true,
        'custom-media-queries': true,
      },
      stage: 3,
    },
  ],
];

const cssUse = useModules => [
  require.resolve('style-loader'),
  {
    loader: require.resolve('css-loader'),
    options: {
      importLoaders: 1,
      // css-loader v7 makes named exports the default. This app imports the default export, so
      // that has to be turned off — otherwise every `css.someClass` is undefined and the first
      // render throws.
      modules: useModules
        ? { localIdentName: '[name]__[local]', namedExport: false, exportLocalsConvention: 'as-is' }
        : false,
    },
  },
  {
    loader: require.resolve('postcss-loader'),
    options: { postcssOptions: { ident: 'postcss', config: false, plugins: postcssPlugins } },
  },
];

/**
 * @param {Array<string>} extraIncludes - Directories outside src/ that also hold sources
 * @returns {Array<Object>} the module rules
 */
const rules = (extraIncludes = []) => [
  {
    test: /\.(js|jsx)$/,
    include: [path.join(REPO, 'src'), ...extraIncludes],
    loader: require.resolve('babel-loader'),
    options: {
      presets: [path.join(REPO, 'config/babel-preset-react-app')],
      plugins: [require.resolve('@loadable/babel-plugin')],
      configFile: false,
      babelrc: false,
    },
  },
  { test: /\.module\.css$/, use: cssUse(true) },
  { test: /\.css$/, exclude: /\.module\.css$/, use: cssUse(false) },
  {
    test: /\.svg$/,
    use: [
      {
        loader: require.resolve('@svgr/webpack'),
        options: { prettier: false, svgo: false, titleProp: true, ref: true },
      },
    ],
  },
  { test: /\.(png|jpe?g|gif|webp|woff2?|ttf|eot)$/, type: 'asset/resource' },
];

/**
 * Resolution that lets nested dependencies win. react-router v5 needs its own nested
 * path-to-regexp v1; the v8 hoisted to the top level has no default export, and routing throws on
 * the first render if it is picked instead — so plain 'node_modules' has to come first.
 */
const resolve = {
  extensions: ['.js', '.jsx', '.json'],
  modules: ['node_modules', path.join(REPO, 'node_modules')],
};

/**
 * The real build injects the REACT_APP_* variables with DefinePlugin. Without them
 * `src/config/settings.js` throws "process is not defined" before anything renders. None of them
 * need a real value in a build that talks to no backend.
 *
 * @param {Object} overrides - Values to add or replace
 * @returns {Object} the DefinePlugin instance
 */
const definePlugin = (overrides = {}) =>
  new webpack.DefinePlugin({
    'process.env': JSON.stringify({
      NODE_ENV: 'production',
      REACT_APP_ENV: 'production',
      REACT_APP_MARKETPLACE_NAME: 'Demo',
      REACT_APP_MARKETPLACE_ROOT_URL: 'http://127.0.0.1:8099',
      REACT_APP_SHARETRIBE_SDK_CLIENT_ID: 'demo-client-id',
      REACT_APP_SHARETRIBE_SDK_TRANSIT_VERBOSE: 'false',
      REACT_APP_SHARETRIBE_USING_SSL: 'false',
      REACT_APP_CSP: 'block',
      ...overrides,
    }),
  });

module.exports = { REPO, cssUse, definePlugin, resolve, rules };
