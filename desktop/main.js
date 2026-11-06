'use strict'
// Campos Muños desktop app: a thin shell around the live staff portal.
// The portal itself is the website at admin.camulaw.com and updates itself;
// this process only provides the window, the tray, start-at-login and
// notifications that come from the app instead of from a browser.

const path = require('node:path')
const {
  app, BrowserWindow, Menu, Tray, Notification, clipboard, dialog, ipcMain, nativeImage, net, powerMonitor, screen, session, shell,
} = require('electron')

const { resolveConfig, isPortalUrl, externalUrl, portalPathUrl, isReloadShortcut } = require('./src/urls')
const { createPoller } = require('./src/poller')
const { createNotifier } = require('./src/notifier')
const { createStore, cursorFor } = require('./src/store')
const { createStatus, describe } = require('./src/status')
const { restoreBounds, MIN_SIZE } = require('./src/window-state')
const { createLog, originOnly } = require('./src/log')
const { createCrashGuard } = require('./src/crash-guard')
const { createRateLimit } = require('./src/rate-limit')

const APP_ID = 'com.camulaw.portal'
const APP_NAME = 'Campos Muños'
const { portalOrigin, apiOrigin } = resolveConfig(process.env, { allowOverrides: !app.isPackaged })
const isMac = process.platform === 'darwin'
const isWindows = process.platform === 'win32'

app.setName(APP_NAME)
// Every page this app ever shows runs in Chromium's sandbox.
app.enableSandbox()
// Windows shows the name and icon registered for this id on every toast.
if (isWindows) app.setAppUserModelId(APP_ID)

// A second launch (double-clicking the icon again) focuses the running app.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => showWindow())
  app.whenReady().then(start)
}

let win = null
let tray = null
let quitting = false
let store = null
let poller = null
// Set while the window shows the offline page: the portal URL to load again.
let portalUrlToRetry = null
let retryTimer = null
const status = createStatus()
let signedOutAlert = null
// Set once the portal has registered for in-place navigation (preload.js);
// cleared on every full page load, which starts a fresh portal.
let portalCanNavigate = false
let log = () => {}
const crashGuard = createCrashGuard()
const externalLimit = createRateLimit()
let lastThrottleLog = 0

const asset = (name) => path.join(__dirname, 'assets', name)

// Every web page, including any the portal opens, gets the same rules.
app.on('web-contents-created', (_event, contents) => guardNavigation(contents))

function start() {
  store = createStore(path.join(app.getPath('userData'), 'settings.json'))
  log = createLog(path.join(app.getPath('userData'), 'logs', 'app.log'))
  log('start', { version: app.getVersion(), platform: process.platform })
  lockDownSession(session.defaultSession)
  allowDownloadsFromPortalOnly(session.defaultSession)
  answerPortal()
  setUpLoginItem()
  buildMenu()
  createWindow()
  createTray()
  startNotifications()

  app.on('activate', () => showWindow())
  app.on('before-quit', () => { quitting = true })
  // The computer shutting down or the person signing out of it must not be
  // held up by close-to-tray (Windows asks every window first).
  powerMonitor.on('shutdown', () => { quitting = true })
}

// --- Window -----------------------------------------------------------------

