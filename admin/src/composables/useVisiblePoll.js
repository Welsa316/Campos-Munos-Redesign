// A component's self-refresh (utils/visiblePoll.js for the rules). It stops
// when the component is deactivated (kept-alive sections) or unmounted; the
// component decides when to start() it, since each section treats its first
// show and its later activations differently.
import { onDeactivated, onBeforeUnmount } from 'vue'
import { createVisiblePoll } from '../utils/visiblePoll.js'

export function useVisiblePoll(run, ms, options) {
  const poll = createVisiblePoll(run, ms, options)
  onDeactivated(poll.stop)
  onBeforeUnmount(poll.stop)
  return poll
}
