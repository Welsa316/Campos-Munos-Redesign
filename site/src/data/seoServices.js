/**
 * SEO Location Pages Generator
 *
 * Generates location-specific service page data for SEO coverage.
 * Each base service × location = one additional SEO page.
 */

// Target locations for SEO pages
export const locations = [
  {
    slug: 'new-orleans',
    nameEs: 'Nueva Orleans',
    nameEn: 'New Orleans',
    contextEs: 'en el área de Nueva Orleans',
    contextEn: 'in the New Orleans area',
  },
  {
    slug: 'louisiana',
    nameEs: 'Louisiana',
    nameEn: 'Louisiana',
    contextEs: 'en Louisiana',
    contextEn: 'in Louisiana',
  },
  {
    slug: 'metairie',
    nameEs: 'Metairie',
    nameEn: 'Metairie',
    contextEs: 'en Metairie y áreas cercanas',
    contextEn: 'in Metairie and nearby areas',
  },
  {
    slug: 'kenner',
    nameEs: 'Kenner',
    nameEn: 'Kenner',
    contextEs: 'en Kenner y comunidades vecinas',
    contextEn: 'in Kenner and neighboring communities',
  },
  {
    slug: 'jefferson-parish',
    nameEs: 'Jefferson Parish',
    nameEn: 'Jefferson Parish',
    contextEs: 'en Jefferson Parish y sus alrededores',
    contextEn: 'in Jefferson Parish and surrounding areas',
  },
]

// Base services (no 'videos' since it has no legal content)
export const baseServices = {
  'green-card': {
    key: 'greenCard',
    icon: 'fa-solid fa-id-card',
    video: true,
    videoFile: '/Green Card.mp4',
    relatedSlugs: ['ciudadania', 'peticiones-familiares', 'ead'],
  },
  'ciudadania': {
    key: 'ciudadania',
    icon: 'fa-solid fa-certificate',
    video: true,
    videoFile: '/Ciudadania.mp4',
    relatedSlugs: ['green-card', 'peticiones-familiares'],
  },
  'asilo': {
    key: 'asilo',
    icon: 'fa-solid fa-hand-holding-heart',
    video: false,
    relatedSlugs: ['visa-t', 'vawa', 'defensa-contra-la-deportacion'],
  },
  'vawa': {
    key: 'vawa',
    icon: 'fa-solid fa-shield-halved',
    video: true,
    videoFile: '/VAWA.mp4',
    relatedSlugs: ['visa-u', 'visa-t', 'asilo'],
  },
  'visa-u': {
    key: 'visaU',
    icon: 'fa-solid fa-scale-balanced',
    video: true,
    videoFile: '/Visa U Listo YT.mp4',
    relatedSlugs: ['visa-t', 'vawa', 'ead'],
  },
  'visa-t': {
    key: 'visaT',
    icon: 'fa-solid fa-link',
    video: true,
    videoFile: '/3 Listo Visa T fx Listo.mp4',
    relatedSlugs: ['visa-u', 'vawa', 'asilo'],
  },
  'daca': {
    key: 'daca',
    icon: 'fa-solid fa-graduation-cap',
    video: true,
    videoFile: '/Listo DACA Fx LIsto.mp4',
    relatedSlugs: ['ead', 'defensa-contra-la-deportacion', 'green-card'],
  },
  'estatus-de-proteccion-temporal': {
    key: 'tps',
    icon: 'fa-solid fa-umbrella',
    video: false,
    relatedSlugs: ['ead', 'defensa-contra-la-deportacion', 'asilo'],
  },
  'tramite-consular': {
    key: 'tramiteConsular',
    icon: 'fa-solid fa-file-signature',
    video: true,
    videoFile: '/Listo Proceso consullar fx listo.mp4',
    relatedSlugs: ['green-card', 'visas-de-prometido', 'peticiones-familiares'],
  },
  'visas-de-prometido': {
    key: 'visasPrometido',
    icon: 'fa-solid fa-ring',
    video: false,
    relatedSlugs: ['tramite-consular', 'green-card', 'peticiones-familiares'],
  },
  'visas-especial-para-jovenes': {
    key: 'visasJovenes',
    icon: 'fa-solid fa-passport',
    video: true,
    videoFile: '/Jovenes.mp4',
    relatedSlugs: ['asilo', 'defensa-contra-la-deportacion', 'green-card'],
  },
  'peticiones-familiares': {
    key: 'peticionesFamiliares',
    icon: 'fa-solid fa-people-roof',
    video: true,
    videoFile: '/Peticiones Familiares.mp4',
    relatedSlugs: ['green-card', 'ciudadania', 'visas-de-prometido'],
  },
  'ead': {
    key: 'ead',
    icon: 'fa-solid fa-briefcase',
    video: true,
    videoFile: '/2 Listo Permiso de Trabajo FX Listo.mp4',
    relatedSlugs: ['daca', 'estatus-de-proteccion-temporal', 'green-card'],
  },
  'defensa-contra-la-deportacion': {
    key: 'defensaDeportacion',
    icon: 'fa-solid fa-gavel',
    video: true,
    videoFile: '/1 listo defensa en corte FX listo.mp4',
    relatedSlugs: ['asilo', 'daca', 'vawa'],
  },
}

