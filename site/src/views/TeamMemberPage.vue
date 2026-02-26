<template>
  <div>
    <!-- Hero split -->
    <section class="min-h-[80vh] bg-brand-surface">
      <div class="max-w-7xl mx-auto px-6 pt-32 pb-20">
        <router-link to="/el-equipo"
          class="inline-flex items-center gap-2 text-gray-400 hover:text-brand-navy text-base font-[var(--font-ui)] tracking-wider uppercase mb-12 transition-colors group">
          <i class="fa-solid fa-arrow-left text-xs group-hover:-translate-x-1 transition-transform"></i>
          {{ $t('team.title') }}
        </router-link>

        <div class="grid grid-cols-1 md:grid-cols-5 gap-12 items-start">
          <!-- Photo -->
          <div class="md:col-span-2 relative">
            <div class="aspect-[3/4] rounded-2xl overflow-hidden relative shadow-lg">
              <img v-if="memberData.image" :src="memberData.image" :alt="$t(`team.members.${memberData.key}.name`)"
                class="w-full h-full object-cover" />
              <div v-else class="w-full h-full bg-gray-100 flex items-center justify-center">
                <i class="fa-solid fa-user text-7xl text-gray-300"></i>
              </div>
            </div>
            <!-- Decorative accent -->
            <div class="absolute -bottom-4 -right-4 w-24 h-24 border-2 border-brand-navy/15 rounded-2xl -z-10"></div>
          </div>

          <!-- Bio content -->
          <div class="md:col-span-3">
            <p class="font-[var(--font-ui)] text-base tracking-[0.2em] text-brand-navy uppercase mb-3">
              {{ $t(`team.members.${memberData.key}.title`) }}
            </p>
            <h1 class="font-[var(--font-heading)] text-4xl md:text-6xl font-bold text-brand-navy leading-tight mb-6">
              {{ $t(`team.members.${memberData.key}.name`) }}
            </h1>
            <div class="w-16 h-[2px] bg-brand-navy mb-8"></div>
            <p class="text-gray-600 text-2xl leading-relaxed font-[var(--font-body)]">
              {{ memberData.bio }}
            </p>

            <!-- CTA -->
            <div class="mt-10 flex flex-wrap gap-4">
              <router-link to="/consulta"
                class="inline-flex items-center gap-3 bg-brand-navy text-white font-[var(--font-ui)] font-bold tracking-wider text-base px-10 py-5 rounded-xl btn-magnetic">
                {{ $t('home.consultaBtn') }} <i class="fa-solid fa-arrow-right text-sm"></i>
              </router-link>
              <a href="tel:+15049106508"
                class="inline-flex items-center gap-3 border border-gray-300 text-gray-500 hover:text-brand-navy hover:border-brand-navy/30 font-[var(--font-ui)] font-medium tracking-wider text-base px-10 py-5 rounded-xl transition-all">
                <i class="fa-solid fa-phone text-sm"></i> (504) 910-6508
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({ member: String })

const members = {
  juan: {
    key: 'juan', image: '/JuanHeadshot.jpg',
    bio: 'Juan Campos-Gutierrez es el socio fundador de Campos Munos Law, LLC. Con más de veinte años de experiencia en derecho de inmigración, Juan ha dedicado su carrera a representar y defender los derechos de los inmigrantes en el sureste de los Estados Unidos. Su compromiso con la comunidad inmigrante y su profundo conocimiento de las leyes migratorias lo convierten en un defensor excepcional para sus clientes.',
  },
  angenette: {
    key: 'angenette', image: null,
    bio: 'Angenette Van Lieu-Munos es la socia fundadora de Campos Munos Law, LLC. Con títulos de J.D. y LL.M., Angenette aporta una formación académica excepcional al equipo. Su experiencia en derecho de inmigración y su dedicación al servicio de la comunidad inmigrante la convierten en una pieza fundamental del bufete.',
  },
  diana: {
    key: 'diana', image: '/DianaHeadshot.jpg',
    bio: 'Diana Arreaga sirve como Paralegal Senior en Campos Munos Law, LLC. Su dedicación y atención al detalle aseguran que cada caso reciba el cuidado y la preparación necesarios. Diana es un recurso invaluable para el equipo y para los clientes del bufete.',
  },
  rio: {
    key: 'rio', image: null,
    bio: 'Rio Shattuck es Asistente Legal en Campos Munos Law, LLC. Rio apoya al equipo legal en la preparación de documentos, investigación y comunicación con los clientes. Su dedicación al servicio contribuye significativamente al éxito del bufete.',
  },
}

const memberData = computed(() => members[props.member] || members.juan)
</script>
