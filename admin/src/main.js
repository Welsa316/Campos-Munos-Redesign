import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import { startFontAwesome } from './icons.js'
import './style.css'
import { applyTheme, cachedTheme, DEFAULT_THEME } from './data/themes.js'

// Theme before the first paint: the last one this browser showed (replaced
// by the account's saved theme as soon as the profile loads), else Classic.
applyTheme(cachedTheme() || DEFAULT_THEME)

createApp(App).use(router).mount('#app')

startFontAwesome()
