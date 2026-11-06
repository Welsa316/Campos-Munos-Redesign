// What the notification settings tell someone to check depends on their
// computer and browser: a Mac's settings are not Windows'.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { platformOf, browserName, testSentHelp, blockedHelp } from '../src/utils/push.js'

const MAC_CHROME = { userAgentData: { platform: 'macOS' }, userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36' }
const MAC_SAFARI = { platform: 'MacIntel', userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15' }
const WIN_EDGE = { userAgentData: { platform: 'Windows' }, userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0' }

test('the computer and browser are told apart', () => {
  assert.equal(platformOf(MAC_CHROME), 'mac')
  assert.equal(platformOf(MAC_SAFARI), 'mac')
  assert.equal(platformOf(WIN_EDGE), 'windows')
  assert.equal(browserName(MAC_CHROME), 'Google Chrome')
  assert.equal(browserName(MAC_SAFARI), 'Safari')
  assert.equal(browserName(WIN_EDGE), 'Microsoft Edge')
})

test('a Mac is sent to System Settings, Windows to its own settings', () => {
  assert.match(testSentHelp(MAC_CHROME), /System Settings → Notifications → Google Chrome/)
  assert.doesNotMatch(testSentHelp(MAC_CHROME), /Windows/)
  assert.match(testSentHelp(WIN_EDGE), /Settings → System → Notifications/)
  assert.match(testSentHelp(WIN_EDGE), /Microsoft Edge/)
})

test('Safari is told where Safari keeps the setting', () => {
  assert.match(blockedHelp('admin.camulaw.com', MAC_SAFARI), /Safari → Settings → Websites → Notifications/)
  assert.match(blockedHelp('admin.camulaw.com', MAC_CHROME), /Site settings/)
})
