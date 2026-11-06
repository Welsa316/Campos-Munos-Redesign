<template>
  <div class="h-dvh flex flex-col bg-brand-surface overflow-hidden">
    <PortalHeader title="Team" current="team" />

    <div class="flex-1 overflow-y-auto">
      <div class="max-w-[1180px] mx-auto px-4 sm:px-6 py-6 space-y-5">
        <div class="flex flex-wrap items-end gap-3">
          <div class="min-w-0">
            <h2 class="text-base font-ui font-semibold text-gray-900">People with access</h2>
            <p class="text-xs font-ui text-gray-500 mt-0.5">Roles decide what each person sees. Every change here is recorded in the <router-link :to="{ name: 'Activity' }" class="text-brand-navy underline">activity log</router-link>.</p>
          </div>
          <button v-if="!adding" type="button" @click="openAdd"
            class="ml-auto inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-navy text-white text-sm font-ui font-semibold hover:bg-brand-navy-dark transition-colors">
            <FaIcon name="user-plus" class="text-xs" />Add person
          </button>
        </div>

        <p v-if="error" role="alert" class="text-sm font-ui text-brand-red bg-red-50 rounded-lg px-4 py-3">{{ error }}</p>

        <!-- A new or reset password, shown once. -->
        <section v-if="secret" role="status" class="rounded-xl ring-1 ring-amber-300 bg-amber-50 px-5 py-4 font-ui" aria-labelledby="pw-h">
          <h3 id="pw-h" class="text-sm font-semibold text-gray-900">Temporary password for {{ secret.email }}</h3>
          <p class="text-xs text-gray-700 mt-1">Shown once. Give it to them in person or by phone, not by email, and ask them to change it with the Password button after signing in.</p>
          <div class="mt-3 flex flex-wrap items-center gap-2">
            <code class="px-3 py-2 rounded-lg bg-white ring-1 ring-amber-200 text-sm text-gray-900 font-mono select-all break-all">{{ secret.password }}</code>
            <button type="button" @click="copySecret" class="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold text-brand-navy ring-1 ring-brand-navy/30 hover:bg-white">
              <FaIcon name="copy" />{{ copied === true ? 'Copied' : 'Copy' }}
            </button>
            <button type="button" @click="secret = null" class="px-3 py-2 rounded-lg text-xs font-semibold text-gray-600 hover:bg-white">Done</button>
          </div>
          <p v-if="copied === 'failed'" role="alert" class="mt-2 text-xs text-brand-red">Could not copy it. Select the password above and copy it by hand before closing this.</p>
        </section>

        <!-- Add person -->
        <form v-if="adding" @submit.prevent="create" class="bg-white rounded-xl ring-1 ring-gray-200 px-5 py-4 font-ui" aria-labelledby="add-h">
          <h3 id="add-h" class="text-sm font-semibold text-gray-900">Add person</h3>
          <div class="mt-3 grid grid-cols-[minmax(0,1fr)] md:grid-cols-3 gap-3">
            <div>
              <label for="new-email" class="text-[11px] font-semibold text-gray-700">Email (their sign-in)</label>
              <input id="new-email" ref="emailInput" v-model.trim="draft.email" type="email" required autocomplete="off"
                class="mt-1 w-full text-sm px-3 py-2 rounded-lg border border-gray-300 focus:border-brand-navy focus:outline-none" />
            </div>
            <div>
              <label for="new-name" class="text-[11px] font-semibold text-gray-700">Name colleagues see</label>
              <input id="new-name" v-model.trim="draft.name" type="text" maxlength="60" autocomplete="off"
                class="mt-1 w-full text-sm px-3 py-2 rounded-lg border border-gray-300 focus:border-brand-navy focus:outline-none" />
            </div>
            <div>
              <label for="new-role" class="text-[11px] font-semibold text-gray-700">Role</label>
              <select id="new-role" v-model="draft.role" required
                class="mt-1 w-full text-sm px-3 py-2 rounded-lg bg-white border border-gray-300 focus:border-brand-navy focus:outline-none">
                <option v-for="r in roles" :key="r.key" :value="r.key">{{ r.label }}</option>
              </select>
            </div>
          </div>
          <p class="mt-2 text-[11px] text-gray-500">{{ roleSummary(draft.role) }}</p>
          <div class="mt-3 flex gap-2">
            <button type="submit" :disabled="busy === 'create'" class="px-4 py-2 rounded-lg bg-brand-navy text-white text-sm font-semibold hover:bg-brand-navy-dark disabled:opacity-50">Create account</button>
            <button type="button" @click="adding = false" class="px-4 py-2 rounded-lg text-sm font-semibold text-gray-600 hover:bg-brand-surface">Cancel</button>
          </div>
        </form>

        <p v-if="loading && !accounts.length" class="py-12 text-center text-sm text-gray-500 font-ui">Loading…</p>

        <section v-if="accounts.length" class="bg-white rounded-xl ring-1 ring-gray-200 font-ui" aria-label="Accounts">
          <!-- Column heads: wide screens only; below, each person is a card. -->
          <div class="hidden lg:grid grid-cols-[minmax(0,2.4fr)_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_auto] gap-4 px-5 py-2.5 border-b border-gray-100 text-[10px] uppercase tracking-[0.1em] text-gray-500 font-semibold">
            <span>Person</span><span>Role</span><span>Access</span><span>Last active</span><span class="w-[164px]"></span>
          </div>
          <ul class="divide-y divide-gray-100">
            <li v-for="a in accounts" :key="a.id" :class="a.disabled ? 'bg-gray-50/70' : ''">
              <div class="grid grid-cols-[minmax(0,1fr)_auto] lg:grid-cols-[minmax(0,2.4fr)_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_auto] gap-x-4 gap-y-3 items-center px-4 sm:px-5 py-4">
                <div class="flex items-center gap-3 min-w-0" :class="a.disabled ? 'opacity-60' : ''">
                  <UserAvatar :avatar="a.avatar" :size="36" :label="''" />
                  <div class="min-w-0">
                    <p class="text-sm font-semibold text-gray-900 truncate">
                      {{ a.displayName || a.email.split('@')[0] }}
                      <span v-if="isMe(a)" class="ml-1 align-middle text-[10px] font-semibold uppercase tracking-[0.1em] text-brand-navy bg-brand-navy/10 px-1.5 py-0.5 rounded">You</span>
                    </p>
                    <p class="text-xs text-gray-500 truncate">{{ a.email }}</p>
                  </div>
                </div>

                <!-- Phone: status beside the name, the rest below. -->
                <span class="lg:hidden justify-self-end"><AccessChip :account="a" /></span>

                <div class="col-span-2 lg:col-span-1">
                  <label :for="`role-${a.id}`" class="lg:sr-only text-[11px] font-semibold text-gray-700">Role</label>
                  <select :id="`role-${a.id}`" :value="a.role" :disabled="isMe(a) || Boolean(busy)"
                    @change="askRole(a, $event.target.value); $event.target.value = a.role"
                    :title="isMe(a) ? 'You can’t change your own role here' : ''"
                    class="mt-1 lg:mt-0 w-full text-sm px-3 py-2 rounded-lg bg-white border border-gray-300 focus:border-brand-navy focus:outline-none disabled:bg-gray-50 disabled:text-gray-500">
                    <option v-for="r in roles" :key="r.key" :value="r.key">{{ r.label }}</option>
                  </select>
                  <p v-if="overrideCount(a)" class="mt-1 text-[11px] text-gray-500">+ {{ overrideCount(a) }} permission change{{ overrideCount(a) === 1 ? '' : 's' }}</p>
                </div>

                <span class="hidden lg:block"><AccessChip :account="a" /></span>

                <p class="col-span-2 lg:col-span-1 text-xs text-gray-600">
                  <template v-if="a.lastActiveAt"><span class="lg:hidden text-gray-500">Last active </span><span :title="fullTime(a.lastActiveAt)" class="tabular-nums">{{ relative(a.lastActiveAt) }}</span></template>
                  <template v-else><span title="Nothing in the activity log yet (the log started with this release)">No activity yet</span></template>
                </p>

                <div class="col-span-2 lg:col-span-1 flex items-center gap-1 lg:w-[164px] lg:justify-end">
                  <router-link :to="{ name: 'Activity', query: { actor: a.id } }"
                    class="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-gray-600 hover:text-brand-navy hover:bg-brand-surface">
                    <FaIcon name="clock-rotate-left" />Activity
                  </router-link>
                  <button type="button" @click="toggle(a.id)" :aria-expanded="openId === a.id" :aria-controls="`manage-${a.id}`"
                    class="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-brand-navy hover:bg-brand-surface">
                    Manage<FaIcon :name="openId === a.id ? 'chevron-up' : 'chevron-down'" class="text-[9px]" />
                  </button>
                </div>
              </div>

              <!-- Confirming a role change -->
              <div v-if="pending?.id === a.id && pending.kind === 'role'" role="alertdialog" :aria-labelledby="`cr-${a.id}`" v-alert-focus
                @keydown.esc.stop="pending = null"
                class="mx-4 sm:mx-5 mb-4 rounded-lg ring-1 ring-brand-navy/20 bg-brand-surface px-4 py-3 text-[13px]">
                <p :id="`cr-${a.id}`" class="font-semibold text-gray-900">Make {{ nameOf(a) }} {{ roleLabel(pending.role) }}?</p>
                <p class="mt-1 text-gray-700">{{ roleSummary(pending.role) }} It applies on their next click; any permission changes made for them stay.</p>
                <div class="mt-3 flex gap-2">
                  <button type="button" @click="confirmRole(a)" :disabled="Boolean(busy)" class="px-3 py-1.5 rounded-lg bg-brand-navy text-white font-semibold disabled:opacity-50">Change role</button>
                  <button type="button" data-autofocus @click="pending = null" class="px-3 py-1.5 rounded-lg text-gray-700 hover:bg-white">Cancel</button>
                </div>
              </div>

              <!-- Manage: access, password, sessions, single permissions -->
              <div v-if="openId === a.id" :id="`manage-${a.id}`" class="px-4 sm:px-5 pb-5 space-y-4">
                <div class="flex flex-wrap gap-2">
                  <button v-if="!a.disabled" type="button" @click="ask(a, 'disable')" :disabled="isMe(a) || Boolean(busy)"
                    class="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold text-brand-red ring-1 ring-red-200 hover:bg-red-50 disabled:opacity-40">
                    <FaIcon name="ban" />Revoke access
                  </button>
                  <button v-else type="button" @click="run(a, 'enable')" :disabled="Boolean(busy)"
                    class="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold text-green-800 ring-1 ring-green-300 hover:bg-green-50 disabled:opacity-40">
                    <FaIcon name="circle-check" />Restore access
                  </button>
                  <button type="button" @click="ask(a, 'reset-password')" :disabled="isMe(a) || Boolean(busy)"
                    class="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold text-gray-700 ring-1 ring-gray-300 hover:bg-brand-surface disabled:opacity-40">
                    <FaIcon name="key" />Reset password
                  </button>
                  <button type="button" @click="ask(a, 'sign-out')" :disabled="isMe(a) || Boolean(busy)"
                    class="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold text-gray-700 ring-1 ring-gray-300 hover:bg-brand-surface disabled:opacity-40">
                    <FaIcon name="arrow-right-from-bracket" />Sign out everywhere
                  </button>
                  <button type="button" @click="startRename(a)" :disabled="Boolean(busy)"
                    class="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold text-gray-700 ring-1 ring-gray-300 hover:bg-brand-surface disabled:opacity-40">
                    <FaIcon name="pen" />Rename
                  </button>
                </div>
                <p v-if="isMe(a)" class="text-[11px] text-gray-500">Your own role and access can't be changed here, so one click can't lock the firm out. Use the Password button to change your password.</p>

                <form v-if="renaming === a.id" @submit.prevent="rename(a)" class="flex flex-wrap items-end gap-2">
                  <div>
                    <label :for="`name-${a.id}`" class="text-[11px] font-semibold text-gray-700">Name colleagues see</label>
                    <input :id="`name-${a.id}`" v-model.trim="nameDraft" maxlength="60" required
                      class="mt-1 block w-64 max-w-full text-sm px-3 py-2 rounded-lg border border-gray-300 focus:border-brand-navy focus:outline-none" />
                  </div>
                  <button type="submit" :disabled="Boolean(busy)" class="px-3 py-2 rounded-lg bg-brand-navy text-white text-xs font-semibold disabled:opacity-50">Save</button>
                  <button type="button" @click="renaming = null" class="px-3 py-2 rounded-lg text-xs font-semibold text-gray-600 hover:bg-brand-surface">Cancel</button>
                </form>

                <!-- Which RingCentral extension is this person: the call log then shows their name. -->
                <div class="flex flex-wrap items-end gap-x-3 gap-y-1">
                  <div>
                    <label :for="`ext-${a.id}`" class="text-[11px] font-semibold text-gray-700">RingCentral extension</label>
                    <select :id="`ext-${a.id}`" :value="a.rcExtensionId || ''" :disabled="Boolean(busy) || !extensions.length"
                      @change="linkExtension(a, $event.target.value, $event)"
                      class="mt-1 block w-64 max-w-full text-sm px-3 py-2 rounded-lg border border-gray-300 bg-white focus:border-brand-navy focus:outline-none disabled:opacity-60">
                      <option value="">Not linked</option>
                      <option v-for="x in extensions" :key="x.id" :value="x.id" :disabled="Boolean(linkedTo(x.id, a))">
                        Ext. {{ x.number }} · {{ x.name }}{{ linkedTo(x.id, a) ? ` (linked to ${nameOf(linkedTo(x.id, a))})` : '' }}
                      </option>
                    </select>
                  </div>
                  <p class="text-[11px] text-gray-500 max-w-md pb-2">{{ extensions.length ? 'Calls offered to this extension show under this person’s name in Calls. RingCentral’s own name for it stays in each call’s details.' : 'The extension list appears after the next call import from RingCentral.' }}</p>
                </div>

                <div v-if="pending?.id === a.id && pending.kind !== 'role'" role="alertdialog" :aria-labelledby="`cf-${a.id}`" v-alert-focus
                  @keydown.esc.stop="pending = null"
                  class="rounded-lg ring-1 ring-red-200 bg-red-50 px-4 py-3 text-[13px]">
                  <p :id="`cf-${a.id}`" class="font-semibold text-gray-900">{{ CONFIRM[pending.kind].title(nameOf(a)) }}</p>
                  <p class="mt-1 text-gray-700">{{ CONFIRM[pending.kind].body }}</p>
                  <div class="mt-3 flex gap-2">
                    <button type="button" @click="run(a, pending.kind)" :disabled="Boolean(busy)" class="px-3 py-1.5 rounded-lg bg-brand-red text-white font-semibold disabled:opacity-50">{{ CONFIRM[pending.kind].action }}</button>
                    <button type="button" data-autofocus @click="pending = null" class="px-3 py-1.5 rounded-lg text-gray-700 hover:bg-white">Cancel</button>
                  </div>
                </div>

                <fieldset class="rounded-lg ring-1 ring-gray-100 p-4">
                  <legend class="px-1 text-[11px] font-semibold text-gray-700">What {{ nameOf(a) }} can do</legend>
                  <p v-if="capStatus.id === a.id" :role="capStatus.ok ? 'status' : 'alert'" :class="capStatus.ok ? 'text-green-700' : 'text-brand-red'" class="text-[11px] font-semibold">{{ capStatus.text }}</p>
                  <p class="text-[11px] text-gray-500">Ticked boxes come from the role unless marked. Untick to take one permission away from this person only; tick to add one.</p>
                  <div class="mt-3 grid grid-cols-[minmax(0,1fr)] md:grid-cols-2 xl:grid-cols-3 gap-x-8 gap-y-4">
                    <div v-for="g in capabilityGroups" :key="g.label">
                    <p class="text-[10px] uppercase tracking-[0.1em] text-gray-500 font-semibold mb-1">{{ g.label }}</p>
                    <label v-for="c in g.items" :key="c.key" class="flex items-start gap-2.5 py-1 text-xs"
                      :class="lockedCap(a, c) ? 'cursor-not-allowed' : 'cursor-pointer'">
                      <input type="checkbox" class="mt-0.5 w-3.5 h-3.5 accent-brand-navy flex-shrink-0" :checked="a.capabilities.includes(c.key)"
                        :disabled="lockedCap(a, c) || Boolean(busy)" @change="toggleCap(a, c, $event)" />
                      <span class="min-w-0">
                        <span class="text-gray-900">{{ c.description }}</span>
                        <span v-if="a.grants.includes(c.key)" class="ml-1 text-[10px] font-semibold text-green-800 bg-green-100 px-1.5 py-0.5 rounded">Added</span>
                        <span v-else-if="a.revokes.includes(c.key)" class="ml-1 text-[10px] font-semibold text-brand-red bg-red-50 px-1.5 py-0.5 rounded">Removed</span>
                      </span>
                    </label>
                    </div>
                  </div>
                  <button v-if="overrideCount(a)" type="button" @click="run(a, 'clear-overrides')" :disabled="Boolean(busy)"
                    class="mt-3 text-xs font-semibold text-brand-navy underline disabled:opacity-50">Back to exactly what the role gives</button>
                </fieldset>
              </div>
            </li>
          </ul>
        </section>
        <p v-if="saved" role="status" class="sr-only">{{ saved }}</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, nextTick, onMounted, defineComponent, h } from 'vue'
