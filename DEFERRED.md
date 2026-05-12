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
