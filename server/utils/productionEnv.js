// Whether this process is production, and what production needs at boot.
//
// NODE_ENV alone used to decide it, so a production service that lost
// NODE_ENV would have quietly dropped its hardening (Secure cookies, closed
// CORS, no 'changeme' admin). Railway names its own environment, so that
// counts too.

const RAILWAY_KEYS = ['RAILWAY_ENVIRONMENT', 'RAILWAY_ENVIRONMENT_NAME']

/** True when NODE_ENV or Railway's environment name says production. */
export function isProductionEnv(env = process.env) {
  return env.NODE_ENV === 'production' || RAILWAY_KEYS.some((k) => env[k] === 'production')
}

const weakSecret = (s) => s.length < 32 || /change[-_ ]?me/i.test(s)

/**
 * What is wrong with the environment at boot.
 *   fatal — refuse to start. Only when NODE_ENV is 'production', as before:
 *           Railway saying production on its own is not proof enough to take
 *           the site down over it, so the same problems are warnings there.
 *   warn  — log and carry on.
 */
export function bootEnvProblems(env = process.env) {
  const fatal = []
  const warn = []
  const strict = env.NODE_ENV === 'production'
  const production = isProductionEnv(env)
  if (production && !strict) {
    warn.push(`Railway says this is production but NODE_ENV is ${env.NODE_ENV ? `"${env.NODE_ENV}"` : 'not set'}; set NODE_ENV=production`)
  }
  if (production) {
    const missing = ['JWT_SECRET', 'DATABASE_URL'].filter((k) => !env[k])
    // The portal's origin, for credentialed CORS and the cross-origin write
    // check. FRONTEND_URL is the original name and still works.
    if (!env.ADMIN_ORIGINS && !env.FRONTEND_URL) missing.push('ADMIN_ORIGINS (or FRONTEND_URL)')
    if (missing.length) (strict ? fatal : warn).push(`Missing required env vars in production: ${missing.join(', ')}`)
  }
  // Whenever a secret is set, in any environment: a weak one is weak anywhere.
  if (env.JWT_SECRET && weakSecret(env.JWT_SECRET)) {
    const msg = 'JWT_SECRET is too short or contains a placeholder value. Generate at least 32 random chars.'
    ;(strict ? fatal : warn).push(msg)
  }
  return { fatal, warn }
}
