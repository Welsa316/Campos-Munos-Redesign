## Campos Muños - Frontend

Modern Vue 3 + Vite + Tailwind rebuild of the Campos Muños marketing site.

### Tech stack

- Vue 3 (composition API)
- Vite
- Vue Router
- TailwindCSS
- vue-i18n
- Swiper (hero slideshow)

### Getting started

1. Install dependencies (from the `frontend` directory):

```bash
npm install
```

2. Run the dev server:

```bash
npm run dev
```

3. Build for production:

```bash
npm run build
```

### Routes

All canonical routes from `routes.txt` are implemented via Vue Router:

- `/home`
- `/servicios`
  - `/servicios/visas-especial-para-Jovenes`
  - `/servicios/videos`
  - `/servicios/tramite-consular`
  - `/servicios/asilo`
  - `/servicios/daca`
  - `/servicios/visas-de-prometido`
  - `/servicios/ead`
  - `/servicios/ciudadania`
  - `/servicios/estatus-de-proteccion-temporal`
  - `/servicios/vawa`
  - `/servicios/defensa-contra-la-deportacion`
  - `/servicios/peticione-familiares`
  - `/servicios/visa-u`
  - `/servicios/visa-t`
  - `/servicios/green-card`
- `/consulta`
- `/pago`
- `/el-equipo`
  - `/el-equipo/juan`
  - `/el-equipo/angenette`
  - `/el-equipo/diana`
  - `/el-equipo/rio`
- `/acerca-de`

The `Header` component ensures that **Green Card** is a top‑level nav item while the remaining services appear in the Servicios dropdown in the canonical order.

### i18n (Spanish default)

- `src/i18n/es.json` – Spanish copy keys. Many values are placeholder markers like `MISSING_SOURCE_CONTENT_*` where Wix HTML snapshot content must be mapped in.
- `src/i18n/en.json` – English copy with `TODO_EN_TRANSLATION` placeholders, to be replaced by human‑authored translations.
- Language is toggled via `LanguageToggle.vue` and persisted in `localStorage` (`cm_locale`).

To add or update translations, edit the JSON files in `src/i18n/` and use the existing key structure.

### Hero slideshow

- Implemented in `src/components/sections/HeroSlideshow.vue` using Swiper.
- Slide configuration and timing live in `src/content/slideshow.js`:
  - `HERO_SLIDE_DURATION_MS = 9000`
  - `HERO_FADE_DURATION_MS = 3300`
  - `HERO_SUBTEXT_FADE_DURATION_MS = 2500`
  - `HERO_SUBTEXT_DELAY_MS = 1000`

#### Adding real slide images

1. Place hero images in `frontend/public/assets` or `frontend/src/assets` (e.g. `public/assets/hero-slide-1.jpg`).
2. Update `src/content/slideshow.js` to point to the correct filenames and preserve the slide order from the current site.

### Video handling

`VideoBlock.vue` is a reusable placeholder for video content:

- Shows a thumbnail with a play icon.
- On click opens a modal with “Video próximamente” copy.

To wire real videos later:

1. Add a `videoUrl` prop to `VideoBlock.vue` and pass a real URL.
2. Replace the placeholder modal implementation with an embedded `<video>` or player of your choice.

### Inactivity popup

The inactivity popup is implemented in `InactivityPopup.vue` and mounted via `DefaultLayout.vue`:

- Shows after 20 seconds of no mouse, scroll, or keypress activity.
- Uses `sessionStorage` key `cm_inactivity_dismissed` to avoid repeat display per session.
- CTA button routes to `/consulta`.
- Secondary button dismisses the popup.

To add the group photo:

1. Place the image at `frontend/public/assets/popup-group.jpg`.
2. The component already references `/assets/popup-group.jpg`.

### Where to add remaining content

- **Home hero, intro, and other Spanish copy**
  - Map copy from `home.html` into `src/i18n/es.json` under:
    - `home.hero.*`
    - `home.sections.*`

- **Services content**
  - For each service page, replace `MISSING_SOURCE_CONTENT_SERVICE_TEXT` and `MISSING_SOURCE_CONTENT_SERVICE_SUMMARY` with actual Spanish copy from the relevant Wix HTML snapshot (`services.html` and per‑service HTML files) and move the text into `es.json` with new keys.

- **Team bios**
  - Replace `MISSING_SOURCE_CONTENT_TEAM_MEMBER_BIO` in `EquipoMember.vue` with content coming from `es.json` keys like `equipo.juan.bio`, etc.

- **Consulta, Pago, Acerca de**
  - Replace the `MISSING_SOURCE_CONTENT_*` placeholders in the corresponding pages with i18n keys backed by text extracted from `Contact.html`, `About.html`, and related snapshots.

### English translations

All English strings are currently `TODO_EN_TRANSLATION` placeholders. Once approved legal copy is available:

1. Edit `src/i18n/en.json`.
2. Replace each `TODO_EN_TRANSLATION` with a human‑authored English translation.

