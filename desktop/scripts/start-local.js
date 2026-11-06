'use strict'
// npm run start:local: the app against a portal and API running on this
// computer (admin on :5420, server on :3410). Works the same on macOS and
// Windows, where "VAR=value command" is not shell syntax.
const { spawn } = require('node:child_process')
const electron = require('electron')

const env = {
  ...process.env,
  CM_PORTAL_URL: process.env.CM_PORTAL_URL || 'http://localhost:5420',
  CM_API_URL: process.env.CM_API_URL || 'http://localhost:3410',
}
const child = spawn(electron, ['.'], { cwd: `${__dirname}/..`, env, stdio: 'inherit' })
child.on('exit', (code) => process.exit(code ?? 0))
