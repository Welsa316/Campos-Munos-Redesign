// The test link: what lets the public website form send into the test
// channel instead of the inbox.
//
// The website never carries the staff session (publicApi.js sends no
// cookies), so the administrator's portal mints a short-lived signed token
// and the website passes it back in the form body. Without the server's
// secret nobody can make one, and it is checked again against the account
// when used: an account that lost the capability, was disabled, or changed
// its password (token version) can no longer send tests with an old link.
import crypto from 'crypto'
import { loadAccount } from '../auth/account.js'

export const TEST_CAPABILITY = 'forms.test'
export const TEST_LINK_TTL_MS = 60 * 60 * 1000
// "t1.<account>.<tokenVersion>.<expires, epoch seconds>.<signature>"
const SHAPE = /^t1\.(\d{1,10})\.(\d{1,10})\.(\d{10,11})\.([A-Za-z0-9_-]{43})$/

// Its own key, derived from the session secret, so a test token can never
// be mistaken for anything else signed with JWT_SECRET.
const keyFor = (secret) => crypto.createHmac('sha256', String(secret)).update('cm-test-channel-v1').digest()
const sign = (secret, payload) => crypto.createHmac('sha256', keyFor(secret)).update(payload).digest('base64url')

export function mintTestToken({ accountId, tokenVersion }, { secret = process.env.JWT_SECRET, now = Date.now() } = {}) {
  if (!secret) throw new Error('JWT_SECRET is not set')
  const expires = Math.floor((now + TEST_LINK_TTL_MS) / 1000)
  const payload = `t1.${Number(accountId)}.${Number(tokenVersion)}.${expires}`
  return { token: `${payload}.${sign(secret, payload)}`, expiresAt: new Date(expires * 1000).toISOString() }
}

/** The signed claims, or null: wrong shape, bad signature or expired. No database. */
export function readTestToken(token, { secret = process.env.JWT_SECRET, now = Date.now() } = {}) {
  if (typeof token !== 'string' || !secret) return null
  const m = SHAPE.exec(token)
  if (!m) return null
  const [, accountId, tokenVersion, expires, mac] = m
  const expected = sign(secret, `t1.${accountId}.${tokenVersion}.${expires}`)
  if (!crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null
  if (Number(expires) * 1000 <= now) return null
  return { accountId: Number(accountId), tokenVersion: Number(tokenVersion) }
}

/**
 * The account a test token speaks for, or null. Signed, unexpired, and the
 * account still active, on the same token version, and holding the test
 * capability.
 */
export async function verifyTestToken(db, token, opts = {}) {
  const claims = readTestToken(token, opts)
  if (!claims) return null
  const account = await loadAccount(db, claims.accountId)
  if (!account || account.disabled || account.tokenVersion !== claims.tokenVersion) return null
  if (!account.capabilities.has(TEST_CAPABILITY)) return null
  return account
}
