# Deferred items from the megareview

Audit-flagged work that's been intentionally deferred. Each one has scope and
rationale so future-you (or another dev) can decide when to pick it up.

## Video CDN move (~474MB across 11 MP4s)

**State today:** the service-page videos live in `site/public/*.mp4` and are
served from the same origin as the rest of the site. Git LFS handles them
correctly during deploy (`site/nixpacks.toml` runs `git lfs pull` before
build), but every play streams from your Railway service's bandwidth pool.

| File | Size |
|---|---|
| `1-listo-defensa-en-corte-FX-listo.mp4` | 64 MB |
| `Peticiones-Familiares.mp4` | 58 MB |
| `VAWA.mp4`, `Visa-U-Listo-YT.mp4`, `Green-Card.mp4` | 57 MB each |
| `Ciudadania.mp4` | 48 MB |
| `Jovenes.mp4` | 47 MB |
| `3-Listo-Visa-T-fx-Listo.mp4` | 28 MB |
| `Listo-Proceso-consullar-fx-listo.mp4` | 21 MB |
| `2-Listo-Permiso-de-Trabajo-FX-Listo.mp4` | 20 MB |
| `Listo-DACA-Fx-LIsto.mp4` | 17 MB |

**Why defer:** can't be done without picking + provisioning a CDN.

**Options, cheapest → most-managed:**

1. **YouTube embeds** (free, zero bandwidth)
   - Upload videos to your existing YouTube channel (`@camposmunoslaw6542`)
   - Replace `<video :src="videoFile">` in `ServiceDetailPage.vue` with
     `<iframe :src="`https://www.youtube.com/embed/${ytId}`">`
   - Trade-off: branded YouTube player + suggested videos at end
   - DB change: `seoServices.js`'s `videoFile` becomes a YouTube ID string

2. **Cloudflare R2** (~$0.015/GB stored, **zero egress**)
   - Create R2 bucket, upload mp4s, point a custom subdomain at it
     (`videos.camulaw.com`)
   - Change `seoServices.js` `videoFile` paths from `/Green-Card.mp4` to
     `https://videos.camulaw.com/Green-Card.mp4`
   - Most cost-effective at scale; native HTML5 player retained

3. **Bunny CDN** (~$0.01/GB egress, $0.01/GB stored)
   - Similar to R2, slightly different pricing model
   - Comes with built-in image optimization too

**Files to touch:**
- `site/src/data/seoServices.js:53,61,75,83,91,99,113,127,135,143,151` —
  each service's `videoFile` path

After moving, the 474MB of mp4s can stay in Git LFS (for backup) but no
longer need to ship to clients. Removing them from LFS later would shrink
the clone by ~474MB.

## SSR / prerender via vite-ssg

**Attempted, rolled back.** The package was installed, main.js was
refactored to the ViteSSG factory pattern, and a build succeeded BUT:

1. App.vue's watchers for `<html lang>` and admin-noindex meta hit
   `document is not defined` errors during prerender. Each needs a
   `typeof document !== 'undefined'` guard.
2. Dynamic routes (`/servicios/:slug`, `/servicios/:service/:location`,
   `/el-equipo/:member`) emitted as literal `:slug.html` paths instead of
   one HTML file per service. Would need `ssgOptions.includedRoutes` to
   explicitly expand:
   - 15 services × 5 SEO locations = 75 service+location combinations
   - 15 base service slugs
   - 4 team members
   - Plus the static routes (home, about, contact, payment, services)
3. `useScrollReveal`, the chat widget's localStorage init, and any
   IntersectionObserver usage need similar SSR guards.

**Worth doing** for social-share crawlers (Facebook/iMessage/LinkedIn) that
don't run JS — service-page links would then show proper per-page OG
previews instead of the homepage's. Homepage sharing already works thanks
to the static OG block in `site/index.html`.

**Scope:** ~3-4 hours of focused work — refactor main.js, audit + guard
every browser-API call in components, set up the path expansion in
`includedRoutes`, run + verify each prerendered route.

**The SSR-safe guard in `site/src/i18n/index.js`** was kept from the
attempt since it's also useful defensive code — it doesn't affect runtime
behaviour.

## Inbound email replies

**Today:** when the admin replies in the dashboard, an email goes via Resend
to the client. If the client hits "Reply" in their email client, that reply
arrives at `RESEND_FROM_EMAIL` (whatever inbox you configure on Railway) —
i.e., the firm's normal email. It does NOT appear in the dashboard's chat
thread.

**Optional improvement:** wire Resend Inbound (or Postmark/SendGrid inbound)
so client email-replies land back in `chat_messages` for that submission.
Then the admin sees the full conversation in one place.

Scope: ~2-3 hours including DNS verification and a webhook endpoint.

## Image CDN / responsive variants

Images are now compressed (138MB → 3.6MB) but still ship as single files.
For real perf, add a `<picture>` with `srcset` so mobile gets a 480w/768w
variant instead of the full 1800-2000w hero. Easiest path: a Vite plugin
like `vite-imagetools` that generates variants at build time.

Scope: ~2 hours.

## Megareview (July) — flagged refactors / trade-offs (NOT auto-fixed)

