// Dashboard figures for the operations demo.
//
// `real: true` marks the ONE figure that comes from the firm's actual phone
// records (missed business-hour calls last month). Everything else is
// illustrative and is rendered with a DEMO tag. The illustrative numbers are
// kept internally consistent (the funnel sums to the headline cards) so they
// hold up if someone adds them up in the meeting.

export const MONTH_LABEL = 'Last 30 days'

export const HEADLINE_METRICS = [
  { key: 'leads',       label: 'Leads this month',            value: '184',    real: false },
  { key: 'missed',      label: 'Missed business-hour calls',  value: '98',     real: true,
    note: 'From the firm’s phone records' },
  { key: 'recovered',   label: 'Recovered missed calls',      value: '71',     real: false },
  { key: 'response',    label: 'Average first response',      value: '12',     unit: 'min', real: false },
  { key: 'scheduled',   label: 'Consultations scheduled',     value: '38',     real: false },
  { key: 'retained',    label: 'Clients retained',            value: '14',     real: false },
]

// leads → contacted → scheduled → retained, per acquisition channel.
// Totals: 184 leads · 112 contacted · 38 scheduled · 14 retained.
export const SOURCE_FUNNEL = [
  { channel: 'google_ads', label: 'Google Ads',         leads: 62, contacted: 34, scheduled: 13, retained: 5 },
  { channel: 'lsa',        label: 'Local Services Ads', leads: 41, contacted: 26, scheduled: 9,  retained: 3 },
  { channel: 'organic',    label: 'Organic',            leads: 35, contacted: 22, scheduled: 7,  retained: 3 },
  { channel: 'whatsapp',   label: 'WhatsApp / Direct',  leads: 46, contacted: 30, scheduled: 9,  retained: 3 },
]

export const FUNNEL_STAGES = [
  { key: 'leads',     label: 'Leads' },
  { key: 'contacted', label: 'Contacted' },
  { key: 'scheduled', label: 'Scheduled' },
  { key: 'retained',  label: 'Retained' },
]

// How last month's 98 missed calls would have resolved with recovery running.
// 71 + 15 + 12 = 98.
export const MISSED_CALL_OUTCOMES = [
  { key: 'recovered',  label: 'Recovered',                 value: 71, bar: 'bg-brand-navy' },
  { key: 'closed',     label: 'Wrong number / not a lead', value: 15, bar: 'bg-gray-300' },
  { key: 'unresolved', label: 'Still unresolved',          value: 12, bar: 'bg-orange-400' },
]

export const MEDIAN_CALLBACK = '8 min'