// FAQ data extracted and rephrased from existing service descriptions
// Each FAQ only uses information already present on the site
export const serviceFaqs = {
  greenCard: {
    es: [
      { q: '¿Qué es una Green Card?', a: 'La Green Card es el documento que otorga la residencia permanente legal en los Estados Unidos.' },
      { q: '¿Cómo puedo obtener una Green Card?', a: 'Asesoramos y representamos a nuestros clientes en procesos para obtener la residencia permanente a través de familia, empleo u otras opciones disponibles.' },
      { q: '¿Puedo solicitar una Green Card mediante una petición familiar?', a: 'Sí. Nuestro equipo ayuda a clientes que buscan obtener residencia permanente a través de peticiones familiares.' },
    ],
    en: [
      { q: 'What is a Green Card?', a: 'A Green Card is the document that grants lawful permanent residence in the United States.' },
      { q: 'How can I obtain a Green Card?', a: 'We advise and represent our clients in processes to obtain lawful permanent residence through family, employment, or other available options.' },
      { q: 'Can I apply for a Green Card through a family petition?', a: 'Yes. Our team helps clients seeking to obtain permanent residence through family petitions.' },
    ],
  },
  ciudadania: {
    es: [
      { q: '¿Cómo puedo obtener la ciudadanía estadounidense?', a: 'Le ayudamos guiándolo en cada paso del proceso, desde la solicitud hasta la entrevista y el examen de naturalización.' },
      { q: '¿Qué incluye el proceso de ciudadanía?', a: 'El proceso incluye la solicitud, la entrevista y el examen de naturalización. Nuestro equipo lo acompaña en cada etapa.' },
      { q: '¿Necesito un abogado para el proceso de ciudadanía?', a: 'Contar con representación legal le ayuda a asegurar que su solicitud cumpla con todos los requisitos y a prepararse adecuadamente para la entrevista y el examen.' },
    ],
    en: [
      { q: 'How can I obtain U.S. citizenship?', a: 'We help you by guiding you through every step of the process, from the application to the interview and naturalization exam.' },
      { q: 'What does the citizenship process include?', a: 'The process includes the application, interview, and naturalization exam. Our team accompanies you at every stage.' },
      { q: 'Do I need an attorney for the citizenship process?', a: 'Having legal representation helps ensure your application meets all requirements and prepares you adequately for the interview and exam.' },
    ],
  },
  asilo: {
    es: [
      { q: '¿Qué es el asilo?', a: 'El asilo es una forma de protección para personas que enfrentan persecución o peligro en su país de origen.' },
      { q: '¿Cómo manejan los casos de asilo?', a: 'Brindamos apoyo legal manejando cada caso con confidencialidad y cuidado, ayudando a personas que buscan protección en los Estados Unidos.' },
      { q: '¿El proceso de asilo es confidencial?', a: 'Sí. Manejamos su caso con confidencialidad y cuidado en todo momento.' },
    ],
    en: [
      { q: 'What is asylum?', a: 'Asylum is a form of protection for individuals facing persecution or danger in their home country.' },
      { q: 'How do you handle asylum cases?', a: 'We provide legal support handling each case with confidentiality and care, helping individuals seeking protection in the United States.' },
      { q: 'Is the asylum process confidential?', a: 'Yes. We handle your case with confidentiality and care at all times.' },
    ],
  },
  vawa: {
    es: [
      { q: '¿Qué es VAWA?', a: 'VAWA permite a víctimas de abuso por parte de un ciudadano o residente permanente solicitar estatus legal de forma confidencial e independiente del agresor.' },
      { q: '¿Puedo solicitar VAWA sin que mi agresor lo sepa?', a: 'Sí. El proceso VAWA es confidencial e independiente del agresor.' },
      { q: '¿Quién es elegible para VAWA?', a: 'Víctimas de abuso por parte de un ciudadano estadounidense o residente permanente pueden ser elegibles para solicitar estatus legal bajo VAWA.' },
    ],
    en: [
      { q: 'What is VAWA?', a: 'VAWA allows victims of abuse by a U.S. citizen or permanent resident to apply for legal status confidentially and independently from the abuser.' },
      { q: 'Can I apply for VAWA without my abuser knowing?', a: 'Yes. The VAWA process is confidential and independent from the abuser.' },
      { q: 'Who is eligible for VAWA?', a: 'Victims of abuse by a U.S. citizen or permanent resident may be eligible to apply for legal status under VAWA.' },
    ],
  },
  visaU: {
    es: [
      { q: '¿Qué es la Visa U?', a: 'La Visa U brinda protección y estatus legal a víctimas de ciertos delitos que han cooperado con las autoridades.' },
      { q: '¿Necesito haber cooperado con las autoridades?', a: 'Sí. La Visa U requiere que la víctima haya cooperado con las autoridades en la investigación o persecución del delito.' },
      { q: '¿Qué protección ofrece la Visa U?', a: 'La Visa U ofrece protección y estatus legal en los Estados Unidos para víctimas de ciertos delitos.' },
    ],
    en: [
      { q: 'What is a U Visa?', a: 'The U Visa provides protection and legal status to victims of certain crimes who have cooperated with authorities.' },
      { q: 'Do I need to have cooperated with authorities?', a: 'Yes. The U Visa requires that the victim has cooperated with authorities in the investigation or prosecution of the crime.' },
      { q: 'What protection does the U Visa offer?', a: 'The U Visa provides protection and legal status in the United States for victims of certain crimes.' },
    ],
  },
  visaT: {
    es: [
      { q: '¿Qué es la Visa T?', a: 'La Visa T está diseñada para víctimas de tráfico humano, brindando estatus legal y protección en los Estados Unidos.' },
      { q: '¿El proceso de Visa T es confidencial?', a: 'Sí. Brindamos representación legal confidencial para ayudarle a obtener estatus legal y protección.' },
      { q: '¿Quién califica para la Visa T?', a: 'Las víctimas de tráfico humano pueden calificar para la Visa T para obtener protección y estatus legal en los Estados Unidos.' },
    ],
    en: [
      { q: 'What is a T Visa?', a: 'The T Visa is designed for victims of human trafficking, providing legal status and protection in the United States.' },
      { q: 'Is the T Visa process confidential?', a: 'Yes. We provide confidential legal representation to help you obtain legal status and protection.' },
      { q: 'Who qualifies for a T Visa?', a: 'Victims of human trafficking may qualify for a T Visa to obtain protection and legal status in the United States.' },
    ],
  },
  daca: {
    es: [
      { q: '¿Qué es DACA?', a: 'DACA brinda protección contra la deportación y autorización de empleo a jóvenes elegibles.' },
      { q: '¿Puedo renovar mi DACA?', a: 'Sí. Ayudamos a jóvenes elegibles a solicitar o renovar DACA.' },
      { q: '¿DACA me permite trabajar legalmente?', a: 'Sí. DACA brinda autorización de empleo además de protección contra la deportación.' },
    ],
    en: [
      { q: 'What is DACA?', a: 'DACA provides deportation protection and employment authorization to eligible young people.' },
      { q: 'Can I renew my DACA?', a: 'Yes. We help eligible young people apply for or renew DACA.' },
      { q: 'Does DACA allow me to work legally?', a: 'Yes. DACA provides employment authorization in addition to deportation protection.' },
    ],
  },
  tps: {
    es: [
      { q: '¿Qué es el Estatus de Protección Temporal?', a: 'El TPS permite a personas elegibles vivir y trabajar legalmente en los Estados Unidos.' },
      { q: '¿Puedo renovar mi TPS?', a: 'Sí. Asistimos a personas elegibles para solicitar o renovar el Estatus de Protección Temporal.' },
      { q: '¿El TPS me permite trabajar?', a: 'Sí. El Estatus de Protección Temporal permite vivir y trabajar legalmente en EE. UU.' },
    ],
    en: [
      { q: 'What is Temporary Protected Status?', a: 'TPS allows eligible individuals to live and work legally in the United States.' },
      { q: 'Can I renew my TPS?', a: 'Yes. We assist eligible individuals in applying for or renewing Temporary Protected Status.' },
      { q: 'Does TPS allow me to work?', a: 'Yes. Temporary Protected Status allows you to live and work legally in the U.S.' },
    ],
  },
  tramiteConsular: {
    es: [
      { q: '¿Qué es el trámite consular?', a: 'Es el proceso para obtener su visa desde su país de origen a través del consulado de los Estados Unidos.' },
      { q: '¿Qué requisitos necesito cumplir?', a: 'Nos aseguramos de que su solicitud cumpla con todos los requisitos legales para el proceso consular.' },
      { q: '¿Me ayudan con la preparación de documentos?', a: 'Sí. Le asistimos en todo el proceso consular, asegurándonos de que su solicitud esté completa y cumpla con los requisitos.' },
    ],
    en: [
      { q: 'What is consular processing?', a: 'It is the process to obtain your visa from your home country through the United States consulate.' },
      { q: 'What requirements do I need to meet?', a: 'We ensure your application meets all legal requirements for consular processing.' },
      { q: 'Do you help with document preparation?', a: 'Yes. We assist you throughout the consular process, ensuring your application is complete and meets all requirements.' },
    ],
  },
  visasPrometido: {
    es: [
      { q: '¿Qué es una visa de prometido(a)?', a: 'La visa de prometido(a) permite reunirse con su pareja ciudadana estadounidense y casarse legalmente en EE. UU.' },
      { q: '¿Mi pareja debe ser ciudadano(a) estadounidense?', a: 'Sí. La visa de prometido(a) está diseñada para parejas donde uno de los miembros es ciudadano estadounidense.' },
      { q: '¿Me guían durante todo el proceso?', a: 'Sí. Le guiamos en cada paso del proceso de visa de prometido(a) para que pueda reunirse con su pareja.' },
    ],
    en: [
      { q: 'What is a fiancé visa?', a: 'A fiancé visa allows you to reunite with your U.S. citizen partner and legally marry in the U.S.' },
      { q: 'Does my partner need to be a U.S. citizen?', a: 'Yes. The fiancé visa is designed for couples where one member is a U.S. citizen.' },
      { q: 'Do you guide me through the entire process?', a: 'Yes. We guide you through every step of the fiancé visa process so you can reunite with your partner.' },
    ],
  },
  visasJovenes: {
    es: [
      { q: '¿Qué es la Visa Especial para Jóvenes (SIJS)?', a: 'El SIJS brinda protección migratoria a jóvenes menores de 21 años que han sido abandonados, maltratados o descuidados.' },
      { q: '¿Puedo solicitar residencia permanente con SIJS?', a: 'Sí. El SIJS permite solicitar la residencia permanente en los Estados Unidos.' },
      { q: '¿Quién es elegible para SIJS?', a: 'Jóvenes menores de 21 años que han sido abandonados, maltratados o descuidados pueden ser elegibles para SIJS.' },
    ],
    en: [
      { q: 'What is Special Immigrant Juvenile Status (SIJS)?', a: 'SIJS provides immigration protection to minors under 21 who have been abandoned, abused, or neglected.' },
      { q: 'Can I apply for permanent residence with SIJS?', a: 'Yes. SIJS allows you to apply for permanent residence in the United States.' },
      { q: 'Who is eligible for SIJS?', a: 'Minors under 21 who have been abandoned, abused, or neglected may be eligible for SIJS.' },
    ],
  },
  peticionesFamiliares: {
    es: [
      { q: '¿Qué son las peticiones familiares?', a: 'Las peticiones familiares permiten a ciudadanos y residentes permanentes solicitar a ciertos familiares para obtener estatus legal y residencia permanente.' },
      { q: '¿Quién puede hacer una petición familiar?', a: 'Ciudadanos y residentes permanentes de los Estados Unidos pueden solicitar a ciertos familiares.' },
      { q: '¿Qué familiares puedo solicitar?', a: 'Ciertos familiares pueden ser solicitados por ciudadanos y residentes permanentes para obtener estatus legal y residencia permanente en EE. UU.' },
    ],
    en: [
      { q: 'What are family petitions?', a: 'Family petitions allow citizens and permanent residents to petition certain family members to obtain legal status and permanent residence.' },
      { q: 'Who can file a family petition?', a: 'U.S. citizens and permanent residents can petition for certain family members.' },
      { q: 'Which family members can I petition for?', a: 'Certain family members can be petitioned by citizens and permanent residents to obtain legal status and permanent residence in the U.S.' },
    ],
  },
  ead: {
    es: [
      { q: '¿Qué es un permiso de trabajo (EAD)?', a: 'El permiso de trabajo permite a ciertos inmigrantes trabajar legalmente en Estados Unidos mientras su caso migratorio está en proceso.' },
      { q: '¿Puedo trabajar mientras mi caso está en proceso?', a: 'Sí. El permiso de trabajo le permite trabajar legalmente mientras su caso migratorio está en proceso o bajo una categoría elegible.' },
      { q: '¿Me ayudan a solicitar el permiso de trabajo?', a: 'Sí. Le ayudamos a solicitarlo correctamente para que pueda trabajar sin preocupaciones.' },
    ],
    en: [
      { q: 'What is an Employment Authorization Document (EAD)?', a: 'The EAD allows certain immigrants to work legally in the United States while their immigration case is in process.' },
      { q: 'Can I work while my case is being processed?', a: 'Yes. The employment authorization document allows you to work legally while your immigration case is in process or under an eligible category.' },
      { q: 'Do you help me apply for the work permit?', a: 'Yes. We help you apply correctly so you can work without worry.' },
    ],
  },
  defensaDeportacion: {
    es: [
      { q: '¿Qué es la defensa contra la deportación?', a: 'Representamos a personas que enfrentan procedimientos de deportación ante los tribunales de inmigración.' },
      { q: '¿Preparan defensas para estos casos?', a: 'Sí. Nuestros abogados preparan defensas sólidas para proteger su derecho a permanecer en los Estados Unidos.' },
      { q: '¿Me representan en el tribunal de inmigración?', a: 'Sí. Representamos a personas en procedimientos de deportación ante los tribunales de inmigración.' },
    ],
    en: [
      { q: 'What is deportation defense?', a: 'We represent individuals facing deportation proceedings in immigration court.' },
      { q: 'Do you prepare defenses for these cases?', a: 'Yes. Our attorneys prepare strong defenses to protect your right to remain in the United States.' },
      { q: 'Do you represent me in immigration court?', a: 'Yes. We represent individuals in deportation proceedings before immigration courts.' },
    ],
  },
}

