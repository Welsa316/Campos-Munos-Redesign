// The request logger prints req.url. Some URLs carry one-time secrets in the
// query string: Meta's webhook verify token, and on the OAuth callback the
// authorization code and the state. Mask them so they never land in logs.
import { redactVerifyToken } from './whatsapp.js'

const OAUTH_PARAM_RE = /([?&](?:code|state|error_description)=)[^&#]*/gi

export function redactUrlSecrets(url) {
  if (typeof url !== 'string') return url
  let out = redactVerifyToken(url)
  if (/^\/api\/integrations\//i.test(out) || /\/integrations\/[^?]*callback/i.test(out)) {
    out = out.replace(OAUTH_PARAM_RE, '$1%5BREDACTED%5D')
  }
  return out
}

export default redactUrlSecrets
