<template>
  <div ref="scroller" class="strategy flex-1 overflow-y-auto min-h-0">
    <!-- Chapter navigation. The firm's logo already sits in the app bar above,
         so this bar carries only the chapters. -->
    <nav ref="chapterNav" class="s-nav" aria-label="Presentation chapters">
      <div ref="navLinks" class="s-nav-links">
        <button v-for="(c, i) in CHAPTERS" :key="c.id" type="button"
          :class="{ active: active === c.id }"
          :aria-current="active === c.id ? 'location' : undefined"
          @click="goTo(c.id)">
          <span class="s-nav-num">0{{ i + 1 }}</span>{{ c.name }}
        </button>
      </div>
      <span class="s-nav-caption">Strategy concept<span>September 2026</span></span>
    </nav>

    <!-- 01 · Vision ------------------------------------------------------- -->
    <section id="vision" class="section-wrap hero">
      <div class="hero-topline">
        <p class="eyebrow"><span>01</span>A connected firm</p>
        <span class="proposal-label">An operational transformation proposal</span>
      </div>
      <div class="hero-main">
        <div>
          <h1>Automated<br>Operations<br>System.</h1>
          <p class="hero-subtitle">A more connected way to run the firm — from first contact to case completion.</p>
          <button type="button" class="text-link" @click="goTo('model')">
            Explore the operating model <DemoIcon :icon="faArrowDown" />
          </button>
        </div>
        <div class="hero-visual" aria-label="Diagram: first contact and the client relationship feed one operations layer, which serves leads, clients and cases" role="img">
          <p class="hero-diagram-label">The next chapter of Campos Muños</p>
          <div class="hero-source-row"><span>First contact</span><span>Client relationship</span></div>
          <div class="hero-connections"><div></div><div></div></div>
          <div class="hero-hub">
            <DemoIcon :icon="faLayerGroup" class="hub-icon" />
            <div><small>One connected</small><strong>Operations layer</strong></div>
          </div>
          <div class="hero-branches"><div></div><div></div><div></div></div>
          <div class="hero-domain-row">
            <div><span>01</span><strong>Leads</strong><small>Capture &amp; respond</small></div>
            <div><span>02</span><strong>Clients</strong><small>Onboard &amp; connect</small></div>
            <div><span>03</span><strong>Cases</strong><small>Coordinate &amp; track</small></div>
          </div>
          <div class="judgment-strip"><DemoIcon :icon="faShieldHalved" />Human judgment at every critical step</div>
          <p class="hero-diagram-foot">The systems do the repetitive work.<br>Your people do the work that matters.</p>
        </div>
      </div>
      <div class="hero-bottom">
        <p>Connect the systems the firm already uses, automate repetitive work, and keep people focused on judgment, communication, and legal work.</p>
        <div class="outcome-strip">
          <div><span>01</span><strong>Less manual work</strong></div>
          <div><span>02</span><strong>Save time &amp; money</strong></div>
          <div><span>03</span><strong>More clients / better visibility</strong></div>
        </div>
      </div>
      <div class="section-footer">
        <span>Vision → Operating model → Working demo → Roadmap</span>
        <button type="button" @click="goTo('opportunity')">The opportunity <DemoIcon :icon="faArrowDown" /></button>
      </div>
    </section>

    <!-- 02 · Opportunity -------------------------------------------------- -->
    <section id="opportunity" class="section-wrap">
      <div class="section-heading">
        <p class="eyebrow"><span>02</span>The opportunity</p>
        <div class="heading-row">
          <h2>Less work<br>between the systems.</h2>
          <p>The firm already has the tools and the people. The opportunity is to make the handoffs work together.</p>
        </div>
      </div>
      <div class="opportunity-grid">
        <div class="today-flow">
          <span class="small-label">Today</span>
          <h3>People are often the glue between systems.</h3>
          <ol class="manual-chain">
            <li v-for="(s, i) in MANUAL_CHAIN" :key="s">
              <span>{{ String(i + 1).padStart(2, '0') }}</span><p>{{ s }}</p>
            </li>
          </ol>
        </div>
        <div class="tomorrow-flow">
          <span class="small-label">Tomorrow</span>
          <h3>Systems should move the information.</h3>
          <div class="future-flow">
            <div>Lead source</div>
            <DemoIcon :icon="faArrowDown" />
            <div class="flow-highlight"><DemoIcon :icon="faLayerGroup" />Operations layer</div>
            <DemoIcon :icon="faArrowDown" />
            <div class="flow-human"><DemoIcon :icon="faUsers" />Staff only when needed</div>
            <DemoIcon :icon="faArrowDown" />
            <div class="flow-split"><span>Consultation</span><DemoIcon :icon="faArrowRight" /><span>Client</span></div>
            <DemoIcon :icon="faArrowDown" />
            <div class="flow-split"><span>Case system</span><DemoIcon :icon="faArrowRight" /><span>Reporting</span></div>
          </div>
        </div>
        <aside class="observed-callout">
          <span class="tag tag-observed">Firm data · reported by the firm</span>
          <div class="big-number">98<span>calls</span></div>
          <h3>Missed during business hours.</h3>
          <p>In the last 30 days reported.</p>
          <div class="callout-rule"></div>
          <p>One visible example of where operational automation can reduce leakage.</p>
          <small>These are unanswered calls, not 98 confirmed prospective clients. Intent and outcome need review.</small>
        </aside>
      </div>
      <div class="context-note">
        <span>Build on what exists</span>
        <p>The custom Client Messages inbox already tracks lead stages. The firm has also added receptionist support. Connected workflows can help that team act with more context and fewer manual handoffs.</p>
      </div>
    </section>

    <!-- 03 · The system --------------------------------------------------- -->
    <section id="model" class="model-section">
      <div class="section-wrap">
        <div class="section-heading">
          <p class="eyebrow"><span>03</span>The future operating model</p>
          <div class="heading-row">
            <h2>Six connected capabilities.<br>One operational backbone.</h2>
            <p>A shared record connects the journey. Select a capability to explore how it supports the next.</p>
          </div>
        </div>

        <div class="pillar-list" role="tablist" aria-label="Operational pillars" @keydown="onTabKey($event, PILLARS.length, i => (pillar = i))">
          <button v-for="(p, i) in PILLARS" :key="p.title" type="button" role="tab"
            :id="`pillar-tab-${i}`" :aria-controls="`pillar-panel-${i}`"
            :aria-selected="pillar === i" :tabindex="pillar === i ? 0 : -1"
            :class="{ active: pillar === i }" class="pillar-trigger" @click="pillar = i">
            <span class="pillar-index">0{{ i + 1 }}<DemoIcon :icon="p.icon" /></span>
            <strong>{{ p.title }}</strong>
            <span class="pillar-short">{{ p.short }}</span>
          </button>
        </div>
        <div v-for="(p, i) in PILLARS" v-show="pillar === i" :key="p.title" role="tabpanel"
          :id="`pillar-panel-${i}`" :aria-labelledby="`pillar-tab-${i}`" class="pillar-detail">
          <div>
            <span class="light-kicker">0{{ i + 1 }} / The operating model</span>
            <h3>{{ p.purpose }}</h3>
            <p>{{ p.outcome }}</p>
          </div>
          <div>
            <ul class="check-grid">
              <li v-for="x in p.items" :key="x"><DemoIcon :icon="faCheck" />{{ x }}</li>
            </ul>
            <div class="validation"><span class="tag">To validate</span><span>{{ p.validation }}</span></div>
          </div>
        </div>

        <div class="model-foundation">
          <span><DemoIcon :icon="faLink" />Shared identity &amp; activity history</span>
          <span><DemoIcon :icon="faCodeBranch" />Approved rules &amp; clear ownership</span>
          <span><DemoIcon :icon="faShieldHalved" />Human review &amp; permissions</span>
        </div>
      </div>
    </section>

    <!-- 04 · Working demo ------------------------------------------------- -->
    <section id="demo" class="section-wrap demo-section">
      <div class="section-heading">
        <p class="eyebrow"><span>04</span>Make the vision concrete</p>
        <div class="heading-row">
          <h2>A missed call.<br>A clear path forward.</h2>
          <p>An evolution of the existing Client Messages tool: the same familiar lead lifecycle, with connected actions and a visible history.</p>
        </div>
      </div>
      <div class="demo-intro">
        <p><strong>Follow Maria’s journey.</strong> Play the sample recovery, or use the staff controls to update a lead and schedule a consultation. This is the same working demo as the Lead Operations tab.</p>
        <button type="button" class="play-button" :disabled="state.playing" @click="actions.playRecovery()">
          <DemoIcon :icon="state.playing ? faSpinner : faPlay" :class="{ 'animate-spin': state.playing }" />
          {{ state.playing ? 'Recovery playing…' : 'Play Maria’s recovery' }}
        </button>
      </div>

      <div class="demo-frame">
        <div class="demo-toolbar">
          <div class="demo-title">
            <img src="/logo.png" alt="Campos Muños Law" class="h-7" />
            <span class="toolbar-divider"></span>
            <strong>Client Messages</strong>
          </div>
          <div class="toolbar-actions">
            <span class="tag">Interactive demo</span>
            <button type="button" class="reset-button" @click="resetMaria"><DemoIcon :icon="faRotateLeft" />Reset Maria</button>
          </div>
        </div>
        <div class="demo-panes">
          <div :class="['demo-list', state.selectedId ? 'hidden lg:flex' : 'flex']">
            <LeadList :leads="state.leads" :selectedId="state.selectedId" @select="actions.select" />
          </div>
          <div :class="['demo-detail', state.selectedId ? 'flex' : 'hidden lg:flex']">
            <LeadDetail :lead="selectedLead" @back="actions.close" />
          </div>
        </div>
        <p class="demo-note">{{ state.playing ? 'Replaying a sample journey, including simulated staff actions.' : 'Simulation only. No messages are sent and no calendar events are created.' }}</p>
      </div>

      <div class="demo-takeaway">
        <span>The principle</span>
        <h3>Automation starts the response.<br>People move the relationship forward.</h3>
      </div>
    </section>

    <!-- 05 · Visibility --------------------------------------------------- -->
    <section id="visibility" class="visibility-section">
      <div class="section-wrap">
        <div class="section-heading">
          <p class="eyebrow"><span>05</span>Lead-to-client visibility</p>
          <div class="heading-row">
            <h2>Keep the source.<br>See the outcome.</h2>
            <p>Today we can measure where a lead came from. The goal is to measure which sources actually produce consultations and clients.</p>
          </div>
        </div>
        <div class="funnel-layout">
          <ol class="funnel-stages">
            <li v-for="(stage, i) in FUNNEL_JOURNEY" :key="stage" class="funnel-stage">
              <span>0{{ i + 1 }}</span><strong>{{ stage }}</strong>
            </li>
          </ol>
          <div class="attribution-story">
            <div class="panel-title">
              <span class="small-label">The source stays attached</span>
              <span class="tag">Illustrative journey</span>
            </div>
            <div class="attribution-source">
              <span class="source-monogram"><DemoIcon :icon="faGoogle" /></span>
              <div><strong>Google Ads</strong><p>{{ mariaCampaign }}</p></div>
              <span class="tag tag-blue">Source preserved</span>
            </div>
            <ol class="attribution-path">
              <li v-for="(x, i) in ATTRIBUTION_PATH" :key="x.title">
                <span><DemoIcon v-if="i === ATTRIBUTION_PATH.length - 1" :icon="faCheck" /><span v-else class="path-dot"></span></span>
                <div><strong>{{ x.title }}</strong><p>{{ x.desc }}</p></div>
              </li>
            </ol>
            <div class="source-preserved"><DemoIcon :icon="faLink" />Google Ads / {{ mariaCampaign }}<span>attached throughout</span></div>
            <p class="small-note">Attribution coverage and cross-channel identity matching to validate.</p>
          </div>
        </div>
        <ul class="channel-row" aria-label="Lead sources tracked">
          <li v-for="s in SOURCE_FUNNEL" :key="s.channel"><DemoIcon :icon="CHANNELS[s.channel].icon" />{{ s.label }}</li>
        </ul>
      </div>
    </section>

    <!-- 06 · Operational intelligence ------------------------------------- -->
    <section id="intelligence" class="section-wrap">
      <div class="section-heading">
        <p class="eyebrow"><span>06</span>Operational intelligence</p>
        <div class="heading-row">
          <h2>A clearer view<br>of the whole firm.</h2>
          <p>See where attention is needed, how quickly the team responds, and which sources lead to retained clients.</p>
        </div>
      </div>
      <p class="data-disclosure"><strong>98</strong> is the reported count from the prior 30-day window. Every other figure below is fabricated. Demo outcomes are not measured results or a recovery rate against those 98 calls.</p>
      <DemoDashboard embedded @openList="openList" @openLead="actions.open" />
    </section>

    <!-- 07 · Why this matters --------------------------------------------- -->
    <section class="impact-section">
      <div class="section-wrap">
        <p class="eyebrow"><span>07</span>Why this matters</p>
        <h2>Less administration.<br>More room for legal work.</h2>
        <div class="impact-grid">
          <div v-for="(x, i) in IMPACT" :key="x.title">
            <span>0{{ i + 1 }}</span>
            <h3>{{ x.title }}</h3>
            <p>{{ x.desc }}</p>
          </div>
        </div>
      </div>
    </section>

    <!-- 08 · Roadmap ------------------------------------------------------ -->
    <section id="roadmap" class="section-wrap">
      <div class="section-heading">
        <p class="eyebrow"><span>08</span>A phased implementation</p>
        <div class="heading-row">
          <h2>Connect first.<br>Build with purpose.</h2>
          <p>Start with repeatable operational work. Expand only after the process, access and ownership are clear.</p>
        </div>
      </div>
      <div class="roadmap-grid">
        <article v-for="x in PHASES" :key="x.n" class="phase-card">
          <div class="phase-top"><span>Phase {{ x.n }}</span><span>{{ x.time }}</span></div>
          <h3>{{ x.title }}</h3>
          <span class="phase-label">{{ x.label }}</span>
          <ul>
            <li v-for="it in x.items" :key="it"><DemoIcon :icon="faCheck" />{{ it }}</li>
          </ul>
          <details>
            <summary>What makes this phase ready <DemoIcon :icon="faChevronDown" /></summary>
            <div><strong>{{ x.gate }}</strong><p>{{ x.extra }}</p></div>
          </details>
        </article>
      </div>
      <p class="roadmap-note"><DemoIcon :icon="faClock" />Indicative phases for discussion, not committed delivery dates. Scope and timing depend on discovery, access and integration feasibility.</p>
    </section>

    <!-- 09 · Human control ------------------------------------------------ -->
    <section id="control" class="control-section">
      <div class="section-wrap control-layout">
        <div>
          <p class="eyebrow"><span>09</span>Privacy &amp; human control</p>
          <span class="shield-emblem"><DemoIcon :icon="faShieldHalved" /></span>
          <h2>AI comes later.<br>With controls.</h2>
          <p class="control-copy">The attorney remains in control. AI is an optional tool for carefully defined work, with human review before legal output is relied upon.</p>
          <p class="control-line">Technology supports the team.<br><strong>Judgment stays with the firm.</strong></p>
        </div>
        <div class="control-rules">
          <div>
            <span class="small-label">Protect the information</span>
            <ul><li v-for="x in PROTECT_RULES" :key="x"><DemoIcon :icon="faLock" />{{ x }}</li></ul>
          </div>
          <div>
            <span class="small-label">Preserve the judgment</span>
            <ul><li v-for="x in JUDGMENT_RULES" :key="x"><DemoIcon :icon="faShieldHalved" />{{ x }}</li></ul>
          </div>
          <p class="small-note">Proposed safeguards, subject to firm review and implementation. No compliance certification is implied.</p>
        </div>
      </div>
    </section>

    <!-- 10 · Final vision ------------------------------------------------- -->
    <section id="final" class="final-section">
      <div class="section-wrap">
        <div class="final-heading">
          <p class="eyebrow"><span>10</span>The final vision</p>
          <h2>Automate the repetitive.<br>Preserve the judgment.</h2>
          <p>The goal is not more software. The goal is less work between the software you already use.</p>
        </div>

        <div class="view-toggle" role="tablist" aria-label="Compare current and future operations" @keydown="onTabKey($event, 2, i => (vision = i === 0 ? 'today' : 'future'))">
          <button v-for="v in ['today', 'future']" :key="v" type="button" role="tab"
            :id="`vision-tab-${v}`" :aria-controls="`vision-panel-${v}`"
            :aria-selected="vision === v" :tabindex="vision === v ? 0 : -1"
            :class="{ active: vision === v }" @click="vision = v">{{ v === 'today' ? 'Today' : 'Future' }}</button>
        </div>

        <div v-show="vision === 'today'" id="vision-panel-today" role="tabpanel" aria-labelledby="vision-tab-today" class="final-diagram">
          <div class="system-chips"><span v-for="x in SYSTEMS" :key="x">{{ x }}</span></div>
          <div class="diagram-join dashed"></div>
          <div class="operations-hub manual">
            <DemoIcon :icon="faUsers" />
            <div><strong>Humans connect the systems</strong><span>Notice · copy · follow up · update · report</span></div>
          </div>
          <p class="diagram-caption">Every handoff depends on someone moving the information.</p>
        </div>
        <div v-show="vision === 'future'" id="vision-panel-future" role="tabpanel" aria-labelledby="vision-tab-future" class="final-diagram">
          <div class="system-chips"><span v-for="x in SYSTEMS" :key="x">{{ x }}</span></div>
          <div class="diagram-join"></div>
          <div class="operations-hub">
            <DemoIcon :icon="faLayerGroup" />
            <div><span>Campos Muños</span><strong>Operations layer</strong></div>
            <span class="tag">Proposed</span>
          </div>
          <div class="branch-line"></div>
          <div class="three-domains"><span>Leads</span><span>Clients</span><span>Cases</span></div>
          <div class="human-center"><DemoIcon :icon="faShieldHalved" />Human judgment where it matters</div>
        </div>

        <div class="final-footer">
          <img src="/logo.png" alt="Campos Muños Law" class="h-10 brightness-0 invert opacity-80" />
          <span>An operational transformation concept</span>
          <button type="button" @click="goTo('vision')">Back to the beginning <DemoIcon :icon="faArrowUp" /></button>
        </div>
      </div>
    </section>
  </div>
