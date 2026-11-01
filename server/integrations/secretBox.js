// Authenticated encryption for third-party credentials stored in Postgres
// (OAuth access and refresh tokens). AES-256-GCM with a random 96-bit IV per
// value and an AAD naming what the value is ("ringcentral:refresh_token"),
// so a ciphertext copied into another column or another provider's row does
// not decrypt.
//
// Stored form: "v1.<kid>.<iv>.<tag>.<ciphertext>". kid is a short public
// fingerprint of the key, so a value sealed under a different key (the key
// was changed) is recognised as such instead of failing as "corrupt".
//
// The key is never stored in the database.
import crypto from 'crypto'

const VERSION = 'v1'
const IV_BYTES = 12

export class SecretBoxError extends Error {
  constructor(message, code = 'secret_box') {
    super(message)
    this.name = 'SecretBoxError'
    this.code = code
  }
}

/** Parse a 32-byte key from hex or base64. Returns null when absent or malformed. */
export function parseKey(raw) {
  const s = String(raw ?? '').trim()
  if (!s) return null
  if (/^[0-9a-f]{64}$/i.test(s)) return Buffer.from(s, 'hex')
  if (/^[A-Za-z0-9+/_-]+={0,2}$/.test(s)) {
    const buf = Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
    if (buf.length === 32) return buf
  }
  return null
}

/** A 32-byte key derived from a server-side secret with HKDF-SHA256. */
export function deriveKey(secret, info) {
  if (!secret) throw new SecretBoxError('No secret to derive a key from', 'invalid_key')
  return Buffer.from(crypto.hkdfSync('sha256', Buffer.from(String(secret), 'utf8'), Buffer.from('camulaw-integrations-v1'), Buffer.from(String(info)), 32))
}

/** Public, non-reversible key fingerprint (8 hex chars). */
export const keyId = (key) => crypto.createHash('sha256').update(Buffer.concat([Buffer.from('kid:'), key])).digest('hex').slice(0, 8)

export function createSecretBox(key) {
  if (!Buffer.isBuffer(key) || key.length !== 32) {
    throw new SecretBoxError('Encryption key must be 32 bytes', 'invalid_key')
  }
  const kid = keyId(key)
  return {
    kid,
    seal(plaintext, context) {
      if (typeof plaintext !== 'string' || !plaintext) throw new SecretBoxError('Nothing to encrypt', 'empty')
      if (!context) throw new SecretBoxError('Encryption context is required', 'no_context')
      const iv = crypto.randomBytes(IV_BYTES)
      const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
      cipher.setAAD(Buffer.from(String(context), 'utf8'))
      const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
      const tag = cipher.getAuthTag()
      return [VERSION, kid, iv.toString('base64url'), tag.toString('base64url'), ct.toString('base64url')].join('.')
    },
    open(sealed, context) {
      const parts = String(sealed ?? '').split('.')
      if (parts.length !== 5 || parts[0] !== VERSION) throw new SecretBoxError('Unrecognised ciphertext', 'bad_format')
      if (parts[1] !== kid) throw new SecretBoxError('Stored value was encrypted with a different key', 'key_changed')
      try {
        const [iv, tag, ct] = parts.slice(2).map((p) => Buffer.from(p, 'base64url'))
        const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
        decipher.setAAD(Buffer.from(String(context), 'utf8'))
        decipher.setAuthTag(tag)
        return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8')
      } catch {
        // Wrong context or tampered value: all the same to a caller.
        throw new SecretBoxError('Could not decrypt the stored value', 'decrypt_failed')
      }
    },
  }
}

export const sha256Hex = (value) => crypto.createHash('sha256').update(String(value)).digest('hex')

/** Constant-time comparison of two hex digests of equal length. */
export function digestsEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length || !/^[0-9a-f]*$/i.test(a + b)) return false
  return crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'))
}

export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url')

export default { parseKey, deriveKey, keyId, createSecretBox, sha256Hex, digestsEqual, randomToken }
