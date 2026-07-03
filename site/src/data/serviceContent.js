/**
 * Service page content per locale.
 *
 * Each content block is one of:
 *   { type: 'heading', text }       — h2
 *   { type: 'subheading', text }    — h3
 *   { type: 'paragraph', text }
 *   { type: 'list', items: [] }
 *   { type: 'video' }               — marks where the inline video embed goes
 *
 * Usage from ServiceDetailPage.vue:
 *   serviceContent[locale][serviceKey]  ->  array of blocks or undefined
 *
 * Keep ES + EN structurally identical (same block sequence) so a locale flip
 * doesn't rearrange the page. If a translation is missing for a service,
 * `getServiceContent()` falls back to ES so visitors never see an empty page.
 */

const es = {
  asilo: [
    { type: 'heading', text: '¿Qué es el Asilo?' },
    { type: 'paragraph', text: 'El asilo puede ser otorgado a personas que ya se encuentran en los Estados Unidos y que no pueden o no desean regresar a su país de origen debido a persecución o a un temor bien fundado de persecución por motivos de raza, religión, nacionalidad, pertenencia a un grupo social determinado o por opinión política.' },
    { type: 'paragraph', text: 'Si se le concede asilo, se le permitirá vivir y trabajar en los Estados Unidos.' },
    { type: 'paragraph', text: 'Usted puede incluir a su cónyuge y a sus hijos solteros menores de 21 años en su propia solicitud de asilo, siempre que su cónyuge o hijos se encuentren en los Estados Unidos.' },
    { type: 'heading', text: '¿Estatus de Asilo o Estatus de Refugiado?' },
    { type: 'paragraph', text: 'El estatus de asilo y el estatus de refugiado están estrechamente relacionados. La diferencia principal radica en el lugar donde la persona solicita el estatus.' },
    { type: 'paragraph', text: 'El asilo se solicita dentro de los Estados Unidos, mientras que el estatus de refugiado se solicita fuera de los Estados Unidos.' },
    { type: 'paragraph', text: 'Sin embargo, todas las personas a las que se les concede asilo deben cumplir con la definición de refugiado. Si no califica para el asilo pero teme ser torturado al regresar a su país de origen, puede solicitar consideración bajo la Convención contra la Tortura.' },
    { type: 'paragraph', text: 'El Congreso ha restringido las solicitudes de asilo que se presentan más de un año después de la llegada a los Estados Unidos, salvo que existan circunstancias extraordinarias o cambios significativos en la situación del solicitante.' },
    { type: 'heading', text: 'El proceso de asilo' },
    { type: 'paragraph', text: 'Existen dos maneras en las que una persona puede solicitar asilo. Sin embargo, en ambos procesos, los solicitantes deben demostrar un "temor bien fundado" de persecución en su país de origen, como se explicó anteriormente.' },
    { type: 'subheading', text: 'Proceso de asilo afirmativo' },
    { type: 'paragraph', text: 'Una persona puede solicitar asilo mediante el proceso de asilo afirmativo si ingresó a los Estados Unidos con una visa o si es un menor no acompañado que se encuentra físicamente presente en el país, sin importar cómo haya ingresado, siempre y cuando lo haga dentro del primer año después de su llegada.' },
    { type: 'paragraph', text: 'En el proceso de asilo afirmativo, un oficial de asilo de USCIS determina si el individuo recibirá asilo en los Estados Unidos.' },
    { type: 'paragraph', text: 'El solicitante de asilo puede ser aprobado para asilo o remitido ante un juez de inmigración. Si el caso es remitido, el solicitante tendrá otra oportunidad de demostrar su elegibilidad ante el juez.' },
    { type: 'subheading', text: 'Proceso de asilo defensivo' },
    { type: 'paragraph', text: 'Una persona puede solicitar asilo mediante el proceso de asilo defensivo como una defensa contra la deportación, después de haber sido detenida por el Servicio de Inmigración y Control de Aduanas (ICE) o por Aduanas y Protección Fronteriza (CBP) de los Estados Unidos, o al llegar a un puerto de entrada sin una visa válida.' },
    { type: 'paragraph', text: 'A través del proceso de asilo defensivo, los individuos solicitan asilo ante un tribunal de inmigración, donde un juez decide si el solicitante recibirá o no el asilo.' },
    { type: 'paragraph', text: 'Nuestro bufete también puede ayudar a los solicitantes con problemas de autorización de empleo, solicitudes de residencia permanente y asistencia para que los familiares puedan venir a los Estados Unidos.' },
  ],

  ciudadania: [
    { type: 'heading', text: '¿Qué es la naturalización en los Estados Unidos?' },
    { type: 'paragraph', text: 'La "naturalización" es el nombre del proceso para convertirse en ciudadano estadounidense, si nació fuera de los Estados Unidos.' },
    { type: 'video' },
    { type: 'paragraph', text: 'Contácte a nuestros abogados si está solicitando la ciudadanía o naturalización estadounidense.' },
  ],

  daca: [
    { type: 'video' },
    { type: 'paragraph', text: 'Esta política protege a casi 1 millón de jóvenes que ingresaron al país ilegalmente cuando eran niños. Aunque no ofrece un camino hacia la ciudadanía, las personas que se benefician de esta política pueden obtener tanto un número de Seguro Social como un permiso de trabajo.' },
    { type: 'heading', text: 'Beneficios de DACA' },
    { type: 'paragraph', text: 'El programa DACA puede cambiar la vida de una persona al darle acceso a mejores oportunidades laborales y educativas. El beneficio más importante es que permite a los beneficiarios obtener un número de Seguro Social y, en algunos estados, una licencia de conducir.' },
    { type: 'paragraph', text: 'Esto significa que podrá solicitar atención médica, poner servicios públicos a su nombre e incluso comenzar a construir un historial de crédito.' },
    { type: 'heading', text: '¿Qué significa "Acción Diferida" en DACA?' },
    { type: 'paragraph', text: 'En la ley administrativa de los Estados Unidos, la "acción diferida" es una forma técnica de decir que el beneficiario está protegido temporalmente contra la deportación.' },
    { type: 'paragraph', text: 'Se trata de una determinación discrecional para aplazar la expulsión de una persona como un acto de discreción procesal. No es un estatus legal, sino un aplazamiento indefinido de la deportación.' },
    { type: 'heading', text: '¿Existen riesgos al solicitar DACA?' },
    { type: 'paragraph', text: 'Comenzar el proceso de solicitud sin cumplir con los criterios de elegibilidad puede causar que su solicitud sea rechazada e incluso acelerar su proceso de deportación. Además, debe recordar que DACA es un estatus discrecional, lo que significa que las autoridades pueden decidir revocarlo en cualquier momento. Por ello, se recomienda consultar con un abogado de inmigración antes de iniciar su solicitud.' },
    { type: 'heading', text: '¿Pueden los beneficiarios de DACA viajar a otros países?' },
    { type: 'paragraph', text: '¡Sí! Algunos beneficiarios pueden solicitar un permiso anticipado de viaje (Advance Parole), el cual les permite salir del país sin perder su estatus DACA.' },
    { type: 'paragraph', text: 'Sin embargo, este documento no se aplica a todos los casos ni a todos los motivos de viaje, por lo que debe asegurarse de verificar su elegibilidad antes de presentar la solicitud.' },
    { type: 'paragraph', text: 'Nuestro equipo de abogados de inmigración está formado por profesionales de distintos orígenes y áreas de especialización, listos para ayudarle a entender su situación y brindarle asesoría personalizada.' },
  ],

  ead: [
    { type: 'video' },
    { type: 'heading', text: '¿Qué es un Documento de Autorización de Empleo?' },
    { type: 'paragraph', text: 'El Formulario I-765, también conocido como Documento de Autorización de Empleo (EAD) o permiso de trabajo, le permite demostrar que está autorizado para trabajar legalmente dentro de los Estados Unidos. Con un EAD, usted puede trabajar en el país incluso si su visa no lo permite directamente.' },
    { type: 'paragraph', text: 'El EAD está diseñado para ciertos visitantes no inmigrantes que necesitan trabajar en los Estados Unidos, como estudiantes, refugiados o solicitantes de asilo.' },
    { type: 'paragraph', text: 'En Campos Muños, estamos listos para ayudarle durante todo el proceso, desde la recopilación de la evidencia necesaria hasta su entrevista ante la junta de inmigración.' },
  ],

  tps: [
    { type: 'heading', text: '¿Qué es el TPS en el sistema legal de inmigración de los Estados Unidos?' },
    { type: 'paragraph', text: 'Como su nombre lo indica, el Estatus de Protección Temporal (TPS) ofrece a los no ciudadanos un estatus migratorio no permanente en los Estados Unidos.' },
    { type: 'paragraph', text: 'El TPS es un beneficio migratorio relativamente nuevo, creado por el Congreso de los EE. UU. en 1990 cuando se reformó la Ley de Inmigración y Nacionalidad.' },
    { type: 'paragraph', text: 'El TPS protege a los ciudadanos de ciertos países designados por el Congreso de los EE. UU. o el Departamento de Seguridad Nacional (DHS).' },
    { type: 'paragraph', text: 'El propósito del TPS es proteger a las personas de países designados que podrían enfrentar condiciones peligrosas o dificultades significativas si regresaran a su país de origen.' },
    { type: 'paragraph', text: 'Los Estados Unidos otorgan designaciones de TPS en respuesta a crisis humanitarias provocadas por desastres naturales, conflictos armados, disturbios civiles, violencia generalizada u otras condiciones extraordinarias y temporales.' },
    { type: 'paragraph', text: 'Una designación típica de TPS se realiza después de que el gobierno determina que no es seguro regresar a un país específico debido a su situación actual.' },
    { type: 'paragraph', text: 'En resumen, el Gobierno de los Estados Unidos, a través del Congreso o del Poder Ejecutivo, tiene la autoridad para designar países para el Estatus de Protección Temporal (TPS) y ofrecer a sus ciudadanos un estatus migratorio temporal que les permita permanecer legalmente en los Estados Unidos mientras persistan las condiciones que justificaron la designación.' },
    { type: 'heading', text: '¿Quién califica para el TPS?' },
    { type: 'paragraph', text: 'En términos generales, para calificar para el Estatus de Protección Temporal (TPS), el solicitante debe cumplir con tres requisitos básicos.' },
    { type: 'paragraph', text: 'Primero, el solicitante debe demostrar que es ciudadano del país designado o una persona sin nacionalidad que haya residido habitualmente en el país designado bajo TPS.' },
    { type: 'paragraph', text: 'La forma más sencilla de probar la ciudadanía es mediante un pasaporte o certificado de nacimiento emitido por las autoridades del país correspondiente.' },
    { type: 'paragraph', text: 'Segundo, el solicitante debe demostrar su presencia física en los Estados Unidos en la fecha en que se oficializó la designación del TPS.' },
    { type: 'paragraph', text: 'Por lo general, el Departamento de Seguridad Nacional (DHS) publica una resolución en el Registro Federal indicando que los ciudadanos del país designado que se encontraban físicamente en EE. UU. antes de una fecha específica son elegibles para el estatus temporal.' },
    { type: 'paragraph', text: 'Normalmente, esta fecha es anterior a la publicación oficial de la designación. Hay varias formas de demostrar la presencia física antes de la fecha estipulada, como por ejemplo: extractos bancarios, contratos de arrendamiento, talonarios de pago, comprobantes de seguro o registros escolares.' },
    { type: 'paragraph', text: 'Cualquier documento o declaración jurada que confirme la presencia de una persona en EE. UU. puede ser presentado ante las autoridades migratorias.' },
    { type: 'paragraph', text: 'Por último, el solicitante debe demostrar residencia continua en los Estados Unidos desde el momento en que se realizó la designación hasta que se presenta formalmente la solicitud. Sin embargo, ausencias breves o accidentales fuera del territorio estadounidense pueden ser aceptadas bajo circunstancias excepcionales.' },
    { type: 'paragraph', text: 'Los registros de viaje emitidos por la Oficina de Aduanas y Protección Fronteriza (CBP), copias de las páginas del pasaporte u otra evidencia que demuestre la presencia física mencionada anteriormente, pueden utilizarse para probar que el solicitante ha permanecido en EE. UU. desde la designación del TPS.' },
    { type: 'paragraph', text: 'Además, un solicitante de TPS no puede ser inadmisible bajo la ley de inmigración.' },
    { type: 'paragraph', text: 'El término inadmisibilidad proviene de la Ley de Inmigración y Nacionalidad (INA), la cual impide la entrada o permanencia en los Estados Unidos a ciertas personas bajo circunstancias específicas.' },
    { type: 'paragraph', text: 'Según la INA, una persona se considera inadmisible si padece ciertas condiciones médicas, ha cometido ciertos tipos de delitos, ha violado las leyes de inmigración, o representa un riesgo para la seguridad de los Estados Unidos.' },
    { type: 'paragraph', text: 'En este contexto, esto significa que el solicitante no debe haber cometido un delito grave o dos delitos menores, ya que la mayoría de los motivos de inadmisibilidad son exentos para los solicitantes de TPS, especialmente aquellos relacionados con violaciones a las leyes de inmigración.' },
    { type: 'heading', text: '¿Cómo beneficia el TPS a una persona después de que su solicitud ha sido aprobada?' },
    { type: 'paragraph', text: 'El TPS crea dos efectos legales principales: protege a los titulares de TPS contra la deportación y les autoriza a trabajar legalmente en los Estados Unidos.' },
    { type: 'paragraph', text: 'Sin embargo, los solicitantes de TPS no están obligados a solicitar un permiso de trabajo de inmediato. Además, un titular de TPS también puede solicitar autorización para viajar al extranjero.' },
    { type: 'paragraph', text: 'La protección contra la deportación puede tener distintos significados. Podría implicar que una persona que ingresó ilegalmente a los Estados Unidos no será deportada; que una persona que entró al país con una visa temporal y perdió su estatus no será colocada en un proceso de deportación; que una persona a la que se le negó una visa o alivio migratorio no será removida del país; o que una persona con un caso de deportación activo puede lograr la suspensión de su proceso.' },
    { type: 'paragraph', text: 'En resumen, los titulares de TPS no pueden ser expulsados de los Estados Unidos mientras su estatus de TPS siga siendo válido.' },
    { type: 'subheading', text: 'Autorización de Empleo bajo el TPS' },
    { type: 'paragraph', text: 'Una persona que solicita el TPS puede presentar al mismo tiempo una solicitud para obtener un permiso de trabajo.' },
    { type: 'paragraph', text: 'Si decide no hacerlo de inmediato, puede hacerlo una vez que su solicitud de TPS haya sido aprobada.' },
    { type: 'paragraph', text: 'Un permiso de trabajo bajo la categoría TPS (A-12 / C-19) autoriza a una persona a trabajar legalmente en los Estados Unidos sin restricciones significativas.' },
    { type: 'paragraph', text: 'Estos permisos se emiten por un período igual a la vigencia del estatus TPS y pueden renovarse mientras la designación de TPS siga activa.' },
    { type: 'heading', text: 'Países que han sido designados para el TPS en los Estados Unidos' },
    { type: 'list', items: [
      'El Salvador',
      'Honduras',
      'Nepal',
      'Nicaragua',
      'Haití',
      'Birmania (Myanmar)',
      'Somalia',
      'Siria',
      'Venezuela',
      'Sudán',
      'Sudán del Sur',
      'Yemen',
    ] },
    { type: 'heading', text: '¿El TPS ofrece un camino hacia la residencia permanente?' },
    { type: 'paragraph', text: 'Al momento de redactar este artículo, la Ley de Inmigración y Nacionalidad de los Estados Unidos no permite que los titulares de TPS ajusten su estatus migratorio a residente permanente únicamente por tener la designación de TPS.' },
    { type: 'paragraph', text: 'Sin embargo, si un titular de TPS obtiene una visa de inmigrante mientras mantiene su estatus TPS, podría ser posible convertirse en residente permanente.' },
    { type: 'paragraph', text: 'El propósito principal del TPS es proteger temporalmente a los nacionales de un país designado para que no tengan que regresar a su país de origen y enfrentar peligro.' },
    { type: 'paragraph', text: 'Sin embargo, cuando una persona tiene dos nacionalidades, existe la posibilidad de que pueda buscar refugio o residencia en otro país, distinto al país designado para el TPS.' },
    { type: 'paragraph', text: 'Esto no significa que una persona con doble ciudadanía no pueda solicitar el TPS, pero sí requiere un análisis detallado de la relación real entre el solicitante y el país designado o no designado para TPS.' },
    { type: 'paragraph', text: 'Factores como cómo se adquirió la segunda ciudadanía, las barreras lingüísticas, el tiempo de residencia en ese otro país, la frecuencia de viajes, los lazos familiares, las propiedades u otras conexiones con dicho país pueden ser evaluados para determinar si el solicitante se ha establecido de manera permanente en el tercer país.' },
    { type: 'paragraph', text: 'Si ese fuera el caso, es poco probable que se apruebe una solicitud de TPS, ya que se considera que la persona puede encontrar refugio seguro en otro lugar.' },
  ],

  tramiteConsular: [
    { type: 'video' },
    { type: 'paragraph', text: 'El procesamiento consular es un procedimiento mediante el cual el beneficiario de una petición de inmigración aprobada solicita una visa en uno de los consulados de los Estados Unidos en el extranjero. Para iniciar este proceso, deben existir números de visa disponibles para el país del posible inmigrante.' },
    { type: 'paragraph', text: 'Si está interesado en solicitar una visa en una oficina consular fuera de los Estados Unidos, debe buscar la asistencia de un abogado de inmigración calificado que lo guíe durante todo el proceso.' },
  ],

  // User-supplied content verbatim — covers what the live Wix /visas-de-prometido page shows.
  visasPrometido: [
    { type: 'paragraph', text: 'Los ciudadanos estadounidenses que están comprometidos con un ciudadano extranjero y tienen la intención real de casarse y comenzar una vida juntos como pareja, tienen la posibilidad de solicitar una Visa de Prometido(a) (K-1) para permitir que su pareja ingrese al país y se casen dentro de los 90 días posteriores a su entrada.' },
    { type: 'paragraph', text: 'La ventaja de esta visa es que, si se casan dentro del plazo establecido, podrán solicitar de inmediato el estatus de residente permanente para su pareja (Green Card).' },
    { type: 'heading', text: 'Requisitos para la Visa de Prometido(a) K-1' },
    { type: 'paragraph', text: 'Según el USCIS, usted puede ser elegible para traer a su prometido(a) a los Estados Unidos con una visa K-1 si cumple con los siguientes requisitos:' },
    { type: 'list', items: [
      'Usted es ciudadano estadounidense.',
      'Usted y su prometido(a) tienen la intención de casarse dentro de los 90 días posteriores a la admisión de su prometido(a) a los Estados Unidos con una visa K-1 de no inmigrante.',
      'Usted y su prometido(a) son legalmente libres para casarse (esto significa que ambos pueden casarse legalmente en los Estados Unidos y que cualquier matrimonio anterior ha sido legalmente disuelto por divorcio, fallecimiento o anulación).',
      'Usted y su prometido(a) se conocieron en persona al menos una vez dentro de los 2 años anteriores a la presentación de su solicitud. Puede solicitar una exención de este requisito de encuentro en persona si puede demostrar que dicho encuentro: viola las costumbres estrictas y de larga tradición de la cultura o práctica social extranjera de su prometido(a); o implicaría una dificultad extrema para usted, el solicitante ciudadano estadounidense.',
    ] },
    { type: 'heading', text: '¿Cuál es el proceso para traer a mi prometido(a) a los Estados Unidos con una visa K-1?' },
    { type: 'subheading', text: 'Paso 1 – Presentar la Petición' },
    { type: 'paragraph', text: 'Complete el Formulario I-129F, siguiendo las instrucciones, para registrar su relación con un ciudadano extranjero. USCIS puede solicitar documentación, formal o informal, para probar la relación. Una vez que la relación sea reconocida y USCIS apruebe la petición, el formulario será enviado al Centro Nacional de Visas (NVC). Si no es aprobada, se le notificará sobre las razones de la negación.' },
    { type: 'paragraph', text: 'El NVC le proporcionará un número de caso y enviará su petición a la embajada o consulado de los Estados Unidos en el país de su prometido(a).' },
    { type: 'subheading', text: 'Paso 2 – Solicitud de la Visa' },
    { type: 'paragraph', text: 'Una vez que la embajada reciba el formulario, programará una entrevista con su prometido(a). Es importante que su prometido(a) asista a la entrevista en la fecha acordada con todos los formularios y documentos requeridos.' },
    { type: 'paragraph', text: 'Durante la entrevista, un oficial del Departamento de Estado determinará si la relación es genuina y si su prometido(a) califica para una visa K-1. Si el oficial aprueba la visa, su prometido(a) deberá viajar a los Estados Unidos para continuar el proceso.' },
    { type: 'subheading', text: 'Paso 3 – Matrimonio' },
    { type: 'paragraph', text: 'Una vez que su prometido(a) haya sido admitido(a) en los Estados Unidos, tendrán 90 días para casarse.' },
    { type: 'subheading', text: 'Paso 4 – Ajuste de Estatus' },
    { type: 'paragraph', text: 'Si usted y su cónyuge se casan dentro de los 90 días posteriores a la entrada, su pareja puede presentar el Formulario I-485 para solicitar la residencia permanente (Green Card).' },
    { type: 'paragraph', text: 'Como en procesos anteriores, USCIS puede solicitar información adicional sobre el matrimonio antes de programar una entrevista para aprobar la residencia permanente.' },
    { type: 'heading', text: 'Mi prometido(a) tiene hijos — ¿Puede traerlos a los Estados Unidos?' },
    { type: 'paragraph', text: 'Los hijos solteros de su prometido(a) menores de 21 años son elegibles para una visa K-2.' },
    { type: 'paragraph', text: 'Asegúrese de incluir sus nombres en el Formulario I-129F.' },
    { type: 'paragraph', text: 'Si usted y su prometido(a) se casan dentro de los 90 días posteriores a la entrada, los hijos que ingresaron con una visa K-2 también pueden solicitar una tarjeta de residencia (Green Card).' },
  ],

  // Visa U content — from VAWA.txt (Visa U section)
  visaU: [
    { type: 'video' },
  ],

  // Visa T content — from VAWA.txt (Visa T section)
  visaT: [
    { type: 'video' },
    { type: 'heading', text: '¿Qué es una Visa T?' },
    { type: 'paragraph', text: 'La Visa T fue creada para ofrecer alivio migratorio a las víctimas de formas graves de trata de personas.' },
    { type: 'paragraph', text: 'Una Visa T protege a los beneficiarios de la deportación y les otorga permiso para trabajar en los Estados Unidos.' },
    { type: 'paragraph', text: 'Los solicitantes de una Visa T de buena fe también tienen acceso a los mismos beneficios que los refugiados, incluyendo asistencia económica, ayuda alimentaria y capacitación laboral.' },
    { type: 'paragraph', text: 'El cónyuge y los hijos solteros menores de edad de la víctima de trata pueden calificar como familiares dependientes. Además, si el solicitante tiene menos de 21 años, también pueden incluirse sus padres y hermanos menores solteros como beneficiarios derivados.' },
    { type: 'heading', text: '¿Quién es elegible para una Visa T?' },
    { type: 'paragraph', text: 'Un inmigrante puede ser elegible para una Visa T si cumple con los siguientes requisitos:' },
    { type: 'list', items: [
      'Es víctima de una forma grave de trata de personas, lo que incluye: trata sexual (en la cual un acto sexual comercial se obtiene mediante fraude, fuerza o coerción, o si la víctima tiene menos de 18 años de edad) o trata laboral (que consiste en el reclutamiento, transporte, acogida o provisión de una persona para trabajo o servicios mediante fuerza, fraude o coerción, con el propósito de someterla a servidumbre involuntaria o esclavitud).',
      'Se encuentra físicamente presente en los Estados Unidos como resultado directo de la trata de personas.',
      'Colabora con las autoridades en la investigación o el enjuiciamiento de los tratantes (las víctimas menores de 18 años están exentas de este requisito).',
      'Puede demostrar que sufriría dificultades extremas que implicarían daño inusual o severo si fuera removida de los Estados Unidos.',
    ] },
  ],

  // VAWA content — from VAWA.txt (VAWA self-petition section)
  vawa: [
    { type: 'video' },
    { type: 'heading', text: '¿Qué es una Auto-Petición VAWA?' },
    { type: 'paragraph', text: 'VAWA significa Violence Against Women Act (Ley de Violencia Contra la Mujer), aprobada por el Congreso en 1994. VAWA creó una vía especial para obtener estatus migratorio legal para víctimas de abuso doméstico que normalmente tendrían que depender de sus abusadores para solicitar estatus migratorio.' },
    { type: 'paragraph', text: 'La auto-petición VAWA permite que las víctimas de abuso que son familiares cercanos de ciudadanos estadounidenses o residentes permanentes legales (cónyuges, hijos y padres) soliciten el estatus migratorio por su cuenta, sin necesidad del abusador.' },
    { type: 'paragraph', text: '¿Quieres solicitar una visa para sobrevivientes de violencia o trata de personas? ¡Estamos aquí para ayudarte!' },
    { type: 'paragraph', text: 'En Campos Muños Law, nos encanta brindar servicios legales y asesoría a inmigrantes en cada etapa de su proceso para convertirse en residentes permanentes y ciudadanos estadounidenses. Sabemos bien la importancia que tiene la diversidad en la cultura de un país.' },
    { type: 'paragraph', text: 'Nuestro equipo de abogados está compuesto por profesionales de diferentes orígenes y áreas de experiencia, listos para identificar las necesidades especiales de tu caso desde distintas perspectivas.' },
  ],
}

