import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import { startFontAwesome } from './icons.js'
import './style.css'

createApp(App).use(router).mount('#app')

startFontAwesome()
