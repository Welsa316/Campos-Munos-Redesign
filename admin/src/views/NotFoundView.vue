<template>
  <div class="min-h-dvh bg-brand-surface flex items-center justify-center px-6">
    <div class="text-center">
      <img src="/logo.png" alt="Campos Muños Law" class="h-12 mx-auto mb-6" />
      <h1 class="font-heading text-2xl text-brand-navy">Page not found</h1>
      <p class="text-sm font-ui text-gray-600 mt-2">This address is not part of the staff portal.</p>
      <router-link :to="{ name: 'Inbox' }"
        class="mt-6 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-navy text-white text-sm font-ui font-semibold hover:bg-brand-navy-dark transition-colors">
        Go to messages
      </router-link>
    </div>
  </div>
</template>