import { useApi } from '../../composables/useApi.js'
import { useAuth } from '../../composables/useAuth.js'
import PortalHeader from '../../components/portal/PortalHeader.vue'
import UserAvatar from '../../components/UserAvatar.vue'
import FaIcon from '../../components/FaIcon.vue'
import { vAlertFocus } from '../../directives/alertFocus.js'

const { get, post, put } = useApi()
const { adminEmail } = useAuth()

const accounts = ref([])
const roles = ref([])
const capabilities = ref([])
const loading = ref(true)
const busy = ref('')
const error = ref('')
const saved = ref('')
const openId = ref(null)
const pending = ref(null)
const secret = ref(null)
const copied = ref(false)
const adding = ref(false)
const renaming = ref(null)
const nameDraft = ref('')
const emailInput = ref(null)
const draft = reactive({ email: '', name: '', role: 'front_desk' })

const CONFIRM = {
  disable: {
    title: (n) => `Revoke access for ${n}?`,
    body: 'They are signed out at once and can no longer sign in. Their notes, replies and history stay. You can restore access at any time.',
    action: 'Revoke access',
  },
  'reset-password': {
    title: (n) => `Reset ${n}’s password?`,
    body: 'Their current password stops working and they are signed out everywhere. You get a temporary password to give them.',
    action: 'Reset password',
  },
  'sign-out': {
    title: (n) => `Sign ${n} out everywhere?`,
    body: 'Every open session ends; they can sign in again with their password. Use this if a computer was left signed in.',
    action: 'Sign out',
  },
}

