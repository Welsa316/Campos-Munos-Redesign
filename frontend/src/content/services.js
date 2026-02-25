export const services = [
  {
    slug: 'visas-especial-para-Jovenes',
    path: '/servicios/visas-especial-para-Jovenes',
    titleKey: 'services.jovenes',
    hasVideo: false,
    hasText: true
  },
  {
    slug: 'videos',
    path: '/servicios/videos',
    titleKey: 'services.videos',
    hasVideo: true,
    hasText: false
  },
  {
    slug: 'tramite-consular',
    path: '/servicios/tramite-consular',
    titleKey: 'services.tramiteConsular',
    hasVideo: false,
    hasText: true
  },
  {
    slug: 'asilo',
    path: '/servicios/asilo',
    titleKey: 'services.asilo',
    hasVideo: true,
    hasText: true
  },
  {
    slug: 'daca',
    path: '/servicios/daca',
    titleKey: 'services.daca',
    hasVideo: true,
    hasText: true
  },
  {
    slug: 'visas-de-prometido',
    path: '/servicios/visas-de-prometido',
    titleKey: 'services.visasPrometido',
    hasVideo: false,
    hasText: true
  },
  {
    slug: 'ead',
    path: '/servicios/ead',
    titleKey: 'services.ead',
    hasVideo: false,
    hasText: true
  },
  {
    slug: 'ciudadania',
    path: '/servicios/ciudadania',
    titleKey: 'services.ciudadania',
    hasVideo: false,
    hasText: true
  },
  {
    slug: 'estatus-de-proteccion-temporal',
    path: '/servicios/estatus-de-proteccion-temporal',
    titleKey: 'services.estatusTemporal',
    hasVideo: false,
    hasText: true
  },
  {
    slug: 'vawa',
    path: '/servicios/vawa',
    titleKey: 'services.vawa',
    hasVideo: false,
    hasText: true
  },
  {
    slug: 'defensa-contra-la-deportacion',
    path: '/servicios/defensa-contra-la-deportacion',
    titleKey: 'services.defensaDeportacion',
    hasVideo: false,
    hasText: true
  },
  {
    slug: 'peticione-familiares',
    path: '/servicios/peticione-familiares',
    titleKey: 'services.peticionesFamiliares',
    hasVideo: false,
    hasText: true
  },
  {
    slug: 'visa-u',
    path: '/servicios/visa-u',
    titleKey: 'services.visaU',
    hasVideo: false,
    hasText: true
  },
  {
    slug: 'visa-t',
    path: '/servicios/visa-t',
    titleKey: 'services.visaT',
    hasVideo: false,
    hasText: true
  },
  {
    slug: 'green-card',
    path: '/servicios/green-card',
    titleKey: 'services.greenCard',
    hasVideo: true,
    hasText: true
  }
];

export const servicesBySlug = Object.fromEntries(services.map((s) => [s.slug, s]));