</template>

<script>
// Module scope: survives the component unmounting when the tab changes.
let savedScroll = 0
</script>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted, onBeforeUnmount } from 'vue'
import {
  faArrowDown, faArrowRight, faArrowUp, faCheck, faChevronDown, faClock, faCodeBranch, faLayerGroup,
  faLink, faLock, faPlay, faRotateLeft, faShieldHalved, faSpinner, faUsers,
} from '@fortawesome/free-solid-svg-icons'
import { faGoogle } from '@fortawesome/free-brands-svg-icons'
import DemoIcon from './DemoIcon.vue'
import LeadList from './LeadList.vue'
import LeadDetail from './LeadDetail.vue'
import DemoDashboard from './DemoDashboard.vue'
import { CHANNELS } from '../data/model.js'
import { SOURCE_FUNNEL } from '../data/dashboard.js'
import {
  CHAPTERS, PILLARS, MANUAL_CHAIN, FUNNEL_JOURNEY, ATTRIBUTION_PATH, IMPACT, PHASES,
  PROTECT_RULES, JUDGMENT_RULES, SYSTEMS,
} from '../data/strategy.js'
import { state, actions, selectedLead } from '../useOpsDemo.js'

const emit = defineEmits(['openList'])

const pillar = ref(0)
const vision = ref('future')