// Small status chip, used in the row and on the phone card.
const AccessChip = defineComponent({
  props: { account: { type: Object, required: true } },
  setup: (props) => () => props.account.disabled
    ? h('span', { class: 'inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-red-50 text-brand-red ring-1 ring-red-200' }, 'Access revoked')
    : h('span', { class: 'inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-green-50 text-green-800 ring-1 ring-green-200' }, 'Active'),
})

const isMe = (a) => a.email.toLowerCase() === String(adminEmail.value || '').toLowerCase()
const nameOf = (a) => a.displayName || a.email.split('@')[0]
const roleLabel = (key) => roles.value.find((r) => r.key === key)?.label ?? key
const overrideCount = (a) => a.grants.length + a.revokes.length
// Admin-only permissions come with the admin role and nowhere else; your
// own permissions can't be taken away here.
const lockedCap = (a, c) => (c.adminOnly && a.role !== 'admin') || (isMe(a) && a.capabilities.includes(c.key))

// The permission list, by area. Administrator-only ones get their own group.
const GROUPS = [
  { label: 'Website leads', test: (c) => !c.adminOnly && c.key.startsWith('crm.') },
  { label: 'WhatsApp', test: (c) => !c.adminOnly && c.key.startsWith('whatsapp.') },
  { label: 'Calls', test: (c) => !c.adminOnly && c.key.startsWith('calls.') },
  { label: 'Billing', test: (c) => !c.adminOnly && c.key.startsWith('billing.') },
  { label: 'Administrators only', test: (c) => c.adminOnly },
]
const capabilityGroups = computed(() => GROUPS
  .map((g) => ({ label: g.label, items: capabilities.value.filter(g.test) }))
  .filter((g) => g.items.length))

