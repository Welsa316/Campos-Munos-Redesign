<template>
  <span :class="meta.pill" class="inline-flex items-center gap-1.5 text-[11px] font-ui font-semibold px-2.5 py-1 rounded-full ring-1 whitespace-nowrap" :title="meta.hint">
    <span :class="meta.dot" class="w-1.5 h-1.5 rounded-full" aria-hidden="true"></span>
    {{ meta.label }}
  </span>
</template>

<script setup>
import { computed } from 'vue'

// Same pill vocabulary as the lead pipeline (data/leadStatuses.js).
const STATUSES = {
  paid: { label: 'Paid', hint: 'The report shows nothing owed', pill: 'bg-green-100 text-green-800 ring-green-200', dot: 'bg-green-600' },
  partial: { label: 'Partially paid', hint: 'Something paid, balance remains, not past due', pill: 'bg-amber-100 text-amber-800 ring-amber-200', dot: 'bg-amber-500' },
  unpaid: { label: 'Unpaid', hint: 'Nothing paid yet, not past due', pill: 'bg-brand-navy/10 text-brand-navy ring-brand-navy/20', dot: 'bg-brand-navy' },
  overdue: { label: 'Overdue', hint: 'A balance remains after the due date that applies', pill: 'bg-brand-red/10 text-brand-red ring-brand-red/20', dot: 'bg-brand-red' },
  void: { label: 'Void', hint: 'Cancelled in eImmigration', pill: 'bg-gray-100 text-gray-600 ring-gray-200', dot: 'bg-gray-400' },
  needs_review: { label: 'Needs review', hint: 'The report is incomplete or contradictory; nothing was guessed', pill: 'bg-violet-100 text-violet-800 ring-violet-200', dot: 'bg-violet-500' },
}

const props = defineProps({ status: { type: String, required: true } })
const meta = computed(() => STATUSES[props.status] || { label: props.status, hint: '', pill: 'bg-gray-100 text-gray-600 ring-gray-200', dot: 'bg-gray-400' })
</script>
