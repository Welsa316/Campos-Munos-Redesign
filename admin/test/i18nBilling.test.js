// Billing in Spanish. What matters: every word exists in both languages
// with the same blanks to fill, the sentences built from data read in
// Spanish when asked, and English is exactly what it was before Spanish was
// added (the English expectations below are the old strings, verbatim).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { missingKeys, makeTranslate } from '../src/i18n/translator.js'
import { BILLING } from '../src/i18n/billing.js'
import { BILLING_REMINDERS } from '../src/i18n/billingReminders.js'
import { money, shortDate } from '../src/modules/billing/format.js'
import {
  num, around, invoiceHistory, rowChanges, phoneSummary, approveSummary, appliedSummary,
  ruleLabel, sendingHours, evaluateNotice, dispatchNotice, approveNotice, consentLine,
} from '../src/modules/billing/billingText.js'

const DICTS = { BILLING, BILLING_REMINDERS }
const holes = (v) => [...new Set(JSON.stringify(v).match(/\{\w+\}/g) ?? [])].sort()

for (const [name, dict] of Object.entries(DICTS)) {
  test(`${name}: every key in both languages, same shape and placeholders`, () => {
    assert.deepEqual(missingKeys(dict), { inEs: [], inEn: [] })
    for (const k of Object.keys(dict.en)) {
      const en = dict.en[k]
      const es = dict.es[k]
      assert.equal(typeof es, typeof en, `${k}: plural in one language only`)
      assert.deepEqual(holes(es), holes(en), `${k}: placeholders differ`)
      if (typeof en === 'object') for (const v of [en, es]) assert.ok(v.one && v.other, `${k}: one and other`)
      assert.ok(String(es.other ?? es).trim(), `${k}: empty Spanish`)
    }
  })
}

test('counts pick the singular only for 1, with thousands separators', () => {
  const t = makeTranslate(BILLING)
  assert.equal(t('en', 'count.invoice', { count: num(1) }), '1 invoice')
  assert.equal(t('en', 'count.invoice', { count: num(1234) }), '1,234 invoices')
  assert.equal(t('es', 'count.invoice', { count: num(1, 'es') }), '1 factura')
  assert.equal(t('es', 'count.invoice', { count: num(0, 'es') }), '0 facturas')
})

test('money and dates follow the language; English unchanged with no locale', () => {
  assert.equal(money(123456), '$1,234.56')
  assert.equal(money(123456, 'es-US'), '$1,234.56')
  assert.equal(money(null, 'es-US'), '—')
  assert.equal(shortDate('2026-11-05'), 'Nov 5, 2026')
  assert.equal(shortDate('2026-11-05', 'es-US'), '5 nov 2026')
  assert.equal(shortDate('garbage', 'es-US'), '—')
})

test('a sentence splits around its control in either language', () => {
  const t = makeTranslate(BILLING)
  assert.deepEqual(around(t('en', 'detail.not_linked'), 'link'), ['Client not linked yet. ', '.'])
  assert.deepEqual(around(t('es', 'matching.choose_board'), 'link'), ['Elija el tablero de clientes en la pestaña ', ' para empezar a vincular clientes.'])
  assert.deepEqual(around('no control here', 'link'), ['no control here', ''])
})

test('an invoice revision, in Spanish and unchanged in English', () => {
  const changes = [
    { field: 'balanceCents', from: 50000, to: 25000 },
    { field: 'status', from: 'unpaid', to: 'overdue' },
    { field: 'dueDate', from: null, to: '2026-12-01' },
  ]
  assert.equal(invoiceHistory(changes), 'balance: $500.00 → $250.00; status: unpaid → overdue; due date: — → Dec 1, 2026')
  assert.equal(invoiceHistory(changes, 'es'), 'saldo: $500.00 → $250.00; estado: sin pagar → vencida; fecha de vencimiento: — → 1 dic 2026')
  assert.equal(invoiceHistory([]), 'Re-confirmed, no changes')
  assert.equal(invoiceHistory([], 'es'), 'Confirmada de nuevo, sin cambios')
  assert.equal(invoiceHistory([{ field: 'total', from: null, to: 1 }], 'es'), 'Importada por primera vez desde este informe')
  assert.equal(invoiceHistory([{ field: 'odd', from: 1, to: 2 }]), '1 field updated')
  assert.equal(invoiceHistory([{ field: 'odd', from: 1, to: 2 }, { field: 'odder', from: 1, to: 2 }], 'es'), '2 campos actualizados')
  // A status the server adds later shows as stored.
  assert.equal(invoiceHistory([{ field: 'status', from: 'unpaid', to: 'disputed' }], 'es'), 'estado: sin pagar → disputed')
})