function createWindow() {
  const areas = screen.getAllDisplays().map((d) => d.workArea)
  const bounds = restoreBounds(store.get('windowBounds'), areas)

  win = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    minWidth: MIN_SIZE.width,
    minHeight: MIN_SIZE.height,
    title: APP_NAME,
    icon: isMac ? undefined : asset('icon.png'),
    backgroundColor: '#15213e',
    autoHideMenuBar: !isMac,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false,
      spellcheck: true,
      additionalArguments: [`--cm-version=${app.getVersion()}`],
    },
  })
  if (bounds.maximized) win.maximize()
  win.once('ready-to-show', () => win.show())

  // An app, not a browser tab: Cmd/Ctrl+R, Cmd/Ctrl+Shift+R and F5 do nothing
  // (Help → Reload is there if a page ever gets stuck).
  win.webContents.on('before-input-event', (event, input) => {
    if (isReloadShortcut(input)) event.preventDefault()
  })
  addContextMenu(win.webContents)

  // Keep the page title in the title bar, falling back to the app name.
  win.on('page-title-updated', (event, title) => {
    event.preventDefault()
    win.setTitle(title && title.trim() ? title : APP_NAME)
  })

  let saveTimer = null
  const saveBounds = () => {
    clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      if (!win || win.isDestroyed() || win.isMinimized()) return
      const maximized = win.isMaximized() || win.isFullScreen()
      const b = maximized ? (store.get('windowBounds') || win.getNormalBounds()) : win.getBounds()
      store.set('windowBounds', { ...b, maximized })
    }, 400)
  }
  for (const e of ['resize', 'move', 'maximize', 'unmaximize']) win.on(e, saveBounds)

  // Closing the window keeps the app running (tray on Windows, Dock on
  // macOS) so notifications keep arriving. Quit from the tray or Cmd+Q.
  win.on('close', (event) => {
    if (quitting) return
    event.preventDefault()
    if (win.isFullScreen()) win.setFullScreen(false)
    win.hide()
    if (isWindows && !store.get('trayHintShown') && tray) {
      store.set('trayHintShown', true)
      tray.displayBalloon({
        iconType: 'info',
        title: APP_NAME,
        content: 'Still running here so new calls and messages reach you. Right-click the icon to quit.',
      })
    }
  })

  // Offline, or the portal down: show a page that says so instead of a blank
  // window, and keep trying (the reload keys are off in this app).
  win.webContents.on('did-fail-load', (_event, code, _desc, url, isMainFrame) => {
    // -3 is a load replaced by another one, not a failure.
    if (!isMainFrame || code === -3 || !isPortalUrl(url, portalOrigin)) return
    showOffline(url)
  })

  // Windows: logging off or shutting down closes the window for real.
  win.on('query-session-end', () => { quitting = true })
  win.on('session-end', () => { quitting = true })

  watchRenderer(win)

  win.on('focus', () => poller && poller.poke())
  loadPortal(portalOrigin + '/')
}

// The page crashed or froze. Reload it (not forever: a page that crashes
// straight away again gets the offline page instead of a reload loop), and
// for a hang let the person choose, since it may still recover.
function watchRenderer(w) {
  const contents = w.webContents
  contents.on('did-navigate', () => { portalCanNavigate = false })
  contents.on('render-process-gone', (_event, details) => {
    portalCanNavigate = false
    log('renderer-gone', { reason: details.reason, exitCode: details.exitCode })
    if (details.reason === 'clean-exit' || w.isDestroyed()) return
    const url = contents.getURL()
    const again = isPortalUrl(url, portalOrigin) ? url : portalOrigin + '/'
    if (crashGuard.shouldReload()) loadPortal(again)
    else showOffline(again)
  })
  let asking = false
  w.on('unresponsive', async () => {
    log('unresponsive', {})
    if (asking || w.isDestroyed()) return
    asking = true
    try {
      const { response } = await dialog.showMessageBox(w, {
        type: 'warning',
        buttons: ['Reload', 'Wait'],
        defaultId: 1,
        cancelId: 1,
        message: 'Campos Muños is not responding',
        detail: 'You can wait for it to recover, or reload the portal. Reloading loses anything typed but not saved.',
      })
      // A hung page cannot reload itself; end it, and the crash handler above
      // loads the portal again.
      if (response === 0 && !w.isDestroyed()) contents.forcefullyCrashRenderer()
    } finally {
      asking = false
    }
  })
  w.on('responsive', () => log('responsive', {}))
}

function loadPortal(url) {
  portalCanNavigate = false
  portalUrlToRetry = null
  clearInterval(retryTimer)
  retryTimer = null
  // A failure is handled by did-fail-load; the promise only needs catching.
  win.loadURL(url).catch(() => {})
}

