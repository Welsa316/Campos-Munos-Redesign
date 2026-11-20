// Renders one of the portal's components to HTML under plain Node, the way
// the browser would show it, with a router sitting on a given route. For
// behavioural checks (what a person sees), not structure.
import { register } from 'node:module'
import { createSSRApp, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { createRouter, createMemoryHistory } from 'vue-router'

register('./vueHooks.js', import.meta.url)

const Blank = { render: () => null }
const ROUTES = ['Home', 'Login', 'Inbox', 'Updates', 'WhatsApp', 'Calls', 'BillingOverview', 'Integrations', 'Team', 'Activity', 'TestChannel', 'OperationsDemo', 'NoAccess', 'NotFound']
  .map((name) => ({ path: `/${name.toLowerCase()}`, name, component: Blank }))

/** HTML of the component at src/<path>, with props, on the named route. */
export async function renderVue(path, { props = {}, route = 'Home' } = {}) {
  const { default: component } = await import(new URL(`../../src/${path}`, import.meta.url).href)
  const router = createRouter({ history: createMemoryHistory(), routes: ROUTES })
  await router.push({ name: route })
  await router.isReady()
  const app = createSSRApp({ render: () => h(component, props) })
  app.use(router)
  return renderToString(app)
}

/** The visible text of rendered HTML, tags removed and spaces collapsed. */
export const textOf = (html) => html.replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