test('a preview row\'s changes say "due", in both languages', () => {
  const changes = [{ field: 'dueDate', from: '2026-11-01', to: '2026-12-01' }, { field: 'paidCents', from: null, to: 1000 }, { field: 'reviewReason', from: 'a', to: 'b' }]
  assert.equal(rowChanges(changes), 'due 2026-11-01 → 2026-12-01; paid — → $10.00')
  assert.equal(rowChanges(changes, 'es'), 'vencimiento 2026-11-01 → 2026-12-01; pagado — → $10.00')
})

test('what a report does to WhatsApp numbers, singular and plural in Spanish', () => {
  const phones = { new: 2, changed: 0, same: 1, kept: 0, invalid: 3, conflict: 1 }
  assert.equal(phoneSummary(phones), '2 new · 1 already on file · 3 unreadable (need a 10-digit US number, or + and the country code) · 1 not saved (the client’s rows disagree)')
  assert.equal(phoneSummary(phones, 'es'), '2 nuevos · 1 ya estaba registrado · 3 ilegibles (se necesita un número de EE. UU. de 10 dígitos, o + y el código del país) · 1 no se guardó (las filas del cliente no coinciden)')
  assert.equal(phoneSummary(null, 'es'), '')
})

test('the approval line, in Spanish and unchanged in English', () => {
  const counts = { invoice_insert: 2, invoice_update: 3, payment_insert: 1, payment_update: 0 }
  assert.equal(approveSummary(counts, 2), 'Approving writes 2 new and 3 changed invoices and 1 payment, and saves 2 WhatsApp numbers. Skipped rows are not imported. monday.com is not touched.')
  assert.equal(approveSummary({ ...counts, invoice_update: 0, invoice_insert: 1 }, 0), 'Approving writes 1 new and 0 changed invoice and 1 payment. Skipped rows are not imported. monday.com is not touched.')
  assert.equal(approveSummary(counts, 2, 'es'), 'Aprobar guarda 2 facturas nuevas y 3 con cambios, y 1 pago, y también 2 números de WhatsApp. Las filas omitidas no se importan. No se toca monday.com.')
  assert.equal(approveSummary({ ...counts, invoice_insert: 1 }, 0, 'es'), 'Aprobar guarda 1 factura nueva y 3 con cambios, y 1 pago. Las filas omitidas no se importan. No se toca monday.com.')
})

test('what an approved import applied', () => {
  assert.equal(appliedSummary({ invoices: 12, payments: 1, links: 1 }), 'Applied: 12 invoices, 1 payment, 1 client linked to monday.com by eImmigration ID.')
  assert.equal(appliedSummary({ invoices: 1, payments: 0, links: 0 }), 'Applied: 1 invoice, 0 payments.')
  assert.equal(appliedSummary({ invoices: 12, payments: 1, links: 2 }, 'es'), 'Aplicado: 12 facturas, 1 pago, 2 clientes vinculados a monday.com por ID de eImmigration.')
})

test('a reminder rule by what it does now', () => {
  const rule = (over) => ({ trigger: 'before_due', action: 'send', days: 3, ...over })
  assert.equal(ruleLabel(rule()), '3 days before due')
  assert.equal(ruleLabel(rule(), 'es'), '3 días antes del vencimiento')
  assert.equal(ruleLabel(rule({ days: 0 }), 'es'), 'Vence hoy')
  assert.equal(ruleLabel(rule({ days: 1 })), 'Due tomorrow')
  assert.equal(ruleLabel(rule({ days: 1 }), 'es'), 'Vence mañana')
  assert.equal(ruleLabel(rule({ trigger: 'after_due', days: 1 })), '1 days overdue')
  assert.equal(ruleLabel(rule({ trigger: 'after_due', days: 1 }), 'es'), '1 día de atraso')
  assert.equal(ruleLabel(rule({ trigger: 'after_due', action: 'staff_followup', days: 14 })), 'Follow-up, 14 days overdue')
  assert.equal(ruleLabel(rule({ trigger: 'after_due', action: 'staff_followup', days: 14 }), 'es'), 'Seguimiento, 14 días de atraso')
})

