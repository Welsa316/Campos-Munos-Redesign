// The words of every automatic message to someone outside the firm.
//
// These are the only place client-facing text lives: handlers name a
// template and never write copy of their own. An administrator can edit them
// in the portal (automation settings, 'templates'); the defaults below are
// DRAFTS for the firm to approve before anything is switched on.
//
// Rules for every template, checked on save:
//   - short, and only an acknowledgment or a prompt to get in touch
//   - no legal advice, no promise about a case, nothing that says the firm
//     has accepted the person as a client or that an attorney reviewed it
//   - no case details: the only variables are the person's first name, the
//     office phone, the firm's name and the booking link
//   - a text message says how to stop them (STOP)
//
// Languages: 'es' and 'en' from the website language the form was sent in
// (never guessed from a name), and 'bi', a short bilingual version, when the
// language is not known.
//
// A line that uses {{bookingLink}} is left out when there is no booking link
// (scheduling is off or no link is set), so a template can offer booking
// without a second version.

export const VARIABLES = Object.freeze(['firstName', 'firmName', 'officePhone', 'bookingLink'])
export const LANGUAGES = Object.freeze(['es', 'en', 'bi'])
export const SMS_MAX = 480
export const EMAIL_BODY_MAX = 2000
export const SUBJECT_MAX = 120

const NOT_ADVICE_ES = 'Este mensaje confirma que recibimos su solicitud. No es asesoría legal y no crea una relación de abogado y cliente.'
const NOT_ADVICE_EN = 'This message confirms that we received your request. It is not legal advice and does not create an attorney-client relationship.'

