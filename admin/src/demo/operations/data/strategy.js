// Copy for the strategy deck (Strategy tab). Structure and wording follow the
// presentation drafted for the meeting; figures are not repeated here — the
// deck reads them from dashboard.js so the two views can never disagree.

import {
  faLink, faMessage, faFileSignature, faLayerGroup, faEnvelope, faChartColumn,
} from '@fortawesome/free-solid-svg-icons'

export const CHAPTERS = [
  { id: 'vision', name: 'Vision' },
  { id: 'opportunity', name: 'Opportunity' },
  { id: 'model', name: 'The system' },
  { id: 'demo', name: 'Working demo' },
  { id: 'visibility', name: 'Visibility' },
  { id: 'roadmap', name: 'Roadmap' },
  { id: 'control', name: 'Human control' },
]

export const PILLARS = [
  { title: 'Lead capture', short: 'Every source. One record.', icon: faLink,
    purpose: 'Bring every prospective client into one trackable system.',
    items: ['Google Ads', 'Local Services Ads', 'Website forms', 'RingCentral calls', 'WhatsApp', 'Organic / other'],
    outcome: 'A lead record with its source attached from the beginning.',
    validation: 'Validate channel access, identity matching and duplicate handling.' },
  { title: 'Intake & response', short: 'A clear next step.', icon: faMessage,
    purpose: 'Respond promptly and give staff a structured path to the next conversation.',
    items: ['Instant approved acknowledgements', 'Automated scheduling', 'English / Spanish intake paths', 'Follow-up reminders', 'Receptionist task assignment', 'Lead status tracking'],
    outcome: 'Rules-based intake, with staff in control of assessment and next steps.',
    validation: 'Validate approved language, scheduling rules and communication consent.' },
  { title: 'Client onboarding', short: 'A coordinated beginning.', icon: faFileSignature,
    purpose: 'Once a client is retained, start the right onboarding steps together.',
    items: ['Create client / matter record', 'Trigger onboarding workflow', 'Approved document checklist', 'Secure document upload path', 'Internal tasks and reminders', 'Agreements / payment workflow'],
    outcome: 'A consistent handoff from retained lead to active client.',
    validation: 'Potential integration: validate case-system access and approved payment flow.' },
  { title: 'Case operations', short: 'Less duplicate entry.', icon: faLayerGroup,
    purpose: 'Keep tasks, important dates and activity connected to the matter.',
    items: ['eImmigration / Cerenade', 'Google Calendar and documents', 'Case-specific workflows', 'Important-date tracking', 'Assignments and reminders', 'Centralized activity history'],
    outcome: 'The right task, assigned to the right person, with context.',
    validation: 'Potential integrations: capabilities and deadline-review process to validate.' },
  { title: 'Communication', short: 'One connected history.', icon: faEnvelope,
    purpose: 'Keep the operational history together across the channels clients use.',
    items: ['Website inbox and email', 'RingCentral and WhatsApp', 'Two-way communication', 'Follow-up tracking', 'Contact ownership and staff notes', 'Communication history'],
    outcome: 'Staff can see what happened before the next conversation.',
    validation: 'Potential integrations: validate two-way channel access and retention rules.' },
  { title: 'Reporting & growth', short: 'See what produces clients.', icon: faChartColumn,
    purpose: 'Follow performance beyond the first click or phone call.',
    items: ['Leads → contacted → scheduled → retained', 'Response times', 'Missed-call recovery', 'Campaign / source performance', 'Consultation conversion', 'Retained-client attribution'],
    outcome: 'Feed useful, approved conversion data back into advertising.',
    validation: 'Validate attribution coverage and approved advertising data flows.' },
]

export const MANUAL_CHAIN = [
  'Lead arrives', 'Someone notices', 'Someone responds', 'Someone remembers to follow up',
  'Someone schedules', 'Someone updates another system', 'Someone reports the result',
]

export const FUNNEL_JOURNEY = ['Traffic', 'Lead', 'Contacted', 'Consultation', 'Retained', 'Client']

export const ATTRIBUTION_PATH = [
  { title: 'Website / Phone', desc: 'Track the interaction and capture its origin.' },
  { title: 'Maria Rodriguez', desc: 'One lead record, with campaign context.' },
  { title: 'Contacted → Scheduled', desc: 'Record the staff conversation and consultation.' },
  { title: 'Retained → Client', desc: 'Connect the business outcome to the source.' },
]

export const IMPACT = [
  { title: 'Reduce administrative work', desc: 'Predictable actions run automatically, cutting repetitive entry and manual reminders.' },
  { title: 'Respond faster', desc: 'Fewer leads sit unattended while reception and attorneys are busy with the people in front of them.' },
  { title: 'Connect the firm', desc: 'Website, calls, calendar, case system, communications and advertising share useful information.' },
  { title: 'Measure what produces clients', desc: 'Marketing optimization continues past the first enquiry, through consultation and retention.' },
]

export const PHASES = [
  { n: '01', time: '0–3 months', title: 'Operations automation', label: 'Quick wins / low legal risk',
    items: ['Unified lead inbox', 'Missed-call recovery', 'Automated approved follow-ups', 'Consultation scheduling', 'Response-time measurement', 'Lead lifecycle tracking', 'Advertising attribution'],
    gate: 'Confirm approved messages, lead ownership, channel access and success measures.',
    extra: 'Use the current Client Messages inbox as the starting point. Measure response times and recovery outcomes before deciding what to expand.' },
  { n: '02', time: '3–6 months', title: 'Deeper integration', label: 'Remove duplicate entry',
    items: ['eImmigration integration', 'Client / matter creation', 'Document workflow', 'Google Calendar integration', 'Case-specific workflow triggers', 'Communication history', 'Internal operational reporting'],
    gate: 'Validate eImmigration / Cerenade integration options, permissions and data flows.',
    extra: 'Potential integrations depend on system access and supported capabilities. Agree the record of truth for clients, matters, documents and important dates before connecting them.' },
  { n: '03', time: 'Future · optional', title: 'Controlled AI', label: 'Only where AI creates clear value',
    items: ['Call transcription and summaries', 'Document classification / extraction', 'Case chronology generation', 'Document comparison', 'Missing-item detection', 'First-draft assistance', 'Natural-language search across approved matter data'],
    gate: 'Approve a narrow use case, vendor, data scope and human-review process.',
    extra: 'Introduce one controlled capability at a time, evaluate its quality and usefulness, and expand only if it reduces work without compromising attorney oversight.' },
]

export const PROTECT_RULES = [
  'No consumer chatbot exposed directly to confidential case files',
  'Access controls and audit logs',
  'Approved data flows and approved vendors / models only',
  'Minimum necessary data sent to AI',
]

export const JUDGMENT_RULES = [
  'Attorney control and human review',
  'No autonomous legal decisions',
  'No autonomous filing',
  'No replacement for attorney judgment',
]

export const SYSTEMS = ['Google Ads', 'Website', 'RingCentral', 'WhatsApp', 'Google Calendar', 'eImmigration', 'Email']