test('the sending window', () => {
  const s = { startHour: 9, endHour: 18, timeZone: 'America/Chicago' }
  assert.equal(sendingHours(s), '9:00–18:00 Chicago time')
  assert.equal(sendingHours(s, 'es'), 'de 9:00 a 18:00, hora de Chicago')
  assert.equal(sendingHours({ ...s, timeZone: 'America/Los_Angeles' }), '9:00–18:00 Los Angeles time')
  assert.equal(sendingHours(null), 'during business hours')
  assert.equal(sendingHours(null, 'es'), 'en horario de oficina')
})

test('what a reminder action did, in Spanish and unchanged in English', () => {
  // The reasons come from the server and are shown as sent.
  const evaluated = { created: 1, suppressed: [{ count: 2, label: 'No consent' }] }
  assert.equal(evaluateNotice(evaluated), '1 new draft. Not created: 2 × no consent.')
  assert.equal(evaluateNotice(evaluated, 'es'), '1 borrador nuevo. No se crearon: 2 × no consent.')
  assert.equal(evaluateNotice({ created: 0 }, 'es'), '0 borradores nuevos.')

  assert.equal(dispatchNotice({ sent: 3, failed: 0, unknown: 1, cancelled: 0 }), '3 sent, 0 failed, 1 unconfirmed, 0 cancelled before sending.')
  assert.equal(dispatchNotice({ sent: 3, failed: 0, unknown: 1, cancelled: 0 }, 'es'), '3 enviados, 0 con error, 1 sin confirmar, 0 cancelados antes de enviarse.')
  assert.equal(dispatchNotice({ skipped: 'sending_disabled' }, 'es'), 'El envío está desactivado en el servidor. Los recordatorios aprobados están esperando.')
  assert.equal(dispatchNotice({ skipped: 'outside_hours', nextOpenAt: '2026-11-06' }), 'Outside sending hours. Next window: Nov 6, 2026.')
  assert.equal(dispatchNotice({ skipped: 'outside_hours', nextOpenAt: '2026-11-06' }, 'es'), 'Fuera del horario de envío. Próximo horario: 6 nov 2026.')

  assert.equal(approveNotice({ approved: [1, 2], tasksDone: 1, notApproved: 1 }), '2 approved, 1 follow-up marked done; 1 no longer qualified and were cancelled or skipped.')
  assert.equal(approveNotice({ approved: [1] }), '1 approved.')
  assert.equal(approveNotice({ approved: [1], tasksDone: 2, notApproved: 3 }, 'es'), '1 aprobado, 2 seguimientos marcados como hechos; 3 ya no cumplían las condiciones y se cancelaron u omitieron.')
})

test('a client\'s consent line', () => {
  const c = (over) => ({ phone_e164: '15045550100', ...over })
  assert.deepEqual(consentLine({}, false, 'es'), { label: 'Sin número de WhatsApp', tone: 'text-gray-500' })
  assert.equal(consentLine(c({ opted_out_at: '2026-11-05', opt_out_source: 'whatsapp_reply' })).label, 'Opted out Nov 5, 2026 (replied STOP)')
  assert.equal(consentLine(c({ opted_out_at: '2026-11-05', opt_out_source: 'whatsapp_reply' }), false, 'es').label, 'Dado de baja el 5 nov 2026 (respondió STOP)')
  // What staff typed as the source is shown as typed.
  assert.equal(consentLine(c({ opted_in_at: '2026-11-05', opt_in_source: 'signed intake form' }), false, 'es').label, 'Aceptó el 5 nov 2026 · signed intake form')
  assert.equal(consentLine(c(), true).label, 'Agreed under the firm policy')
  assert.equal(consentLine(c(), true, 'es').label, 'Aceptó según la política de la firma')
  assert.deepEqual(consentLine(c(), false), { label: 'No consent recorded', tone: 'text-amber-700' })
})

test('English values that stand in for stored ones are the stored ones', () => {
  // Shown in English as the server sends them, so English is unchanged.
  for (const k of ['paid', 'partial', 'unpaid', 'overdue', 'void', 'needs_review']) assert.equal(BILLING.en[`value.${k}`], k)
  for (const k of ['status', 'outstanding', 'lastPaymentDate', 'nextDueDate', 'lastSync', '_item']) assert.equal(BILLING.en[`sfield.${k}`], k)
})
