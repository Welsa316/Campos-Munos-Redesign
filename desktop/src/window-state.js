'use strict'
// Saved window bounds are only reused if they still land on a connected
// screen; otherwise a window last seen on an unplugged monitor would open
// off-screen with no way to reach it.

const DEFAULT_SIZE = { width: 1280, height: 860 }
const MIN_SIZE = { width: 900, height: 600 }

function intersects(a, b) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
}

/**
 * @param {any} saved            { x, y, width, height, maximized } or nothing
 * @param {Array<{x,y,width,height}>} workAreas  one per display
 */
function restoreBounds(saved, workAreas) {
  const ok = saved && ['x', 'y', 'width', 'height'].every((k) => Number.isFinite(saved[k]))
  if (!ok) return { ...DEFAULT_SIZE, maximized: false }
  const width = Math.max(MIN_SIZE.width, Math.round(saved.width))
  const height = Math.max(MIN_SIZE.height, Math.round(saved.height))
  const box = { x: Math.round(saved.x), y: Math.round(saved.y), width, height }
  // Require a usable strip of the window on some screen, not one stray pixel.
  const visible = workAreas.some((area) => intersects({ x: box.x + 40, y: box.y, width: Math.max(1, width - 80), height: 40 }, area))
  if (!visible) return { width, height, maximized: !!saved.maximized }
  return { ...box, maximized: !!saved.maximized }
}

module.exports = { restoreBounds, DEFAULT_SIZE, MIN_SIZE }
