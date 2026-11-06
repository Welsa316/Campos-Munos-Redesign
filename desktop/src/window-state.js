'use strict'
// Saved window bounds are only reused if they still land on a connected
// screen; otherwise a window last seen on an unplugged monitor would open
// off-screen with no way to reach it. The size is also cut down to fit the
// screen, so a window saved on a big monitor does not open with its title
// bar or edges out of reach on a laptop.

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
  let width = Math.max(MIN_SIZE.width, Math.round(saved.width))
  let height = Math.max(MIN_SIZE.height, Math.round(saved.height))
  const x = Math.round(saved.x)
  const y = Math.round(saved.y)
  // Require a usable strip of the window on some screen, not one stray pixel.
  const home = workAreas.find((area) => intersects({ x: x + 40, y, width: Math.max(1, width - 80), height: 40 }, area))
  const fit = home || workAreas[0]
  if (fit) {
    width = Math.min(width, fit.width)
    height = Math.min(height, fit.height)
  }
  if (!home) return { width, height, maximized: !!saved.maximized }
  // Shifted only as far as needed to bring the whole window onto its screen.
  const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi)
  return {
    x: clamp(x, home.x, home.x + home.width - width),
    y: clamp(y, home.y, home.y + home.height - height),
    width,
    height,
    maximized: !!saved.maximized,
  }
}

module.exports = { restoreBounds, DEFAULT_SIZE, MIN_SIZE }
