import { createRouter, createWebHistory } from 'vue-router';
import i18n from '../i18n';

const Home = () => import('../pages/Home.vue');
const ServiciosIndex = () => import('../pages/ServiciosIndex.vue');
const ServicioPage = () => import('../pages/ServicioPage.vue');
const Consulta = () => import('../pages/Consulta.vue');
const Pago = () => import('../pages/Pago.vue');
const EquipoIndex = () => import('../pages/EquipoIndex.vue');
const EquipoMember = () => import('../pages/EquipoMember.vue');
const AcercaDe = () => import('../pages/AcercaDe.vue');

const routes = [
  {
    path: '/',
    redirect: '/home'
  },
  {
    path: '/home',
    name: 'home',
    component: Home,
    meta: {
      titleKey: 'meta.home.title',
      descriptionKey: 'meta.home.description'
    }
  },
  {
    path: '/servicios',
    name: 'servicios',
    component: ServiciosIndex,
    meta: {
      titleKey: 'meta.services.title',
      descriptionKey: 'meta.services.description'
    }
  },
  {
    path: '/servicios/:slug',
    name: 'servicio-slug',
    component: ServicioPage,
    meta: {
      titleKey: 'meta.serviceGeneric.title',
      descriptionKey: 'meta.serviceGeneric.description'
    }
  },
  {
    path: '/consulta',
    name: 'consulta',
    component: Consulta,
    meta: {
      titleKey: 'meta.consulta.title',
      descriptionKey: 'meta.consulta.description'
    }
  },
  {
    path: '/pago',
    name: 'pago',
    component: Pago,
    meta: {
      titleKey: 'meta.pago.title',
      descriptionKey: 'meta.pago.description'
    }
  },
  {
    path: '/el-equipo',
    name: 'equipo',
    component: EquipoIndex,
    meta: {
      titleKey: 'meta.equipo.title',
      descriptionKey: 'meta.equipo.description'
    }
  },
  {
    path: '/el-equipo/:member',
    name: 'equipo-member',
    component: EquipoMember,
    meta: {
      titleKey: 'meta.equipoMember.title',
      descriptionKey: 'meta.equipoMember.description'
    }
  },
  {
    path: '/acerca-de',
    name: 'acerca-de',
    component: AcercaDe,
    meta: {
      titleKey: 'meta.acerca.title',
      descriptionKey: 'meta.acerca.description'
    }
  }
];

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior() {
    return { top: 0, behavior: 'smooth' };
  }
});

router.afterEach((to) => {
  const defaultTitle = 'Campos Muños';
  const { t, locale } = i18n.global;
  let titleKey = to.meta?.titleKey;
  let descriptionKey = to.meta?.descriptionKey;

  let title = defaultTitle;
  if (titleKey && typeof t === 'function') {
    const translatedTitle = t(titleKey);
    if (translatedTitle) {
      title = translatedTitle;
    }
  }

  if (typeof document !== 'undefined') {
    document.title = title;
  }

  if (descriptionKey && typeof document !== 'undefined') {
    const translatedDescription = typeof t === 'function' ? t(descriptionKey) : '';
    let meta = document.querySelector('meta[name="description"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'description';
      document.head.appendChild(meta);
    }
    if (translatedDescription) {
      meta.content = translatedDescription;
    }
  }
});

export default router;