function showOffline(url) {
  log('portal-unreachable', { url: originOnly(url) })
  portalUrlToRetry = url
  win.loadFile(asset('offline.html')).catch(() => {})
  if (!retryTimer) {
    retryTimer = setInterval(() => {
      if (net.isOnline()) retryPortal()
    }, 15_000)
  }
}

function retryPortal() {
  if (!win || win.isDestroyed()) return
  if (portalUrlToRetry) loadPortal(portalUrlToRetry)
  else win.webContents.reload()
}

function showWindow() {
  if (!win || win.isDestroyed()) {
    createWindow()
    return
  }
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
}

// Only the portal loads inside the app. Everything else goes to the
// system browser / mail / phone app, and only for https, mailto and tel,
// a few at a time (a page opening links in a loop gets only a handful).
function openOutside(url) {
  const safe = externalUrl(url)
  if (!safe) return
  if (!externalLimit.allow()) {
    // Once a minute at most, or a page opening links in a loop fills the log.
    if (Date.now() - lastThrottleLog > 60_000) {
      lastThrottleLog = Date.now()
      log('external-link-throttled', { url: originOnly(safe) })
    }
    return
  }
  shell.openExternal(safe).catch(() => {})
}

function guardNavigation(contents) {
  contents.setWindowOpenHandler(({ url }) => {
    if (isPortalUrl(url, portalOrigin)) contents.loadURL(url)
    else openOutside(url)
    return { action: 'deny' }
  })
  const keepInPortal = (event, url) => {
    // The offline page's "Try again" link reloads the page that failed.
    if (portalUrlToRetry) {
      event.preventDefault()
      retryPortal()
      return
    }
    if (isPortalUrl(url, portalOrigin)) return
    event.preventDefault()
    openOutside(url)
  }
  contents.on('will-navigate', keepInPortal)
  contents.on('will-redirect', (event, url, isInPlace, isMainFrame) => {
    if (isMainFrame) keepInPortal(event, url)
  })
  contents.on('will-attach-webview', (event) => event.preventDefault())
}

// Electron has no right-click menu of its own; give text fields the usual one.
function addContextMenu(contents) {
  contents.on('context-menu', (_event, params) => {
    const items = []
    for (const word of params.dictionarySuggestions || []) {
      items.push({ label: word, click: () => contents.replaceMisspelling(word) })
    }
    if (items.length) items.push({ type: 'separator' })
    if (params.isEditable) {
      items.push({ role: 'cut', enabled: params.editFlags.canCut })
      items.push({ role: 'copy', enabled: params.editFlags.canCopy })
      items.push({ role: 'paste', enabled: params.editFlags.canPaste })
      items.push({ role: 'selectAll' })
    } else if (params.selectionText) {
      items.push({ role: 'copy' })
    }
    if (params.linkURL && externalUrl(params.linkURL)) {
      if (items.length) items.push({ type: 'separator' })
      items.push({ label: 'Copy Link', click: () => clipboard.writeText(params.linkURL) })
    }
    if (items.length) Menu.buildFromTemplate(items).popup({ window: win })
  })
}

// --- Session / permissions ----------------------------------------------------

// Downloads only from the portal and the API (the CSV exports, saved from the
// portal as blob: URLs of the portal's own origin). Anything else is refused.
function allowDownloadsFromPortalOnly(ses) {
  ses.on('will-download', (event, item) => {
    const raw = item.getURL()
    let from = ''
    try {
      const u = new URL(raw)
      from = u.protocol === 'blob:' ? new URL(u.pathname).origin : u.origin
    } catch { /* unparseable: refused below */ }
    if (from === portalOrigin || from === apiOrigin) return
    log('download-refused', { url: originOnly(raw) })
    event.preventDefault()
  })
}

// The only two things the portal can ask the app (preload.js): to say it can
// take a notification's link in place, and what the notification state is.
// Each answers only the app's own window showing the portal.
function fromPortalWindow(event) {
  return !!win && !win.isDestroyed() && event.sender === win.webContents &&
    event.senderFrame === win.webContents.mainFrame && isPortalUrl(event.senderFrame.url, portalOrigin)
}

