'use strict'
// Runs sandboxed before the portal loads. The page learns that it is inside
// the desktop app (so it can, for example, skip its own Web Push prompt) and
// gets exactly two narrow hooks, nothing else: no Node, no Electron APIs, no
// general-purpose messaging.
//   notificationState()  read-only: { feed, supported } for its Notifications dialog
//   onNavigate(fn)       the app passes a clicked notification's path to fn,
//                        so the portal can route in place instead of reloading
const { contextBridge, ipcRenderer } = require('electron')

const version = (process.argv.find((a) => a.startsWith('--cm-version=')) || '').slice('--cm-version='.length)

let navigate = null
ipcRenderer.on('campos:navigate', (_event, path) => {
  if (navigate && typeof path === 'string') navigate(path)
})

contextBridge.exposeInMainWorld('campos', Object.freeze({
  desktop: true,
  version,
  notificationState: () => ipcRenderer.invoke('campos:notification-state').then((s) => (s ? Object.freeze({ feed: String(s.feed), supported: s.supported === true }) : null)),
  onNavigate(fn) {
    if (typeof fn !== 'function') return
    navigate = fn
    ipcRenderer.send('campos:navigate-ready')
  },
}))
