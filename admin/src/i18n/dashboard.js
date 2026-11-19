// Home's words in English and Spanish (the language switch at the bottom
// left, components/LanguageSwitch.vue). Home and its "My follow-ups" block
// use this; other sections have their own dictionary in i18n/. Pure, tested
// in admin/test/portalLang.test.js.
//
// {name} placeholders are filled from vars. An entry with { one, other }
// picks by vars.count. Every key must exist in both languages.

export const LANGS = ['en', 'es']

export const DASHBOARD = {
  en: {
    'header.title': 'Home',

    'greeting.morning': 'Good morning',
    'greeting.afternoon': 'Good afternoon',
    'greeting.evening': 'Good evening',
    'avatar.change': 'Change your picture',
    'avatar.label': 'Your picture',

    'figures.could_not_load': 'Could not load these figures. Open the page, or reload to try again.',

    'missed.label': 'Missed calls in business hours',
    'missed.window': 'Last 30 days · Mon–Fri 9–5',
    'missed.voicemail': { one: '{count} went to voicemail', other: '{count} went to voicemail' },
    'missed.not_connected': 'RingCentral is not connected yet',
    'missed.not_returned': { one: '{count} not called back', other: '{count} not called back' },
    'missed.all_returned': 'All called back',

    'unread.label': 'Unread messages',
    'unread.waiting_for': 'Waiting for you, {name}',
    'unread.sources': 'Website and chat inquiries',
    'unread.all_caught_up': 'All caught up',
    'oldest_from': 'Oldest from {when}',

    'overdue.label': 'Overdue invoices',
    'overdue.report_of': 'From the eImmigration report of {date}',
    'overdue.report_unknown_date': 'From the eImmigration report of an unknown date',
    'overdue.no_report': 'No eImmigration report imported yet',
    'overdue.latest_report': 'From the latest eImmigration report',
    'overdue.owed': '{amount} owed',
    'overdue.none': 'Nothing overdue',

    'approval.label': 'Reminders waiting for approval',
    'approval.sub': 'Payment reminders drafted by the rules',
    'approval.none': 'Nothing to approve',

    'goto': 'Go to',
    'card.calls.eyebrow': 'RingCentral',
    'card.calls.title': 'Call log',
    'card.calls.description': 'Who called, who answered, and who still needs a call back.',
    'card.inbox.eyebrow': 'Website leads',
    'card.inbox.title': 'Inbox',
    'card.inbox.description': 'Contact-form and chat inquiries, with replies and notes.',
    'card.whatsapp.eyebrow': 'Client conversations',
    'card.whatsapp.title': 'WhatsApp',
    'card.whatsapp.description': 'Shared WhatsApp inbox: replies, assignments and notes.',
    'card.billing.eyebrow': 'Invoices & payments',
    'card.billing.title': 'Billing',
    'card.billing.description': 'Payment status, balances and reminders.',
    'card.admin.eyebrow': 'Administrator',
    'card.team.title': 'Team',
    'card.team.description': 'Who has access, their roles, and revoking or restoring it.',
    'card.activity.title': 'Activity',
    'card.activity.description': 'Every change made in the portal, by whom and when.',
    'card.test.title': 'Test channel',
    'card.test.description': 'Send test forms through the website without touching the inbox.',
    'cards.empty': 'Use the links at the top to open the sections your account can use.',
    'footer.portal': 'Staff portal',

    // utils/text.js daysAgo
    'days.today': 'today',
    'days.yesterday': 'yesterday',
    'days.ago': { one: '{count} day ago', other: '{count} days ago' },

    // modules/reminders/MyFollowUps.vue
    'fu.heading': 'My follow-ups',
    'fu.view_all': 'View all:',
    'fu.needs_attention': 'Needs attention',
    'fu.messages': 'Messages',
    'fu.error': 'Could not load your follow-ups. Reload the page to try again.',
    'fu.empty': 'Nothing waiting for you right now.',
    'fu.loading': 'Loading…',
    'fu.more': 'More waiting:',
    'fu.and': ' and ',

    // modules/reminders/workQueueText.js
    'fu.when.overdue': 'Overdue since {when}',
    'fu.when.due': 'Due now',
    'fu.when.today': 'Today, {time}',
    'fu.when.received': 'Received {when}',
    'fu.call_back': 'Call back {who}',
    'fu.a_caller': 'a caller',
    'fu.follow_up': 'Follow up with {who}',
    'fu.a_website_lead': 'a website lead',
    'fu.new_chat': 'New website chat',
    'fu.new_message': 'New website message',
    'fu.from': ' from {who}',

    // modules/automation/automationText.js attentionText
    'attn.client_replied': '{who} replied by text',
    'attn.message_failed': 'An automatic message to {who} was not sent',
    'attn.booking_cancelled': '{who}’s consultation was cancelled',
    'attn.overdue': 'Nobody has contacted {who} yet',
    'attn.possible_spam': 'Check: possible vendor message from {who}',
    'attn.no_response': 'No response from {who} after the follow-ups',
    'attn.other': '{who} needs someone',
    'attn.when.waiting': 'Waiting since',
    'attn.when.since': 'Since',
    'attn.when.due': 'Due since',
    'attn.when.received': 'Received',

    // Roles (server/auth/capabilities.js ROLES), by role key.
    'role.admin': 'Administrator',
    'role.staff': 'Staff (view billing)',
    'role.front_desk': 'Front desk',
    'role.receptionist': 'Receptionist',
    'role.office_manager': 'Office Manager',
    'role.billing_paralegal': 'Billing paralegal',
  },

  es: {
    'header.title': 'Inicio',

    'greeting.morning': 'Buenos días',
    'greeting.afternoon': 'Buenas tardes',
    'greeting.evening': 'Buenas noches',
    'avatar.change': 'Cambiar su foto',
    'avatar.label': 'Su foto',

    'figures.could_not_load': 'No se pudieron cargar estas cifras. Abra la página o vuelva a cargarla para intentarlo de nuevo.',

    'missed.label': 'Llamadas perdidas en horario laboral',
    'missed.window': 'Últimos 30 días · lun–vie 9–5',
    'missed.voicemail': { one: '{count} fue al buzón de voz', other: '{count} fueron al buzón de voz' },
    'missed.not_connected': 'RingCentral aún no está conectado',
    'missed.not_returned': { one: '{count} no devuelta', other: '{count} no devueltas' },
    'missed.all_returned': 'Todas devueltas',

    'unread.label': 'Mensajes sin leer',
    'unread.waiting_for': 'Pendientes para usted, {name}',
    'unread.sources': 'Consultas del sitio web y del chat',
    'unread.all_caught_up': 'Todo al día',
    'oldest_from': 'El más antiguo: {when}',

    'overdue.label': 'Facturas vencidas',
    'overdue.report_of': 'Del informe de eImmigration del {date}',
    'overdue.report_unknown_date': 'De un informe de eImmigration de fecha desconocida',
    'overdue.no_report': 'Aún no se ha importado ningún informe de eImmigration',
    'overdue.latest_report': 'Del informe más reciente de eImmigration',
    'overdue.owed': '{amount} adeudados',
    'overdue.none': 'Nada vencido',

    'approval.label': 'Recordatorios por aprobar',
    'approval.sub': 'Recordatorios de pago redactados por las reglas',
    'approval.none': 'Nada por aprobar',

    'goto': 'Ir a',
    'card.calls.eyebrow': 'RingCentral',
    'card.calls.title': 'Registro de llamadas',
    'card.calls.description': 'Quién llamó, quién contestó y a quién todavía hay que devolverle la llamada.',
    'card.inbox.eyebrow': 'Consultas del sitio web',
    'card.inbox.title': 'Bandeja de entrada',
    'card.inbox.description': 'Consultas del formulario de contacto y del chat, con respuestas y notas.',
    'card.whatsapp.eyebrow': 'Chats con clientes',
    'card.whatsapp.title': 'WhatsApp',
    'card.whatsapp.description': 'Bandeja compartida de WhatsApp: respuestas, asignaciones y notas.',
    'card.billing.eyebrow': 'Facturas y pagos',
    'card.billing.title': 'Facturación',
    'card.billing.description': 'Estado de pagos, saldos y recordatorios.',
    'card.admin.eyebrow': 'Administrador',
    'card.team.title': 'Equipo',
    'card.team.description': 'Quién tiene acceso, sus roles, y cómo quitarlo o devolverlo.',
    'card.activity.title': 'Actividad',
    'card.activity.description': 'Cada cambio hecho en el portal, quién lo hizo y cuándo.',
    'card.test.title': 'Canal de prueba',
    'card.test.description': 'Envíe formularios de prueba por el sitio web sin tocar la bandeja de entrada.',
    'cards.empty': 'Use los enlaces de arriba para abrir las secciones que su cuenta puede usar.',
    'footer.portal': 'Portal del personal',

    'days.today': 'hoy',
    'days.yesterday': 'ayer',
    'days.ago': { one: 'hace {count} día', other: 'hace {count} días' },

    'fu.heading': 'Mis seguimientos',
    'fu.view_all': 'Ver todo:',
    'fu.needs_attention': 'Requiere atención',
    'fu.messages': 'Mensajes',
    'fu.error': 'No se pudieron cargar sus seguimientos. Vuelva a cargar la página para intentarlo de nuevo.',
    'fu.empty': 'No tiene nada pendiente por ahora.',
    'fu.loading': 'Cargando…',
    'fu.more': 'Hay más pendientes:',
    'fu.and': ' y ',

    'fu.when.overdue': 'Vencido desde {when}',
    'fu.when.due': 'Vence ahora',
    'fu.when.today': 'Hoy, {time}',
    'fu.when.received': 'Recibido {when}',
    'fu.call_back': 'Devolver la llamada a {who}',
    'fu.a_caller': 'una persona que llamó',
    'fu.follow_up': 'Dar seguimiento a {who}',
    'fu.a_website_lead': 'un cliente potencial del sitio web',
    'fu.new_chat': 'Nuevo chat del sitio web',
    'fu.new_message': 'Nuevo mensaje del sitio web',
    'fu.from': ' de {who}',

    'attn.client_replied': '{who} respondió por mensaje de texto',
    'attn.message_failed': 'No se envió un mensaje automático a {who}',
    'attn.booking_cancelled': 'Se canceló la consulta de {who}',
    'attn.overdue': 'Nadie ha contactado a {who} todavía',
    'attn.possible_spam': 'Revisar: posible mensaje de un proveedor de {who}',
    'attn.no_response': 'Sin respuesta de {who} después de los seguimientos',
    'attn.other': '{who} necesita atención',
    'attn.when.waiting': 'Esperando desde',
    'attn.when.since': 'Desde',
    'attn.when.due': 'Vencido desde',
    'attn.when.received': 'Recibido',

    'role.admin': 'Administrador',
    'role.staff': 'Personal (consulta facturación)',
    'role.front_desk': 'Recepción',
    'role.receptionist': 'Recepcionista',
    'role.office_manager': 'Gerente de oficina',
    'role.billing_paralegal': 'Paralegal de facturación',
  },
}

/** 'es' for 'es', otherwise 'en' (an unknown or stored-garbage value reads as English). */
export const normalizeLang = (v) => (v === 'es' ? 'es' : 'en')

/**
 * The text for key in lang, with {name} filled from vars. A key missing in
 * lang falls back to English; a key missing everywhere returns the key.
 */
export function translate(lang, key, vars = {}) {
  const table = DASHBOARD[normalizeLang(lang)]
  let entry = Object.hasOwn(table, key) ? table[key] : DASHBOARD.en[key]
  if (entry == null) return key
  if (typeof entry === 'object') entry = Number(vars.count) === 1 ? entry.one : entry.other
  return entry.replace(/\{(\w+)\}/g, (m, name) => (vars[name] == null ? m : String(vars[name])))
}

/**
 * A role's name. English is the server's own label (it names the roles);
 * Spanish maps the known roles, and a role added later keeps the server's label.
 */
export function roleLabel(lang, role, serverLabel = '') {
  const key = `role.${role}`
  if (normalizeLang(lang) === 'en' || !role || !Object.hasOwn(DASHBOARD.es, key)) return serverLabel
  return DASHBOARD.es[key]
}