The July megareview verified these as real but they were **not** applied in the
safe-fix pass because each is a refactor or a deliberate trade-off that needs a
decision or carries regression risk. The safe findings were fixed in commits
`7e22796` (backend), `c80e99e` (resilience), `cf2ac2e` (a11y), `ebd5c07`
(motion-perf), `0d6545f` (dedup).

- **FontAwesome `dom.watch()` MutationObserver** (`site/src/icons.js:96`) — a
  document-wide observer runs for the whole SPA lifetime to swap `<i>`→`<svg>`.
  Proper fix: render via `<font-awesome-icon>` (compile-time SVG). Touches ~76
  `<i>` usages and `dom.watch()` is currently relied on for dynamically-rendered
  icons, so it's a real refactor (~2-3h + full icon regression check).
- **CSP `unsafe-inline`** (`server/index.js:53,60`) — needed today for the inline
  JSON-LD + gtag/dataLayer scripts. Hardening = per-response nonces (helmet
  nonce fn) or hashed/external scripts; risk of breaking analytics/JSON-LD on a
  static SPA index. ~2h + verify.
- **Build config (nixpacks) untangling** — root `nixpacks.toml` install phase
  calls `npm run install:all`, which does NOT exist in root `package.json`
  (only `postinstall`/`build`/`start`, per Railpack). BUT `site/nixpacks.toml`
  runs `git lfs pull` for the ~474MB of LFS videos. So it's NOT simply dead —
  which builder Railway actually uses (Railpack vs Nixpacks) must be confirmed
  from the Railway dashboard before deleting/editing either file. Do not touch
  blind; verify against a real deploy.
- **`pool.js` `rejectUnauthorized:false`** (`server/db/pool.js:10`) — standard
  Railway-Postgres trade-off (self-signed internal cert). Flipping to `true`
  needs the provider CA / internal-network URL or it breaks the DB connection.
- **Admin submissions pagination** (`server/routes/submissions.js:140,149`) —
  list silently caps at 100 (max 200) and returns a bare array with no total /
  has_more. Low urgency (won't hit the cap at launch); needs a small pagination
  UI in `AdminDashboard.vue` + a `count(*) OVER()` or header. ~1-2h.
- **CSV export cursor-in-transaction** (`server/routes/submissions.js:340`) —
  holds one pooled connection idle-in-transaction for the whole download. The
  transaction is required for the DB cursor; admin-only + rare, so low impact.
- **`socials` array duplication** (`SiteHeader.vue:242`, `SiteFooter.vue:93`,
  `ContactPage.vue:225`) — hrefs/labels are shareable, but the brand colors
  DIFFER between header (true brand colors) and footer (softer variants), which
  may be intentional. Extract href/icon/label to `data/socials.js`; keep color
  a per-surface override. Needs a design call so unifying doesn't regress a
  surface's look.
- **`src/data/source/*.txt`** (7 files) — reference transcripts checked into the
  source tree but never imported. Move to a top-level `content-source/` (or
  delete) so `src/` is code-only. Cosmetic; safe `git mv`.
- **Mobile drawer accordion `max-height` animation** (`SiteHeader.vue`) —
  animates a layout property. A grid-rows `0fr→1fr` reveal is nicer, but the
  current `max-h-[56rem]` was set deliberately to fix a services-list clipping
  bug; changing it risks re-introducing that. Low priority.

Dropped as false positives during verification: `frontend/` "dead dir" (empty +
untracked), committed secrets (none; gitignored), missing i18n keys (parity is
160/160), ContactPage `v-html` XSS (static content), unprotected admin routes
(`requireAuth` present), `seed.js` default admin (already guarded), the
`icons.js` console.log (DEV-gated).

## Admin-dashboard DRY refactors (from the 2026-07-09 admin review)

Deferred by choice — these are pure simplify/DRY cleanups with no active defect
(all P2, "simplify" dimension). Verified real; scoped for a dedicated pass.

- **Shared email util** — `new Resend(...)` + `RESEND_FROM_EMAIL` fallback + the
  branded HTML wrapper are copy-pasted across 3 send sites in
  `server/routes/submissions.js`. Extract `server/utils/email.js` with a lazy
  singleton client + `sendBrandedEmail({ to, replyTo, subject, heading, bodyHtml })`.
- **`resolveAdmin(token)`** — `/verify` in `server/routes/auth.js` re-implements
  the token-validation logic in `server/middleware/auth.js` step for step.
  Extract one helper both call, so a future auth change can't drift between them.
- **`unwrap(res, fallback)` helper** — the "parse JSON then throw on !ok" block is
  duplicated in `useApi.js`, `useAuth.js` login, and `ChangePasswordModal.vue`
  (the two auth paths bypass apiFetch to avoid its 401 redirect). Export one
  helper from `useApi.js` they all call.
- **`useAdminLabels` composable** — `consultationLabel`/`formatCountry` wrappers +
  the `useI18n()` destructure are duplicated in `SubmissionDetail.vue` and
  `SubmissionList.vue`.
- **Shared `CONSULTATION_TYPES`** — the 15-element whitelist is triplicated
  (`server/routes/submissions.js`, `site/src/data/consultationTypes.js`, the DB
  CHECK in `server/db/migrate.js`), held together only by a comment. Genuine
  cross-package refactor (site/ ↔ server/ import boundary) — scope on its own.