// The campaign name comes from Maria's record so the deck and the demo agree.
const mariaCampaign = computed(() =>
  state.leads.find(l => l.id === 'maria-rodriguez')?.attribution.campaign || 'Family Immigration - Search')

// Section 04 opens on Maria so the story is on screen without a click.
if (!state.selectedId) actions.select('maria-rodriguez')

function resetMaria() {
  actions.stopPlaying()
  actions.resetLead('maria-rodriguez')
  actions.select('maria-rodriguez')
}

function openList(preset) {
  emit('openList', preset)
}

// --- Chapter navigation ------------------------------------------------------
// The deck scrolls inside the app shell, not the window, so links scroll this
// container directly rather than relying on #hash jumps.
const scroller = ref(null)
const chapterNav = ref(null)
const active = ref('vision')
const navLinks = ref(null)

// On a phone the chapter row scrolls sideways; keep the current one in view.
// Adjusts only the row's own scrollLeft, never the page.
watch(active, () => {
  const row = navLinks.value
  const btn = row?.querySelector('.active')
  if (!row || !btn || row.scrollWidth <= row.clientWidth) return
  const left = btn.offsetLeft - row.offsetLeft
  if (left < row.scrollLeft || left + btn.offsetWidth > row.scrollLeft + row.clientWidth) {
    row.scrollLeft = Math.max(0, left - 16)
  }
}, { flush: 'post' })
const reduceMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

