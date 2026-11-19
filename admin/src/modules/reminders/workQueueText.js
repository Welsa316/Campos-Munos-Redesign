// Home's "My follow-ups" rows in words (GET /api/work-queue). Pure, tested in
// admin/test/workQueue.test.js.
import { formatDue, formatTime } from './dueChoices.js'
import { sameFirmDay } from '../../utils/firmTime.js'
import { phone } from '../calls/callLook.js'
import { attentionText } from '../automation/automationText.js'
import { translate } from '../../i18n/dashboard.js'

function when(item, now, lang) {
  const at = new Date(item.at)
  const t = (key, vars) => translate(lang, key, vars)
  const sinceOrAt = () => (sameFirmDay(at, now) ? formatTime(at, lang) : formatDue(at, lang))
  if (item.group === 'overdue') return t('fu.when.overdue', { when: sinceOrAt() })
  if (item.group === 'due') return t('fu.when.due')
  if (item.group === 'today') return t('fu.when.today', { time: formatTime(at, lang) })
  if (item.group === 'lead') return t('fu.when.received', { when: sinceOrAt() })
  return formatDue(at, lang)
}

/** { title, when, icon, tone } for one row; lang 'es' for Home in Spanish. */
export function workItemText(item, now = Date.now(), lang = 'en') {
  // A lead that needs a person, and why (server/automation/health.js).
  if (item.kind === 'lead_attention') return attentionText(item, now, lang)
  const t = (key, vars) => translate(lang, key, vars)
  const who = item.name || (item.number ? phone(item.number) : null)
  const title = item.kind === 'callback' ? t('fu.call_back', { who: who || t('fu.a_caller') })
    : item.kind === 'lead_followup' ? t('fu.follow_up', { who: who || t('fu.a_website_lead') })
    : `${t(item.source === 'chat' ? 'fu.new_chat' : 'fu.new_message')}${who ? t('fu.from', { who }) : ''}`
  const icon = item.kind === 'callback' ? 'phone' : item.kind === 'lead_followup' ? 'bell' : 'envelope-open-text'
  const tone = item.group === 'overdue' ? 'overdue' : item.group === 'due' ? 'due' : 'quiet'
  return { title, when: when(item, now, lang), icon, tone }
}