function answerPortal() {
  ipcMain.on('campos:navigate-ready', (event) => {
    if (fromPortalWindow(event)) portalCanNavigate = true
  })
  ipcMain.handle('campos:notification-state', (event) => {
    if (!fromPortalWindow(event)) return null
    return {
      feed: poller ? status.state : 'off',
      supported: Notification.isSupported(),
    }
  })
}

// The portal may show notifications and write to the clipboard (its "Copy"
// buttons). Every other permission (camera, microphone, location, ...) and
// every other origin is refused.
const ALLOWED_PERMISSIONS = new Set(['notifications', 'clipboard-sanitized-write'])

function lockDownSession(ses) {
  const allowed = (permission, url) => ALLOWED_PERMISSIONS.has(permission) && isPortalUrl(url, portalOrigin)
  ses.setPermissionRequestHandler((contents, permission, callback, details) => {
    callback(allowed(permission, details.requestingUrl || contents.getURL()))
  })
  ses.setPermissionCheckHandler((contents, permission, requestingOrigin) => {
    return allowed(permission, requestingOrigin || (contents && contents.getURL()) || '')
  })
}

// --- Start at login -------------------------------------------------------------

// On by default, set once on the first run. After that the system's own
// setting is the truth: someone who turns it off in System Settings or Task
// Manager is not overruled at the next launch.
function setUpLoginItem() {
  // Running from source would register the bare Electron binary; skip it.
  if (!app.isPackaged) return
  if (store.get('loginItemSet') === true) return
  app.setLoginItemSettings({ openAtLogin: true })
  store.set('loginItemSet', true)
}

function opensAtLogin() {
  try { return app.getLoginItemSettings().openAtLogin === true } catch { return false }
}

function toggleLoginItem(on) {
  if (!app.isPackaged) return
  app.setLoginItemSettings({ openAtLogin: on })
  store.set('loginItemSet', true)
}

// --- Tray and menus -------------------------------------------------------------

function trayMenu() {
  const { label } = describe(status.state, APP_NAME)
  const problem = label ? [
    { label, enabled: false },
    status.state === 'signed-out'
      ? { label: 'Sign in…', click: () => showWindow() }
      : { label: 'Try again now', click: () => { retryPortal(); poller && poller.poke() } },
    { type: 'separator' },
  ] : []
  return Menu.buildFromTemplate([
    ...problem,
    { label: `Open ${APP_NAME}`, click: () => showWindow() },
    { type: 'separator' },
    {
      label: 'Start at login',
      type: 'checkbox',
      checked: app.isPackaged && opensAtLogin(),
      enabled: app.isPackaged,
      click: (item) => toggleLoginItem(item.checked),
    },
    { type: 'separator' },
    { label: 'Quit', click: () => { quitting = true; app.quit() } },
  ])
}

function createTray() {
  const image = nativeImage.createFromPath(asset('tray.png'))
  tray = new Tray(image)
  tray.setToolTip(APP_NAME)
  tray.setContextMenu(trayMenu())
  // Rebuild so the checkbox reflects a change made in System Settings.
  tray.on('right-click', () => tray.setContextMenu(trayMenu()))
  if (isWindows) tray.on('click', () => showWindow())
}

function buildMenu() {
  const template = [
    ...(isMac ? [{
      label: APP_NAME,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    }] : [{ label: 'File', submenu: [{ label: 'Quit', click: () => { quitting = true; app.quit() } }] }]),
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        ...(app.isPackaged ? [] : [{ role: 'toggleDevTools' }]),
      ],
    },
    { role: 'windowMenu' },
    // A way out if a page ever gets stuck, without a browser's shortcut.
    { role: 'help', submenu: [{ label: 'Reload Campos Muños', click: () => retryPortal() }] },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

// --- Notifications ----------------------------------------------------------------

