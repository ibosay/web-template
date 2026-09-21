/**
 * Builds the assistant as an app of its own: one page, installable, and able to start offline.
 */
const path = require('path');
const webpack = require('webpack');
const HtmlWebpackPlugin = require('html-webpack-plugin');

const { definePlugin, resolve, rules } = require('./webpackRules');

module.exports = {
  mode: 'production',
  devtool: false,
  entry: path.join(__dirname, 'index.js'),
  output: {
    path: path.join(__dirname, 'dist'),
    // Content hashed, so a new build never serves a stale file out of the cache.
    filename: 'app.[contenthash:8].js',
    assetModuleFilename: 'assets/[hash][ext]',
    publicPath: './',
    clean: true,
  },
  context: path.resolve(__dirname, '..'),
  resolve,
  plugins: [
    definePlugin(),
    // Swap the marketplace component barrel for the few components the screens use. See
    // slimComponents.js for why. Only the request is rewritten; nothing in src/ is touched.
    new webpack.NormalModuleReplacementPlugin(/^(\.\.\/)+components$/, resource => {
      resource.request = path.join(__dirname, 'slimComponents.js');
    }),
    new HtmlWebpackPlugin({
      template: path.join(__dirname, 'index.html'),
      minify: {
        collapseWhitespace: true,
        removeComments: true,
        keepClosingSlash: true,
      },
    }),
  ],
  module: { rules: rules([__dirname]) },
  performance: { hints: false },
};
