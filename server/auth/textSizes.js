// How large a person reads chat text in the portal (WhatsApp: messages,
// notes, the reply box and the conversation list). Saved to their account,
// like the colour theme, so it follows them to any computer. Keep in step
// with admin/src/data/textSizes.js, which holds what each size looks like.
export const TEXT_SIZES = Object.freeze(['standard', 'large', 'larger', 'very_large', 'largest'])
export const DEFAULT_TEXT_SIZE = 'standard'

/** A stored value as the portal should use it: unknown or empty is the default. */
export const textSizeFor = (value) => (TEXT_SIZES.includes(value) ? value : DEFAULT_TEXT_SIZE)

export default { TEXT_SIZES, DEFAULT_TEXT_SIZE, textSizeFor }
