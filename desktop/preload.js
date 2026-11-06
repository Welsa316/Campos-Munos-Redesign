'use strict'
// Runs sandboxed before the portal loads. The only thing the page learns is
// that it is inside the desktop app (so it can, for example, skip its own
// Web Push prompt). No Node, no IPC, no Electron APIs are exposed.
const { contextBridge } = require('electron')

const version = (process.argv.find((a) => a.startsWith('--cm-version=')) || '').slice('--cm-version='.length)

contextBridge.exposeInMainWorld('campos', Object.freeze({ desktop: true, version }))
