<template>
  <div>
    <!-- Hero -->
    <section class="relative py-16 bg-brand-dark">
      <div class="max-w-4xl mx-auto px-4">
        <router-link to="/el-equipo" class="inline-flex items-center gap-2 text-brand-gold hover:text-brand-gold-light text-sm font-[var(--font-ui)] mb-8 transition-colors">
          <i class="fa-solid fa-arrow-left text-xs"></i>
          {{ $t('team.title') }}
        </router-link>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-8 items-start">
          <!-- Photo -->
          <div class="aspect-square rounded-xl overflow-hidden bg-brand-gray">
            <img v-if="memberData.image" :src="memberData.image" :alt="memberData.nameKey"
              class="w-full h-full object-cover" />
            <div v-else class="w-full h-full flex items-center justify-center">
              <i class="fa-solid fa-user text-6xl text-white/20"></i>
            </div>
          </div>

          <!-- Info -->
          <div class="md:col-span-2">
            <h1 class="font-[var(--font-heading)] text-3xl md:text-4xl text-white mb-2">
              {{ $t(`team.members.${memberData.key}.name`) }}
            </h1>
            <p class="font-[var(--font-ui)] text-brand-gold tracking-wider uppercase text-sm mb-6">
              {{ $t(`team.members.${memberData.key}.title`) }}
            </p>
            <div class="w-16 h-0.5 bg-brand-gold mb-6"></div>
            <p class="text-white/70 text-lg leading-relaxed">
              {{ memberData.bio }}
            </p>
          </div>
        </div>
      </div>
    </section>

    <!-- CTA -->
    <section class="py-16 bg-brand-darker text-center">
      <router-link to="/consulta"
        class="inline-block bg-brand-red hover:bg-brand-red-light text-white font-[var(--font-ui)] font-semibold tracking-wider text-sm px-8 py-3.5 rounded-lg transition-colors">
        {{ $t('home.consultaBtn') }}
      </router-link>
    </section>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  member: String,
})

const members = {
  juan: {
    key: 'juan',
    image: '/JuanHeadshot.jpg',
    bio: 'Juan Campos-Gutierrez es el socio fundador de Campos Munos Law, LLC. Con más de veinte años de experiencia en derecho de inmigración, Juan ha dedicado su carrera a representar y defender los derechos de los inmigrantes en el sureste de los Estados Unidos. Su compromiso con la comunidad inmigrante y su profundo conocimiento de las leyes migratorias lo convierten en un defensor excepcional para sus clientes.',
  },
  angenette: {
    key: 'angenette',
    image: null,
    bio: 'Angenette Van Lieu-Munos es la socia fundadora de Campos Munos Law, LLC. Con títulos de J.D. y LL.M., Angenette aporta una formación académica excepcional al equipo. Su experiencia en derecho de inmigración y su dedicación al servicio de la comunidad inmigrante la convierten en una pieza fundamental del bufete.',
  },
  diana: {
    key: 'diana',
    image: '/DianaHeadshot.jpg',
    bio: 'Diana Arreaga sirve como Paralegal Senior en Campos Munos Law, LLC. Su dedicación y atención al detalle aseguran que cada caso reciba el cuidado y la preparación necesarios. Diana es un recurso invaluable para el equipo y para los clientes del bufete.',
  },
  rio: {
    key: 'rio',
    image: null,
    bio: 'Rio Shattuck es Asistente Legal en Campos Munos Law, LLC. Rio apoya al equipo legal en la preparación de documentos, investigación y comunicación con los clientes. Su dedicación al servicio contribuye significativamente al éxito del bufete.',
  },
}

const memberData = computed(() => members[props.member] || members.juan)
</script>
