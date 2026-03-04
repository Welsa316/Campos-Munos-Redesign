import { createApp } from 'vue'
import { createUnhead } from '@unhead/vue'
import App from './App.vue'
import router from './router'
import i18n from './i18n'
import './style.css'

const app = createApp(App)
const head = createUnhead()
app.use(head)
app.use(router)
app.use(i18n)
app.mount('#app')
