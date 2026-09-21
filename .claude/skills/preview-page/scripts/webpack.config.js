/**
 * Builds one page of this template into a bundle that runs on its own in a browser.
 *
 * The whole app cannot be started without Sharetribe credentials: `hasMandatoryConfigs` in
 * src/util/configHelpers.js gates every page behind hosted assets fetched from the API, and
 * without them the app renders its maintenance screen and nothing else. A single page does not
 * need any of that, so it is mounted on `TestProvider` — the same providers the repository's own
 * tests use — and everything else about it is real.
 *
 * The loader rules mirror config/webpack.config.js and config/sharetribeWebpackConfig.js, so the
 * CSS modules, the custom media queries and the SVG icons build exactly as they do in the app.
 */
const path = require('path');
const webpack = require('webpack');

const { DIST_DIR, ENTRY_FILE, PORT, REPO, WORK_DIR } = require('./paths');

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
      // that has to be turned off, exactly as config/webpack.config.js does — otherwise every
      // `css.someClass` is undefined and the page throws on its first render.
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

// The real build injects the REACT_APP_* variables with DefinePlugin. Without them
// src/config/settings.js throws "process is not defined" before anything renders. None of them
// need a real value: the preview talks to no backend.
const appEnvironment = {
  NODE_ENV: 'development',
  REACT_APP_ENV: 'development',
  REACT_APP_MARKETPLACE_NAME: 'Preview',
  REACT_APP_MARKETPLACE_ROOT_URL: `http://127.0.0.1:${PORT}`,
  REACT_APP_SHARETRIBE_SDK_CLIENT_ID: 'preview-client-id',
  REACT_APP_SHARETRIBE_SDK_TRANSIT_VERBOSE: 'false',
  REACT_APP_SHARETRIBE_USING_SSL: 'false',
  REACT_APP_CSP: 'block',
};

module.exports = {
  mode: 'development',
  devtool: false,
  entry: ENTRY_FILE,
  output: { path: DIST_DIR, filename: 'bundle.js', publicPath: '/' },
  // Resolve from the repository, and look in ancestor node_modules first, so nested dependencies
  // win. react-router v5 needs its own nested path-to-regexp v1; the v8 hoisted to the top level
  // has no default export, and routing throws on the first render if it is picked instead.
  context: REPO,
  resolve: {
    extensions: ['.js', '.jsx', '.json'],
    modules: ['node_modules', path.join(REPO, 'node_modules')],
  },
  plugins: [new webpack.DefinePlugin({ 'process.env': JSON.stringify(appEnvironment) })],
  module: {
    rules: [
      {
        test: /\.(js|jsx)$/,
        include: [path.join(REPO, 'src'), WORK_DIR],
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
    ],
  },
};
