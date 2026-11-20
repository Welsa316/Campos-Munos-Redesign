// How large a person reads chat text (WhatsApp: messages, notes, the reply
// box and the conversation list). The keys and their order match
// server/auth/textSizes.js, which validates what is saved to the account.
//
// px is the size of message text; everything else in a chat (names, times,
// previews, notes) grows by the same factor, so the page keeps its shape.
// standard is the size chats always had.
export const TEXT_SIZES = Object.freeze([
  { key: 'standard', px: 14 },
  { key: 'large', px: 16 },
  { key: 'larger', px: 18 },
  { key: 'very_large', px: 20 },
  { key: 'largest', px: 23 },
])
export const DEFAULT_TEXT_SIZE = 'standard'
const BASE_PX = 14

export const textSizeFor = (key) => (TEXT_SIZES.some((s) => s.key === key) ? key : DEFAULT_TEXT_SIZE)

/** How much bigger than standard a size is: 1, 1.14…, up to 1.64…. */
export function textScale(key) {
  const size = TEXT_SIZES.find((s) => s.key === textSizeFor(key))
  return size.px / BASE_PX
}
