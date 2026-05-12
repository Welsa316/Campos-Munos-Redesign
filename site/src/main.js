import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import i18n from './i18n'
import { startFontAwesome } from './icons.js'
import './style.css'

const app = createApp(App)
app.use(router)
app.use(i18n)
app.mount('#app')

// Start the FA dom-watcher after the app mounts so it picks up the initial
// render's icons, then any reactive updates.
startFontAwesome()