function goTo(id) {
  const el = scroller.value?.querySelector(`#${id}`)
  if (!el) return
  const offset = (chapterNav.value?.offsetHeight || 0) - 1
  scroller.value.scrollTo({ top: el.offsetTop - offset, behavior: reduceMotion ? 'auto' : 'smooth' })
}

// Remember where the presenter was, so a detour to the Dashboard tab and back
// returns to the same slide instead of the top of the deck.
onBeforeUnmount(() => { savedScroll = scroller.value?.scrollTop || 0 })

let observer = null
onMounted(() => {
  if (savedScroll) scroller.value.scrollTop = savedScroll
  if (!('IntersectionObserver' in window)) return
  observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting && CHAPTERS.some(c => c.id === entry.target.id)) active.value = entry.target.id
    }
  }, { root: scroller.value, rootMargin: '-18% 0px -62% 0px', threshold: 0 })
  CHAPTERS.forEach(c => {
    const el = scroller.value.querySelector(`#${c.id}`)
    if (el) observer.observe(el)
  })
})
onUnmounted(() => observer?.disconnect())

// Arrow-key movement between tabs, per the WAI-ARIA tabs pattern.
function onTabKey(event, count, select) {
  const keys = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }
  if (!(event.key in keys) && event.key !== 'Home' && event.key !== 'End') return
  const tabs = [...event.currentTarget.querySelectorAll('[role="tab"]')]
  const current = tabs.indexOf(document.activeElement)
  if (current < 0) return
  event.preventDefault()
  let next = current + (keys[event.key] || 0)
  if (event.key === 'Home') next = 0
  if (event.key === 'End') next = count - 1
  next = (next + count) % count
  select(next)
  tabs[next].focus()
}
</script>

<style scoped>
/* Palette and type from the strategy draft, set in the site's own families:
   Playfair Display for display type (as the admin header uses) and Inter for
   everything else. Small text uses --muted, chosen to clear 4.5:1 on white;
   the draft's lighter greys are kept only for rules and decoration. */
.strategy {
  --navy: #102842;
  --blue: #496f91;
  --text: #596b7b;
  --muted: #53667a;
  --paper: #fafaf7;
  --line: #d9dfe2;
  --rule: #b3c1cb;
  background: var(--paper);
  color: var(--navy);
  font-family: var(--font-ui);
  font-size: 16px;
  line-height: 1.55;
  scroll-padding-top: 64px;
}
/* Plain element selectors compile to this component's scope attribute only,
   so none of these reach the embedded inbox or dashboard. Margin, list and
   button resets come from Tailwind's preflight already. */
