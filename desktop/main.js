'use strict'
// Campos Muños desktop app: a thin shell around the live staff portal.
// The portal itself is the website at admin.camulaw.com and updates itself;
// this process only provides the window, the tray, start-at-login and
// notifications that come from the app instead of from a browser.

const path = require('node:path')
const {
  app, BrowserWindow, Menu, Tray, Notification, clipboard, nativeImage, net, powerMonitor, screen, session, shell,
} = require('electron')

const { resolveConfig, isPortalUrl, externalUrl, portalPathUrl, isReloadShortcut } = require('./src/urls')
const { createPoller } = require('./src/poller')
const { createNotifier } = require('./src/notifier')
const { createStore, cursorFor } = require('./src/store')
const { restoreBounds, MIN_SIZE } = require('./src/window-state')

const APP_ID = 'com.camulaw.portal'
const APP_NAME = 'Campos Muños'
const { portalOrigin, apiOrigin } = resolveConfig()
const isMac = process.platform === 'darwin'
const isWindows = process.platform === 'win32'

app.setName(APP_NAME)
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

const asset = (name) => path.join(__dirname, 'assets', name)

function start() {
  store = createStore(path.join(app.getPath('userData'), 'settings.json'))
  lockDownSession(session.defaultSession)
  setUpLoginItem()
  buildMenu()
  createWindow()
  createTray()
  startNotifications()

  app.on('activate', () => showWindow())
  app.on('before-quit', () => { quitting = true })
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

  guardNavigation(win.webContents)
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

  win.on('focus', () => poller && poller.poke())
  win.loadURL(portalOrigin + '/')
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
// system browser / mail / phone app, and only for https, mailto and tel.
function openOutside(url) {
  const safe = externalUrl(url)
  if (safe) shell.openExternal(safe).catch(() => {})
}

function guardNavigation(contents) {
  contents.setWindowOpenHandler(({ url }) => {
    if (isPortalUrl(url, portalOrigin)) contents.loadURL(url)
    else openOutside(url)
    return { action: 'deny' }
  })
  const keepInPortal = (event, url) => {
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

function setUpLoginItem() {
  // Running from source would register the bare Electron binary; skip it.
  if (!app.isPackaged) return
  let wanted = store.get('openAtLogin')
  if (typeof wanted !== 'boolean') {
    wanted = true // on by default, first run only
    store.set('openAtLogin', wanted)
  }
  app.setLoginItemSettings({ openAtLogin: wanted })
}

function toggleLoginItem(on) {
  store.set('openAtLogin', on)
  if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: on })
}

// --- Tray and menus -------------------------------------------------------------

function trayMenu() {
  return Menu.buildFromTemplate([
    { label: `Open ${APP_NAME}`, click: () => showWindow() },
    { type: 'separator' },
    {
      label: 'Start at login',
      type: 'checkbox',
      checked: store.get('openAtLogin') !== false,
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
    { role: 'help', submenu: [{ label: 'Reload Campos Muños', click: () => win?.webContents.reload() }] },
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
      if (target && win) win.loadURL(target)
    },
  })

  let state = 'ok'
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
    cursor: cursorFor(store, apiOrigin),
    notify: (item) => notifier.show(item),
    onState: (s) => { state = s },
  })
  poller.start()

  powerMonitor.on('resume', () => poller.poke())
  powerMonitor.on('unlock-screen', () => poller.poke())

  // No "online" event in the main process; watch for the network coming back.
  let wasOnline = net.isOnline()
  setInterval(() => {
    const online = net.isOnline()
    if (online && !wasOnline) poller.poke()
    wasOnline = online
  }, 10_000).unref()

  // Signing in sets the session cookie on the API host: start right away
  // instead of waiting out the slow signed-out interval.
  const apiHost = new URL(apiOrigin).hostname
  session.defaultSession.cookies.on('changed', (_event, cookie, _cause, removed) => {
    if (removed || state !== 'signed-out') return
    const domain = String(cookie.domain || '').replace(/^\./, '')
    if (domain === apiHost || apiHost.endsWith('.' + domain)) poller.poke()
  })
}
