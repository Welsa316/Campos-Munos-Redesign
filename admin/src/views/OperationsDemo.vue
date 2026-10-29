<template>
  <div class="h-dvh flex flex-col bg-brand-surface overflow-hidden">
    <!-- Top bar: same shell as the production Client Messages dashboard -->
    <header class="h-16 flex-shrink-0 bg-white border-b border-gray-200 flex items-center px-4 sm:px-6 z-10 gap-3">
      <div class="flex items-center gap-3 sm:gap-4 min-w-0">
        <img src="/logo.png" alt="Campos Muños Law" class="hidden min-[420px]:block h-7 sm:h-9 flex-shrink-0" />
        <div class="w-px h-8 bg-gray-200 hidden sm:block" aria-hidden="true"></div>
        <h1 class="font-heading text-lg text-brand-navy tracking-tight hidden md:block whitespace-nowrap">Client Messages</h1>
        <div class="flex bg-brand-surface rounded-lg p-0.5" role="tablist" aria-label="Demo views">
          <button v-for="tab in TABS" :key="tab.key"
            role="tab"
            :aria-selected="state.view === tab.key"
            @click="actions.setView(tab.key)"
            :class="state.view === tab.key ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'"
            class="text-xs font-ui font-medium px-3 py-1.5 rounded-md transition-all whitespace-nowrap">
            <span class="sm:hidden">{{ tab.short }}</span><span class="hidden sm:inline">{{ tab.label }}</span>
          </button>
        </div>
        <span v-if="unread > 0" class="hidden sm:inline-flex items-center justify-center min-w-[22px] h-[22px] px-1.5 rounded-full bg-brand-red text-white text-xs font-ui font-bold">{{ unread }}</span>
      </div>

      <div class="ml-auto flex items-center gap-1 sm:gap-2">
        <span class="hidden lg:inline-flex items-center gap-1.5 text-[10px] font-ui font-bold uppercase tracking-[0.14em] text-gray-500 px-2.5 py-1 rounded-full border border-dashed border-gray-300 mr-2">
          <DemoIcon :icon="faFlask" class="text-[10px]" /> Demo
        </span>

        <div class="relative hidden sm:block">
          <button ref="guideBtn" @click.stop="guideOpen = !guideOpen" :aria-expanded="guideOpen" aria-controls="demo-guide"
            class="flex items-center gap-2 px-3 py-2 rounded-lg text-gray-500 hover:text-brand-navy hover:bg-brand-surface text-sm font-ui font-medium transition-colors">
            <DemoIcon :icon="faListCheck" class="text-xs" />
            <span class="hidden sm:inline">Walkthrough</span>
          </button>
          <div v-if="guideOpen" id="demo-guide" @click.stop
            class="absolute right-0 top-full mt-2 z-40 w-[340px] max-w-[calc(100vw-2rem)] bg-white rounded-xl shadow-xl ring-1 ring-gray-200 p-4">
            <div v-for="(s, i) in SCENARIOS" :key="s.lead" :class="i > 0 ? 'mt-4 pt-4 border-t border-gray-100' : ''">
              <p class="text-[10px] font-ui font-bold uppercase tracking-[0.14em] text-gray-500">Scenario {{ i + 1 }}</p>
              <p class="text-sm font-ui font-semibold text-gray-900 mt-0.5">{{ s.title }}</p>
              <ol class="mt-2 space-y-1 text-xs font-ui text-gray-600 list-decimal pl-4 leading-relaxed">
                <li v-for="step in s.steps" :key="step">{{ step }}</li>
              </ol>
              <button @click="startScenario(s)"
                class="mt-3 inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-ui font-semibold text-white bg-brand-navy hover:bg-brand-navy-dark transition-colors">
                {{ s.cta }} <DemoIcon :icon="faArrowRight" class="text-[10px]" />
              </button>
            </div>
          </div>
        </div>

        <button @click="resetDemo"
          class="flex items-center gap-2 px-3 py-2 rounded-lg text-gray-500 hover:text-brand-red hover:bg-red-50 text-sm font-ui font-medium transition-colors"
          title="Restore every lead to its starting state">
          <DemoIcon :icon="faRotateLeft" class="text-xs" />
          <span class="hidden sm:inline">Reset demo</span>
        </button>
      </div>
    </header>

    <!-- Always-visible disclosure -->
    <div class="flex-shrink-0 bg-brand-navy text-white/90 text-[11px] font-ui px-4 sm:px-6 py-1.5 flex items-center gap-2">
      <DemoIcon :icon="faCircleInfo" class="text-[10px] text-white/70" />
      <span class="truncate"><span class="font-semibold text-white">Demonstration.</span> All people, numbers and figures are fabricated. No calls, texts or emails are sent, and nothing is written to the firm's records.</span>
    </div>

    <StrategyPage v-if="state.view === 'strategy'" @openList="openList" />

    <DemoDashboard v-else-if="state.view === 'dashboard'" @openList="openList" @openLead="openLead" />

    <div v-else class="flex-1 flex overflow-hidden min-h-0">
      <div :class="['w-full lg:w-[380px] lg:flex-shrink-0 flex flex-col min-h-0', state.selectedId ? 'hidden lg:flex' : 'flex']">
        <LeadList :leads="state.leads" :selectedId="state.selectedId" :preset="state.listPreset" @select="actions.open" />
      </div>
      <div :class="['flex-1 flex flex-col min-w-0 min-h-0', state.selectedId ? 'flex' : 'hidden lg:flex']">
        <LeadDetail :lead="selectedLead" @back="actions.close" />
      </div>
    </div>

    <DemoToast :toast="state.toast" @dismiss="actions.dismissToast" />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { faFlask, faListCheck, faRotateLeft, faCircleInfo, faArrowRight } from '@fortawesome/free-solid-svg-icons'