function startNotifications() {
  if (!Notification.isSupported()) return

  const notifier = createNotifier({
    create: (opts) => new Notification({ ...opts, icon: isMac ? undefined : asset('icon.png') }),
    onClick: (url) => {
      showWindow()
      const target = portalPathUrl(url, portalOrigin)
      if (!target || !win) return
      // In place through the portal's router when it is showing and listening;
      // otherwise (offline page, an older portal) a full load.
      if (portalCanNavigate && !portalUrlToRetry && isPortalUrl(win.webContents.getURL(), portalOrigin)) {
        const u = new URL(target)
        win.webContents.send('campos:navigate', u.pathname + u.search + u.hash)
      } else {
        loadPortal(target)
      }
    },
  })

  let state = 'ok'
  const cursor = cursorFor(store, apiOrigin)
  poller = createPoller({
    // Uses the window's cookies, so it is signed in exactly when the portal is.
    fetchFeed: (after) => {
      const url = new URL('/api/notifications/feed', apiOrigin)
      if (after !== null && after !== undefined) url.searchParams.set('after', String(after))
      return session.defaultSession.fetch(url.href, {
        credentials: 'include',
        cache: 'no-store',
        headers: { Origin: portalOrigin, Accept: 'application/json' },
        signal: AbortSignal.timeout(15_000),
      })
    },
    cursor,
    notify: (item) => notifier.show(item),
    onState: (s) => {
      if (s !== state) log('feed-state', { state: s })
      state = s
      showStatus(status.report(s))
    },
  })
  poller.start()

  powerMonitor.on('resume', () => poller.poke())
  powerMonitor.on('unlock-screen', () => poller.poke())

  // No "online" event in the main process; watch for the network coming back.
  let wasOnline = net.isOnline()
  setInterval(() => {
    const online = net.isOnline()
    if (online && !wasOnline) {
      poller.poke()
      if (portalUrlToRetry) retryPortal()
    }
    wasOnline = online
  }, 10_000).unref()

  // Signing in sets the session cookie on the API host: start right away
  // instead of waiting out the slow signed-out interval. Signing out (or the
  // session expiring) removes it: clear what the portal kept on this computer.
  const apiHost = new URL(apiOrigin).hostname
  session.defaultSession.cookies.on('changed', (_event, cookie, cause, removed) => {
    const domain = String(cookie.domain || '').replace(/^\./, '')
    if (!(domain === apiHost || apiHost.endsWith('.' + domain))) return
    if (!removed) {
      if (state === 'signed-out') poller.poke()
      return
    }
    // 'overwrite' is a new sign-in replacing the old cookie, not a sign-out.
    if (cookie.name === 'token' && cause !== 'overwrite') clearAfterSignOut(cursor)
  })
}

function clearAfterSignOut(cursor) {
  log('signed-out-cleanup', {})
  cursor.reset()
  const ses = session.defaultSession
  ses.clearStorageData({ origin: portalOrigin, storages: ['localstorage', 'cachestorage', 'serviceworkers', 'indexdb'] }).catch(() => {})
  ses.clearCache().catch(() => {})
}

// Make a stopped poller visible: tray tooltip and menu, the Dock badge on
// macOS, and one notification when a signed-in session ends.
function showStatus({ state, changed, alert }) {
  if (!changed && !alert) return
  const { tooltip, badge } = describe(state, APP_NAME)
  if (tray) {
    tray.setToolTip(tooltip)
    tray.setContextMenu(trayMenu())
  }
  if (isMac && app.dock) app.dock.setBadge(badge)
  // Someone looking at the window sees the sign-in page; no need to tell them.
  if (alert && !(win && !win.isDestroyed() && win.isVisible() && win.isFocused())) {
    signedOutAlert = new Notification({
      title: 'Signed out of Campos Muños',
      body: 'Notifications are paused. Click to sign in again.',
      icon: isMac ? undefined : asset('icon.png'),
    })
    signedOutAlert.on('click', () => showWindow())
    signedOutAlert.show()
  }
}
