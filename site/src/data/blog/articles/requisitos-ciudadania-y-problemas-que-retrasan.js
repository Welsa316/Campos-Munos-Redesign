// Sources: Ciudadania-Video-Transcript.txt, plus the client-provided
// citizenship FAQ in src/data/seoServices.js (the exam exceptions,
// surrendering the green card, USCIS as the deciding agency). The waiting
// period is stated as the actual rule (5 years, or 3 if married to and living
// with a U.S. citizen), not the FAQ's "3–5 depending on how you got your
// green card" — flagged for the client in docs/blog-articles-signoff.md.
export default {
  es: {
    blocks: [
      { type: 'lead', text: 'Para muchas personas, hacerse ciudadano no es solo un trámite. Es tranquilidad, es dejar de vivir con miedo, es la seguridad de pertenecer plenamente a los Estados Unidos y la posibilidad de construir un futuro estable para usted y su familia.' },

      { type: 'heading', text: 'Por qué la ciudadanía es el estatus más sólido' },
      { type: 'paragraph', text: 'La ciudadanía estadounidense es el estatus migratorio más sólido que existe. Para los residentes permanentes, es el cierre de un proceso largo y, muchas veces, lleno de sacrificios. Entre otras cosas, la ciudadanía le permite:' },
      { type: 'list', items: [
        'Votar.',
        'Pedir a ciertos familiares (vea [quién puede pedir a quién](/blog/peticiones-familiares-quien-puede-pedir-a-quien)).',
        'Viajar con mayor libertad.',
        'Vivir sin incertidumbre.',
      ] },

      { type: 'heading', text: 'Requisitos generales' },
      { type: 'list', items: [
        'Haber sido residente permanente durante cierto tiempo: por lo general **cinco años**, o **tres años** si durante ese tiempo ha estado casado con un ciudadano estadounidense y viviendo con él o ella.',
        'Haber mantenido residencia continua y presencia física en los Estados Unidos.',
        'Demostrar buen carácter moral.',
        'Aprobar los exámenes de inglés y de educación cívica. Hay algunas excepciones según su edad y el tiempo que ha tenido la green card.',
      ] },
      { type: 'paragraph', text: 'La agencia que decide si usted puede hacerse ciudadano es USCIS, el Servicio de Ciudadanía e Inmigración de los Estados Unidos. La elegibilidad depende de la historia migratoria y personal de cada persona. Al hacerse ciudadano, usted entrega su green card.' },

      { type: 'heading', text: 'Problemas que pueden retrasar su solicitud' },
      { type: 'paragraph', text: 'Aunque pedir la ciudadanía parezca sencillo, muchas solicitudes enfrentan retrasos o problemas por:' },
      { type: 'list', items: [
        'Entradas anteriores al país.',
        'Antecedentes criminales, **aunque sean muy antiguos**.',
        'Viajes prolongados fuera de los Estados Unidos.',
        'Asuntos con el IRS.',
        'Inconsistencias con casos de inmigración anteriores.',
      ] },
      { type: 'callout', title: 'El momento importa', text: 'En ciertos casos, aplicar en el momento equivocado puede generar riesgos. Antes de presentar la solicitud, vale la pena revisar su historial con un abogado.' },

      { type: 'heading', text: 'Cómo le ayuda nuestra firma' },
      { type: 'paragraph', text: 'En Campos Muños Law le ayudamos a evaluar si realmente está listo para pedir la ciudadanía, a identificar posibles obstáculos antes de presentar la solicitud y a preparar su caso con cuidado y estrategia. Un abogado también puede representarle el día de su examen. Conozca más sobre nuestro servicio de [ciudadanía](/servicios/ciudadania).' },
    ],
    faqs: [
      { q: '¿Cuánto tiempo debo esperar para pedir la ciudadanía después de hacerme residente?', a: 'Por lo general, cinco años. Si durante ese tiempo ha estado casado con un ciudadano estadounidense y viviendo con él o ella, pueden ser tres años.' },
      { q: '¿Un antecedente criminal muy antiguo puede afectar mi solicitud?', a: 'Sí. Los antecedentes criminales pueden causar retrasos o problemas en la solicitud de ciudadanía, aunque sean muy antiguos. Conviene revisarlos con un abogado antes de aplicar.' },
      { q: '¿Viajar fuera del país puede afectar mi ciudadanía?', a: 'Los viajes prolongados fuera de los Estados Unidos son una de las causas comunes de retrasos y problemas, porque la ciudadanía exige residencia continua y presencia física en el país.' },
    ],
  },
  en: {
    blocks: [
      { type: 'lead', text: 'For many people, becoming a citizen is not just paperwork. It is peace of mind, it is no longer living in fear, it is the security of belonging fully to the United States and the chance to build a stable future for you and your family.' },

      { type: 'heading', text: 'Why citizenship is the strongest status' },
      { type: 'paragraph', text: 'U.S. citizenship is the strongest immigration status there is. For permanent residents, it is the end of a long process, one that is often full of sacrifice. Among other things, citizenship lets you:' },
      { type: 'list', items: [
        'Vote.',
        'Petition for certain relatives (see [who can petition for whom](/blog/peticiones-familiares-quien-puede-pedir-a-quien)).',
        'Travel more freely.',
        'Live without uncertainty.',
      ] },

      { type: 'heading', text: 'General requirements' },
      { type: 'list', items: [
        'Have been a permanent resident for a certain amount of time: generally **five years**, or **three years** if during that time you have been married to, and living with, a U.S. citizen.',
        'Have maintained continuous residence and physical presence in the United States.',
        'Show good moral character.',
        'Pass the English and civics exams. There are some exceptions based on your age and how long you have had your green card.',
      ] },
      { type: 'paragraph', text: 'The agency that decides whether you can become a citizen is USCIS, U.S. Citizenship and Immigration Services. Eligibility depends on each person’s immigration and personal history. When you become a citizen, you turn in your green card.' },

      { type: 'heading', text: 'Problems that can delay your application' },
      { type: 'paragraph', text: 'Although applying for citizenship may seem simple, many applications run into delays or problems because of:' },
      { type: 'list', items: [
        'Previous entries into the country.',
        'Criminal records, **even very old ones**.',
        'Long trips outside the United States.',
        'Issues with the IRS.',
        'Inconsistencies with previous immigration cases.',
      ] },
      { type: 'callout', title: 'Timing matters', text: 'In certain cases, applying at the wrong time can create risks. Before you file your application, it is worth reviewing your history with a lawyer.' },

      { type: 'heading', text: 'How our firm helps' },
      { type: 'paragraph', text: 'At Campos Muños Law, we help you assess whether you are truly ready to apply for citizenship, identify possible obstacles before you file, and prepare your case with care and strategy. A lawyer can also represent you on the day of your exam. Learn more about our [citizenship](/servicios/ciudadania) service.' },
    ],
    faqs: [
      { q: 'How long do I have to wait to apply for citizenship after becoming a resident?', a: 'Generally five years. If during that time you have been married to, and living with, a U.S. citizen, it can be three years.' },
      { q: 'Can a very old criminal record affect my application?', a: 'Yes. Criminal records can cause delays or problems in a citizenship application, even very old ones. It is a good idea to review them with a lawyer before you apply.' },
      { q: 'Can traveling outside the country affect my citizenship?', a: 'Long trips outside the United States are one of the common causes of delays and problems, because citizenship requires continuous residence and physical presence in the country.' },
    ],
  },
}
