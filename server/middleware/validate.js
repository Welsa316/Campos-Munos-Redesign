import { validationResult } from 'express-validator'

export default function validate(req, res, next) {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    const all = errors.array()
    // Keep `error` (first message) for backward compatibility; add a field-keyed
    // `errors` array so the client can flag every invalid field at once.
    return res.status(400).json({
      error: all[0].msg,
      errors: all.map((e) => ({ field: e.path, msg: e.msg })),
    })
  }
  next()
}
