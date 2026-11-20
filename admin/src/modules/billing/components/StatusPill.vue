<template>
  <span :class="meta.pill" class="inline-flex items-center gap-1.5 text-[11px] font-ui font-semibold px-2.5 py-1 rounded-full ring-1 whitespace-nowrap" :title="meta.hint">
    <span :class="meta.dot" class="w-1.5 h-1.5 rounded-full" aria-hidden="true"></span>
    {{ meta.label }}
  </span>
</template>

<script setup>
import { computed } from 'vue'
import { useT } from '../../../i18n/translator.js'
import { BILLING } from '../../../i18n/billing.js'

// Same pill vocabulary as the lead pipeline (data/leadStatuses.js). The
// label and hint are status.<key> and status.<key>.hint in i18n/billing.js.
const STATUSES = {
  paid: { pill: 'bg-green-100 text-green-800 ring-green-200', dot: 'bg-green-600' },
  partial: { pill: 'bg-amber-100 text-amber-800 ring-amber-200', dot: 'bg-amber-500' },
  unpaid: { pill: 'bg-brand-navy/10 text-brand-navy ring-brand-navy/20', dot: 'bg-brand-navy' },
  overdue: { pill: 'bg-brand-red/10 text-brand-red ring-brand-red/20', dot: 'bg-brand-red' },
  void: { pill: 'bg-gray-100 text-gray-600 ring-gray-200', dot: 'bg-gray-400' },
  needs_review: { pill: 'bg-violet-100 text-violet-800 ring-violet-200', dot: 'bg-violet-500' },
}

const props = defineProps({ status: { type: String, required: true } })
const { t } = useT(BILLING)
const meta = computed(() => {
  const look = STATUSES[props.status]
  // A status the server adds later shows as itself.
  if (!look) return { label: props.status, hint: '', pill: 'bg-gray-100 text-gray-600 ring-gray-200', dot: 'bg-gray-400' }
  return { ...look, label: t(`status.${props.status}`), hint: t(`status.${props.status}.hint`) }
})
</script>