/**
 * Resolves a slug to its base service data.
 * Handles both base slugs (e.g., "green-card") and location slugs (e.g., "green-card-new-orleans").
 *
 * @param {string} slug - The route slug
 * @returns {{ service: object, location: object|null, baseSlug: string } | null}
 */
export function resolveServiceSlug(slug) {
  // Direct match - base service
  if (baseServices[slug]) {
    return { service: baseServices[slug], location: null, baseSlug: slug }
  }

  // Try to match location suffix
  for (const loc of locations) {
    const suffix = `-${loc.slug}`
    if (slug.endsWith(suffix)) {
      const baseSlug = slug.slice(0, -suffix.length)
      if (baseServices[baseSlug]) {
        return { service: baseServices[baseSlug], location: loc, baseSlug }
      }
    }
  }

  return null
}

/**
 * Generates SEO metadata for a service page.
 *
 * @param {string} serviceKey - The i18n service key
 * @param {object|null} location - Location object or null for base page
 * @param {string} lang - 'es' or 'en'
 * @param {Function} t - i18n translate function
 * @returns {{ title: string, metaDescription: string, h1: string }}
 */
export function generateSeoMeta(serviceKey, location, lang, t) {
  const serviceName = t(`services.${serviceKey}`)

  if (!location) {
    return {
      title: `${serviceName} | Campos Muños`,
      metaDescription: lang === 'es'
        ? `Abogados de inmigración especializados en ${serviceName.toLowerCase()}. Atendemos clientes en Nueva Orleans y toda Louisiana.`
        : `Immigration attorneys specializing in ${serviceName.toLowerCase()}. Serving clients in New Orleans and all of Louisiana.`,
      h1: serviceName,
    }
  }

  const locName = lang === 'es' ? location.nameEs : location.nameEn

  return {
    title: `${serviceName} en ${locName} | Campos Muños`,
    metaDescription: lang === 'es'
      ? `Abogados de inmigración ayudando con ${serviceName.toLowerCase()}. Atendemos clientes en ${locName} y áreas cercanas.`
      : `Immigration attorneys helping with ${serviceName.toLowerCase()}. Serving clients in ${locName} and nearby areas.`,
    h1: `${serviceName} en ${locName}`,
  }
}