const en = {
  asilo: [
    { type: 'heading', text: 'What Is Asylum?' },
    { type: 'paragraph', text: 'Asylum may be granted to people already in the United States who are unable or unwilling to return to their home country because of persecution, or a well-founded fear of persecution, on account of race, religion, nationality, membership in a particular social group, or political opinion.' },
    { type: 'paragraph', text: 'If you are granted asylum, you will be permitted to live and work in the United States.' },
    { type: 'paragraph', text: 'You may include your spouse and unmarried children under 21 in your own asylum application, provided your spouse or children are in the United States.' },
    { type: 'heading', text: 'Asylum Status or Refugee Status?' },
    { type: 'paragraph', text: 'Asylum status and refugee status are closely related. The main difference lies in where the person applies for status.' },
    { type: 'paragraph', text: 'Asylum is applied for inside the United States, while refugee status is applied for outside the United States.' },
    { type: 'paragraph', text: 'However, every person granted asylum must meet the definition of a refugee. If you do not qualify for asylum but fear being tortured upon return to your home country, you may seek consideration under the Convention Against Torture.' },
    { type: 'paragraph', text: 'Congress has restricted asylum applications filed more than one year after arrival in the United States, unless there are extraordinary circumstances or significant changes in the applicant’s situation.' },
    { type: 'heading', text: 'The Asylum Process' },
    { type: 'paragraph', text: 'There are two ways a person can apply for asylum. In both processes, applicants must demonstrate a "well-founded fear" of persecution in their home country, as explained above.' },
    { type: 'subheading', text: 'Affirmative Asylum Process' },
    { type: 'paragraph', text: 'A person can apply for asylum through the affirmative process if they entered the United States on a visa, or if they are an unaccompanied minor physically present in the country regardless of how they entered, provided they apply within the first year after arrival.' },
    { type: 'paragraph', text: 'In the affirmative process, a USCIS asylum officer determines whether the individual will be granted asylum in the United States.' },
    { type: 'paragraph', text: 'The applicant can be approved for asylum or referred to an immigration judge. If the case is referred, the applicant will have another chance to demonstrate eligibility before the judge.' },
    { type: 'subheading', text: 'Defensive Asylum Process' },
    { type: 'paragraph', text: 'A person can request asylum through the defensive process as a defense against deportation, after being detained by U.S. Immigration and Customs Enforcement (ICE) or Customs and Border Protection (CBP), or upon arriving at a port of entry without a valid visa.' },
    { type: 'paragraph', text: 'Through the defensive asylum process, individuals seek asylum before an immigration court, where a judge decides whether to grant asylum.' },
    { type: 'paragraph', text: 'Our firm can also help applicants with work authorization issues, permanent residence applications, and family-based assistance to bring relatives to the United States.' },
  ],

  ciudadania: [
    { type: 'heading', text: 'What Is Naturalization in the United States?' },
    { type: 'paragraph', text: '"Naturalization" is the name for the process of becoming a U.S. citizen if you were born outside the United States.' },
    { type: 'video' },
    { type: 'paragraph', text: 'Contact our attorneys if you are applying for U.S. citizenship or naturalization.' },
  ],

  daca: [
    { type: 'video' },
    { type: 'paragraph', text: 'This policy protects nearly 1 million young people who entered the country unlawfully as children. While it does not offer a path to citizenship, those who benefit from this policy can obtain both a Social Security number and a work permit.' },
    { type: 'heading', text: 'DACA Benefits' },
    { type: 'paragraph', text: 'The DACA program can change a person’s life by giving them access to better employment and education opportunities. The most important benefit is that recipients can obtain a Social Security number and, in some states, a driver’s license.' },
    { type: 'paragraph', text: 'That means you can apply for healthcare, put utilities in your name, and even start building credit history.' },
    { type: 'heading', text: 'What Does "Deferred Action" Mean in DACA?' },
    { type: 'paragraph', text: 'In U.S. administrative law, "deferred action" is a technical way of saying that the recipient is temporarily protected from deportation.' },
    { type: 'paragraph', text: 'It is a discretionary determination to postpone someone’s removal as an act of prosecutorial discretion. It is not a legal status, but rather an indefinite postponement of deportation.' },
    { type: 'heading', text: 'Are There Risks to Applying for DACA?' },
    { type: 'paragraph', text: 'Starting the application process without meeting the eligibility criteria can result in your application being denied and even accelerate your deportation process. Also remember that DACA is a discretionary status — authorities can decide to revoke it at any time. For that reason, consulting with an immigration attorney before applying is recommended.' },
    { type: 'heading', text: 'Can DACA Recipients Travel to Other Countries?' },
    { type: 'paragraph', text: 'Yes! Some recipients can apply for Advance Parole, which allows them to leave the country without losing their DACA status.' },
    { type: 'paragraph', text: 'However, this document doesn’t apply to every case or every travel reason, so verify your eligibility before applying.' },
    { type: 'paragraph', text: 'Our immigration team is made up of professionals from different backgrounds and areas of specialization, ready to help you understand your situation and give you personalized advice.' },
  ],

  ead: [
    { type: 'video' },
    { type: 'heading', text: 'What Is an Employment Authorization Document?' },
    { type: 'paragraph', text: 'Form I-765, also known as the Employment Authorization Document (EAD) or work permit, lets you prove that you are authorized to work legally inside the United States. With an EAD, you can work in the country even if your visa doesn’t directly permit it.' },
    { type: 'paragraph', text: 'The EAD is designed for certain nonimmigrant visitors who need to work in the U.S., such as students, refugees, or asylum applicants.' },
    { type: 'paragraph', text: 'At Campos Muños, we are ready to help you through the entire process — from gathering the necessary evidence to your interview before the immigration board.' },
  ],

  tps: [
    { type: 'heading', text: 'What Is TPS in the U.S. Immigration Legal System?' },
    { type: 'paragraph', text: 'As the name implies, Temporary Protected Status (TPS) offers non-citizens a non-permanent immigration status in the United States.' },
    { type: 'paragraph', text: 'TPS is a relatively new immigration benefit, created by the U.S. Congress in 1990 when it reformed the Immigration and Nationality Act.' },
    { type: 'paragraph', text: 'TPS protects citizens of certain countries designated by the U.S. Congress or the Department of Homeland Security (DHS).' },
    { type: 'paragraph', text: 'The purpose of TPS is to protect people from designated countries who could face dangerous conditions or significant hardship if they returned home.' },
    { type: 'paragraph', text: 'The United States grants TPS designations in response to humanitarian crises caused by natural disasters, armed conflict, civil unrest, generalized violence, or other extraordinary and temporary conditions.' },
    { type: 'paragraph', text: 'A typical TPS designation is made after the government determines that returning to a specific country is unsafe given its current situation.' },
    { type: 'paragraph', text: 'In short, the U.S. Government, through Congress or the Executive Branch, has authority to designate countries for Temporary Protected Status and to offer their citizens a temporary immigration status that lets them remain legally in the U.S. while the conditions that justified the designation persist.' },
    { type: 'heading', text: 'Who Qualifies for TPS?' },
    { type: 'paragraph', text: 'Generally, to qualify for Temporary Protected Status (TPS), the applicant must meet three basic requirements.' },
    { type: 'paragraph', text: 'First, the applicant must show that they are a citizen of the designated country, or a stateless person who habitually resided in the designated country.' },
    { type: 'paragraph', text: 'The simplest way to prove citizenship is with a passport or birth certificate issued by the relevant authorities.' },
    { type: 'paragraph', text: 'Second, the applicant must demonstrate physical presence in the United States on the date TPS was officially designated.' },
    { type: 'paragraph', text: 'Typically, the Department of Homeland Security (DHS) publishes a Federal Register notice stating that citizens of the designated country who were physically present in the U.S. before a specific date are eligible for the temporary status.' },
    { type: 'paragraph', text: 'Usually this date is earlier than the official publication of the designation. There are several ways to demonstrate physical presence before the stated date, such as: bank statements, lease agreements, pay stubs, insurance receipts, or school records.' },
    { type: 'paragraph', text: 'Any document or sworn statement confirming a person’s presence in the U.S. may be presented to immigration authorities.' },
    { type: 'paragraph', text: 'Finally, the applicant must show continuous residence in the United States from the moment of designation until they formally file the application. Brief or accidental absences from U.S. territory may be accepted under exceptional circumstances.' },
    { type: 'paragraph', text: 'Travel records issued by U.S. Customs and Border Protection (CBP), copies of passport pages, or other evidence demonstrating physical presence may be used to prove that the applicant has remained in the U.S. since the TPS designation.' },
    { type: 'paragraph', text: 'Additionally, a TPS applicant cannot be inadmissible under immigration law.' },
    { type: 'paragraph', text: 'Inadmissibility comes from the Immigration and Nationality Act (INA), which prevents certain people from entering or remaining in the United States under specific circumstances.' },
    { type: 'paragraph', text: 'Under the INA, a person is considered inadmissible if they have certain medical conditions, have committed certain types of crimes, have violated immigration laws, or pose a risk to U.S. security.' },
    { type: 'paragraph', text: 'In this context, this means the applicant must not have committed a felony or two misdemeanors, since most grounds of inadmissibility are waived for TPS applicants — especially those related to immigration-law violations.' },
    { type: 'heading', text: 'How Does TPS Benefit a Person After Their Application Is Approved?' },
    { type: 'paragraph', text: 'TPS creates two main legal effects: it protects TPS holders from deportation and authorizes them to work legally in the United States.' },
    { type: 'paragraph', text: 'However, TPS applicants are not required to apply for a work permit immediately. A TPS holder may also apply for authorization to travel abroad.' },
    { type: 'paragraph', text: 'Protection from deportation can mean different things. It could mean that a person who entered unlawfully will not be deported; that a person who entered on a temporary visa and lost status will not be placed in removal; that a person denied a visa or other relief will not be removed; or that a person already in active removal proceedings can have those proceedings suspended.' },
    { type: 'paragraph', text: 'In short, TPS holders cannot be removed from the United States while their TPS status remains valid.' },
    { type: 'subheading', text: 'Work Authorization Under TPS' },
    { type: 'paragraph', text: 'A person applying for TPS can file at the same time for a work permit.' },
    { type: 'paragraph', text: 'If they choose not to do it immediately, they can do it once their TPS application is approved.' },
    { type: 'paragraph', text: 'A work permit under the TPS category (A-12 / C-19) authorizes a person to work legally in the United States without significant restrictions.' },
    { type: 'paragraph', text: 'These permits are issued for a period equal to the validity of the TPS status and can be renewed while the TPS designation remains active.' },
    { type: 'heading', text: 'Countries That Have Been Designated for TPS in the US' },
    { type: 'list', items: [
      'El Salvador',
      'Honduras',
      'Nepal',
      'Nicaragua',
      'Haiti',
      'Burma (Myanmar)',
      'Somalia',
      'Syria',
      'Venezuela',
      'Sudan',
      'South Sudan',
      'Yemen',
    ] },
    { type: 'heading', text: 'Does TPS Offer a Path to Permanent Residence?' },
    { type: 'paragraph', text: 'As of this writing, the U.S. Immigration and Nationality Act does not allow TPS holders to adjust their immigration status to lawful permanent resident solely on the basis of having TPS.' },
    { type: 'paragraph', text: 'However, if a TPS holder obtains an immigrant visa while maintaining TPS status, it may be possible to become a permanent resident.' },
    { type: 'paragraph', text: 'The primary purpose of TPS is to temporarily protect nationals of a designated country so they don’t have to return home and face danger.' },
    { type: 'paragraph', text: 'However, when a person has dual nationality, there is a possibility that they could seek refuge or residence in another country other than the TPS-designated country.' },
    { type: 'paragraph', text: 'That doesn’t mean a person with dual citizenship can’t apply for TPS — but it does require careful analysis of the applicant’s real connection to the designated or non-designated country.' },
    { type: 'paragraph', text: 'Factors such as how the second citizenship was acquired, language barriers, length of residence in the other country, travel frequency, family ties, property, or other connections can be weighed to determine whether the applicant has permanently settled in the third country.' },
    { type: 'paragraph', text: 'If so, a TPS application is unlikely to be approved, since the person can find safe refuge elsewhere.' },
  ],

  tramiteConsular: [
    { type: 'video' },
    { type: 'paragraph', text: 'Consular processing is a procedure in which the beneficiary of an approved immigration petition applies for a visa at one of the U.S. consulates abroad. To start this process, visa numbers must be available for the prospective immigrant’s country.' },
    { type: 'paragraph', text: 'If you are interested in applying for a visa at a consular office outside the United States, you should seek the help of a qualified immigration attorney to guide you through the entire process.' },
  ],

  visasPrometido: [
    { type: 'paragraph', text: 'U.S. citizens engaged to a foreign national who genuinely intend to marry and start a life together as a couple may apply for a Fiancé(e) Visa (K-1), which allows the partner to enter the country and marry within 90 days of arrival.' },
    { type: 'paragraph', text: 'The advantage of this visa is that, if you marry within the established window, your partner can immediately apply for permanent resident status (Green Card).' },
    { type: 'heading', text: 'Requirements for the K-1 Fiancé(e) Visa' },
    { type: 'paragraph', text: 'According to USCIS, you may be eligible to bring your fiancé(e) to the United States with a K-1 visa if you meet the following requirements:' },
    { type: 'list', items: [
      'You are a U.S. citizen.',
      'You and your fiancé(e) intend to marry within 90 days of your fiancé(e)’s admission to the United States with a nonimmigrant K-1 visa.',
      'You and your fiancé(e) are legally free to marry (this means both of you are legally able to marry in the United States and that any previous marriage has been legally dissolved through divorce, death, or annulment).',
      'You and your fiancé(e) met in person at least once within the 2 years before filing your petition. You may request a waiver of this in-person meeting requirement if you can show that the meeting: would violate strict, long-established customs of your fiancé(e)’s foreign culture or social practice; or would result in extreme hardship to you, the U.S. citizen petitioner.',
    ] },
    { type: 'heading', text: 'What Is the Process to Bring My Fiancé(e) to the United States with a K-1 Visa?' },
    { type: 'subheading', text: 'Step 1 — File the Petition' },
    { type: 'paragraph', text: 'Complete Form I-129F, following the instructions, to register your relationship with a foreign national. USCIS may request formal or informal documentation to prove the relationship. Once the relationship is recognized and USCIS approves the petition, the form will be sent to the National Visa Center (NVC). If it is not approved, you will be notified of the reasons for the denial.' },
    { type: 'paragraph', text: 'The NVC will provide you with a case number and forward your petition to the U.S. embassy or consulate in your fiancé(e)’s country.' },
    { type: 'subheading', text: 'Step 2 — Visa Application' },
    { type: 'paragraph', text: 'Once the embassy receives the form, it will schedule an interview with your fiancé(e). It is important that your fiancé(e) attend the interview on the agreed date with all the required forms and documents.' },
    { type: 'paragraph', text: 'During the interview, an officer from the Department of State will determine whether the relationship is genuine and whether your fiancé(e) qualifies for a K-1 visa. If the officer approves the visa, your fiancé(e) will need to travel to the United States to continue the process.' },
    { type: 'subheading', text: 'Step 3 — Marriage' },
    { type: 'paragraph', text: 'Once your fiancé(e) has been admitted into the United States, you will have 90 days to marry.' },
    { type: 'subheading', text: 'Step 4 — Adjustment of Status' },
    { type: 'paragraph', text: 'If you and your spouse marry within 90 days of entry, your partner can file Form I-485 to apply for permanent residence (Green Card).' },
    { type: 'paragraph', text: 'As in previous steps, USCIS may request additional information about the marriage before scheduling an interview to approve permanent residence.' },
    { type: 'heading', text: 'My Fiancé(e) Has Children — Can They Be Brought to the United States?' },
    { type: 'paragraph', text: 'Unmarried children of your fiancé(e) under 21 are eligible for a K-2 visa.' },
    { type: 'paragraph', text: 'Be sure to include their names on Form I-129F.' },
    { type: 'paragraph', text: 'If you and your fiancé(e) marry within 90 days of entry, the children who entered with a K-2 visa can also apply for a green card.' },
  ],

  visaU: [
    { type: 'video' },
  ],

  visaT: [
    { type: 'video' },
    { type: 'heading', text: 'What Is a T Visa?' },
    { type: 'paragraph', text: 'The T Visa was created to provide immigration relief to victims of severe forms of human trafficking.' },
    { type: 'paragraph', text: 'A T Visa protects recipients from deportation and grants them permission to work in the United States.' },
    { type: 'paragraph', text: 'Good-faith T Visa applicants also have access to the same benefits as refugees, including financial assistance, food aid, and job training.' },
    { type: 'paragraph', text: 'The spouse and unmarried minor children of a trafficking victim can qualify as derivative family members. Additionally, if the applicant is under 21, their parents and unmarried minor siblings can also be included as derivative beneficiaries.' },
    { type: 'heading', text: 'Who Is Eligible for a T Visa?' },
    { type: 'paragraph', text: 'An immigrant may be eligible for a T Visa if they meet the following requirements:' },
    { type: 'list', items: [
      'Is a victim of a severe form of human trafficking, which includes: sex trafficking (in which a commercial sex act is induced by fraud, force, or coercion, or if the victim is under 18 years old) or labor trafficking (the recruitment, transportation, harboring, or provision of a person for labor or services through force, fraud, or coercion, for the purpose of subjecting them to involuntary servitude or slavery).',
      'Is physically present in the United States as a direct result of the trafficking.',
      'Cooperates with authorities in the investigation or prosecution of the traffickers (victims under 18 are exempt from this requirement).',
      'Can show that they would suffer extreme hardship involving unusual or severe harm if removed from the United States.',
    ] },
  ],

  vawa: [
    { type: 'video' },
    { type: 'heading', text: 'What Is a VAWA Self-Petition?' },
    { type: 'paragraph', text: 'VAWA stands for the Violence Against Women Act, passed by Congress in 1994. VAWA created a special pathway to legal immigration status for victims of domestic abuse who would normally have to rely on their abusers to file for immigration status.' },
    { type: 'paragraph', text: 'The VAWA self-petition allows abuse victims who are close family members of U.S. citizens or lawful permanent residents (spouses, children, and parents) to apply for immigration status on their own, without the abuser.' },
    { type: 'paragraph', text: 'Want to apply for a visa for survivors of violence or human trafficking? We are here to help!' },
    { type: 'paragraph', text: 'At Campos Muños Law, we love providing legal services and counsel to immigrants at every stage of their journey to becoming permanent residents and U.S. citizens. We know how important diversity is in a country’s culture.' },
    { type: 'paragraph', text: 'Our team is made up of professionals from different backgrounds and areas of expertise, ready to identify your case’s special needs from multiple perspectives.' },
  ],
}

export const serviceContent = { es, en }

/**
 * Returns the content blocks for the given service key in the given locale.
 * Falls back to ES if a translation isn't available, so visitors never get
 * an empty page after flipping to a partially-translated locale.
 */
export function getServiceContent(serviceKey, locale = 'es') {
  return serviceContent[locale]?.[serviceKey] || serviceContent.es?.[serviceKey] || []
}
