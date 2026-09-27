// Fabricated leads for the operations demo. Every name, phone number, email
// and message here is invented; phone numbers use the 555-01xx block that is
// reserved for fiction, and emails use the reserved example.com domain.
//
// Times are built relative to the day the demo is opened, at a fixed "demo
// clock" of 10:37 AM, so the story reads the same whichever day it's shown.

export const DEMO_CLOCK = { hour: 10, minute: 37 }

/** Midnight today, local time. */
export function demoDay(date = new Date()) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

export function demoNow(day = demoDay()) {
  const d = new Date(day)
  d.setHours(DEMO_CLOCK.hour, DEMO_CLOCK.minute, 0, 0)
  return d
}

/** @returns {import('./model.js').DemoLead[]} */
export function buildLeads(day = demoDay()) {
  const at = (dayOffset, h, m) => {
    const d = new Date(day)
    d.setDate(d.getDate() + dayOffset)
    d.setHours(h, m, 0, 0)
    return d.toISOString()
  }
  let seq = 0
  const ev = (atIso, kind, title, extra = {}) => ({ id: `seed-${++seq}`, at: atIso, kind, title, ...extra })

  const ACK_ES = 'Gracias por comunicarse con Campos Muños Law. Recibimos su mensaje y un miembro de nuestro equipo le responderá pronto.'
  const ACK_EN = 'Thank you for contacting Campos Muños Law. We received your message and a member of our team will reply shortly.'

  return [
    // --- Scenario 1: the missed call ------------------------------------------
    {
      id: 'maria-rodriguez',
      name: 'Maria Rodriguez',
      phone: '(504) 555-0142',
      email: 'maria.rodriguez@example.com',
      method: 'missed_call',
      practice: 'Family / Green Card',
      country: 'Honduras',
      language: 'Spanish',
      status: 'missed_call',
      receivedAt: at(0, 10, 34),
      unread: true,
      attribution: {
        channel: 'google_ads',
        campaign: 'Family Immigration - Search',
        adGroup: 'Green Card / Adjustment',
        keyword: 'abogado green card new orleans',
        landingPage: '/servicios/green-card',
      },
      events: [
        ev(at(0, 10, 31), 'client', 'Google Ads visit', { detail: 'Clicked a “Family Immigration - Search” ad and landed on /servicios/green-card' }),
        ev(at(0, 10, 34), 'client', 'Incoming phone call', { detail: 'Tapped “Call now” on the landing page · (504) 555-0142' }),
        ev(at(0, 10, 34), 'client', 'Call missed', { detail: 'Rang during business hours — no answer, no voicemail left', tone: 'alert' }),
      ],
    },

    // --- Scenario 2: the website lead that became a client -------------------
    {
      id: 'lucia-morales',
      name: 'Lucía Morales',
      phone: '(504) 555-0168',
      email: 'lucia.morales@example.com',
      method: 'website_form',
      practice: 'Asylum',
      country: 'Venezuela',
      language: 'Spanish',
      status: 'retained',
      receivedAt: at(-5, 19, 48),
      unread: false,
      message: 'Llegué con mi esposo y mi hija en marzo. Tenemos una cita en corte en enero y todavía no tenemos abogado.',
      attribution: {
        channel: 'google_ads',
        campaign: 'Asylum & Defense - Search',
        adGroup: 'Asylum',
        keyword: 'abogado de asilo',
        landingPage: '/servicios/asilo',
      },
      consultationAt: at(-2, 10, 0),
      consultationMode: 'In person',
      events: [
        ev(at(-5, 19, 41), 'client', 'Google Ads visit', { detail: 'Clicked an “Asylum & Defense - Search” ad · keyword “abogado de asilo”' }),
        ev(at(-5, 19, 44), 'client', 'Read the asylum page, opened the consultation form', { detail: '/servicios/asilo → /consulta' }),
        ev(at(-5, 19, 48), 'client', 'Consultation form submitted', { quote: 'Llegué con mi esposo y mi hija en marzo. Tenemos una cita en corte en enero y todavía no tenemos abogado.' }),
        ev(at(-5, 19, 48), 'auto', 'Confirmation email sent — after hours', { channel: 'Email', quote: ACK_ES, quoteNote: ACK_EN }),
        ev(at(-5, 19, 48), 'auto', 'Queued for reception at next opening', { detail: 'Arrived after hours · first in line at 9:00 AM' }),
        ev(at(-4, 9, 6), 'staff', 'Reception replied by email', { quote: 'Buenos días, Lucía. Con gusto le ayudamos. ¿Le funciona una consulta en persona esta semana a las 10:00?' }),
        ev(at(-4, 9, 6), 'staff', 'Status changed to Contacted'),
        ev(at(-4, 9, 40), 'client', 'Client replied', { quote: 'Sí, a las 10 está perfecto. Muchas gracias.' }),
        ev(at(-4, 9, 43), 'staff', 'Consultation scheduled', { detail: 'In person · with an attorney' }),
        ev(at(-4, 9, 43), 'auto', 'Confirmation and reminder queued', { channel: 'SMS', detail: 'Reminder sent the day before at 9:00 AM' }),
        ev(at(-2, 10, 0), 'staff', 'Consultation held', { detail: 'In person · 45 minutes' }),
        ev(at(-2, 11, 15), 'staff', 'Engagement signed — status Retained'),
        ev(at(-2, 11, 15), 'auto', 'Attribution closed', { detail: 'Google Ads → Asylum & Defense - Search → Asylum → Retained client', tone: 'win' }),
      ],
    },

    // --- Today ---------------------------------------------------------------
    {
      id: 'carlos-perez',
      name: 'Carlos Perez',
      phone: '(504) 555-0117',
      email: 'carlos.perez@example.com',
      method: 'website_form',
      practice: 'Deportation / Removal',
      country: 'Mexico',
      language: 'Spanish',
      status: 'contacted',
      receivedAt: at(0, 10, 25),
      unread: false,
      message: 'Mi hermano fue detenido ayer en Kenner. Necesitamos saber qué hacer y si ustedes pueden representarlo.',
      attribution: { channel: 'lsa', landingPage: '/consulta' },
      events: [
        ev(at(0, 10, 22), 'client', 'Found the firm on Local Services Ads', { detail: 'Opened the listing, then the website' }),
        ev(at(0, 10, 25), 'client', 'Consultation form submitted', { quote: 'Mi hermano fue detenido ayer en Kenner. Necesitamos saber qué hacer y si ustedes pueden representarlo.' }),
        ev(at(0, 10, 25), 'auto', 'Confirmation email sent', { channel: 'Email', quote: ACK_ES, quoteNote: ACK_EN }),
        ev(at(0, 10, 25), 'auto', 'Reception notified — marked urgent', { detail: 'Detention keywords flag the lead as time-sensitive' }),
        ev(at(0, 10, 31), 'staff', 'Reception called back', { detail: 'Spoke with Carlos · gathering the A-number' }),
        ev(at(0, 10, 31), 'staff', 'Status changed to Contacted'),
      ],
    },
    {
      id: 'unknown-0178',
      name: null,
      phone: '(985) 555-0178',
      method: 'missed_call',
      practice: 'Not yet known',
      language: 'Unknown',
      status: 'missed_call',
      receivedAt: at(0, 10, 2),
      unread: true,
      attribution: { channel: 'lsa' },
      events: [
        ev(at(0, 10, 2), 'client', 'Incoming call from Local Services Ads', { detail: 'Called from the Google listing' }),
        ev(at(0, 10, 2), 'client', 'Call missed', { detail: 'All lines busy', tone: 'alert' }),
      ],
    },
    {
      id: 'ana-gomez',
      name: 'Ana Gomez',
      phone: '(504) 555-0125',
      email: 'ana.gomez@example.com',
      method: 'whatsapp',
      practice: 'Citizenship',
      country: 'El Salvador',
      language: 'Spanish',
      status: 'scheduled',
      receivedAt: at(0, 9, 37),
      unread: false,
      attribution: { channel: 'organic', keyword: 'requisitos ciudadania americana', landingPage: '/servicios/ciudadania' },
      consultationAt: at(0, 15, 0),
      consultationMode: 'Phone',
      events: [
        ev(at(0, 9, 30), 'client', 'Organic search visit', { detail: 'Searched “requisitos ciudadania americana” → /servicios/ciudadania' }),
        ev(at(0, 9, 37), 'client', 'WhatsApp message', { quote: 'Hola, tengo la residencia desde 2019. ¿Ya puedo aplicar para la ciudadanía?' }),
        ev(at(0, 9, 37), 'auto', 'WhatsApp auto-reply sent', { channel: 'WhatsApp', quote: ACK_ES, quoteNote: ACK_EN }),
        ev(at(0, 9, 44), 'staff', 'Reception replied on WhatsApp'),
        ev(at(0, 9, 44), 'staff', 'Status changed to Contacted'),
        ev(at(0, 9, 52), 'staff', 'Consultation scheduled', { detail: 'Phone · today at 3:00 PM' }),
        ev(at(0, 9, 52), 'auto', 'Confirmation sent', { channel: 'WhatsApp' }),
        ev(at(0, 15, 0), 'upcoming', 'Consultation', { detail: 'Phone consultation' }),
      ],
    },
    {
      id: 'unknown-0143',
      name: null,
      phone: '(504) 555-0143',
      method: 'missed_call',
      practice: 'Not yet known',
      language: 'Unknown',
      status: 'missed_call',
      receivedAt: at(0, 9, 12),
      unread: true,
      attribution: { channel: 'google_ads', campaign: 'Deportation Defense - Search', adGroup: 'Removal Defense', landingPage: '/servicios/defensa-contra-la-deportacion' },
      events: [
        ev(at(0, 9, 10), 'client', 'Google Ads visit', { detail: 'Landed on /servicios/defensa-contra-la-deportacion' }),
        ev(at(0, 9, 12), 'client', 'Incoming phone call'),
        ev(at(0, 9, 12), 'client', 'Call missed', { detail: 'Rang during business hours — no answer', tone: 'alert' }),
      ],
    },
    {
      id: 'jose-castillo',
      name: 'José Castillo',
      phone: '(504) 555-0156',
      method: 'missed_call',
      practice: 'Work Permit (EAD)',
      country: 'Mexico',
      language: 'Spanish',
      status: 'missed_call',
      receivedAt: at(0, 8, 58),
      unread: false,
      attribution: { channel: 'organic', landingPage: '/servicios/ead' },
      events: [
        ev(at(0, 8, 55), 'client', 'Organic search visit', { detail: 'Landed on /servicios/ead' }),
        ev(at(0, 8, 58), 'client', 'Incoming phone call', { detail: 'Caller ID: José Castillo' }),
        ev(at(0, 8, 58), 'client', 'Call missed', { detail: 'Before the front desk opened the lines', tone: 'alert' }),
      ],
    },
    {
      id: 'fernando-ruiz',
      name: 'Fernando Ruiz',
      phone: '(504) 555-0131',
      email: 'fernando.ruiz@example.com',
      method: 'website_form',
      practice: 'DACA',
      country: 'Mexico',
      language: 'English',
      status: 'new',
      receivedAt: at(0, 8, 41),
      unread: true,
      message: 'My DACA expires in four months. I want to make sure the renewal is filed on time.',
      attribution: { channel: 'google_ads', campaign: 'DACA & Youth - Search', adGroup: 'DACA Renewal', keyword: 'daca renewal lawyer', landingPage: '/servicios/daca' },
      events: [
        ev(at(0, 8, 38), 'client', 'Google Ads visit', { detail: 'Clicked a “DACA & Youth - Search” ad → /servicios/daca' }),
        ev(at(0, 8, 41), 'client', 'Consultation form submitted', { quote: 'My DACA expires in four months. I want to make sure the renewal is filed on time.' }),
        ev(at(0, 8, 41), 'auto', 'Confirmation email sent', { channel: 'Email', quote: ACK_EN }),
        ev(at(0, 8, 41), 'auto', 'Reception notified'),
        ev(at(0, 9, 41), 'auto', 'Escalated — not contacted within 1 hour', { detail: 'Moved to the top of Needs Attention', tone: 'alert' }),
      ],
    },
    {
      id: 'carlos-diaz',
      name: 'Carlos Diaz',
      phone: '(504) 555-0184',
      method: 'missed_call',
      practice: 'U Visa',
      country: 'Guatemala',
      language: 'Spanish',
      status: 'contacted',
      receivedAt: at(0, 8, 2),
      unread: false,
      attribution: { channel: 'google_ads', campaign: 'Humanitarian - Search', adGroup: 'U Visa', landingPage: '/servicios/visa-u' },
      events: [
        ev(at(0, 8, 0), 'client', 'Google Ads visit', { detail: 'Landed on /servicios/visa-u' }),
        ev(at(0, 8, 2), 'client', 'Incoming phone call'),
        ev(at(0, 8, 2), 'client', 'Call missed', { tone: 'alert' }),
        ev(at(0, 8, 3), 'auto', 'Automatic acknowledgement sent', { channel: 'SMS', quote: 'Lamentamos no haber contestado su llamada. Un miembro de nuestro equipo se comunicará con usted en breve.', quoteNote: 'Sorry we missed your call. A member of our team will contact you shortly.' }),
        ev(at(0, 8, 3), 'auto', 'Reception team notified'),
        ev(at(0, 8, 6), 'staff', 'Outbound callback placed', { marker: 'callback' }),
        ev(at(0, 8, 6), 'client', 'Client answered'),
        ev(at(0, 8, 8), 'staff', 'Status changed to Contacted'),
      ],
    },

    // --- Earlier this week -----------------------------------------------------
    {
      id: 'gabriela-soto',
      name: 'Gabriela Soto',
      phone: '(504) 555-0193',
      method: 'whatsapp',
      practice: 'Asylum',
      country: 'Nicaragua',
      language: 'Spanish',
      status: 'scheduled',
      receivedAt: at(-1, 17, 10),
      unread: false,
      attribution: { channel: 'whatsapp' },
      consultationAt: at(0, 11, 30),
      consultationMode: 'In person',
      events: [
        ev(at(-1, 17, 10), 'client', 'WhatsApp message', { quote: 'Buenas tardes, quisiera una consulta sobre asilo para mí y mi hijo.' }),
        ev(at(-1, 17, 10), 'auto', 'WhatsApp auto-reply sent', { channel: 'WhatsApp', quote: ACK_ES, quoteNote: ACK_EN }),
        ev(at(-1, 17, 24), 'staff', 'Reception replied on WhatsApp'),
        ev(at(-1, 17, 31), 'staff', 'Consultation scheduled', { detail: 'In person · today at 11:30 AM' }),
        ev(at(-1, 17, 31), 'auto', 'Confirmation sent', { channel: 'WhatsApp' }),
        ev(at(0, 9, 0), 'auto', 'Same-day reminder sent', { channel: 'WhatsApp' }),
        ev(at(0, 11, 30), 'upcoming', 'Consultation', { detail: 'In person' }),
      ],
    },
    {
      id: 'miguel-hernandez',
      name: 'Miguel Hernandez',
      phone: '(504) 555-0109',
      email: 'miguel.hernandez@example.com',
      method: 'phone_call',
      practice: 'Family Immigration',
      country: 'Guatemala',
      language: 'Spanish',
      status: 'retained',
      receivedAt: at(-1, 14, 12),
      unread: false,
      attribution: { channel: 'google_ads', campaign: 'Family Immigration - Search', adGroup: 'Family Petitions', keyword: 'peticion familiar abogado', landingPage: '/servicios/peticiones-familiares' },
      consultationAt: at(-1, 16, 30),
      consultationMode: 'In person',
      events: [
        ev(at(-1, 14, 9), 'client', 'Google Ads visit', { detail: 'Landed on /servicios/peticiones-familiares' }),
        ev(at(-1, 14, 12), 'client', 'Incoming phone call'),
        ev(at(-1, 14, 12), 'staff', 'Call answered by reception'),
        ev(at(-1, 14, 19), 'staff', 'Consultation scheduled', { detail: 'In person · same day at 4:30 PM' }),
        ev(at(-1, 14, 19), 'auto', 'Confirmation sent', { channel: 'SMS' }),
        ev(at(-1, 16, 30), 'staff', 'Consultation held'),
        ev(at(-1, 17, 5), 'staff', 'Engagement signed — status Retained'),
        ev(at(-1, 17, 5), 'auto', 'Attribution closed', { detail: 'Google Ads → Family Immigration - Search → Retained client', tone: 'win' }),
      ],
    },
    {
      id: 'rosa-villanueva',
      name: 'Rosa Villanueva',
      phone: '(504) 555-0172',
      email: 'rosa.villanueva@example.com',
      method: 'website_form',
      practice: 'TPS',
      country: 'Honduras',
      language: 'Spanish',
      status: 'no_response',
      receivedAt: at(-2, 16, 20),
      unread: false,
      message: '¿Qué pasa con mi TPS si cancelan el programa? Tengo permiso de trabajo hasta julio.',
      attribution: { channel: 'organic', landingPage: '/servicios/estatus-de-proteccion-temporal' },
      events: [
        ev(at(-2, 16, 20), 'client', 'Consultation form submitted', { quote: '¿Qué pasa con mi TPS si cancelan el programa? Tengo permiso de trabajo hasta julio.' }),
        ev(at(-2, 16, 20), 'auto', 'Confirmation email sent', { channel: 'Email' }),
        ev(at(-2, 16, 45), 'staff', 'Reception replied by email'),
        ev(at(-1, 10, 10), 'staff', 'Called — no answer, voicemail left'),
        ev(at(-1, 10, 10), 'staff', 'Status changed to No Response'),
        ev(at(0, 9, 0), 'auto', 'Second follow-up due today', { detail: 'Reminder assigned to reception' }),
      ],
    },
    {
      id: 'patricia-navarro',
      name: 'Patricia Navarro',
      phone: '(504) 555-0138',
      method: 'phone_call',
      practice: 'U Visa',
      country: 'Guatemala',
      language: 'Spanish',
      status: 'no_response',
      receivedAt: at(-2, 13, 30),
      unread: false,
      attribution: { channel: 'google_ads', campaign: 'Humanitarian - Search', adGroup: 'U Visa', landingPage: '/servicios/visa-u' },
      events: [
        ev(at(-2, 13, 30), 'client', 'Incoming phone call'),
        ev(at(-2, 13, 30), 'staff', 'Call answered — asked for a callback after 5 PM'),
        ev(at(-2, 17, 15), 'staff', 'Called back — no answer'),
        ev(at(-2, 17, 15), 'staff', 'Status changed to No Response'),
        ev(at(0, 9, 0), 'auto', 'Second follow-up due today', { detail: 'Reminder assigned to reception' }),
      ],
    },
    {
      id: 'daniel-ortiz',
      name: 'Daniel Ortiz',
      phone: '(504) 555-0161',
      method: 'whatsapp',
      practice: 'Work Permit (EAD)',
      country: 'Venezuela',
      language: 'Spanish',
      status: 'no_response',
      receivedAt: at(-3, 11, 5),
      unread: false,
      attribution: { channel: 'direct' },
      events: [
        ev(at(-3, 11, 5), 'client', 'WhatsApp message', { quote: 'Hola, ¿cuánto tarda el permiso de trabajo con asilo pendiente?' }),
        ev(at(-3, 11, 5), 'auto', 'WhatsApp auto-reply sent', { channel: 'WhatsApp' }),
        ev(at(-3, 11, 20), 'staff', 'Reception replied on WhatsApp'),
        ev(at(-2, 11, 20), 'staff', 'Status changed to No Response', { detail: 'Message read, no reply in 24 hours' }),
        ev(at(0, 9, 0), 'auto', 'Second follow-up due today', { detail: 'Reminder assigned to reception' }),
      ],
    },
    {
      id: 'roberto-mendez',
      name: 'Roberto Méndez',
      phone: '(504) 555-0199',
      email: 'roberto.mendez@example.com',
      method: 'website_form',
      practice: 'Other',
      country: 'Colombia',
      language: 'English',
      status: 'closed',
      receivedAt: at(-6, 15, 2),
      unread: false,
      message: 'I own a restaurant and want to sponsor a cook for a work visa.',
      attribution: { channel: 'organic', landingPage: '/consulta' },
      events: [
        ev(at(-6, 15, 2), 'client', 'Consultation form submitted', { quote: 'I own a restaurant and want to sponsor a cook for a work visa.' }),
        ev(at(-6, 15, 2), 'auto', 'Confirmation email sent', { channel: 'Email' }),
        ev(at(-6, 15, 40), 'staff', 'Reception replied — outside the firm’s practice areas', { detail: 'Referred to an employment-immigration firm' }),
        ev(at(-6, 15, 40), 'staff', 'Status changed to Closed'),
      ],
    },
  ]
}
