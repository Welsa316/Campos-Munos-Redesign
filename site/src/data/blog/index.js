// App-side helpers for the blog. posts.js stays Node-importable for the
// prerender script; anything that needs Vite (import.meta.glob) lives here.
import { posts, postBySlug } from './posts.js'
import { baseServices } from '../seoServices.js'

export { posts, postBySlug }

// Article bodies are split per file so /blog doesn't download all twelve.
const loaders = import.meta.glob('./articles/*.js')

export async function loadArticle(slug) {
  const load = loaders[`./articles/${slug}.js`]
  return load ? (await load()).default : null
}

// The baseServices entry behind an article (video, poster, icon), or null.
export function serviceFor(post) {
  return post?.service ? baseServices[post.service] || null : null
}

export function posterFor(post) {
  const service = serviceFor(post)
  return service?.thumbnail ? `${service.thumbnail}?v=2` : null
}

// "2026-11-09" → a local date, so it never renders as the previous day in
// time zones west of UTC (new Date('2026-11-09') is UTC midnight).
export function formatDate(iso, locale) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'es-US', { dateStyle: 'long' })
    .format(new Date(y, m - 1, d))
}

// Plain text of a block list, for the reading-time estimate.
function blockText(block) {
  return [block.text, block.title, ...(block.items || []), ...(block.head || []), ...(block.rows || []).flat()]
    .filter(Boolean).join(' ')
}

export function readingMinutes(content) {
  if (!content) return 1
  const text = [...content.blocks.map(blockText), ...(content.faqs || []).flatMap(f => [f.q, f.a])].join(' ')
  const words = text.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').split(/\s+/).filter(Boolean).length
  return Math.max(1, Math.round(words / 200))
}

// Stable fragment id for an article heading ("¿Qué es VAWA?" → "que-es-vawa").
export function headingId(text) {
  return String(text)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

// Up to `count` other articles: ones whose service is related to this one's
// first, then the rest in index order.
export function relatedPosts(post, count = 3) {
  const related = serviceFor(post)?.relatedSlugs || []
  const others = posts.filter(p => p.slug !== post.slug)
  const near = others.filter(p => p.service && related.includes(p.service))
  const rest = others.filter(p => !near.includes(p))
  return [...near, ...rest].slice(0, count)
}
