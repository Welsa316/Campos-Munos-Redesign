// App-wide states shown as a banner over every screen (App.vue): the session
// ended, or a screen failed to render. Neither reloads the page, so whatever
// someone was typing stays where it is until they choose to leave.
import { ref } from 'vue'

export const sessionExpired = ref(false)
export const renderError = ref(false)
