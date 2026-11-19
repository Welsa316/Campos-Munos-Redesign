// Module hooks that let a test import the portal's .vue files under plain
// Node (registered by renderVue.js): a single-file component is compiled
// with Vue's own compiler (script setup with its template inlined; styles
// are ignored), and import.meta.env, which only Vite provides, reads as the
// standalone portal's ('/').
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { parse, compileScript } from 'vue/compiler-sfc'

const SRC = new URL('../../src/', import.meta.url).href
const ENV = '({ BASE_URL: "/", MODE: "test", DEV: false, PROD: true })'

export async function load(url, context, nextLoad) {
  if (url.endsWith('.vue')) {
    const file = fileURLToPath(url)
    const { descriptor } = parse(await readFile(file, 'utf8'), { filename: file })
    const script = compileScript(descriptor, { id: file, inlineTemplate: true })
    return { format: 'module', source: script.content.replaceAll('import.meta.env', ENV), shortCircuit: true }
  }
  if (url.startsWith(SRC) && url.endsWith('.js')) {
    const source = (await readFile(fileURLToPath(url), 'utf8')).replaceAll('import.meta.env', ENV)
    return { format: 'module', source, shortCircuit: true }
  }
  return nextLoad(url, context)
}
