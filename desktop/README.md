# Campos Muños desktop app

A small Electron shell around the live staff portal (https://admin.camulaw.com).
The portal itself still updates on its own; this app adds its own name and
icon, a tray / Dock presence, start at login, and notifications that come from
the app instead of from Chrome.

## Build

```sh
cd desktop
npm install
npm test            # unit tests (plain Node, no Electron)
npm start           # run against production
npm run start:local # run against http://localhost:5420 + http://localhost:3410
npm run dist:mac    # dist/Campos-Munos-<version>-universal.dmg (+ .zip)
npm run dist:win    # dist/Campos-Munos-<version>-x64.exe (works on macOS too)
```

Builds are unsigned (macOS gets an ad-hoc signature so Apple silicon will run
it). Icons in `build/` and `assets/` come from `admin/public/favicon-512.png`;
rebuild them with `npm run icons` if the logo changes.

## Installing an unsigned build

- **macOS:** open the .dmg, drag the app to Applications, open it once. When
  macOS refuses, go to System Settings → Privacy & Security and click
  **Open Anyway** (macOS 15), then confirm.
- **Windows:** run the installer; on the SmartScreen warning click
  **More info → Run anyway**.

## How notifications work

While the app is running (window open or closed to the tray / Dock) it asks
`GET /api/notifications/feed?after=<cursor>` every 20 seconds, and at once on
wake from sleep, network back and window focus, using the window's sign-in
cookie. Signed out, it checks once a minute; on network errors it backs off to
at most every 5 minutes. When the app is fully quit, nothing arrives.

There is no auto-update for the shell: install the new version over the old
one. The portal inside it is always the live site.