const ROLE_SUMMARY = {
  admin: 'Everything, including integrations, the monday.com board setup, Team and the activity log.',
  front_desk: 'Website leads, WhatsApp, calls and payment status.',
  receptionist: 'Calls, WhatsApp, and website leads to read (no replies or changes).',
  billing_paralegal: 'Billing imports, sync, reminders and WhatsApp. No website leads.',
  staff: 'Website leads and billing to read (the original view-only login).',
}
const roleSummary = (key) => ROLE_SUMMARY[key] || ''

function relative(d) {
  const mins = Math.round((Date.now() - new Date(d).getTime()) / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins} min ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs} h ago`
  const days = Math.round(hrs / 24)
  return days === 1 ? 'Yesterday' : days < 30 ? `${days} days ago` : new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
const fullTime = (d) => new Date(d).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'medium' })

async function load() {
  loading.value = true
  try {
    const data = await get('/api/team')
    accounts.value = data.accounts
    roles.value = data.roles
    capabilities.value = data.capabilities
    extensions.value = data.extensions || []
  } catch (err) {
    error.value = `Could not load the team: ${err.message}`
  } finally {
    loading.value = false
  }
}

function replace(account) {
  accounts.value = accounts.value.map((a) => (a.id === account.id ? { ...account, lastActiveAt: a.lastActiveAt } : a))
}

async function act(label, fn) {
  busy.value = label
  error.value = ''
  try {
    return await fn()
  } catch (err) {
    error.value = err.message
    return null
  } finally {
    busy.value = ''
  }
}

function toggle(id) {
  openId.value = openId.value === id ? null : id
  pending.value = null
  renaming.value = null
}

function askRole(a, role) {
  if (role === a.role) return
  pending.value = { id: a.id, kind: 'role', role }
}
function ask(a, kind) { pending.value = { id: a.id, kind } }

async function confirmRole(a) {
  const out = await act('role', () => put(`/api/team/${a.id}/role`, { role: pending.value.role }))
  if (out) { replace(out); saved.value = `${nameOf(a)} is now ${out.roleLabel}`; pending.value = null }
}

async function run(a, kind) {
  const out = await act(kind, () => post(`/api/team/${a.id}/${kind}`, {}))
  if (!out) return
  pending.value = null
  if (kind === 'reset-password') { secret.value = { email: a.email, password: out.password }; copied.value = false }
  else if (kind === 'sign-out') saved.value = `${nameOf(a)} is signed out everywhere`
  else { replace(out); saved.value = 'Saved' }
}

async function toggleCap(a, c, event) {
  const has = a.capabilities.includes(c.key)
  // Back to the role's default when that gives the wanted result.
  const state = has ? (a.grants.includes(c.key) ? 'default' : 'revoke') : (a.revokes.includes(c.key) ? 'default' : 'grant')
  const out = await act('cap', () => put(`/api/team/${a.id}/capabilities/${c.key}`, { state }))
  if (out) { replace(out); saved.value = 'Permission saved'; capStatus.value = { id: a.id, ok: true, text: 'Saved' } }
  else {
    // The box was ticked by the click itself; Vue has nothing new to draw, so put it back by hand.
    if (event?.target) event.target.checked = has
    capStatus.value = { id: a.id, ok: false, text: `Not saved: ${error.value}` }
  }
}
// What happened to the last permission change, shown inside that person's box.
const capStatus = ref({ id: null, ok: true, text: '' })

function startRename(a) { renaming.value = a.id; nameDraft.value = a.displayName || '' }
// RingCentral's people extensions; each can be linked to one account.
const extensions = ref([])
const linkedTo = (extId, self) => accounts.value.find((x) => x.id !== self.id && x.rcExtensionId === extId) || null
async function linkExtension(a, extId, event) {
  const out = await act('extension', () => put(`/api/team/${a.id}/extension`, { extensionId: extId || null }))
  if (out) { replace(out); saved.value = extId ? `Linked ${nameOf(a)} to their RingCentral extension` : `Unlinked ${nameOf(a)} from RingCentral` }
  else if (event?.target) event.target.value = a.rcExtensionId || ''
}

async function rename(a) {
  const out = await act('name', () => put(`/api/team/${a.id}/name`, { name: nameDraft.value }))
  if (out) { replace(out); renaming.value = null; saved.value = 'Name saved' }
}

async function openAdd() {
  adding.value = true
  Object.assign(draft, { email: '', name: '', role: 'front_desk' })
  await nextTick()
  emailInput.value?.focus()
}

async function create() {
  const out = await act('create', () => post('/api/team', { ...draft }))
  if (!out) return
  accounts.value = [...accounts.value, out.account]
  secret.value = { email: out.account.email, password: out.password }
  copied.value = false
  adding.value = false
}

// true once copied, 'failed' when the browser refused (the password is
// shown once, so a silent failure would lose it).
async function copySecret() {
  try { await navigator.clipboard.writeText(secret.value.password); copied.value = true } catch { copied.value = 'failed' }
}

onMounted(load)
</script>