/**
 * Generates a location-adjusted service description.
 * Naturally incorporates the location name into the existing description.
 *
 * @param {string} serviceKey - The i18n service key
 * @param {object|null} location - Location object or null
 * @param {string} lang - 'es' or 'en'
 * @param {Function} t - i18n translate function
 * @returns {string}
 */
export function getLocationDescription(serviceKey, location, lang, t) {
  const baseDesc = t(`serviceDescriptions.${serviceKey}`)
  if (!location) return baseDesc

  const context = lang === 'es' ? location.contextEs : location.contextEn

  // Prepend location context to the base description
  if (lang === 'es') {
    return `Nuestro equipo ayuda a clientes ${context} con este servicio. ${baseDesc}`
  }
  return `Our team assists clients ${context} with this service. ${baseDesc}`
}

/**
 * Gets related services for internal linking.
 *
 * @param {string} baseSlug - The base service slug
 * @param {Function} t - i18n translate function
 * @returns {Array<{ slug: string, name: string }>}
 */
export function getRelatedServices(baseSlug, t) {
  const service = baseServices[baseSlug]
  if (!service || !service.relatedSlugs) return []

  return service.relatedSlugs.map(slug => {
    const related = baseServices[slug]
    if (!related) return null
    return {
      slug,
      name: t(`services.${related.key}`),
    }
  }).filter(Boolean)
}
