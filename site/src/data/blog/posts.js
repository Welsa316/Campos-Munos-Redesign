/**
 * Blog article index — metadata only.
 *
 * Every article is written from one of Juan's service videos (transcripts in
 * src/data/source/*-Video-Transcript.txt) plus the firm's own approved page
 * copy. Nothing here may state a legal fact that isn't in one of those
 * sources; wording changes are listed in docs/blog-articles-signoff.md.
 *
 * Kept free of Vite-only APIs so scripts/prerender.js can import it in Node.
 * Article bodies live in ./articles/<slug>.js and load on demand.
 *
 *   slug         URL segment under /blog/
 *   date         ISO date shown on the article (set to the go-live date)
 *   service      baseServices slug the article supports: supplies the video,
 *                the icon and the "related service" link. null = no video.
 *   topic        optional eyebrow override {es,en}; defaults to the service name
 *   coverText    tile text on /blog when there is no service video poster
 *   title        {es,en} — H1 and <title>
 *   description  {es,en} — meta description and the summary on /blog
 *
 * Order = display order on /blog (the first one is featured).
 */

export const BLOG_DATE = '2026-11-09'

export const posts = [
  {
    slug: 'tengo-corte-de-inmigracion-que-significa',
    date: BLOG_DATE,
    service: 'defensa-contra-la-deportacion',
    title: {
      es: 'Tengo corte de inmigración: ¿qué significa y qué opciones de defensa existen?',
      en: 'I have immigration court: what does it mean, and what defenses exist?',
    },
    description: {
      es: 'Tener una cita en la corte de inmigración no significa automáticamente que su caso esté perdido. Qué es la defensa contra la deportación, qué alivios existen y por qué los plazos importan.',
      en: 'A hearing in immigration court does not automatically mean your case is lost. What deportation defense is, the forms of relief that exist, and why deadlines matter.',
    },
  },
  {
    slug: 'peticiones-familiares-quien-puede-pedir-a-quien',
    date: BLOG_DATE,
    service: 'peticiones-familiares',
    title: {
      es: 'Peticiones familiares: quién puede pedir a quién',
      en: 'Family petitions: who can petition for whom',
    },
    description: {
      es: 'Qué familiares pueden pedir los ciudadanos y los residentes permanentes, qué revisa inmigración en una petición por matrimonio y qué situaciones complican el caso.',
      en: 'Which relatives U.S. citizens and permanent residents can petition for, what immigration looks at in a marriage petition, and what complicates a case.',
    },
  },
  {
    slug: 'vawa-arreglar-papeles-sin-su-esposo',
    date: BLOG_DATE,
    service: 'vawa',
    title: {
      es: 'VAWA: cómo arreglar papeles sin la ayuda de su esposo o esposa',
      en: 'VAWA: how to apply for a green card without your spouse’s help',
    },
    description: {
      es: 'Si su esposo o esposa ciudadano o residente le maltrata, VAWA puede permitirle pedir la residencia por su cuenta. Quién califica, qué cuenta como abuso y por qué su caso es confidencial.',
      en: 'If your citizen or resident husband or wife abuses you, VAWA may let you apply for a green card on your own. Who qualifies, what counts as abuse, and why your case is confidential.',
    },
  },
  {
    slug: 'visa-u-que-es-y-quien-califica',
    date: BLOG_DATE,
    service: 'visa-u',
    title: {
      es: 'Visa U: qué es, quién califica y por qué el proceso puede tardar',
      en: 'The U visa: what it is, who qualifies, and why it can take so long',
    },
    description: {
      es: 'La visa U protege a víctimas de delitos graves que cooperan con las autoridades. Los requisitos generales, la certificación de la policía o la fiscalía y los retos del proceso.',
      en: 'The U visa protects victims of serious crimes who help the authorities. The general requirements, the police or prosecutor certification, and the challenges along the way.',
    },
  },
  {
    slug: 'visa-t-victimas-de-trata-y-trabajo-forzado',
    date: BLOG_DATE,
    service: 'visa-t',
    title: {
      es: 'Visa T: protección para víctimas de trata y trabajo forzado',
      en: 'The T visa: protection for victims of trafficking and forced labor',
    },
    description: {
      es: 'Si le obligaron a trabajar sin pago, le trajeron con engaños o le quitaron sus documentos, la visa T puede darle estatus legal, permiso de trabajo y un camino a la residencia.',
      en: 'If you were forced to work without pay, brought here under false pretenses, or had your documents taken, the T visa can give you legal status, a work permit and a path to a green card.',
    },
  },
  {
    slug: 'visa-u-visa-t-o-vawa-diferencias',
    date: BLOG_DATE,
    service: null,
    topic: { es: 'Protección para víctimas', en: 'Protection for victims' },
    coverText: 'U · T · VAWA', // no single video, so /blog shows a typographic tile
    title: {
      es: 'Visa U, visa T o VAWA: ¿qué protección aplica a su caso?',
      en: 'U visa, T visa or VAWA: which protection fits your case?',
    },
    description: {
      es: 'Tres protecciones migratorias para víctimas, comparadas: a quién protege cada una, qué tipo de daño cubre y qué pide de usted.',
      en: 'Three immigration protections for victims, side by side: who each one protects, what kind of harm it covers, and what it asks of you.',
    },
  },
  {
    slug: 'como-obtener-la-green-card',
    date: BLOG_DATE,
    service: 'green-card',
    title: {
      es: '¿Cómo obtener la green card? Los caminos hacia la residencia permanente',
      en: 'How do you get a green card? The paths to permanent residence',
    },
    description: {
      es: 'Qué es la residencia permanente, los tres caminos más comunes para obtenerla y las situaciones que pueden causar retrasos o negaciones.',
      en: 'What permanent residence is, the three most common ways to get it, and the situations that can lead to delays or denials.',
    },
  },
  {
    slug: 'requisitos-ciudadania-y-problemas-que-retrasan',
    date: BLOG_DATE,
    service: 'ciudadania',
    title: {
      es: 'Ciudadanía estadounidense: requisitos y los problemas que pueden retrasar su solicitud',
      en: 'U.S. citizenship: the requirements, and the problems that can delay your application',
    },
    description: {
      es: 'Cuándo puede pedir la ciudadanía, qué requisitos debe cumplir y qué situaciones —viajes largos, antecedentes, asuntos con el IRS— suelen causar retrasos.',
      en: 'When you can apply for citizenship, the requirements you must meet, and the situations — long trips, old records, IRS issues — that often cause delays.',
    },
  },
  {
    slug: 'visa-juvenil-sijs-green-card-para-menores',
    date: BLOG_DATE,
    service: 'visas-especial-para-jovenes',
    title: {
      es: 'Visa juvenil (SIJS): green card para niños y jóvenes abandonados o maltratados',
      en: 'The juvenile visa (SIJS): green cards for abandoned or abused children and youth',
    },
    description: {
      es: 'Cuando un menor no vive con uno o ambos padres por abandono, abuso o negligencia, la visa juvenil puede abrirle un camino a la residencia. Requisitos y retos.',
      en: 'When a child does not live with one or both parents because of abandonment, abuse or neglect, the juvenile visa can open a path to a green card. Requirements and challenges.',
    },
  },
  {
    slug: 'daca-a-residencia-y-ciudadania',
    date: BLOG_DATE,
    service: 'daca',
    title: {
      es: 'Tengo DACA: ¿puedo hacerme residente y luego ciudadano?',
      en: 'I have DACA: can I become a resident, and then a citizen?',
    },
    description: {
      es: 'DACA no es un camino a la ciudadanía por sí solo, pero los Dreamers pueden tener opciones para llegar a la residencia, a veces por vía familiar o laboral.',
      en: 'DACA is not a path to citizenship on its own, but Dreamers may have options for reaching permanent residence, sometimes through family or work.',
    },
  },
  {
    slug: 'permiso-de-trabajo-cuidado-con-las-ofertas',
    date: BLOG_DATE,
    service: 'ead',
    title: {
      es: 'Permiso de trabajo: cuidado con quien se lo ofrece',
      en: 'Work permits: be careful who is offering you one',
    },
    description: {
      es: 'En la gran mayoría de los casos, inmigración solo da permiso de trabajo a quien tiene un caso pendiente. Por qué una oferta fácil puede perjudicarle.',
      en: 'In the vast majority of cases, immigration only grants a work permit to someone with a pending case. Why an easy offer can hurt you.',
    },
  },
  {
    slug: 'tramite-consular-que-es-y-como-prepararse',
    date: BLOG_DATE,
    service: 'tramite-consular',
    title: {
      es: 'Trámite consular: qué es y cómo prepararse para la embajada',
      en: 'Consular processing: what it is and how to prepare for the embassy',
    },
    description: {
      es: 'Cuando su caso se resuelve en una embajada o consulado de los Estados Unidos: las etapas del proceso, la entrevista y por qué salir del país es un paso importante.',
      en: 'When your case is decided at a U.S. embassy or consulate: the stages of the process, the interview, and why leaving the country is an important step.',
    },
  },
]

export const postBySlug = Object.fromEntries(posts.map(p => [p.slug, p]))
