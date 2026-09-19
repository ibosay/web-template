# Quiz Mobile App

This repository can be packaged as an iOS and Android app with Capacitor.

## Setup

1. Run `yarn install`.
2. Run `yarn build-web`.
3. Run `npx cap add ios` and `npx cap add android` once.
4. Run `yarn app:sync` after web changes.
5. Run `yarn app:ios` or `yarn app:android` to open the native project.

The quiz remains available at `/quiz`. The next app phase should give the native shell a dedicated quiz entry flow and app specific visual polish.
