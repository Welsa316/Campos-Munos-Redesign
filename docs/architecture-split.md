# Splitting camulaw.com into site, admin and API

Status: implemented on branch `feat/split-site-admin-api`. Nothing is deployed,
no DNS has changed, and the current Railway service is untouched.

## 1. Target architecture

| Host | App | Directory | Serves |
|---|---|---|---|
| `camulaw.com` (+ `www`) | Public website | `site/` | Vue/Vite SPA with prerendered heads, served by `site/server/index.js`, which also owns the Wix 301 map, www→apex, real 404s and the site CSP. |
| `admin.camulaw.com` | Staff portal | `admin/` | Independent Vue/Vite app (inbox, contacts, notes, replies, operations demo), served by `admin/server.js` with a strict CSP and `noindex`. |
| `api.camulaw.com` | API | `server/` | Express: `/api/*`, `/webhooks/whatsapp`, `/healthz`, `/readyz`. No pages. |

All three stay in this monorepo and deploy as separate Railway services, each
from its own directory, each rebuilt only when its own directory changes.

The current single service keeps working unchanged through the whole migration
(section 6, "transitional mode").

## 2. Dependency analysis (before the split)

How the one Express process and one SPA depended on each other on `main`:

| Concern | Lived in | Depended on | After the split |
|---|---|---|---|
| Admin routes `/admin`, `/admin/login`, `/admin/demo/operations` | `site/src/router/index.js` with an auth guard calling `/api/auth/verify` | `useAuth`, `useApi`, admin views | `admin/src/router/routes.js`. The site router has no admin routes, no auth guard, no auth client. |
| Admin components (inbox, list, detail, reply box, contacts, password modal) | `site/src/components/admin/` | `useApi` (cookie credentials), `vue-i18n` for labels, `leadStatuses`, `consultationTypes`, `countries`, `phone` | `admin/src/components/messages/`. Labels come from `admin/src/data/consultationTypes.js` (both languages, copied from the site's messages) instead of the site's whole i18n bundle. |
| Operations demo | `site/src/demo/operations`, `site/src/views/OperationsDemo.vue` | `leadStatuses` | `admin/src/demo/operations` |
| Lead statuses | `site/src/data/leadStatuses.js` | pinned to the API and DB by `server/leadStatuses.test.js` | `admin/src/data/leadStatuses.js` (the site never used it); test path updated. |
| Consultation types | `site/src/data/consultationTypes.js` | API whitelist + DB CHECK | Site keeps its copy for the form; the portal has its own. `server/consultationTypes.test.js` now pins all four lists together. |
| API client | `site/src/composables/useApi.js`, `credentials: 'include'` for everything | | Site: `site/src/utils/publicApi.js`, `credentials: 'omit'` (the website never needs the cookie). Portal: `admin/src/composables/useApi.js`, `credentials: 'include'`. |
| Admin chrome suppression | `App.vue` `isAdminRoute` (hid header/footer/chat, added `noindex`) | | Removed from the site. The portal has its own shell and `noindex` meta, header and robots.txt. |
| Analytics | `site/src/utils/analytics.js` skipped `/admin`; gtag + OpenAI pixel in `site/index.html` | | Site unchanged. The portal's `index.html` loads no analytics or pixels, enforced by `admin/scripts/check-bundle.js`. |
| Contact form, chat | `ContactPage.vue`, `ChatWidget.vue` → `/api/submissions` | same-origin cookie-less in practice | Same calls to `VITE_API_BASE_URL` (api.camulaw.com) with CORS. Chat follow-ups still use the per-session `chat_token`. |
| Prerendered heads + `route-manifest.json` | `site/scripts/prerender.js`, served by `server/index.js` | manifest listed `/admin*` as real routes | Same script, `/admin*` removed from the manifest. Served by `site/server/app.js`. |
| Wix 301 map, www→apex, real 404s, `index.html` cache headers, site CSP | `server/index.js`, `server/legacyRedirects.js` | `site/dist` | `site/server/app.js` + `site/server/legacyRedirects.js` (moved with its tests). |
| WhatsApp webhook | `server/routes/whatsapp.js` at `camulaw.com/webhooks/whatsapp` | raw-body HMAC, mounted before `express.json()` | Unchanged route, now at `api.camulaw.com/webhooks/whatsapp`. The site's cutover proxy forwards the old URL byte-for-byte until Meta's callback URL is changed. |
| Auth cookie | `token`, httpOnly, `SameSite=Lax`, host-only on `camulaw.com` | same-origin SPA | Host-only on `api.camulaw.com`, still Lax. Portal and API are the same *site*, so the cookie is sent; see section 4. |
| CORS | `FRONTEND_URL`, credentials for that one origin | | `ADMIN_ORIGINS` (credentialed) and `PUBLIC_ORIGINS` (no credentials). `FRONTEND_URL` still honoured. |
| Rate limits | `req.ip` with `trust proxy 1` | | Unchanged for direct traffic; through the site's cutover proxy the visitor IP arrives in `X-CM-Client-IP`, trusted only with `SITE_PROXY_SECRET`. |
| PostgreSQL | `server/db/*` | | Unchanged. No migrations added, no data touched. |
| Notification emails | `server/routes/submissions.js` | no links to the portal | Unchanged. |

Nothing in the API linked to the site or portal by URL, so no stored data or
email template needed changing.

## 3. What changed, by app

### `admin/` (new)
- `package.json`, `vite.config.js` (`ADMIN_BASE`: `/` standalone, `/admin/` transitional), `index.html` (noindex, no analytics), `public/robots.txt` (`Disallow: /`).
- `src/router/` route table grouped by module; `?next=` return path accepted only for in-portal paths (`src/utils/safeNext.js`).
- `src/composables/useApi.js`: API origin from `VITE_API_BASE_URL`, cookie credentials, base-aware redirect to login on 401.
- `src/icons.js`: registers every icon the portal uses. Six icons used on `main` were never registered and rendered blank (search, check, chevron-up, note, trash, warning triangle); they now render.
- `server.js`: static host with CSP `script-src 'self'`, `frame-ancestors 'none'`, `connect-src 'self' <API_ORIGIN>`, `X-Robots-Tag: noindex`, immutable hashed assets, 404 for missing assets instead of `index.html`.
- `scripts/check-bundle.js`: fails the build if the portal bundle contains GA, the OpenAI pixel or Elfsight.
- Inbox header: on phones the logo and button labels collapse, matching the operations demo header. On `main` the Export/Password/Sign Out buttons overlapped the Inbox/Contacts toggle at 375px and Sign Out ran off-screen.

### `site/`
- Admin routes, views, components, demo, auth client removed. `App.vue` no longer branches on admin routes.
- `src/utils/publicApi.js` replaces `useApi.js`; requests omit credentials.
- `server/app.js`, `server/index.js`, `server/proxy.js`, `server/legacyRedirects.js` (moved from `server/`).
- `scripts/check-bundle.js`, run by `npm run build`: fails the build if any portal marker reaches the public bundle. Against `main`'s build it reports 10 hits; against this branch, none.
- `package.json`: `start` runs the site host; `serve` replaced by `express` + `helmet`.

### `server/`
- `app.js`: the Express app without boot (testable). `index.js`: env checks, boot, transitional mount.
- `httpSecurity.js`: origin lists, CORS delegate, cross-origin write check, client-IP resolution, cookie options.
- `frontends.js`: transitional single-service mount of `admin/dist` at `/admin` and the site router at `/`.
- Rate limiters key on `req.clientIp`. Production boot requires `ADMIN_ORIGINS` or `FRONTEND_URL` (was `FRONTEND_URL`).
- `helmet()` defaults for the API; the site CSP moved to the site.

### Root
- `package.json`: `postinstall` installs `admin/` too; `build` builds the site and the portal (with `ADMIN_BASE=/admin/`); `test` runs all three suites.
- `nixpacks.toml` (root) fixed (it referenced a non-existent `install:all` script) and `site/nixpacks.toml` extended to build the portal, so every existing build path produces the same transitional service.
- `server/railway.json`, `site/railway.json`, `admin/railway.json`: config-as-code for the three new services.

## 4. Security model

**Cookie.** `token` stays httpOnly, `SameSite=Lax`, `Secure` in production,
8 h, and host-only (no `Domain`), so it is never sent to `camulaw.com` or
`admin.camulaw.com`, only to `api.camulaw.com`. `admin.` and `api.` share the
registrable domain `camulaw.com`, so the browser treats the portal's fetches as
same-site and sends the cookie. Staff sign in once more after cutover because
the cookie moves host.

**CORS.** Only `ADMIN_ORIGINS` get `Access-Control-Allow-Credentials`, so no
other page can read a credentialed response. `PUBLIC_ORIGINS` get CORS without
credentials, which is all the contact form and chat need. Other origins get no
CORS headers.

**Cross-origin writes.** Same-site is not same-origin: a script on
`camulaw.com` could fire a request to `api.camulaw.com` with the staff cookie
attached. So any non-GET request that carries the session cookie, and every
`/api/auth/*` write, must come from an `ADMIN_ORIGINS` origin, from the API's
own host (transitional mode), or through the authenticated site proxy with a
matching forwarded host. Otherwise: `403 Origin not allowed`. Requests without
the cookie (contact form, chat, Meta) are unaffected.

**Client IP through the proxy.** The site proxy strips any incoming
`X-CM-Client-IP` / `X-CM-Proxy-Secret`, then adds the real visitor IP and the
shared secret. The API trusts the header only when the secret matches
(constant-time compare) and the value is a valid IP.

**Portal hardening.** No third-party script, no inline script, never framed,
never indexed, no source maps, `Referrer-Policy: same-origin`.

**Webhook.** Unchanged: HMAC over raw bytes with `META_APP_SECRET`, fails
closed. The proxy streams the body untouched, which a test asserts.

## 5. Railway configuration

Create three new services in the same Railway project as the existing one
and its Postgres. Each one:

| Setting | API | Website | Portal |
|---|---|---|---|
| Source | this GitHub repo | this GitHub repo | this GitHub repo |
| Root Directory | `server` | `site` | `admin` |
| Config-as-code path | `/server/railway.json` | `/site/railway.json` | `/admin/railway.json` |
| Builder | Railpack | Railpack | Railpack |
| Watch paths (from config) | `/server/**` | `/site/**` | `/admin/**` |
| Build | (none; `npm ci`) | `npm run build` | `npm run build` |
| Start | `npm start` (runs migrate + seed, both idempotent) | `npm start` | `npm start` |
| Health check | `/readyz` | `/healthz` | `/healthz` |
| Custom domain | `api.camulaw.com` | `camulaw.com`, `www.camulaw.com` (at cutover) | `admin.camulaw.com` |

Watch paths are what keep an unrelated change from rebuilding a service: a
commit touching only `site/` redeploys only the website.

Railway reads config-as-code from the repo root unless told otherwise, even
when a Root Directory is set, so set each service's config path explicitly
(Service → Settings → Config-as-code).

### Environment variables

API (`server/.env.example` documents each):

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | reference the existing Postgres service variable (same database) |
| `JWT_SECRET` | same value as the current service |
| `ADMIN_ORIGINS` | `https://admin.camulaw.com` |
| `PUBLIC_ORIGINS` | `https://camulaw.com,https://www.camulaw.com` |
| `SERVE_FRONTENDS` | `false` |
| `SITE_PROXY_SECRET` | new random value (`openssl rand -hex 32`), same on the website |
| `ADMIN_EMAIL`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `RESEND_FROM_NAME`, `RESEND_NOTIFY_FROM_EMAIL` | copy from the current service |
| `WHATSAPP_VERIFY_TOKEN`, `META_APP_SECRET` | copy from the current service |
| `PG_CA_CERT` | copy if set |

`ADMIN_INITIAL_PASSWORD` is not needed: the admin row already exists and the
seed skips. Do not set `FRONTEND_URL` on the new API. If it is copied over by
mistake (it is `https://camulaw.com` on the old service), the API still treats
any origin listed in `PUBLIC_ORIGINS` as public only and logs a warning, so the
public site never gets credentialed access.

Website (`site/.env.example`):

| Variable | Value | When |
|---|---|---|
| `VITE_API_BASE_URL` | `https://api.camulaw.com` | build time |
| `ADMIN_URL` | `https://admin.camulaw.com` | runtime |
| `API_ORIGIN` | `https://api.camulaw.com` | runtime (CSP `connect-src`) |
| `API_PROXY_TARGET` | `https://api.camulaw.com` | runtime, during cutover only |
| `SITE_PROXY_SECRET` | same as the API | runtime, while the proxy is on |

The website service also needs Git LFS only if any `site/public/*.mp4` is
still referenced; the service pages currently stream video from Cloudflare R2.
Check before cutover (`grep -rn "\.mp4" site/src`).

Portal (`admin/.env.example`):

| Variable | Value | When |
|---|---|---|
| `VITE_API_BASE_URL` | `https://api.camulaw.com` | build time |
| `ADMIN_BASE` | `/` (default) | build time |
| `API_ORIGIN` | `https://api.camulaw.com` | runtime (CSP `connect-src`) |

### Staging on Railway domains

`*.up.railway.app` is a public suffix, so a portal and an API on two Railway
domains are cross-site and a Lax cookie is not sent. For a staging test on
Railway domains only, set `COOKIE_SAMESITE=none` on the staging API. Never in
production.

## 6. Transitional mode

Until DNS moves, the existing service keeps running from the repo root
exactly as today, built by the root `package.json`:

- `postinstall` installs site, portal and API.
- `build` builds the site and the portal with `ADMIN_BASE=/admin/` and an
  empty `VITE_API_BASE_URL` (same origin).
- `start` runs the API, which sees `site/dist` and `admin/dist` beside it and
  mounts the portal at `/admin` and the site router at `/`
  (`server/frontends.js`).

So merging this branch to `main` and letting the current service redeploy
changes nothing visible: same URLs, same redirects, same 404s, same login at
`/admin/login`. The portal is now a separate bundle, so the public bundle no
longer ships it. This was verified locally (section 9). The new services
only differ in that they run one app each.

## 7. Migration plan

Each phase is reversible and the site stays up throughout.

0. **Merge.** Review and merge `feat/split-site-admin-api` to `main`. The
   current service redeploys in transitional mode. Check `/`, a service page,
   `/asylum` (301), an unknown URL (404), `/admin/login` and a login.
   Rebase `lp/defensa-deportacion` onto the new `main` before merging it: it
   predates the split and edits `site/src/router/index.js`.
1. **API service.** Create it (section 5) with `api.camulaw.com`. Wait for the
   certificate. Check `https://api.camulaw.com/readyz` → `{"ok":true}`. It
   shares the database, so it is live from this moment, but nothing calls it
   yet. Do not deploy it at the same moment as the current service: both run
   the idempotent migration at start, and two concurrent runs can race on the
   status constraint swap.
2. **Portal service.** Create it with `admin.camulaw.com`. Sign in at
   `https://admin.camulaw.com/login`, open a lead, add a note, export CSV.
   Staff can start using it now; `/admin` on the current service still works.
3. **Website service.** Create it **without** a custom domain first, with
   `API_PROXY_TARGET` and `SITE_PROXY_SECRET` set. Its bundle calls
   `api.camulaw.com` directly, so temporarily add its Railway URL
   (`https://<name>.up.railway.app`) to `PUBLIC_ORIGINS` on the API, or the
   form and chat preflights fail during this check. On its Railway URL check:
   home, a service page in ES and EN, a legacy redirect, an unknown URL (404),
   the contact form and chat (both post to the API), and that `/admin` 302s to
   the portal.
4. **Cutover.** Lower the TTL on the `camulaw.com` / `www` DNS records to 300 s
   a day ahead. At a quiet hour, move the `camulaw.com` and `www.camulaw.com`
   custom domains from the current service to the website service and update
   DNS to the targets Railway shows. Railway attaches a domain to one service
   at a time, so expect a short window (typically the certificate issue time)
   while it moves; the old and new services serve identical pages, so a
   visitor sees either one, never a broken page, once the certificate is up.
   This step could not be rehearsed locally; confirm Railway's behaviour on
   the dashboard before the window.
5. **WhatsApp.** In Meta App Dashboard → WhatsApp → Configuration, change the
   callback URL to `https://api.camulaw.com/webhooks/whatsapp` (same verify
   token). Until then the website proxies the old URL.
6. **Clean up, after 7 days with no proxied traffic** (search the website's
   logs for `API proxy`, the API's for `/api` requests whose host is
   `camulaw.com`): unset `API_PROXY_TARGET` and `SITE_PROXY_SECRET` on both
   services; remove the old service (keep it stopped a further week first).
   Remove the website's Railway URL from `PUBLIC_ORIGINS`.
   Then delete `FRONTEND_URL` everywhere and, optionally, the transitional
   mode (`server/frontends.js`, root build scripts).

## 8. Production cutover checklist

Before the window
- [ ] Branch merged; current service redeployed in transitional mode and checked (phase 0).
- [ ] API service healthy on `api.camulaw.com/readyz`; env per section 5; `SERVE_FRONTENDS=false`.
- [ ] Portal service healthy; real staff login, note, status change and CSV export on `admin.camulaw.com`.
- [ ] Website service healthy on its Railway URL; `npm run build` log shows "Public bundle check passed".
- [ ] On the website's Railway URL: ES and EN pages, contact form, chat, payment page, `/asylum` → 301, `/en/asylum` → 301, unknown URL → 404, `/admin` → 302 to the portal.
- [ ] `curl -s https://<site-railway-url>/servicios/asilo | grep canonical` shows `https://camulaw.com/servicios/asilo`.
- [ ] Same `SITE_PROXY_SECRET` on website and API.
- [ ] DNS TTL lowered to 300 s at least 24 h before.
- [ ] Backup of the Postgres database taken (Railway → Postgres → Backups).

During the window
- [ ] Move `camulaw.com` and `www.camulaw.com` to the website service; update DNS.
- [ ] `curl -sI https://camulaw.com/` → 200 with the site CSP (`googletagmanager` in `content-security-policy`).
- [ ] `curl -sI https://www.camulaw.com/greencards` → 301 to `https://camulaw.com/servicios/green-card`.
- [ ] `curl -sI https://camulaw.com/no-such-page` → 404.
- [ ] `curl -sI https://camulaw.com/admin/login` → 302 to `https://admin.camulaw.com/login`.
- [ ] Submit the contact form on camulaw.com; it appears in the portal; the office alert email arrives.
- [ ] Open the chat widget, send a message and a follow-up; both appear on the lead.
- [ ] GA4 Realtime shows the visit; the `generate_lead` event fires on the form.
- [ ] `curl -i -X POST https://camulaw.com/webhooks/whatsapp -d '{}'` → 401 (reached the API through the proxy).

After
- [ ] Meta callback URL changed to `api.camulaw.com` and a test delivery stored (`docs/whatsapp-webhook.md`, "Verifying a deploy").
- [ ] Google Search Console: inspect a service URL; the live test sees the prerendered head.
- [ ] Watch the API's 4xx/5xx and `Cross-origin write refused` log lines for a day.
- [ ] Phase 6 clean-up scheduled.

### Rollback

- Before DNS moves: nothing to roll back; the current service is unchanged.
- After DNS moves: move the two custom domains back to the old service. It
  still has its environment and the transitional build, and serves `/admin`
  and `/api` itself. The new services can stay up.
- After merging, if transitional mode misbehaves: redeploy the previous
  deployment from Railway's deployment list, then revert the merge.

## 9. Tests and verification

Automated (`npm test` at the repo root builds, then runs all three; the site's real-build checks skip if run without a build):

| Suite | Count | Covers |
|---|---|---|
| `server/` | 59 | Existing API and webhook tests, plus `splitDeployment.test.js` (CORS per origin, cross-origin write refusal including case-variant paths and the proxy branch, public origins never credentialed, proxied client IP in rate limiting, forged IP ignored, cookie options, API serves no pages, transitional mount under production rules: portal CSP on `/admin`, www→apex for `/admin`, real site router with legacy 301, www→apex, prerendered head, 404) and `consultationTypes.test.js` (API, DB, site and portal lists agree). |
| `site/` | 22 | Moved Wix redirect tests; site host: portal redirect, proxy forwards the webhook body byte-for-byte with its signature, IP forwarding only with the secret, 502 on a dead API, CSP `connect-src`; against the real build: every prerendered route serves its own canonical, unknown and `/admin` URLs 404, every Wix redirect lands on a real page; the bundle guard flags a portal chunk. |
| `admin/` | 5 | Open-redirect guard on login return path, portal host headers and SPA fallback, missing build, robots.txt, every template icon registered. |

An independent review of the branch found a case-variant path (`/api/AUTH/login`) that skipped the login origin check, `FRONTEND_URL` able to make the public site a credentialed origin, a runbook step that would fail, `www.camulaw.com/admin` no longer folding into the apex in transitional mode, the proxy not releasing upstream sockets on visitor disconnect, and portal labels ignoring the site's saved language. Each was fixed with a test that failed first.

Each security test was checked by breaking the code it protects and confirming
it fails: removing the origin check, the client-IP key, the public-origin
credential rule, the proxy secret check, the proxy's header stripping, the
portal redirect, and an icon registration each turned the matching test red.

Manual, in a browser, against a scratch local Postgres:
- Transitional mode: `/admin` → login → inbox; note added and status changed (persisted); site pages, 301s, 404s and `/api` JSON 404 as before.
- Three services on three ports: public contact form posts cross-origin (preflight 204, POST 201); chat create + token follow-up (201/201); portal sign-out and sign-in cross-origin; the new lead appears; CSV export with credentials; `/admin` on the site → 302 to the portal; site proxy reaches the API; login from the public origin → 403.
- Phone width (375 px): portal header fits with no overlaps; site service page in Spanish has no horizontal overflow.

## 10. Known issues found during the work (not changed here)

- **The production CSP blocks Google Ads and the OpenAI pixel config.** The
  console shows `googleads.g.doubleclick.net`, `www.google.com/ccm` and
  `/rmkt`, `ad.doubleclick.net`, and `bzrcdn.openai.com/pixel-config` refused
  by `connect-src` / `img-src` / `script-src-elem`. The CSP was moved
  verbatim, so this is the live behaviour today: Google Ads conversions and
  remarketing (AW-16893588137) are likely not being recorded. Fix by adding
  those hosts to `SITE_CSP` in `site/server/app.js`; kept out of this change
  so the migration does not alter behaviour.
- Pre-existing, unchanged: `req.hostname` honours the first value of a
  client-supplied `X-Forwarded-Host`, so a hand-made request can get the www→apex
  301 pointed at another host. Only exploitable through a shared cache; worth
  pinning the redirect target to `https://camulaw.com` in a follow-up.
- Elfsight reviews widget reports `APP_VIEWS_LIMIT_REACHED` (plan limit, not code).

## 11. Adding a portal module (billing and beyond)

The planned billing importer, monday.com sync and WhatsApp reminder queue
(`docs/billing-automation-plan.md` on `feat/billing-automation`) belong in
the portal, not the public site:

- Routes: a block under its own prefix in `admin/src/router/routes.js`
  (`/billing`, `/billing/imports`, …) with `meta: { requiresAuth: true, module: 'billing' }`
  and lazy components, so the inbox chunk is unaffected.
- Code: `admin/src/modules/billing/` (views, components, composables).
- API: a new router under `/api/billing` in `server/app.js`. It inherits the
  cookie auth and the cross-origin write check automatically; role checks go
  in a `requireRole` middleware beside `requireAuth`.
- Uploads (invoice reports): `multipart` or raw bodies need their own body
  parser on that router; the global `express.json()` is capped at 100 kB.
- The public bundle guard (`site/scripts/check-bundle.js`) already treats
  `/api/billing/` as a portal marker; add the API prefix of any further module.
