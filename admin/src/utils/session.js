// Sign-in and sign-out details kept free of Vue, so they test in plain Node.

/**
 * Whether a sign-out reached the server. Until the server clears the session
 * cookie the session still works (a reload signs straight back in), so a
 * sign-out that never arrived must not look like one.
 * @param {() => Promise<{ok: boolean}>} post  sends POST /api/auth/logout
 */
export async function signOutReached(post) {
  try {
    const res = await post()
    return !!res && res.ok === true
  } catch {
    return false
  }
}

export const LOGIN_EMAIL_KEY = 'cm-login-email'

/**
 * Remember the sign-in address only for "Keep me signed in"; otherwise forget
 * any address kept from before, so a shared computer does not show it.
 */
export function saveLoginEmail(storage, email, remember) {
  try {
    if (remember) storage.setItem(LOGIN_EMAIL_KEY, String(email).trim())
    else storage.removeItem(LOGIN_EMAIL_KEY)
  } catch { /* private window: nothing to remember */ }
}

export function readLoginEmail(storage) {
  try { return storage.getItem(LOGIN_EMAIL_KEY) || '' } catch { return '' }
}