import DemoIcon from '../demo/operations/components/DemoIcon.vue'
import DemoDashboard from '../demo/operations/components/DemoDashboard.vue'
import StrategyPage from '../demo/operations/components/StrategyPage.vue'
import LeadList from '../demo/operations/components/LeadList.vue'
import LeadDetail from '../demo/operations/components/LeadDetail.vue'
import DemoToast from '../demo/operations/components/DemoToast.vue'
import { useOpsDemo } from '../demo/operations/useOpsDemo.js'

const { state, actions, selectedLead } = useOpsDemo()

const TABS = [
  { key: 'strategy', label: 'Strategy', short: 'Strategy' },
  { key: 'dashboard', label: 'Dashboard', short: 'Dashboard' },
  { key: 'leads', label: 'Lead Operations', short: 'Leads' },
]

const SCENARIOS = [
  {
    lead: 'maria-rodriguez',
    title: 'Missed call → scheduled consultation',
    cta: 'Open Maria Rodriguez',
    steps: [
      'Dashboard: point out 98 missed business-hour calls',
      'Open Maria — Google Ads click, then a missed call',
      'Simulate Recovery: acknowledged, staff alerted, queued',
      'Mark Contacted, then Schedule Consultation',
      'Back to Dashboard: Needs Attention and Today update',
    ],
  },
  {
    lead: 'lucia-morales',
    title: 'Website lead → retained client',
    cta: 'Open Lucía Morales',
    steps: [
      'Campaign, search term and landing page on the right',
      'Form submission, automatic confirmation, staff reply',
      'Consultation held, engagement signed',
      'Attribution closed: ad spend tied to a real client',
    ],
  },
]

const unread = computed(() => state.leads.filter(l => l.unread).length)

const guideOpen = ref(false)
function closeGuide(e) {
  if (e.type === 'keydown' && e.key !== 'Escape') return
  guideOpen.value = false
}
onMounted(() => {
  document.addEventListener('click', closeGuide)
  document.addEventListener('keydown', closeGuide)
})
onUnmounted(() => {
  document.removeEventListener('click', closeGuide)
  document.removeEventListener('keydown', closeGuide)
})

// Jumping straight to a lead clears any dashboard filter so it is never hidden.
function openLead(id) {
  state.listPreset = null
  actions.open(id)
}

function startScenario(s) {
  guideOpen.value = false
  openLead(s.lead)
}

function openList(preset) {
  state.selectedId = null
  actions.setView('leads', preset)
}

function resetDemo() {
  if (!window.confirm('Reset the demo? Every lead goes back to its starting state.')) return
  actions.reset()
}
</script>
