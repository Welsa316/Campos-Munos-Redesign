// A screen that refreshes itself every so often (useVisiblePoll wraps this
// for components). Pure, so its rules are tested apart from the page
// (admin/test/visiblePoll.test.js):
//   - one run at a time: a tick that arrives while one is in flight is skipped;
//   - a hidden tab is not polled, unless the screen asks to be (Messages
//     keeps going, since that is when a desktop alert is worth sending);
//   - coming back to the tab runs at once (after onShow, e.g. to move a clock);
//   - a failed run is quiet: the next tick tries again;
//   - stop() removes the timer and the listener; start() twice never doubles them.
export function createVisiblePoll(run, ms, {
  whileHidden = false,
  onShow = null,
  doc = typeof document !== 'undefined' ? document : null,
  every = (fn, t) => setInterval(fn, t),
  cancel = (id) => clearInterval(id),
} = {}) {
  let timer = null
  let busy = false
  const hidden = () => doc?.visibilityState === 'hidden'

  async function tick() {
    if (busy || (!whileHidden && hidden())) return
    busy = true
    try { await run() } catch { /* the next tick tries again */ } finally { busy = false }
  }
  function onVisibility() {
    if (hidden()) return
    onShow?.()
    tick()
  }
  function start({ now = false } = {}) {
    stop()
    timer = every(tick, ms)
    doc?.addEventListener('visibilitychange', onVisibility)
    if (now) tick()
  }
  function stop() {
    if (timer != null) cancel(timer)
    timer = null
    doc?.removeEventListener('visibilitychange', onVisibility)
  }
  return { start, stop, tick, get running() { return timer != null } }
}
