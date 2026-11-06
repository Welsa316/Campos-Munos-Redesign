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

When notifications stop, the app says so: the tray tooltip and menu read
"Signed out" or "Can't reach the portal" (after three failed checks in a row),
the Dock icon gets a badge, and a session that ends while signed in posts one
"Signed out of Campos Muños" notification. If the portal can't load at all,
the window shows a "Can't reach the portal" page and retries every 15 seconds
and as soon as the network comes back.

## Security settings

- Every page runs sandboxed (`app.enableSandbox()`) with context isolation
  and no Node. The preload exposes `window.campos = { desktop, version,
  notificationState(), onNavigate(fn) }` and nothing else: two named IPC
  channels, each answered only for the app's window showing the portal
  (`notificationState` is read-only; `onNavigate` lets a clicked notification
  route in place). Navigation rules apply to every web page the app creates.
- Downloads are accepted only from the portal and the API; links opened in
  the browser are limited to a few a minute, and never to `localhost`, private
  network addresses or `.local` names; `mailto:` links lose any attachment.
- Signing out (or the session expiring) clears the portal's storage and the
  HTTP cache on this computer and forgets the notification feed position.
- The Info.plist says the app does not use the camera, microphone or
  Bluetooth. (electron-builder always sets `NSAllowsArbitraryLoads` for its
  localhost exception; it only affects Apple's networking APIs, which the
  portal does not use.)
- Electron fuses (`build.electronFuses`): cookies are encrypted with the macOS
  Keychain / Windows DPAPI; `ELECTRON_RUN_AS_NODE`, `NODE_OPTIONS` and
  `--inspect` are ignored; the app only loads its own integrity-checked
  `app.asar`. A sign-in saved by an older build stays readable but is only
  stored encrypted once it is written again, so sign out and back in once
  after updating. Cookie encryption cannot be turned off again later without
  losing every saved sign-in.
- `CM_PORTAL_URL` / `CM_API_URL` only work when running from source
  (`npm start`, `npm run start:local`); an installed app always uses the
  production portal and API.

A small log of state changes, load failures and crashes (never what a
notification said, and URLs only by host) is kept in the app's data folder
under `logs/app.log`, rotated at 256 KB. The page reloads itself after a
crash, up to three times in five minutes; if it freezes, the app asks
whether to reload or wait.

There is no auto-update for the shell: install the new version over the old
one. The portal inside it is always the live site.
