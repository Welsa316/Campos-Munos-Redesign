<template>
  <div class="h-full flex flex-col bg-white">
    <!-- Empty state -->
    <div v-if="!submission" class="flex-1 flex items-center justify-center">
      <div class="text-center">
        <i class="fa-solid fa-envelope-open text-4xl text-gray-200 mb-4"></i>
        <p class="text-gray-400 font-[var(--font-ui)] text-sm">Select a message to view</p>
      </div>
    </div>

    <template v-else>
      <!-- Contact info header -->
      <div class="p-6 border-b border-gray-100 flex-shrink-0">
        <div class="flex items-start justify-between">
          <div>
            <h2 class="font-[var(--font-heading)] text-2xl text-gray-900 mb-1">{{ submission.name }}</h2>
            <div class="flex items-center gap-4 text-sm font-[var(--font-ui)]">
              <a :href="'mailto:' + submission.email" class="text-brand-navy hover:text-brand-navy-light transition-colors">
                <i class="fa-solid fa-envelope mr-1.5 text-xs"></i>{{ submission.email }}
              </a>
              <a :href="'tel:' + submission.phone" class="text-brand-navy hover:text-brand-navy-light transition-colors">
                <i class="fa-solid fa-phone mr-1.5 text-xs"></i>{{ submission.phone }}
              </a>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <span v-if="!submission.is_read" class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-brand-red/10 text-brand-red text-xs font-[var(--font-ui)] font-medium">
              <span class="w-1.5 h-1.5 rounded-full bg-brand-red"></span>
              Unread
            </span>
            <!-- Back button for mobile -->
            <button v-if="showBack" @click="$emit('back')" class="p-2 rounded-lg text-gray-400 hover:text-brand-navy hover:bg-brand-surface transition-colors lg:hidden">
              <i class="fa-solid fa-arrow-left"></i>
            </button>
          </div>
        </div>
      </div>

      <!-- Conversation thread -->
      <div class="flex-1 overflow-y-auto p-6 space-y-4">
        <!-- Original message -->
        <div class="max-w-[85%]">
          <div class="bg-brand-surface rounded-2xl rounded-tl-sm p-5">
            <p class="text-gray-800 text-sm font-[var(--font-ui)] leading-relaxed whitespace-pre-wrap">{{ submission.message }}</p>
          </div>
          <p class="text-xs text-gray-400 font-[var(--font-ui)] mt-1.5 ml-1">
            {{ formatDate(submission.created_at) }}
          </p>
        </div>

        <!-- Admin replies -->
        <div v-for="reply in submission.replies" :key="reply.id" class="flex justify-end">
          <div class="max-w-[85%]">
            <div class="bg-brand-navy/[0.08] rounded-2xl rounded-tr-sm p-5">
              <p class="text-gray-800 text-sm font-[var(--font-ui)] leading-relaxed whitespace-pre-wrap">{{ reply.body }}</p>
            </div>
            <p class="text-xs text-gray-400 font-[var(--font-ui)] mt-1.5 mr-1 text-right">
              {{ formatDate(reply.sent_at) }}
            </p>
          </div>
        </div>
      </div>

      <!-- Reply box -->
      <ReplyBox
        :submissionId="submission.id"
        @replied="$emit('replied')"
      />
    </template>
  </div>
</template>

<script setup>
import ReplyBox from './ReplyBox.vue'

defineProps({
  submission: { type: Object, default: null },
  showBack: { type: Boolean, default: false },
})

defineEmits(['replied', 'back'])

function formatDate(dateStr) {
  const d = new Date(dateStr)
  const now = new Date()
  const isToday = d.toDateString() === now.toDateString()

  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })

  if (isToday) return `Today at ${time}`

  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  if (d.toDateString() === yesterday.toDateString()) return `Yesterday at ${time}`

  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ` at ${time}`
}
</script>
