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

// FAQ data sourced STRICTLY from .txt files in public/
// Services without .txt files have no FAQs.
export const serviceFaqs = {
  asilo: {
    es: [
      { q: '¿Puede un asilado regresar a su país de origen?', a: 'No se recomienda que los solicitantes de asilo o los asilados regresen a su país de origen. Sin aprobación previa, una solicitud de asilo abierta se considerará abandonada por USCIS.' },
      { q: '¿Cuánto dura el proceso de solicitud de asilo?', a: 'El tiempo varía según la jurisdicción. En algunas jurisdicciones, los solicitantes han esperado varios años, mientras que otros han sido llamados a una entrevista dentro del primer año.' },
      { q: '¿Se les permite a los solicitantes de asilo trabajar en los Estados Unidos?', a: 'En términos generales, después de cierto número de días y con una solicitud de asilo pendiente correctamente presentada, el solicitante puede solicitar un permiso de autorización de empleo. El permiso de trabajo puede ser aprobado por dos años.' },
      { q: '¿Qué sucede si la oficina de asilo no concede el asilo?', a: 'Si el solicitante no tiene un estatus migratorio válido, el caso será remitido a un tribunal de inmigración, donde tendrá una nueva oportunidad de presentar su solicitud ante un juez de inmigración.' },
    ],
    en: [
      { q: 'Can an asylee return to their home country?', a: 'It is not recommended that asylum seekers or asylees return to their home country. Without prior approval, an open asylum application will be considered abandoned by USCIS.' },
      { q: 'How long does the asylum application process take?', a: 'The time varies by jurisdiction. In some jurisdictions, applicants have waited several years, while others have been called for an interview within the first year.' },
      { q: 'Are asylum seekers allowed to work in the United States?', a: 'Generally, after a certain number of days with a properly filed pending asylum application, the applicant may apply for an employment authorization permit. The work permit can be approved for two years.' },
      { q: 'What happens if the asylum office does not grant asylum?', a: 'If the applicant does not have a valid immigration status, the case will be referred to immigration court, where the applicant will have another opportunity to present their asylum claim before an immigration judge.' },
    ],
  },
  ciudadania: {
    es: [
      { q: '¿Qué es la naturalización?', a: 'La "naturalización" es el nombre del proceso para convertirse en ciudadano estadounidense, si nació fuera de los Estados Unidos.' },
      { q: '¿Cuánto tarda el proceso de ciudadanía?', a: 'Considerando los tiempos actuales de procesamiento, el proceso puede tardar más de un año desde la presentación de la solicitud hasta la decisión final.' },
      { q: '¿Qué incluye la entrevista de naturalización?', a: 'Deberá asistir a una entrevista y realizar un examen donde deberá demostrar conocimiento básico sobre el sistema de gobierno y la historia de los Estados Unidos. También deberá demostrar dominio del idioma inglés.' },
      { q: '¿Qué pasa si me mudo durante el proceso?', a: 'Si se muda, debe actualizar su dirección con el gobierno de manera inmediata mediante el formulario AR-11, el cual puede presentar en línea o en formato impreso.' },
    ],
    en: [
      { q: 'What is naturalization?', a: 'Naturalization is the name of the process to become a U.S. citizen if you were born outside the United States.' },
      { q: 'How long does the citizenship process take?', a: 'Considering current processing times, the process can take more than a year from the filing of the application to the final decision.' },
      { q: 'What does the naturalization interview include?', a: 'You must attend an interview and take an exam where you must demonstrate basic knowledge of the U.S. government system and history. You must also demonstrate proficiency in the English language.' },
      { q: 'What happens if I move during the process?', a: 'If you move, you must update your address with the government immediately using Form AR-11, which can be filed online or in print.' },
    ],
  },
  daca: {
    es: [
      { q: '¿Qué beneficios ofrece DACA?', a: 'DACA permite a los beneficiarios obtener un número de Seguro Social y, en algunos estados, una licencia de conducir. Esto significa que podrá solicitar atención médica, poner servicios públicos a su nombre e incluso comenzar a construir un historial de crédito.' },
      { q: '¿Qué significa "Acción Diferida" en DACA?', a: 'La "acción diferida" es una forma técnica de decir que el beneficiario está protegido temporalmente contra la deportación. No es un estatus legal, sino un aplazamiento indefinido de la deportación.' },
      { q: '¿Existen riesgos al solicitar DACA?', a: 'Comenzar el proceso de solicitud sin cumplir con los criterios de elegibilidad puede causar que su solicitud sea rechazada e incluso acelerar su proceso de deportación. DACA es un estatus discrecional, lo que significa que las autoridades pueden decidir revocarlo en cualquier momento.' },
      { q: '¿Pueden los beneficiarios de DACA viajar a otros países?', a: 'Algunos beneficiarios pueden solicitar un permiso anticipado de viaje (Advance Parole), el cual les permite salir del país sin perder su estatus DACA. Sin embargo, este documento no se aplica a todos los casos ni a todos los motivos de viaje.' },
    ],
    en: [
      { q: 'What benefits does DACA offer?', a: 'DACA allows beneficiaries to obtain a Social Security number and, in some states, a driver\'s license. This means you can apply for healthcare, put utilities in your name, and even start building a credit history.' },
      { q: 'What does "Deferred Action" mean in DACA?', a: 'Deferred action is a technical way of saying the beneficiary is temporarily protected from deportation. It is not a legal status, but an indefinite postponement of deportation.' },
      { q: 'Are there risks when applying for DACA?', a: 'Starting the application process without meeting eligibility criteria can cause your application to be rejected and even accelerate your deportation process. DACA is a discretionary status, meaning authorities can decide to revoke it at any time.' },
      { q: 'Can DACA recipients travel to other countries?', a: 'Some beneficiaries can apply for Advance Parole, which allows them to leave the country without losing their DACA status. However, this document does not apply to all cases or all reasons for travel.' },
    ],
  },
  ead: {
    es: [
      { q: '¿Qué es un Documento de Autorización de Empleo (EAD)?', a: 'El Formulario I-765, también conocido como Documento de Autorización de Empleo (EAD) o permiso de trabajo, le permite demostrar que está autorizado para trabajar legalmente dentro de los Estados Unidos.' },
      { q: '¿Cuánto tiempo tarda en obtenerse un EAD?', a: 'Debido a que se trata de un proceso complejo, el tiempo de procesamiento puede ser prolongado. Su solicitud puede tardar hasta 12 meses en algunos casos.' },
      { q: '¿Qué sucede si mi solicitud de EAD es rechazada?', a: 'Si su solicitud de EAD es denegada, recibirá una carta explicando las razones del rechazo. Es posible presentar una moción para reabrir el caso y ofrecer nueva evidencia.' },
      { q: '¿Necesito un abogado para solicitar el EAD?', a: 'Reunir los documentos necesarios para su categoría migratoria específica y mantenerse al día con las diferentes etapas del proceso puede ser difícil sin la ayuda de un equipo de profesionales capacitados y con experiencia.' },
    ],
    en: [
      { q: 'What is an Employment Authorization Document (EAD)?', a: 'Form I-765, also known as the Employment Authorization Document (EAD) or work permit, allows you to prove that you are authorized to work legally within the United States.' },
      { q: 'How long does it take to obtain an EAD?', a: 'Because it is a complex process, the processing time can be lengthy. Your application may take up to 12 months in some cases.' },
      { q: 'What happens if my EAD application is denied?', a: 'If your EAD application is denied, you will receive a letter explaining the reasons for the rejection. It is possible to file a motion to reopen the case and offer new evidence.' },
      { q: 'Do I need an attorney to apply for an EAD?', a: 'Gathering the necessary documents for your specific immigration category and keeping up with the different stages of the process can be difficult without the help of a qualified and experienced professional team.' },
    ],
  },
  tps: {
    es: [
      { q: '¿Qué es el Estatus de Protección Temporal (TPS)?', a: 'El TPS ofrece a los no ciudadanos un estatus migratorio no permanente en los Estados Unidos. Protege a las personas de países designados que podrían enfrentar condiciones peligrosas o dificultades significativas si regresaran a su país de origen.' },
      { q: '¿Quién califica para el TPS?', a: 'El solicitante debe demostrar que es ciudadano del país designado, demostrar su presencia física en los EE. UU. en la fecha de la designación, y demostrar residencia continua desde ese momento. Además, no debe ser inadmisible bajo la ley de inmigración.' },
      { q: '¿Cómo beneficia el TPS después de ser aprobado?', a: 'El TPS protege a los titulares contra la deportación y les autoriza a trabajar legalmente en los Estados Unidos. Un titular de TPS también puede solicitar autorización para viajar al extranjero.' },
      { q: '¿El TPS ofrece un camino hacia la residencia permanente?', a: 'La ley no permite ajustar el estatus a residente permanente únicamente por tener TPS. Sin embargo, si un titular de TPS obtiene una visa de inmigrante mientras mantiene su estatus TPS, podría ser posible convertirse en residente permanente.' },
    ],
    en: [
      { q: 'What is Temporary Protected Status (TPS)?', a: 'TPS offers non-citizens a non-permanent immigration status in the United States. It protects people from designated countries who could face dangerous conditions or significant hardship if they returned to their home country.' },
      { q: 'Who qualifies for TPS?', a: 'The applicant must demonstrate citizenship of the designated country, physical presence in the U.S. on the designation date, and continuous residence since that time. Additionally, they must not be inadmissible under immigration law.' },
      { q: 'How does TPS benefit you after approval?', a: 'TPS protects holders from deportation and authorizes them to work legally in the United States. A TPS holder can also apply for authorization to travel abroad.' },
      { q: 'Does TPS offer a path to permanent residence?', a: 'The law does not allow adjusting status to permanent resident solely for having TPS. However, if a TPS holder obtains an immigrant visa while maintaining TPS status, it may be possible to become a permanent resident.' },
    ],
  },
  tramiteConsular: {
    es: [
      { q: '¿Qué es el procesamiento consular?', a: 'El procesamiento consular es un procedimiento mediante el cual el beneficiario de una petición de inmigración aprobada solicita una visa en uno de los consulados de los Estados Unidos en el extranjero.' },
      { q: '¿Cuál es la diferencia entre el procesamiento consular y el ajuste de estatus?', a: 'El ajuste de estatus permite cambiar su estatus sin salir del país. El procesamiento consular requiere que el inmigrante esté físicamente presente en el país donde tiene programada su cita.' },
      { q: '¿Cuándo debo contratar a un abogado para el proceso consular?', a: 'Lo ideal es que contacte a un abogado lo antes posible. El proceso consular puede ser muy complicado, y un error podría hacerle perder tiempo valioso o poner en riesgo su posibilidad de ingresar a los Estados Unidos en el futuro.' },
    ],
    en: [
      { q: 'What is consular processing?', a: 'Consular processing is a procedure whereby the beneficiary of an approved immigration petition applies for a visa at one of the United States consulates abroad.' },
      { q: 'What is the difference between consular processing and adjustment of status?', a: 'Adjustment of status allows you to change your status without leaving the country. Consular processing requires the immigrant to be physically present in the country where the appointment is scheduled.' },
      { q: 'When should I hire an attorney for consular processing?', a: 'Ideally, you should contact an attorney as soon as possible. Consular processing can be very complicated, and a mistake could cost you valuable time or jeopardize your ability to enter the United States in the future.' },
    ],
  },
  vawa: {
    es: [
      { q: '¿Qué es una Auto-Petición VAWA?', a: 'VAWA creó una vía especial para obtener estatus migratorio legal para víctimas de abuso doméstico que normalmente tendrían que depender de sus abusadores para solicitar estatus migratorio. La auto-petición permite que las víctimas soliciten el estatus por su cuenta, sin necesidad del abusador.' },
      { q: '¿Quién es elegible para VAWA?', a: 'Las auto-peticiones VAWA están disponibles para cónyuges o ex cónyuges de ciudadanos estadounidenses o residentes permanentes legales abusivos. Los hijos de ciudadanos o residentes permanentes abusivos también pueden solicitar antes de cumplir 25 años.' },
      { q: '¿Qué debe demostrar el solicitante de VAWA?', a: 'Además de demostrar abuso, el solicitante debe probar matrimonio de buena fe si el abusador es un cónyuge, la relación con el abusador, el estatus migratorio del abusador, buen carácter moral, y que residió con el familiar abusivo.' },
    ],
    en: [
      { q: 'What is a VAWA Self-Petition?', a: 'VAWA created a special pathway for victims of domestic abuse to obtain legal immigration status who would normally have to depend on their abusers to apply for immigration status. The self-petition allows victims to apply on their own, without the abuser.' },
      { q: 'Who is eligible for VAWA?', a: 'VAWA self-petitions are available for spouses or former spouses of abusive U.S. citizens or lawful permanent residents. Children of abusive citizens or permanent residents can also apply before turning 25.' },
      { q: 'What must a VAWA applicant demonstrate?', a: 'In addition to demonstrating abuse, the applicant must prove good faith marriage if the abuser is a spouse, the relationship with the abuser, the abuser\'s immigration status, good moral character, and that they resided with the abusive family member.' },
    ],
  },
  visaU: {
    es: [
      { q: '¿Qué es la Visa U?', a: 'La Visa U es una visa no inmigrante para víctimas de ciertos delitos que han sufrido abuso físico o mental y que pueden ayudar a las autoridades de los Estados Unidos a investigar o enjuiciar actividades criminales.' },
      { q: '¿Quién es elegible para una Visa U?', a: 'Debe ser víctima de ciertos delitos especificados, poseer información relacionada con la actividad criminal, haber ayudado o ser probable que ayude a una agencia gubernamental en la investigación del delito, y haber sufrido abuso físico o mental sustancial como resultado.' },
      { q: '¿Pueden las víctimas de Visa U obtener residencia permanente?', a: 'Las víctimas de crimen pueden eventualmente calificar para una residencia permanente (Green Card) en el futuro, pero primero deben obtener el estatus no inmigrante U.' },
    ],
    en: [
      { q: 'What is a U Visa?', a: 'The U Visa is a nonimmigrant visa for victims of certain crimes who have suffered physical or mental abuse and can help U.S. authorities investigate or prosecute criminal activity.' },
      { q: 'Who is eligible for a U Visa?', a: 'You must be a victim of certain specified crimes, possess information related to the criminal activity, have helped or be likely to help a government agency in the investigation, and have suffered substantial physical or mental abuse as a result.' },
      { q: 'Can U Visa victims obtain permanent residence?', a: 'Crime victims may eventually qualify for permanent residence (Green Card) in the future, but they must first obtain U nonimmigrant status.' },
    ],
  },
  visaT: {
    es: [
      { q: '¿Qué es una Visa T?', a: 'La Visa T fue creada para ofrecer alivio migratorio a las víctimas de formas graves de trata de personas. Protege a los beneficiarios de la deportación y les otorga permiso para trabajar en los Estados Unidos.' },
      { q: '¿Quién es elegible para una Visa T?', a: 'Es elegible si es víctima de una forma grave de trata de personas (sexual o laboral), se encuentra físicamente presente en EE. UU. como resultado directo de la trata, colabora con las autoridades en la investigación, y puede demostrar que sufriría dificultades extremas si fuera removida del país.' },
      { q: '¿Qué beneficios reciben los solicitantes de Visa T?', a: 'Los solicitantes de buena fe tienen acceso a los mismos beneficios que los refugiados, incluyendo asistencia económica, ayuda alimentaria y capacitación laboral. El cónyuge y los hijos solteros menores de edad también pueden calificar como familiares dependientes.' },
    ],
    en: [
      { q: 'What is a T Visa?', a: 'The T Visa was created to provide immigration relief to victims of severe forms of human trafficking. It protects beneficiaries from deportation and grants them permission to work in the United States.' },
      { q: 'Who is eligible for a T Visa?', a: 'You are eligible if you are a victim of a severe form of human trafficking (sexual or labor), are physically present in the U.S. as a direct result of trafficking, cooperate with authorities in the investigation, and can demonstrate extreme hardship if removed from the country.' },
      { q: 'What benefits do T Visa applicants receive?', a: 'Good faith applicants have access to the same benefits as refugees, including financial assistance, food assistance, and job training. The spouse and unmarried minor children may also qualify as derivative family members.' },
    ],
  },
}

/**
 * Resolves a slug to its base service data.
 * Supports:
 *   resolveServiceSlug('green-card')              → base service
 *   resolveServiceSlug('green-card-new-orleans')   → location via suffix (legacy)
 *   resolveServiceSlug('green-card', 'metairie')   → location via separate param
 *
 * @param {string} slug - The route slug (or service slug when locationSlug provided)
 * @param {string} [locationSlug] - Optional location slug from path param
 * @returns {{ service: object, location: object|null, baseSlug: string } | null}
 */
export function resolveServiceSlug(slug, locationSlug) {
  // Path-based location: /servicios/:service/:location
  if (locationSlug) {
    if (!baseServices[slug]) return null
    const loc = locations.find(l => l.slug === locationSlug)
    return { service: baseServices[slug], location: loc || null, baseSlug: slug }
  }

  // Direct match - base service
  if (baseServices[slug]) {
    return { service: baseServices[slug], location: null, baseSlug: slug }
  }

  // Try to match location suffix (legacy URLs like green-card-new-orleans)
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