export const DEFAULT_TEMPLATES = Object.freeze({
  lead_ack_email: {
    channel: 'email',
    label: 'New lead: acknowledgment email',
    languages: {
      es: {
        subject: 'Recibimos su mensaje — {{firmName}}',
        body: 'Hola {{firstName}}:\n\nGracias por comunicarse con {{firmName}}. Recibimos su mensaje y nuestro equipo lo revisará y se pondrá en contacto con usted.\n\nSi prefiere elegir usted mismo un horario para su consulta: {{bookingLink}}\n\nSi necesita hablar con nosotros antes, llame a nuestra oficina al {{officePhone}}, de lunes a viernes de 9:00 a 17:00.\n\n' + NOT_ADVICE_ES,
      },
      en: {
        subject: 'We received your message — {{firmName}}',
        body: 'Hello {{firstName}},\n\nThank you for contacting {{firmName}}. We received your message, and our team will review it and get in touch with you.\n\nIf you would rather pick a time for your consultation yourself: {{bookingLink}}\n\nIf you need to speak with us sooner, call our office at {{officePhone}}, Monday to Friday, 9:00 AM to 5:00 PM.\n\n' + NOT_ADVICE_EN,
      },
      bi: {
        subject: 'Recibimos su mensaje / We received your message — {{firmName}}',
        body: 'Gracias por comunicarse con {{firmName}}. Recibimos su mensaje y nuestro equipo se pondrá en contacto con usted. Oficina: {{officePhone}}.\nPara elegir un horario: {{bookingLink}}\n\nThank you for contacting {{firmName}}. We received your message and our team will get in touch with you. Office: {{officePhone}}.\nTo pick a time: {{bookingLink}}\n\n' + NOT_ADVICE_ES + '\n' + NOT_ADVICE_EN,
      },
    },
  },
  lead_ack_sms: {
    channel: 'sms',
    label: 'New lead: acknowledgment text',
    languages: {
      es: { body: '{{firmName}}: recibimos su mensaje. Nuestro equipo lo revisará y se comunicará con usted. Oficina: {{officePhone}}.\nPara agendar: {{bookingLink}}\nResponda STOP para no recibir más mensajes.' },
      en: { body: '{{firmName}}: we received your message. Our team will review it and contact you. Office: {{officePhone}}.\nTo book a time: {{bookingLink}}\nReply STOP to opt out.' },
      bi: { body: '{{firmName}}: recibimos su mensaje y nos comunicaremos con usted. / We received your message and will contact you. {{officePhone}}. STOP = no más mensajes / opt out.' },
    },
  },
  lead_followup_1: {
    channel: 'sms',
    label: 'Follow-up 1 (text)',
    languages: {
      es: { body: '{{firmName}}: seguimos atentos a su mensaje. Si aún desea hablar con nuestro equipo, llámenos al {{officePhone}} o responda a este mensaje.\nPara agendar: {{bookingLink}}\nSTOP para no recibir más mensajes.' },
      en: { body: '{{firmName}}: we still have your message. If you would like to speak with our team, call us at {{officePhone}} or reply to this text.\nTo book a time: {{bookingLink}}\nReply STOP to opt out.' },
      bi: { body: '{{firmName}}: seguimos atentos a su mensaje, llámenos al {{officePhone}}. / We still have your message, call us at {{officePhone}}. STOP = no más mensajes / opt out.' },
    },
  },
  lead_followup_2: {
    channel: 'sms',
    label: 'Follow-up 2 (text)',
    languages: {
      es: { body: '{{firmName}}: este es nuestro último recordatorio sobre su mensaje. Cuando guste, llámenos al {{officePhone}}.\nPara agendar: {{bookingLink}}\nSTOP para no recibir más mensajes.' },
      en: { body: '{{firmName}}: this is our last reminder about your message. Call us any time at {{officePhone}}.\nTo book a time: {{bookingLink}}\nReply STOP to opt out.' },
      bi: { body: '{{firmName}}: último recordatorio sobre su mensaje, {{officePhone}}. / Last reminder about your message, {{officePhone}}. STOP = no más mensajes / opt out.' },
    },
  },
  missed_call_sms: {
    channel: 'sms',
    label: 'Missed call: text-back',
    languages: {
      es: { body: '{{firmName}}: lamentamos no haber contestado su llamada. Nuestro equipo le devolverá la llamada. Oficina: {{officePhone}}.\nPara agendar: {{bookingLink}}\nResponda STOP para no recibir más mensajes.' },
      en: { body: '{{firmName}}: we are sorry we missed your call. Our team will call you back. Office: {{officePhone}}.\nTo book a time: {{bookingLink}}\nReply STOP to opt out.' },
      bi: { body: '{{firmName}}: lamentamos no haber contestado su llamada; le devolveremos la llamada. / Sorry we missed your call; we will call you back. {{officePhone}}. STOP = no más mensajes / opt out.' },
    },
  },
})

export const TEMPLATE_KEYS = Object.freeze(Object.keys(DEFAULT_TEMPLATES))

const PLACEHOLDER = /\{\{\s*([a-zA-Z]+)\s*\}\}/g
const placeholders = (text) => [...String(text).matchAll(PLACEHOLDER)].map((m) => m[1])

/** Why a set of templates cannot be saved, or null. */
export function templatesProblem(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 'Templates are missing'
  for (const [key, t] of Object.entries(value)) {
    const base = DEFAULT_TEMPLATES[key]
    if (!base) return `Unknown template: ${key}`
    if (!t?.languages || typeof t.languages !== 'object') return `${base.label}: each language needs its text`
    for (const lang of LANGUAGES) {
      const v = t.languages[lang]
      const where = `${base.label} (${lang})`
      if (!v || typeof v.body !== 'string' || !v.body.trim()) return `${where}: the text is empty`
      const max = base.channel === 'sms' ? SMS_MAX : EMAIL_BODY_MAX
      if (v.body.length > max) return `${where}: at most ${max} characters`
      if (base.channel === 'email') {
        if (typeof v.subject !== 'string' || !v.subject.trim() || v.subject.length > SUBJECT_MAX || /[\r\n]/.test(v.subject)) return `${where}: the subject is one line, up to ${SUBJECT_MAX} characters`
      }
      const used = [...placeholders(v.body), ...placeholders(v.subject || '')]
      const unknown = used.find((p) => !VARIABLES.includes(p))
      if (unknown) return `${where}: {{${unknown}}} is not something a message can include`
      if (/\{\{|\}\}/.test(String(v.body).replace(PLACEHOLDER, ''))) return `${where}: a {{placeholder}} is not closed`
      if (base.channel === 'sms' && !/\bSTOP\b/.test(v.body)) return `${where}: a text message must say how to stop them (STOP)`
    }
  }
  return null
}

