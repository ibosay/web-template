---
name: preview-page
description:
  Run and drive a page of this template in a real browser. Use when asked to run, start, preview or
  screenshot the app or one of its pages, or to confirm a change works in the real app rather than
  only in tests. Covers the traffic sign assistant end to end with a fake camera, fake GPS and a
  scripted drive.
---

# Running a page of this template in a browser

## The whole app does not start here

`hasMandatoryConfigs` (`src/util/configHelpers.js`) gates every page behind hosted assets — the
branding logo, the listing types, the transaction size — which the app fetches from the Sharetribe
API. Without marketplace credentials and network access to `*.st-api.com` the app renders its
maintenance screen and nothing else, so `yarn dev` cannot show a page.

A single page does not need any of that. This skill builds one page into its own bundle and mounts
it on `TestProvider`, the providers the repository's own tests use. The component, the layout, the
topbar, the footer and the CSS are all the real ones; only the marketplace data is missing, which
shows up as a broken logo image in the topbar and nothing else.

## Quick start

From the repository root:

```sh
S=.claude/skills/preview-page/scripts

node $S/build.js                 # build the page (about 20 seconds)
node $S/serve.js &               # serve it on 127.0.0.1:8099
node $S/makeDriveVideo.js        # a road with signs on it, for the fake camera
NODE_PATH=/opt/node22/lib/node_modules node $S/driveTrafficSign.js
```

The last step opens Chromium, drives the assistant, records a stretch, reviews it, exports the ZIP,
and prints what it found at each step. Screenshots and the export land in `$TMPDIR/preview-page/`.

A healthy run prints a recognised limit, a frame rate around 8, a speed, and `no console errors`. It
exits non-zero and lists the problems if a page error or a console error turned up.

To look at a page by hand instead, run `build.js` and `serve.js` and open the URL.

## Another page, another language

```sh
PAGE=QuizGamePage LOCALE=en node $S/build.js
```

`PAGE` is a directory under `src/containers`, and the page must export `<Name>Component` — the
unconnected component, which every page container in this repository exports next to its connected
default. `LOCALE` picks a file from `src/translations`. `PORT` moves the server.

`driveTrafficSign.js` is specific to the traffic sign assistant; other pages are driven by hand or
by a script written next to it.

## The scripts

| File                  | What it does                                                 |
| --------------------- | ------------------------------------------------------------ |
| `paths.js`            | Repository root, work directory, and how playwright is found |
| `build.js`            | Writes the entry file for `PAGE` and runs webpack            |
| `webpack.config.js`   | Loader rules mirroring the app's own build                   |
| `serve.js`            | A small static server for the built bundle                   |
| `makeDriveVideo.js`   | Draws a drive as Y4M, using the app's own sign generator     |
| `driveTrafficSign.js` | Opens Chromium, drives the assistant, checks what it did     |

Nothing is written into the repository: everything lands in `$TMPDIR/preview-page/`.

## What cost time to work out

Each of these fails in a way that does not name its cause, so they are worth knowing:

- **webpack-cli is not installed.** This repository drives webpack through its Node API
  (`scripts/build.js` does the same). Calling the `webpack` binary makes it ask whether to install
  the CLI and wait on stdin, which looks exactly like a hang — zero CPU, no output.
- **`css-loader` v7 defaults to named exports.** The app imports the default export, so
  `modules.namedExport` has to be `false`. Otherwise every `css.someClass` is `undefined` and the
  page throws on its first render.
- **`process.env` has to be injected.** `src/config/settings.js` reads `REACT_APP_*`, and without
  `DefinePlugin` the page dies on `process is not defined` before rendering anything.
- **`resolve.modules` order matters.** react-router v5 needs its own nested `path-to-regexp` v1.
  Listing the repository's `node_modules` first hands it the v8 hoisted to the top level, which has
  no default export, and routing throws. Put plain `'node_modules'` first so ancestor lookup wins.
- **The camera needs a secure context.** `127.0.0.1` counts as one, so the preview works over plain
  HTTP. On a phone it does not: use `HTTPS=true yarn dev` or a tunnel.
- **`pkill -f <pattern>` matches its own command line** and kills the shell running it. Use a
  bracket, as in `pgrep -f '[w]ebpack'`.

## Driving the assistant without a real camera

Chromium serves a file as the camera with these flags, which `driveTrafficSign.js` passes:

```
--use-fake-device-for-media-stream
--use-fake-ui-for-media-stream          # grants the permission without a prompt
--use-file-for-fake-video-capture=<file.y4m>
```

The file has to be Y4M; `makeDriveVideo.js` writes one. Chromium loops it.

The speed comes from moving the position: `context.setGeolocation` once a second, far enough apart
for the wanted speed. Playwright reports no `coords.speed`, so the page falls back to working the
speed out from the distance between fixes — which is the path worth exercising anyway, since plenty
of phones do not fill in `speed` either.
