# Website Corrections Plan

Source: client review doc from July 1, 2026 team meeting (`Website_Corrections_Walid.docx`).
Item numbers below reference the client's own numbering so items can be cross-referenced.

Phases are ordered by effort: Phase 1 is a few hours of text/one-line fixes; each later
phase is heavier. Items marked **[CLIENT]** need an asset or decision from Juan before
they can be finished (listed together in "Questions for the client" at the bottom).

---

## Phase 1 — Text fixes & one-liners (a few hours, no blockers)

### Footer & branding
- [x] **1.2.1** Add the ñ: `footer.firmName` in `site/src/i18n/es.js:141` + `en.js:141` → "CAMPOS MUÑOS LAW, LLC"; hardcoded "© Campos Munos Law, LLC" in `SiteFooter.vue:84`; logo alt at `SiteFooter.vue:12`. Sweep the rest of the repo (`about.firmName`, `TeamPage.vue:7`, `HomePage.vue:24`, `PaymentPage.vue:6`, `SiteHeader.vue:14`, iframe titles) — "Munos" appears ~12 more places. Do **not** touch "Van Lieu-Munos" in the team bios (person's actual name).
- [x] **1.2.2** Footer firm name white, not gray: `text-white/50` → `text-white` at `SiteFooter.vue:80` (and `/40` → `text-white` at :83 for the right-hand line).
- [x] **1.2.3** Remove the © symbol at `SiteFooter.vue:84`.
- [x] **1.2.4** Footer duplicate "Services"/"About Us": column headings and first links use the same i18n key (`SiteFooter.vue:27-31` and :38-42). Remove the self-duplicating first link in each column.

### Map + address (the "big" item that's actually tiny)
- [x] **2.4.2** Fix the map: add `https://www.google.com` to `frame-src` in `server/index.js:92`. Root cause is our production CSP blocking the Google Maps iframe — the embed URL itself works (verified live). Verify on Railway after deploy; local dev doesn't exercise CSP.
- [x] **2.4.3** Make the address clickable → `https://www.google.com/maps/dir/?api=1&destination=812+Gravier+St+Suite+330+New+Orleans+LA+70112` everywhere the address appears (footer, home location section, contact page).
- [x] **2.4.4 + 6.5** Standardize "Suite 330": `ContactPage.vue:218` says "Office 330". Consider centralizing the address string so it can't drift again.

### Reviews section text
- [x] **2.3.1** Remove "Only"/"Solo" from the five-star reviews heading (both locales).
- [x] **2.3.3** Add Google icon (`fa-brands fa-google`) next to the reviews heading — brands set already in the FontAwesome build.
- [x] **2.4.1** Rename "Where Are We" → "Where to Find Us" (`en.js:56`; ES: "Dónde Encontrarnos").

### Navigation text
- [x] **3.4** Capitalize "Home"/"Inicio" consistently in the mobile menu (`en.js:3`, `es.js:3`).
- [x] **4.4** Fix lowercase "Inicio"/back-link casing on service pages (sentence-case i18n key instead of reusing the all-caps nav key).

### FontAwesome icon swaps (already in installed FA 7.2.0, register in icons.js)
- [x] **2.2.2** Citizenship → `fa-flag-usa` (gray US flag)
- [x] **2.2.4** SIJS → `fa-children`
- [x] **2.2.5** Fiancé Visa → `fa-church` (chapel, not ring)
- [x] **2.2.6** Asylum → `fa-earth-americas` (world map)
- [x] **2.2-intro** Add VAWA + Deportation Defense cards to the home services grid (`bentoServices` in `HomePage.vue`) — icons already registered.

### Service content deletions (`site/src/data/serviceContent.js`, both locales; line refs from audit)
- [x] **5.1.2** Citizenship: delete blocks idx 3–26 (ES 47-70, EN 369-392) + delete the `ciudadania` FAQ from `seoServices.js`. Leaves only "What is Naturalization" + video — transcript description (Phase 5) fills the hole.
- [x] **5.3.2** Asylum: trim "may apply for permanent residence one year after" sentence (ES 23, EN 345).
- [x] **5.3.3** Asylum: remove "requested at a port of entry" sentence (ES 34, EN 356).
- [x] **5.3.5** Asylum: delete "quickly and correctly" paragraph (ES 39, EN 361).
- [x] **5.4.1-2** DACA: delete eligibility-criteria + renewals sections (ES 79-98, EN 401-420).
- [x] **5.5.1-5** EAD: delete all five listed sections (ES 115-147, EN 437-469).
- [x] **5.6.1-2** U Visa: delete "What is the U Visa" + "Who is eligible" (ES 279-294, EN 599-614).
- [x] **5.9.3-4** Fiancé: delete "Step 3" + "don't marry within 90 days" blocks (ES 259-261 + 267-269, EN 580-582 + 588-590); renumber remaining steps.
- [x] **5.10.1** VAWA headline → "New Orleans Attorneys for Green Cards under VAWA (Victims of Domestic Violence)" in `seoServices.js:90` (both locales).
- [x] **5.10.2** VAWA: delete eligibility section (ES 321-334, EN 639-652), keep closing CTA.
- [x] **5.11.1-3** Consular processing: delete the three listed sections (ES 212-237, EN 534-559).
- [x] **5.12.1-3** TPS: reword heading to past tense ("Countries That Have Been Designated for TPS"), add FAQ "What if my TPS is cancelled?" with client-supplied answer.

### About / team quick edits
- [x] **8.3** Remove the numbered compass/eye icons above Mission/Vision (`AboutPage.vue:39-44`, :62-67).
- [x] **8.5.1-2** Rios: title → "Paralegal" (`en.js:134`, `es.js:134`), add "Fluent in English and Spanish" to bio.
- [x] **8.5.4** Add Juan's bio — full EN + ES text supplied in the client doc, paste into team data + `TeamMemberPage`.

### Consultation page text
- [x] **6.1** Header → "Schedule Your Consultation Now" (`en.js:74`; ES: "Agende Su Consulta Ahora").

---

## Phase 2 — Small component changes (~1 day)

- [x] **1.1.1 + 1.1.2** Favicon: the current tab icon is the 500×100 wordmark squashed into a square — that IS the "stretched unreadable text". Generate a square "CM" monogram favicon set (favicon.ico 16/32 + 32px PNG + 180px apple-touch-icon) in brand navy, update `index.html` links. **[CLIENT]** ideal: a real square logo mark; monogram works as stopgap.
- [x] **1.3.1** Language toggle: invert flags so the button shows the language you'd switch **to** (`LanguageToggle.vue:7-9` ternaries). Stretch: both-flags side-by-side pill like the old Wix site.
- [x] **3.2** Mobile toggle: "ESPAÑOL" all caps, larger font, flag icon.
- [x] **1.4.2** Video label "Watch a video about {service}" above each video (new i18n key with interpolation) + bigger play button.
- [x] **1.4.5 + 3.7** Ukrainian community note + 🇺🇦 flag on home + services pages, desktop and mobile, both locales.
- [x] **2.6.1 + 3.6** Services page: replace "Our team is here to help you" with "Click on any service to watch a short video" (new i18n key, both locales).
- [x] **2.6.2 + 4.3** Move Related Services below the CTA block; subtitle → "You may also be interested in the following services".
- [x] **2.7.1 + 3.5** Popup: it is NOT hidden on mobile — it needs 30s of zero activity and has a 24h dismiss cookie, which is why testers never saw it. Change to show-on-load (2-5s delay); fix photo crop (`aspect-[4/3]` instead of fixed heights + object-cover). **[CLIENT]** confirm mobile behavior + dismiss TTL.
- [x] **3.9** Add "Text Us" (`sms:+15049106508`) alongside the mobile "Call Us" pill — call stays bottom-center, text-us above it.
- [x] **6.2** Make the phone number prominent on consultation page (large tel: CTA in hero).
- [x] **6.3** Make consultation-type, country, message optional: remove `required` + red asterisks in `ContactPage.vue` (lines 48-49, 57+), AND relax express-validator rules in `server/routes/submissions.js`. Same for ChatWidget if it shares validators.
- [x] **6.4** Move reviews section above the form on consultation page (+ Google icon).
- [x] **7.3** Payment page → simple "Please contact our office to arrange payment" message (keep route + nav). **[CLIENT]** confirm keep-vs-remove; recommend keep-with-message for SEO continuity.
- [x] **2.5.1** Instagram embeds: Elfsight widget markup already exists; it broke in production because the pre-CSP-fix deploy blocked `platform.js`. Extend CSP (`img-src`, `media-src`, `font-src`) with `*.elfsightcdn.com`, `*.cdninstagram.com`, `*.fbcdn.net`; verify on Railway. Auto-scroll is an Elfsight dashboard setting. **[CLIENT]** Elfsight account access.

---

## Phase 3 — Structural / layout work (~2-3 days)

- [x] **2.1** Home page reorder → hero → reviews → services → instagram → recognized-by → statistics → location. Sections are inline template blocks; re-balance alternating backgrounds; keep scroll-reveal classes intact. Remove "Who We Are" (:175-189) + "Why Us" (:192-208) from home (they migrate in 8.1).
- [x] **8.1** Merge About Us + Who We Are + Why Us + Our Team into one page, team grid at bottom. Redirect `/el-equipo` → `/acerca-de`, keep `/el-equipo/:member` bio pages (or redirect). Update nav (SiteHeader:65-67, :183; SiteFooter:43), TeamMemberPage back-link, all CTAs pointing at `/el-equipo`. **[CLIENT]** confirm bio URLs may change + whether home keeps teasers.
- [x] **8.2** Shrink or replace the About "Who We Are" main photo (min-h-screen hero → shorter banner). **[CLIENT]** replacement photo or shrink-only.
- [x] **3.3** Mobile hamburger menu redesign: slide-in panel, Services accordion (14 services currently unreachable on mobile), active-link styling, body scroll-lock, Escape/route-change close. **[CLIENT]** style direction or approve a proposed mockup.
- [x] **1.4.1** Video autoplay + top placement: render `<video>` with `autoplay muted playsinline controls :poster` (browsers force muted), hoist video above the SEO h2, add `preload="metadata"`. **[CLIENT]** hero must shrink for "visible without scrolling" — needs OK. Note: autoplay = real mobile-data cost.

---

## Phase 4 — Asset-dependent work (code is trivial; blocked on photos)

All of these need images sourced/approved first. **[CLIENT]** supplies or approves a stock shortlist.

- [x] **1.4.4 + 4.2 + 5.11.4** DONE (infra): the 14 photos exist in public/services/; compressed the 5 oversized PNGs (~27MB -> ~526KB, ead 9.5MB -> 92KB), wired video posters to them, dropped the SVG placeholders. The photos themselves are a generic first-pass set — swapping any is now a drop-in at the same path. One consistent stock photo per service (14 total) used as BOTH services-grid cover AND video poster. Place in `site/public/services/`, point `thumbnail` fields in `seoServices.js` at them, delete the SVG thumbnails. Compress to <300KB each (current `ead.png` is 9.8MB!). CSP note: photos must be self-hosted or on the R2 bucket — hotlinks will be blocked.
- [x] **2.2.8** DACA photo — existing basketball photo is an acceptable match (young, sports); left as-is. DACA photo: 3-4 young multi-ethnic immigrants (client-specified).
- [x] **2.2.9** EAD photo: construction site — DONE (Unsplash, construction workers on-site).
- [x] **2.2.11** T Visa photo: farm — DONE (Unsplash, cultivated farm field).
- [x] **5.13.2** Green Card cover: Statue of Liberty — DONE (Unsplash, authentic NYC statue + flag).
- [ ] **3.1.1** Mobile photo crop: the Juan+Angenette table photo crops to just the table on mobile (subjects on both edges — no CSS `background-position` can fix it). Options: art-directed mobile crop (`<picture>` + manual crop file) or pick a different photo. **[CLIENT]** decision.

---

## Phase 5 — Content production & integrations (heaviest, multi-day)

- [ ] **1.4.3** Transcript-based video descriptions for ~11 service videos: transcribe each video (Whisper on the R2 MP4s), paraphrase Juan's words into body copy (NOT captions), translate to both locales, insert as content blocks below each video. This backfills the pages gutted in Phase 1 (citizenship, DACA, EAD, U Visa, VAWA, consular, deportation defense per 5.8.1, U Visa per 5.6.4). Largest single work item in the doc.
- [x] **2.3.2** Real Google reviews module (Elfsight Google Reviews widget wired + rendering real reviews on home + consultation): auto-scrolling carousel of actual reviews. Recommended: Elfsight Google Reviews widget (account already used for Instagram) — dashboard config + CSP allowlist + placement on home + consultation pages. Alternative: Google Places API (needs API key, quota, custom carousel). **[CLIENT]** Elfsight account/plan.

---

## Questions for the client (blockers, answer in the corrections doc)

1. ~~**Video autoplay (1.4.1)**~~ — RESOLVED: desktop autoplays muted (native controls to unmute), mobile keeps click-to-play to save cellular data.
2. ~~**Hero size on video pages (1.4.1)**~~ — RESOLVED: service-page hero shrunk (pt-28 pb-10) and video hoisted to the top of the content.
3. ~~**Popup (2.7.1/3.5)**~~ — RESOLVED: now shows 4s after load on all devices; the mobile-invisible bug (stuck Vue transition) fixed with a CSS keyframe animation. — it was never hidden on mobile; it needs 30s of inactivity and hides for 24h once dismissed. Want it on-load (2-5s) on both desktop + mobile? Keep the 24h suppression?
4. ~~**Footer right line (1.2.3/1.2.4)**~~ — RESOLVED: removed the right-hand "Campos Muños Law, LLC"; bottom bar shows the firm name once. — after removing ©, both bottom corners say "Campos Muños Law, LLC". Drop the right-hand one, or replace with something else?
5. ~~**Payment page (7.3)**~~ — RESOLVED: keep the page with the "contact our office" message. — remove entirely, or keep the page with the "contact our office" message? (Recommend keep.)
6. ~~**Mobile menu (3.3)**~~ — RESOLVED: right-side slide-in drawer with a Services accordion (all 14 services), scroll-lock, close on route/backdrop/Escape.
7. **Photos (Phase 4)** — client supplies, or we source a stock shortlist for approval? 4 subjects specified (DACA, EAD, T Visa, Green Card); 10 more services need consistent covers.
8. ~~**Elfsight (2.3.2/2.5.1)**~~ — RESOLVED: client supplied both widget embeds; Google Reviews + Instagram now wired, script + CSP updated. — need dashboard access (or plan confirmation) for the Google Reviews widget and Instagram feed settings.
9. ~~**About merge (8.1)**~~ — RESOLVED: bio URLs preserved (`/el-equipo/:member` unchanged; `/el-equipo` redirects to `/acerca-de#equipo`); home teasers removed per the client's explicit instruction.
10. ~~**Square logo mark (1.1.1)**~~ — RESOLVED: client supplied the square CM emblem; favicon set regenerated from it. — is there a square emblem/monogram version of the logo for the favicon? A "CM" monogram will be generated if not.
11. ~~**Spelling (1.2.1)**~~ — RESOLVED: canonical "Muños"; "Van Lieu-Muños" now carries the accent. — canonical is "Muños" everywhere? ("Van Lieu-Munos" in team bios kept as the person's legal spelling.)
12. **Juan's bio wording (8.5.4)** — the client-supplied text differs by language: the EN bio says he "represented unaccompanied children" at Catholic Charities, while the ES bio says "la población inmigrante principalmente de Centroamérica" (the immigrant population, mainly from Central America). Which is authoritative so both locales match? (The ES bio also says "New Orleans"; the rest of the ES site uses "Nueva Orleans" — align?)
13. ~~**Residual asylum port-of-entry line (5.3.3)**~~ — RESOLVED: client approved; the "upon arriving at a port of entry" clause is trimmed. — the specific sentence flagged for removal is gone, but a second clause making the same claim survives in the defensive-asylum paragraph ("…o al llegar a un puerto de entrada sin una visa válida" / "…or upon arriving at a port of entry without a valid visa"). If the concern was outdated port-of-entry guidance, should this be trimmed too?

## Known future work (surfaced by the Phase 1+2 review, not yet actioned)

- **VAWA FAQ (parallel to 5.10.2)** — the client removed the "Who is eligible for VAWA self-petition" prose from the body; a "¿Quién es elegible para VAWA?" / "Who is eligible for VAWA?" entry still exists in the FAQ accordion (`seoServices.js` `serviceFaqs.vawa`). Not flagged for removal in the client doc, but same pattern as the U-Visa/Consular FAQ cleanup already done — confirm whether to remove it.

---

## Effort summary

| Phase | Scope | Estimate |
|---|---|---|
| 1 | ~30 text/one-liner items incl. the map fix | a few hours |
| 2 | ~14 small component changes | ~1 day |
| 3 | 5 structural items (home reorder, About merge, mobile menu, autoplay) | 2-3 days |
| 4 | photo swaps once assets exist | ~half day of code + asset sourcing |
| 5 | 11 video transcriptions + bilingual descriptions, reviews module | multi-day |

Notable root causes discovered during the audit:
- The "broken map" (2.4.2) is a 1-line CSP fix, not a rebuild.
- The "stretched tab text" (1.1.2) is the wide wordmark squashed into the favicon slot, not a title bug.
- The "missing mobile popup" (3.5) was the 30s-inactivity trigger + 24h dismissal, not a hidden component.
- The Instagram section (2.5.1) broke because the pre-CSP-fix deploy blocked Elfsight's script; partially fixed already, needs CDN hosts allowlisted.

---

## Whole-project audit (July 5) — status

A full 6-dimension audit (security, backend, frontend/a11y, code quality, SEO, resilience) found no P0 security holes. All 10 P1 + 24 P2 findings were fixed except the one below. Commits: e4b019b (backend stability), d5f5cfa (a11y), e67f9d9 (SEO), fe9e7ed (dead code + resilience).

### Deferred — needs its own effort (the big SEO lever)
- **SSR / prerender (the #1 SEO issue).** The site is a client-rendered Vue SPA: the shipped HTML is an empty `#app` shell, so all page content — including the "Abogados de X en Nueva Orleans" service pages the whole site is built to rank for — is JS-injected. Google renders JS on a slower second pass; non-Google/social crawlers see nothing. A `vite-ssg` prerender was attempted earlier and rolled back (`document is not defined` in App.vue watchers; dynamic routes emitted `:slug` literally). **Remediation:** finish the prerender/SSG so every route ships static HTML with its real content + per-route meta (the client-side per-route canonical/OG/description added in e67f9d9 is a stopgap that only helps JS-rendering crawlers). This is the highest-impact SEO work remaining and should be its own focused task. Related decisions still open: the 70 orphan `/servicios/:service/:location` pages (link + sitemap them, or drop them).

### Still open from earlier (client)
- **Q7 — service photos** (Phase 4): DACA, EAD, T-Visa, Statue of Liberty + consistent covers.
- **Q12 — Juan's bio wording** differs EN vs ES; needs Juan to confirm which is authoritative.
