<template>
  <div class="min-h-screen flex flex-col bg-slate-50 text-slate-900">
    <Header />
    <main class="flex-1">
      <slot />
    </main>
    <Footer />
    <InactivityPopup />
  </div>
</template>

<script setup>
import Header from '../components/sections/Header.vue';
import Footer from '../components/sections/Footer.vue';
import InactivityPopup from '../components/sections/InactivityPopup.vue';
</script>

