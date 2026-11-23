// Which WhatsApp numbers stay out of the portal, as SQL: the one rule the
// webhook's storage (db/whatsappEvents.js) and the inbox (whatsapp/inbox.js)
// both apply. A number is hidden when either
//   - someone hid it (wa_hidden_numbers: from a chat, or typed under Hidden
//     numbers), or
//   - Calls has it marked "Someone from the firm" for every call from the
//     number (rc_ignored_numbers, reason staff_test): a colleague's own phone.
//     Other reasons (spam, a verification code) say nothing about WhatsApp.
// Anything that brings messages into the portal later (messages typed on the
// phone, history sync) must ask the same question of the other party's number.
//
// Each takes the SQL expression holding the number (a column or a typed
// parameter) and returns a boolean expression.

// One comparable form per number: cm_phone_key() (digits, North American
// numbers as their last 10), and Meta's mobile prefixes folded away, since
// it reports a Mexican mobile as 521… when people write 52… (Argentina:
// 549… / 54…), the same pairs phoneVariants() expands.
export const waKeySql = (expr) =>
  `regexp_replace(regexp_replace(cm_phone_key(${expr}), '^521([0-9]{10})$', '52\\1'), '^549([0-9]{10})$', '54\\1')`

export const manuallyHiddenSql = (expr) =>
  `EXISTS (SELECT 1 FROM wa_hidden_numbers hn WHERE ${waKeySql('hn.wa_id')} = ${waKeySql(expr)})`

export const firmNumberSql = (expr) =>
  `EXISTS (SELECT 1 FROM rc_ignored_numbers fn WHERE fn.reason = 'staff_test' AND ${waKeySql('fn.counterpart_key')} = ${waKeySql(expr)})`

export const hiddenSql = (expr) => `(${manuallyHiddenSql(expr)} OR ${firmNumberSql(expr)})`

export default { waKeySql, manuallyHiddenSql, firmNumberSql, hiddenSql }
