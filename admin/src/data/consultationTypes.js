// Consultation types as the admin portal shows them. The keys must match
// CONSULTATION_TYPES in server/routes/submissions.js, the DB CHECK constraint
// and site/src/data/consultationTypes.js (pinned by server/consultationTypes.test.js).
// Labels are copied from the public site's i18n messages so a lead reads the
// same in the portal as it did on the form the client filled in.
import { adminLocale } from '../utils/locale.js'

export const CONSULTATION_KEYS = ["greenCard","ciudadania","asilo","vawa","visaU","visaT","daca","tps","tramiteConsular","visasPrometido","visasJovenes","peticionesFamiliares","ead","defensaDeportacion","other"]

const LABELS = {
  "en": {
    "greenCard": "Green Card",
    "ciudadania": "Citizenship",
    "asilo": "Asylum",
    "vawa": "VAWA",
    "visaU": "U Visa",
    "visaT": "T Visa",
    "daca": "DACA",
    "tps": "Temporary Protected Status",
    "tramiteConsular": "Consular Processing",
    "visasPrometido": "Fiancé Visas",
    "visasJovenes": "Special Immigrant Juvenile Visas",
    "peticionesFamiliares": "Family Petitions",
    "ead": "Employment Authorization (EAD)",
    "defensaDeportacion": "Deportation Defense",
    "other": "Not sure / Other"
  },
  "es": {
    "greenCard": "Green Card",
    "ciudadania": "Ciudadanía",
    "asilo": "Asilo",
    "vawa": "VAWA",
    "visaU": "Visa U",
    "visaT": "Visa T",
    "daca": "DACA",
    "tps": "Estatus de Protección Temporal",
    "tramiteConsular": "Trámite Consular",
    "visasPrometido": "Visas de Prometido(a)",
    "visasJovenes": "Visas Especial para Jóvenes",
    "peticionesFamiliares": "Peticiones Familiares",
    "ead": "Permiso de Trabajo (EAD)",
    "defensaDeportacion": "Defensa Contra la Deportación",
    "other": "No estoy seguro / Otro"
  }
}

export function consultationLabel(key, locale = adminLocale()) {
  if (!key) return LABELS[locale]?.other ?? 'Other'
  return LABELS[locale]?.[key] ?? key
}
