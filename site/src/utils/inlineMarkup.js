// The small inline syntax blog articles use (rendered by components/RichText.js):
//   [link text](/path)  → internal link (paths must start with "/")
//   **bold**            → strong
// Plain JS so the Node tests can check every article against it.
const TOKEN = /\[([^\]]+)\]\((\/[^)\s]*)\)|\*\*([^*]+)\*\*/g

export function parseInline(text) {
  const parts = []
  let last = 0
  for (const m of String(text).matchAll(TOKEN)) {
    if (m.index > last) parts.push({ type: 'text', text: text.slice(last, m.index) })
    if (m[1] !== undefined) parts.push({ type: 'link', text: m[1], to: m[2] })
    else parts.push({ type: 'bold', text: m[3] })
    last = m.index + m[0].length
  }
  if (last < text.length) parts.push({ type: 'text', text: text.slice(last) })
  return parts
}
