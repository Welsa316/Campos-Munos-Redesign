// v-glass-light: moves a .glass-interactive panel's light to the pointer
// (sets --gl-x / --gl-y / --gl-on). Mouse and pen only; touch has no hover.
const handlers = new WeakMap()

export const vGlassLight = {
  mounted(el) {
    const move = (e) => {
      if (e.pointerType === 'touch') return
      const r = el.getBoundingClientRect()
      el.style.setProperty('--gl-x', `${e.clientX - r.left}px`)
      el.style.setProperty('--gl-y', `${e.clientY - r.top}px`)
      el.style.setProperty('--gl-on', '1')
    }
    const leave = () => el.style.setProperty('--gl-on', '0')
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerleave', leave)
    handlers.set(el, { move, leave })
  },
  unmounted(el) {
    const h = handlers.get(el)
    if (!h) return
    el.removeEventListener('pointermove', h.move)
    el.removeEventListener('pointerleave', h.leave)
  },
}

export default vGlassLight
