// Profile pictures for staff accounts (docs/staff-accounts.md, "Avatars").
//
// Two kinds, chosen by each person on the portal's Home page:
//   fluent  3D animals from Microsoft's Fluent Emoji (MIT), bundled with the
//           portal in admin/public/avatars/fluent/<key>.png
//   emoji   an emoji drawn by the viewer's own system (looks Apple-like on a
//           Mac, Microsoft-like on Windows)
// on one of a few background colours. Only these values are accepted, so an
// avatar can never carry arbitrary text or a link. The portal keeps the same
// lists in admin/src/data/avatars.js (pinned together by avatars.test.js).
export const FLUENT_AVATARS = Object.freeze([
  'monkey', 'fox', 'panda', 'owl', 'koala', 'tiger', 'lion', 'frog',
  'penguin', 'rabbit', 'unicorn', 'hamster', 'dog', 'cat', 'bear', 'octopus',
])

export const EMOJI_AVATARS = Object.freeze([
  '🐵', '🦊', '🐼', '🦉', '🐨', '🐯', '🦁', '🐸', '🐧', '🐰', '🦄', '🐹',
  '🐶', '🐱', '🐻', '🐙', '🦋', '🐢', '🐬', '🌻', '🌵', '🍀', '⭐', '☕',
])

export const AVATAR_COLORS = Object.freeze(['sky', 'rose', 'sand', 'mint', 'lilac', 'slate', 'navy'])

/** "fluent:fox" / "emoji:🦊" → { kind, key } when valid, else null. */
export function parseAvatar(value) {
  const s = String(value ?? '')
  const i = s.indexOf(':')
  if (i < 0) return null
  const kind = s.slice(0, i)
  const key = s.slice(i + 1)
  if (kind === 'fluent' && FLUENT_AVATARS.includes(key)) return { kind, key }
  if (kind === 'emoji' && EMOJI_AVATARS.includes(key)) return { kind, key }
  return null
}

/**
 * The avatar to show for an account: the one they chose, or until then a
 * stable default picked from their id, so colleagues start out different.
 */
export function avatarFor({ id, avatar, avatar_bg: bg }) {
  const chosen = parseAvatar(avatar)
  const n = Math.abs(Number(id) || 0)
  return {
    ...(chosen || { kind: 'fluent', key: FLUENT_AVATARS[n % FLUENT_AVATARS.length] }),
    bg: AVATAR_COLORS.includes(bg) ? bg : AVATAR_COLORS[(n * 3) % (AVATAR_COLORS.length - 1)],
    chosen: Boolean(chosen),
  }
}

export default { FLUENT_AVATARS, EMOJI_AVATARS, AVATAR_COLORS, parseAvatar, avatarFor }