p { color: var(--text); }
h1, h2 {
  font-family: var(--font-heading);
  font-weight: 400;
  letter-spacing: -0.03em;
  line-height: 1.08;
}
h2 { font-size: clamp(34px, 4.2vw, 58px); }
h3 { font-size: 22px; line-height: 1.3; font-weight: 500; letter-spacing: -0.02em; }
button:focus-visible, summary:focus-visible { outline: 3px solid #548ab8; outline-offset: 3px; }

.section-wrap { max-width: 1440px; margin: 0 auto; padding: 88px 72px; }

/* Chapter nav */
.s-nav {
  position: sticky; top: 0; z-index: 20;
  display: flex; align-items: center; justify-content: space-between; gap: 24px;
  padding: 0 36px; min-height: 60px;
  background: rgba(250, 250, 247, 0.97);
  border-bottom: 1px solid var(--line);
}
.s-nav-links { display: flex; gap: 22px; overflow-x: auto; scrollbar-width: none; }
.s-nav-links button {
  position: relative; white-space: nowrap; font-size: 13px; color: var(--text); padding: 20px 0;
}
.s-nav-num { display: none; }
.s-nav-links button::after {
  content: ""; position: absolute; left: 0; right: 0; bottom: 12px; height: 2px;
  background: var(--navy); transform: scaleX(0); transition: transform 0.2s;
}
.s-nav-links button:hover, .s-nav-links button.active { color: var(--navy); }
.s-nav-links button.active::after { transform: scaleX(1); }
.s-nav-caption { font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; text-align: right; color: var(--muted); white-space: nowrap; }
.s-nav-caption span { display: block; margin-top: 3px; letter-spacing: 0.08em; }

/* Shared pieces */
.eyebrow {
  display: flex; align-items: center; gap: 16px;
  font-size: 12px; font-weight: 600; letter-spacing: 0.18em; text-transform: uppercase; color: var(--blue);
}
.eyebrow > span {
  width: 32px; height: 27px; display: inline-flex; align-items: center; justify-content: center;
  border: 1px solid #cbd6df; border-radius: 3px; font-size: 12px; font-weight: 500; letter-spacing: 0.02em;
  font-variant-numeric: tabular-nums;
}
.section-heading { margin-bottom: 42px; }
.heading-row { display: flex; justify-content: space-between; align-items: flex-end; gap: 50px; margin-top: 25px; }
.heading-row > p { max-width: 365px; font-size: 16px; line-height: 1.75; padding-bottom: 5px; }
.tag {
  display: inline-flex; align-items: center; white-space: nowrap;
  font-size: 11px; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; line-height: 1.25;
  padding: 4px 7px; border-radius: 3px;
  border: 1px solid #dae1e7; background: #f4f6f8; color: #56687a;
}
.tag-blue { background: #edf3f9; color: #335d83; border-color: #dbe7f0; }
.tag-observed { background: #faf1e3; border-color: #e8d8b9; color: #6f4f1f; white-space: normal; }
.small-label { font-size: 12px; font-weight: 600; letter-spacing: 0.13em; text-transform: uppercase; color: var(--muted); }
.small-note { font-size: 12px; line-height: 1.7; margin-top: 15px; color: var(--muted); }

/* 01 · Hero */
.hero { padding-top: 36px; padding-bottom: 24px; }
.hero-topline { display: flex; justify-content: space-between; align-items: center; gap: 16px; }
.proposal-label { font-size: 12px; color: var(--muted); }
.hero-main { display: grid; grid-template-columns: 1.03fr 1fr; gap: 70px; align-items: center; padding: 48px 0 46px; }
.hero h1 { font-size: clamp(56px, 7.3vw, 104px); line-height: 0.98; letter-spacing: -0.035em; }
.hero-subtitle { font-size: 19px; line-height: 1.6; max-width: 450px; margin-top: 28px; }
.text-link {
  display: inline-flex; align-items: center; gap: 24px; margin-top: 26px; padding-bottom: 8px;
  font-size: 13px; font-weight: 600; border-bottom: 1px solid #9daebd;
  transition: border-color 0.2s, gap 0.2s;
}
.text-link:hover { border-color: var(--navy); gap: 28px; }
.hero-visual { padding-top: 30px; }
.hero-diagram-label { font-size: 12px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--muted); text-align: center; margin-bottom: 38px; }
.hero-source-row { display: flex; justify-content: space-around; gap: 12px; font-size: 14px; color: var(--muted); }
.hero-source-row span { min-width: 40%; padding: 12px 18px; text-align: center; background: white; border: 1px solid var(--line); border-radius: 4px; }
.hero-connections { position: relative; width: 60%; height: 42px; margin: auto; border-bottom: 1px solid #a8baca; }
.hero-connections::after { content: ""; position: absolute; left: 50%; bottom: -16px; width: 1px; height: 16px; background: #a8baca; }
.hero-connections > div { position: absolute; top: 0; bottom: 0; border-left: 1px solid #a8baca; }
.hero-connections > div:last-child { right: 0; }
.hero-hub {
  display: flex; align-items: center; gap: 20px; margin-top: 16px; padding: 26px 25px;
  background: var(--navy); color: white; border-radius: 5px;
}
.hub-icon { font-size: 26px; color: #b6c7d6; }
.hero-hub small { display: block; margin-bottom: 5px; font-size: 12px; letter-spacing: 0.16em; text-transform: uppercase; color: #b5c6d7; }
.hero-hub strong { font-family: var(--font-heading); font-size: 25px; font-weight: 400; }
.hero-branches { position: relative; top: 20px; width: 68%; height: 44px; margin: auto; border-top: 1px solid #9eafbf; }
.hero-branches::before { content: ""; position: absolute; top: -21px; left: 50%; height: 20px; border-left: 1px solid #9eafbf; }
.hero-branches > div { position: absolute; top: 0; height: 22px; border-left: 1px solid #9eafbf; }
.hero-branches > div:nth-child(2) { left: 50%; }
.hero-branches > div:nth-child(3) { right: 0; }
.hero-domain-row { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
.hero-domain-row > div { padding: 15px 8px; text-align: center; background: white; border: 1px solid var(--line); border-radius: 3px; }
.hero-domain-row span { display: block; font-size: 12px; color: var(--muted); }
.hero-domain-row strong { display: block; margin: 5px 0; font-family: var(--font-heading); font-size: 23px; font-weight: 400; }
.hero-domain-row small { font-size: 12px; color: var(--muted); }
.judgment-strip {
  display: flex; align-items: center; justify-content: center; gap: 10px; margin-top: 15px; padding: 15px 8px;
  font-size: 12px; color: #3f604f; background: #edf2ee; border: 1px solid #dce5df; border-radius: 3px;
}
.hero-diagram-foot { margin-top: 25px; text-align: center; font-size: 15px; line-height: 1.6; color: var(--muted); }
.hero-bottom { display: grid; grid-template-columns: 1fr 1.1fr; gap: 70px; align-items: center; padding: 27px 0; border-top: 1px solid var(--line); }
.hero-bottom > p { max-width: 460px; font-size: 14px; line-height: 1.8; }
.outcome-strip { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 20px; }
.outcome-strip > div { padding-left: 22px; border-left: 1px solid var(--line); }
.outcome-strip span { display: block; margin-bottom: 6px; font-size: 12px; color: var(--muted); }
.outcome-strip strong { font-size: 13px; line-height: 1.55; font-weight: 500; letter-spacing: 0.04em; text-transform: uppercase; }
.section-footer {
  display: flex; justify-content: space-between; align-items: center; gap: 16px; padding-top: 18px;
  border-top: 1px solid var(--line); font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted);
}
.section-footer button { display: inline-flex; align-items: center; gap: 12px; font-size: 12px; text-transform: none; letter-spacing: 0; color: var(--navy); }

/* 02 · Opportunity */
.opportunity-grid {
  display: grid; grid-template-columns: 1.1fr 1.1fr 0.85fr;
  background: white; border: 1px solid var(--line); border-radius: 5px; overflow: hidden;
}
.today-flow, .tomorrow-flow { padding: 30px; }
.today-flow { border-right: 1px solid var(--line); }
.tomorrow-flow { background: #f1f5f7; }
.opportunity-grid h3 { margin: 15px 0 25px; font-family: var(--font-heading); font-size: 24px; font-weight: 400; line-height: 1.25; }
.manual-chain > li { position: relative; display: flex; align-items: center; gap: 13px; min-height: 46px; }
.manual-chain > li:not(:last-child)::after {
  content: ""; position: absolute; left: 11px; top: 35px; height: 11px; width: 1px; background: var(--rule);
}
.manual-chain span {
  flex-shrink: 0; width: 23px; height: 23px; display: inline-flex; align-items: center; justify-content: center;
  font-size: 11px; color: var(--muted); background: white; border: 1px solid #e0e6ea; border-radius: 50%;
}
.manual-chain p { font-size: 14px; line-height: 1.4; }
.future-flow { display: flex; flex-direction: column; align-items: center; gap: 4px; }
.future-flow > svg { color: #8ea2b3; font-size: 13px; }
.future-flow > div {
  width: 100%; display: flex; justify-content: center; align-items: center; gap: 10px; padding: 9px;
  font-size: 14px; background: white; border: 1px solid #dce4eb; border-radius: 3px;
}
.future-flow > .flow-highlight { padding: 15px; color: white; background: var(--navy); border-color: var(--navy); }
.future-flow > .flow-human { padding: 11px; color: #3d6653; background: #edf3ee; border-color: #d0dfd6; }
.future-flow > .flow-split { gap: 13px; padding: 12px; font-size: 13px; }
.future-flow > .flow-split svg { font-size: 11px; color: #8ea2b3; }
.observed-callout { padding: 30px; background: #f8f4ec; border-left: 1px solid #e6dfd0; }
.big-number {
  margin-top: 35px; font-family: var(--font-heading); font-size: 100px; line-height: 1; letter-spacing: -0.04em;
  color: #6f4f1f; font-variant-numeric: tabular-nums;
}
.big-number > span { margin-left: 10px; font-family: var(--font-ui); font-size: 14px; letter-spacing: 0; color: #7a6446; }
.observed-callout h3 { margin: 12px 0 8px; font-size: 22px; color: #5d4b32; }
.observed-callout p { font-size: 13px; line-height: 1.65; color: #6f5f47; }
.callout-rule { height: 1px; margin: 24px 0; background: #ddd1bc; }
.observed-callout small { display: block; margin-top: 20px; font-size: 12px; line-height: 1.7; color: #74644d; }
.context-note { display: grid; grid-template-columns: 230px 1fr; gap: 30px; margin-top: 27px; }
.context-note span { padding-top: 4px; font-size: 12px; font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase; color: #46657d; }
.context-note p { font-size: 14px; line-height: 1.75; }

/* 03 · The system (navy band) */
.model-section { background: var(--navy); color: #f1f5f8; }
.model-section .eyebrow { color: #a1b9d0; }
.model-section .eyebrow > span { border-color: #526b80; }
.model-section .heading-row > p { color: #b4c3d0; font-size: 15px; }
.pillar-list {
  display: grid; grid-template-columns: repeat(6, minmax(0, 1fr));
  border-top: 1px solid #496078; border-bottom: 1px solid #496078;
}
.pillar-trigger {
  position: relative; display: flex; flex-direction: column; align-items: flex-start; text-align: left;
  min-height: 176px; padding: 24px 18px 27px; color: #e0e8ef;
  border-right: 1px solid #496078; transition: background-color 0.2s, color 0.2s;
}
.pillar-trigger:last-child { border-right: 0; }
.pillar-trigger:hover { background: #1a3853; }
.pillar-trigger.active { background: #f5f7f8; color: var(--navy); }
.pillar-index { display: flex; justify-content: space-between; align-items: center; width: 100%; margin-bottom: 23px; font-size: 12px; color: #90abc2; }
.pillar-index svg { font-size: 17px; }
.pillar-trigger.active .pillar-index { color: #46708f; }
.pillar-trigger strong { max-width: 140px; font-size: 16px; line-height: 1.3; font-weight: 500; }
.pillar-short { margin-top: 8px; font-size: 12px; line-height: 1.4; color: #a9bdce; }
.pillar-trigger.active .pillar-short { color: #56708a; }
.pillar-detail {
  display: grid; grid-template-columns: 0.85fr 1.15fr; gap: 55px; min-height: 245px; padding: 38px 35px;
  background: #f5f7f8; color: var(--navy);
}
.light-kicker { font-size: 12px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--muted); }
.pillar-detail h3 { margin: 12px 0 15px; font-family: var(--font-heading); font-size: 26px; font-weight: 400; line-height: 1.25; }
.pillar-detail p { font-size: 14px; line-height: 1.7; }
.check-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px 20px; padding: 5px 0; }
.check-grid li { display: flex; align-items: flex-start; gap: 10px; font-size: 14px; line-height: 1.5; }
.check-grid svg { flex-shrink: 0; margin-top: 4px; font-size: 12px; color: #4d7582; }
.validation { display: flex; align-items: flex-start; gap: 12px; margin-top: 20px; padding-top: 15px; border-top: 1px solid #dce3e7; font-size: 12px; line-height: 1.6; color: var(--muted); }
.validation .tag { background: transparent; border-color: #b4c2cd; color: #56687a; }
.model-foundation { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 16px 20px; margin-top: 24px; font-size: 12px; color: #b4c6d4; }
.model-foundation > span { display: flex; align-items: center; gap: 10px; }

/* 04 · Working demo */
.demo-section { padding-bottom: 58px; }
.demo-intro { display: flex; justify-content: space-between; align-items: center; gap: 40px; margin-bottom: 22px; }
.demo-intro > p { max-width: 690px; font-size: 14px; }
.demo-intro strong { font-weight: 600; color: var(--navy); }
.play-button {
  flex-shrink: 0; display: inline-flex; align-items: center; gap: 10px; padding: 11px 18px;
  font-size: 13px; font-weight: 600; color: white; background: var(--navy); border-radius: 6px;
  transition: background-color 0.2s;
}
.play-button:hover:not(:disabled) { background: #1c3d5e; }
.play-button:disabled { opacity: 0.75; cursor: default; }
.demo-frame { background: white; border: 1px solid #cbd6df; border-radius: 6px; overflow: hidden; }
.demo-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 20px; padding: 16px 24px; border-bottom: 1px solid #dce3e9; }
.demo-title { display: flex; align-items: center; gap: 20px; min-width: 0; }
.toolbar-divider { width: 1px; height: 28px; background: #dce3e9; }
.demo-title > strong { font-family: var(--font-heading); font-size: 17px; font-weight: 400; color: #003f8d; white-space: nowrap; }
.toolbar-actions { display: flex; align-items: center; gap: 17px; }
.reset-button { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: var(--muted); padding: 6px 4px; }
.reset-button:hover { color: var(--navy); }
.demo-panes { display: flex; height: 680px; background: #f0f2f7; }
.demo-list { width: 100%; flex-direction: column; min-height: 0; }
.demo-detail { flex: 1; flex-direction: column; min-width: 0; min-height: 0; }
@media (min-width: 1024px) { .demo-list { width: 360px; flex-shrink: 0; } }
.demo-note { padding: 12px 24px; font-size: 12px; color: var(--muted); border-top: 1px solid #edf0f3; }
.demo-takeaway { display: flex; justify-content: space-between; gap: 25px; margin-top: 34px; padding: 0 10px; }
.demo-takeaway > span { padding-top: 9px; font-size: 12px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--muted); white-space: nowrap; }
.demo-takeaway h3 { font-family: var(--font-heading); font-size: 25px; font-weight: 400; line-height: 1.4; }

/* 05 · Visibility */
.visibility-section { background: #edf2f5; border-block: 1px solid #dce5eb; }
.funnel-layout { display: grid; grid-template-columns: 0.7fr 1.3fr; gap: 55px; max-width: 1100px; margin: auto; }
.funnel-stages { display: flex; flex-direction: column; align-items: center; gap: 10px; padding-top: 8px; }
.funnel-stage { display: flex; align-items: center; gap: 26px; width: 100%; min-height: 63px; padding: 12px 23px; background: #dce6ee; color: #2f5068; }
.funnel-stage:nth-child(2) { width: 93%; background: #cbdce8; }
.funnel-stage:nth-child(3) { width: 86%; background: #b1c8da; color: #22425a; }
.funnel-stage:nth-child(4) { width: 79%; background: #4a7091; color: white; }
.funnel-stage:nth-child(5) { width: 72%; background: #416987; color: white; }
.funnel-stage:nth-child(6) { width: 65%; background: #163c59; color: white; }
.funnel-stage > span { font-size: 12px; opacity: 0.8; font-variant-numeric: tabular-nums; }
.funnel-stage > strong { font-size: 15px; font-weight: 500; letter-spacing: 0.02em; }
.attribution-story { padding: 28px 30px; background: white; border: 1px solid #d4e0e7; border-radius: 4px; }
.panel-title { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; margin-bottom: 22px; }
.attribution-source { display: flex; align-items: center; gap: 13px; padding-bottom: 23px; border-bottom: 1px solid #e4eaf0; }
.source-monogram { width: 42px; height: 42px; display: inline-flex; align-items: center; justify-content: center; font-size: 18px; color: var(--navy); background: #eff4f9; border: 1px solid #dae4ed; }
.attribution-source > div { flex: 1; min-width: 0; }
.attribution-source strong { font-size: 15px; font-weight: 500; }
.attribution-source p { margin-top: 3px; font-size: 12px; color: var(--muted); }
.attribution-path { padding-top: 21px; }
.attribution-path > li { position: relative; display: flex; gap: 16px; padding-bottom: 20px; }
.attribution-path > li:not(:last-child)::before { content: ""; position: absolute; left: 12px; top: 25px; bottom: 0; width: 1px; background: #d5e2eb; }
.attribution-path > li > span { flex-shrink: 0; width: 25px; height: 25px; display: inline-flex; align-items: center; justify-content: center; font-size: 11px; color: #46708f; background: #f3f7fa; border-radius: 50%; }
.path-dot { width: 5px; height: 5px; background: #7e99ad; border-radius: 50%; }
.attribution-path strong { font-size: 14px; font-weight: 500; }
.attribution-path p { margin-top: 4px; font-size: 12px; color: var(--muted); }
.source-preserved { display: flex; align-items: center; flex-wrap: wrap; gap: 9px; padding: 11px; font-size: 12px; color: #3f6485; background: #eff4f8; border: 1px solid #dbe6ef; border-radius: 3px; }
.source-preserved > span { margin-left: auto; color: var(--muted); }
.channel-row { display: flex; justify-content: center; flex-wrap: wrap; gap: 14px 48px; margin-top: 33px; font-size: 12px; color: #4f687b; }
.channel-row > li { display: flex; align-items: center; gap: 10px; }
.channel-row svg { color: #6b8294; }

/* 06 · Intelligence */
.data-disclosure { max-width: 760px; margin: -18px 0 24px; font-size: 13px; line-height: 1.7; }
.data-disclosure strong { color: var(--navy); }

/* 07 · Impact */
.impact-section { background: #f1f2ee; border-block: 1px solid #e0e3dd; }
.impact-section .section-wrap { padding-top: 65px; padding-bottom: 65px; }
.impact-section h2 { margin-top: 24px; }
.impact-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 28px; margin-top: 44px; }
.impact-grid > div { padding-top: 19px; border-top: 1px solid #bac9cf; }
.impact-grid > div > span { font-size: 12px; letter-spacing: 0.08em; color: var(--muted); }
.impact-grid h3 { max-width: 230px; min-height: 64px; margin: 15px 0 17px; font-family: var(--font-heading); font-size: 24px; font-weight: 400; }
.impact-grid p { font-size: 14px; line-height: 1.8; }

/* 08 · Roadmap */
.roadmap-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 20px; align-items: stretch; }
.phase-card { display: flex; flex-direction: column; overflow: hidden; background: white; border: 1px solid #d7e0e5; border-top: 3px solid #365d7d; border-radius: 4px; }
.phase-card:nth-child(2) { border-top-color: #7393aa; }
.phase-card:nth-child(3) { border-top-color: #a4b9c7; }
.phase-top { display: flex; justify-content: space-between; gap: 15px; padding: 25px 25px 0; font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted); }
.phase-top > span:last-child { letter-spacing: 0; text-transform: none; }
.phase-card h3 { max-width: 240px; min-height: 68px; margin: 22px 25px 16px; font-family: var(--font-heading); font-size: 29px; font-weight: 400; line-height: 1.15; }
.phase-label { display: flex; align-items: center; min-height: 30px; margin: 0 25px; padding: 8px 10px; font-size: 11px; letter-spacing: 0.07em; text-transform: uppercase; line-height: 1.5; color: #3f6783; background: #f0f5f8; }
.phase-card ul { flex: 1; display: grid; align-content: start; gap: 15px; padding: 27px 25px; }
.phase-card li { display: flex; align-items: flex-start; gap: 10px; font-size: 13px; line-height: 1.5; color: #56697a; }
.phase-card li svg { flex-shrink: 0; margin-top: 4px; font-size: 11px; color: #6f8f7d; }
.phase-card details { background: #f8fafb; border-top: 1px solid #e0e7ec; }
.phase-card summary { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 18px 25px; font-size: 12px; color: #3f6783; cursor: pointer; list-style: none; }
.phase-card summary::-webkit-details-marker { display: none; }
.phase-card summary svg { font-size: 11px; transition: transform 0.2s; }
.phase-card details[open] summary svg { transform: rotate(180deg); }
.phase-card details > div { padding: 0 25px 22px; font-size: 12px; line-height: 1.8; color: #46637a; }
.phase-card details strong { font-weight: 500; }
.phase-card details p { margin-top: 11px; color: var(--muted); }
.roadmap-note { display: flex; align-items: center; gap: 10px; margin-top: 23px; font-size: 12px; line-height: 1.6; color: var(--muted); }
.roadmap-note svg { flex-shrink: 0; }

/* 09 · Control */
.control-section { background: #edf2f4; border-block: 1px solid #dbe4e9; }
.control-layout { display: grid; grid-template-columns: 1fr 1fr; gap: 100px; }
.shield-emblem { display: flex; align-items: center; justify-content: center; width: 68px; height: 68px; margin: 38px 0 25px; font-size: 28px; color: #4c6a83; background: #e0e9ef; border: 1px solid #bdcdd9; border-radius: 50%; }
.control-section h2 { font-size: clamp(34px, 3.8vw, 52px); }
.control-copy { max-width: 440px; margin-top: 24px; font-size: 15px; line-height: 1.85; }
.control-line { margin-top: 30px; padding-left: 20px; border-left: 2px solid #98acbc; font-family: var(--font-heading); font-size: 21px; line-height: 1.5; color: var(--muted); }
.control-line strong { font-weight: 400; color: #2f5068; }
.control-rules { padding-top: 15px; }
.control-rules > div { margin-bottom: 28px; padding-bottom: 28px; border-bottom: 1px solid #ccd9e0; }
.control-rules ul { display: grid; gap: 20px; margin-top: 21px; }
.control-rules li { display: flex; gap: 15px; font-size: 14px; line-height: 1.65; color: #4d6578; }
.control-rules li svg { flex-shrink: 0; margin-top: 4px; font-size: 13px; color: #6a879b; }
.control-rules .small-note { max-width: 450px; }

/* 10 · Final (navy band) */
.final-section { background: var(--navy); color: #f4f6f8; }
.final-section .section-wrap { padding-top: 76px; padding-bottom: 30px; }
.final-heading { text-align: center; }
.final-heading .eyebrow { justify-content: center; color: #9eb8ce; }
.final-heading .eyebrow > span { border-color: #547189; }
.final-heading h2 { margin-top: 30px; font-size: clamp(36px, 4.4vw, 62px); }
.final-heading > p { max-width: 550px; margin: 24px auto 0; font-size: 15px; line-height: 1.8; color: #b3c7d7; }
.view-toggle { display: flex; width: max-content; gap: 3px; margin: 34px auto 30px; padding: 4px; background: #173550; border: 1px solid #3b5870; border-radius: 4px; }
.view-toggle button { padding: 8px 24px; font-size: 12px; color: #c2d2df; border-radius: 2px; transition: background-color 0.2s, color 0.2s; }
.view-toggle button.active { background: #e3ecf3; color: #254762; }
.final-diagram { max-width: 900px; min-height: 359px; margin: 0 auto; }
.system-chips { display: flex; justify-content: center; flex-wrap: wrap; gap: 9px; }
.system-chips > span { padding: 9px 16px; font-size: 12px; color: #c2d2df; border: 1px solid #46627a; border-radius: 3px; }
.diagram-join { width: 1px; height: 28px; margin: auto; background: #68879e; }
.diagram-join.dashed { background: transparent; border-left: 1px dashed #8ba1b2; }
.operations-hub {
  display: flex; align-items: center; justify-content: center; gap: 20px; width: 460px; max-width: 100%; margin: auto;
  padding: 21px 25px; color: #294b67; background: #f0f4f7; border: 1px solid #d0dce6; border-radius: 3px;
}
.operations-hub > svg { font-size: 24px; }
.operations-hub > div { flex: 1; }
.operations-hub > div > span { display: block; margin-bottom: 6px; font-size: 12px; letter-spacing: 0.16em; text-transform: uppercase; color: #4a6479; }
.operations-hub strong { font-family: var(--font-heading); font-size: 28px; font-weight: 400; line-height: 1.2; }
.operations-hub .tag { background: transparent; border-color: #b0c2d0; color: #56708a; }
.operations-hub.manual { width: 550px; color: #d4e0e9; background: #1c3a53; border-color: #526e83; }
.operations-hub.manual > div > span { margin: 10px 0 0; font-size: 12px; letter-spacing: 0; text-transform: none; color: #b3c7d7; }
.operations-hub.manual strong { font-size: 25px; }
.branch-line { position: relative; width: 58%; height: 33px; margin: auto; border-bottom: 1px solid #64839a; }
.branch-line::before { content: ""; position: absolute; left: 50%; width: 1px; height: 100%; background: #64839a; }
.three-domains { display: flex; justify-content: space-between; gap: 15px; max-width: 76%; margin: 22px auto 0; }
.three-domains > span {
  position: relative; width: 30%; padding: 13px; text-align: center;
  font-family: var(--font-heading); font-size: 23px; color: #d9e4ed; background: #173650; border: 1px solid #54738b; border-radius: 3px;
}
.three-domains > span::before { content: ""; position: absolute; top: -23px; left: 50%; width: 1px; height: 22px; background: #64839a; }
.human-center { display: flex; align-items: center; justify-content: center; gap: 10px; max-width: 400px; margin: 23px auto 0; padding-top: 18px; font-size: 13px; color: #b3d1c3; border-top: 1px solid #36516a; }
.diagram-caption { margin-top: 30px; text-align: center; font-size: 13px; color: #a8bfd1; }
.final-footer { display: flex; justify-content: space-between; align-items: center; gap: 25px; margin-top: 30px; padding-top: 28px; border-top: 1px solid #365069; }
.final-footer > span { font-size: 12px; letter-spacing: 0.1em; text-transform: uppercase; color: #9db3c6; }
.final-footer button { display: inline-flex; align-items: center; gap: 10px; font-size: 12px; color: #c2d2df; }
.final-footer button:hover { color: white; }

/* Laptop */
@media (max-width: 1200px) {
  .section-wrap { padding: 65px 38px; }
  .s-nav { padding: 0 24px; }
  .s-nav-caption { display: none; }
  .hero-main, .hero-bottom { gap: 35px; }
  .today-flow, .tomorrow-flow, .observed-callout { padding: 24px; }
  .big-number { font-size: 88px; }
  .pillar-trigger { padding: 22px 12px; }
  .pillar-trigger strong { font-size: 14px; }
  .pillar-detail { gap: 30px; padding: 30px; }
  .control-layout { gap: 65px; }
}

/* Tablet */
@media (max-width: 960px) {
  .s-nav-num { display: inline; margin-right: 6px; color: var(--muted); }
  .hero-main, .hero-bottom, .funnel-layout, .control-layout, .context-note { grid-template-columns: minmax(0, 1fr); }
  .heading-row { flex-direction: column; align-items: flex-start; gap: 20px; }
  .opportunity-grid { grid-template-columns: 1fr 1fr; }
  .observed-callout { grid-column: 1 / -1; border-left: 0; border-top: 1px solid #e6dfd0; }
  .pillar-list { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .pillar-trigger { min-height: 150px; border-bottom: 1px solid #496078; }
  .pillar-trigger:nth-child(3n) { border-right: 0; }
  .pillar-detail { grid-template-columns: minmax(0, 1fr); gap: 20px; }
  .impact-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .roadmap-grid { grid-template-columns: minmax(0, 1fr); }
  .phase-card h3 { min-height: 0; }
  .demo-intro { flex-direction: column; align-items: flex-start; gap: 15px; }
  .demo-takeaway { flex-direction: column; gap: 8px; padding: 0; }
}

/* Phone */
@media (max-width: 640px) {
  .section-wrap { padding: 48px 16px; }
  .s-nav { padding: 0 16px; }
  .hero-topline { flex-direction: column; align-items: flex-start; }
  .hero-subtitle { font-size: 16px; }
  .hero-source-row { font-size: 12px; }
  .hero-source-row span { padding: 10px 8px; }
  .hero-hub { padding: 20px 16px; gap: 14px; }
  .hero-hub strong { font-size: 21px; }
  .hero-domain-row { gap: 6px; }
  .hero-domain-row strong { font-size: 18px; }
  .hero-domain-row small { font-size: 11px; }
  .outcome-strip { grid-template-columns: minmax(0, 1fr); gap: 12px; }
  .section-footer { flex-direction: column; align-items: flex-start; }
  .opportunity-grid { grid-template-columns: minmax(0, 1fr); }
  .today-flow { border-right: 0; border-bottom: 1px solid var(--line); }
  .big-number { font-size: 76px; }
  .pillar-list { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .pillar-trigger:nth-child(3n) { border-right: 1px solid #496078; }
  .pillar-trigger:nth-child(2n) { border-right: 0; }
  .pillar-detail { padding: 24px 18px; }
  .check-grid { grid-template-columns: minmax(0, 1fr); }
  .validation { flex-direction: column; }
  .demo-toolbar { padding: 12px 16px; }
  .toolbar-divider, .demo-title > strong, .toolbar-actions .tag { display: none; }
  .demo-panes { height: 620px; }
  .funnel-stage { gap: 14px; padding-inline: 16px; }
  .attribution-story { padding: 22px 18px; }
  .attribution-source > .tag { display: none; }
  .impact-grid { grid-template-columns: minmax(0, 1fr); }
  .impact-grid h3 { min-height: 0; }
  .operations-hub, .operations-hub.manual { width: 100%; padding: 18px; gap: 14px; }
  .operations-hub strong { font-size: 22px; }
  .three-domains { max-width: 100%; gap: 8px; }
  .three-domains > span { width: 33%; padding: 10px 4px; font-size: 17px; }
  .final-footer { flex-direction: column; align-items: flex-start; }
}

@media (prefers-reduced-motion: reduce) {
  .text-link, .pillar-trigger, .view-toggle button, .phase-card summary svg, .s-nav-links button::after { transition: none; }
}
</style>
