// Profile pictures (server/auth/avatars.js holds the same lists and is the
// one that decides what may be saved; server/avatars.test.js pins them).
// 3D animals: Microsoft Fluent Emoji (MIT), see THIRD_PARTY_NOTICES.md.
export const FLUENT_AVATARS = [
  { key: 'monkey', label: 'Monkey' }, { key: 'fox', label: 'Fox' }, { key: 'panda', label: 'Panda' },
  { key: 'owl', label: 'Owl' }, { key: 'koala', label: 'Koala' }, { key: 'tiger', label: 'Tiger' },
  { key: 'lion', label: 'Lion' }, { key: 'frog', label: 'Frog' }, { key: 'penguin', label: 'Penguin' },
  { key: 'rabbit', label: 'Rabbit' }, { key: 'unicorn', label: 'Unicorn' }, { key: 'hamster', label: 'Hamster' },
  { key: 'dog', label: 'Dog' }, { key: 'cat', label: 'Cat' }, { key: 'bear', label: 'Bear' }, { key: 'octopus', label: 'Octopus' },
]

export const EMOJI_AVATARS = [
  '🐵', '🦊', '🐼', '🦉', '🐨', '🐯', '🦁', '🐸', '🐧', '🐰', '🦄', '🐹',
  '🐶', '🐱', '🐻', '🐙', '🦋', '🐢', '🐬', '🌻', '🌵', '🍀', '⭐', '☕',
]

// Soft backgrounds in the spirit of Apple's, plus the firm's navy.
export const AVATAR_COLORS = [
  { key: 'sky', label: 'Sky', hex: '#dbe6f6' },
  { key: 'rose', label: 'Rose', hex: '#f8dede' },
  { key: 'sand', label: 'Sand', hex: '#f6ead3' },
  { key: 'mint', label: 'Mint', hex: '#dcefe6' },
  { key: 'lilac', label: 'Lilac', hex: '#e7e1f6' },
  { key: 'slate', label: 'Slate', hex: '#e3e7ee' },
  { key: 'navy', label: 'Navy', hex: '#003F8D' },
]

export const colorHex = (key) => (AVATAR_COLORS.find((c) => c.key === key) || AVATAR_COLORS[0]).hex
export const fluentSrc = (key) => `${import.meta.env.BASE_URL}avatars/fluent/${key}.png`