/** The saved templates over the defaults, keeping only what a template has. */
export function mergeTemplates(value) {
  const out = {}
  for (const key of TEMPLATE_KEYS) {
    const base = DEFAULT_TEMPLATES[key]
    const saved = value?.[key]?.languages
    const languages = {}
    for (const lang of LANGUAGES) {
      const v = saved?.[lang] || base.languages[lang]
      languages[lang] = base.channel === 'email' ? { subject: String(v.subject).trim(), body: String(v.body) } : { body: String(v.body) }
    }
    out[key] = { channel: base.channel, label: base.label, languages }
  }
  return out
}

/** 'es' | 'en' from the lead, else the bilingual version. Never from a name. */
export const languageFor = (lead) => (lead?.language === 'es' || lead?.language === 'en' ? lead.language : 'bi')

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

function fill(text, vars) {
  return String(text)
    .split('\n')
    // A line that offers the booking link goes when there is no link.
    .filter((line) => vars.bookingLink || !placeholders(line).includes('bookingLink'))
    .join('\n')
    .replace(PLACEHOLDER, (_m, name) => String(vars[name] ?? ''))
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// A first name as it may appear in a message: one word-ish, no markup, not a
// URL. Anything else and the greeting goes without a name.
export function safeFirstName(raw) {
  const name = String(raw ?? '').trim().split(/\s+/)[0] || ''
  return /^[\p{L}][\p{L}'’.-]{0,39}$/u.test(name) ? name : ''
}

/**
 * The message to send. vars: { firstName, firmName, officePhone, bookingLink }.
 * Returns { channel, language, text, subject?, html? }.
 */
export function renderTemplate(templates, key, language, vars = {}) {
  const t = templates?.[key] || DEFAULT_TEMPLATES[key]
  if (!t) throw new Error(`Unknown template: ${key}`)
  const lang = LANGUAGES.includes(language) ? language : 'bi'
  const v = t.languages[lang]
  const clean = { ...vars, firstName: safeFirstName(vars.firstName) }
  let text = fill(v.body, clean)
  // "Hola :" / "Hello ," when there is no usable name.
  if (!clean.firstName) text = text.replace(/^(Hola|Hello) ?([:,])/m, '$1$2')
  if (t.channel === 'sms') return { channel: 'sms', language: lang, text }
  const subject = fill(v.subject, clean).replace(/\s+/g, ' ')
  const paragraphs = text.split(/\n{2,}/).map((p) => `<p style="font-size: 15px; line-height: 1.7; margin: 0 0 16px;">${escapeHtml(p).replace(/\n/g, '<br/>').replace(/(https:\/\/[^\s<]+)/g, '<a href="$1" style="color: #003F8D;">$1</a>')}</p>`).join('')
  const html = `
    <div style="font-family: 'Inter', Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1a1a1a;">
      <div style="border-bottom: 3px solid #003F8D; padding-bottom: 16px; margin-bottom: 24px;">
        <h2 style="margin: 0; color: #003F8D; font-size: 20px;">${escapeHtml(clean.firmName || 'Campos Muños Law')}</h2>
      </div>
      ${paragraphs}
    </div>`
  return { channel: 'email', language: lang, subject, text, html }
}

export default { DEFAULT_TEMPLATES, TEMPLATE_KEYS, VARIABLES, LANGUAGES, templatesProblem, mergeTemplates, renderTemplate, languageFor, safeFirstName }
