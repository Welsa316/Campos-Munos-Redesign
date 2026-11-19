// The portal's side of entry colours: one change at a time per entry, shown
// at once (optimistic) and rolled back with an error toast if the server
// refuses. Shared by every picker and every row that shows a colour.
//
// A caller's colour belongs to the number, so it is matched by the number
// the row shows (display only: the server works out the number from the
// call). A lead or reminder is matched by its id.
//
// A change stays on screen (an override) until a list loaded after it
// arrives: the loaders call settleEntryColors(kind, startedAt) with the time
// they started, which drops the overrides that load already includes.
import { reactive } from 'vue'
import { isEntryColor } from '../../data/entryColors.js'

const overrides = reactive(new Map())
const keyOf = (kind, match) => `${kind}:${kind === 'caller' ? String(match ?? '').replace(/\D/g, '') : String(match ?? '')}`

/** The colour to show: a change in flight or just made, else what the server sent. */
export function entryColor(kind, match, serverColor) {
  const o = overrides.get(keyOf(kind, match))
  if (o) return o.color
  return isEntryColor(serverColor) ? serverColor : null
}

/** Drop the confirmed changes of `kind` that a load started at `since` (ms) already includes. */
export function settleEntryColors(kind, since) {
  for (const [k, o] of overrides) if (k.startsWith(`${kind}:`) && o.confirmedAt != null && o.confirmedAt < since) overrides.delete(k)
}

let seq = 0

/**
 * Set (or with null clear) the colour of { kind, id }. match: the number
 * (caller) or the id. targets: objects on screen that carry this entry's
 * color, updated once the server agrees. send(body) makes the request
 * (PUT /api/colors). Resolves to true when saved; on a refusal the change
 * is undone and onError gets the error.
 */
export async function setEntryColor({ kind, id, match = id, color, targets = [], send, onError = () => {} }) {
  const key = keyOf(kind, match)
  const mine = ++seq
  const previous = overrides.get(key)
  overrides.set(key, { color, seq: mine, confirmedAt: null })
  try {
    const r = await send({ kind, id, color })
    const saved = r && Object.hasOwn(r, 'color') ? r.color : color
    for (const t of targets) if (t && typeof t === 'object') t.color = saved
    // A later change to the same entry owns the override now.
    if (overrides.get(key)?.seq === mine) overrides.set(key, { color: saved, seq: mine, confirmedAt: Date.now() })
    return true
  } catch (err) {
    if (overrides.get(key)?.seq === mine) {
      if (previous) overrides.set(key, previous)
      else overrides.delete(key)
    }
    onError(err)
    return false
  }
}

/** For tests. */
export function resetEntryColors() { overrides.clear() }
