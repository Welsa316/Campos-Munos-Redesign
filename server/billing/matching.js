// Client matching: which monday.com item is this eImmigration client?
//
// Deterministic hierarchy, first hit wins:
//   1. a link staff already approved (billing_client_links)
//   2. the monday item carries this client's eImmigration ID in the column
//      the administrator mapped for it (an exact, stable identifier)
//   3. names → CANDIDATES ONLY. A name match is never approved automatically,
//      however close: duplicate names, family members and accent variants are
//      exactly the cases where a wrong link would send a reminder to the
//      wrong person.
//
// Phone and email are not used to auto-match: eImmigration exports are not
// known to carry them, and family members share both.

/** Lowercase, strip accents and punctuation, collapse spaces. */
export function normalizeName(name) {
  if (name == null) return ''
  return String(name)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Name tokens, ignoring order ("García Pérez, María" ≡ "Maria Garcia Perez"). */
export function nameTokens(name) {
  const stop = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'e'])
  return normalizeName(name).split(' ').filter((t) => t && !stop.has(t))
}

/**
 * Similarity in [0, 1] between two names as token sets.
 * 1 = same tokens in any order. Multiple surnames: "Maria Garcia" vs
 * "Maria Garcia Perez" scores 2/3 (Jaccard), so it surfaces as a candidate
 * without looking like an exact match.
 */
export function nameSimilarity(a, b) {
  const ta = new Set(nameTokens(a))
  const tb = new Set(nameTokens(b))
  if (!ta.size || !tb.size) return 0
  let inter = 0
  for (const t of ta) if (tb.has(t)) inter++
  return inter / (ta.size + tb.size - inter)
}

export const CANDIDATE_THRESHOLD = 0.5

/**
 * Match one billing client against the monday items.
 *
 * @param {object} client  { id, eimmigrationClientId, displayName }
 * @param {object} ctx
 *   links:      Map<clientId, [{ externalId, externalLabel }]>  approved links
 *   items:      [{ id, name, columns }]  monday items (may be empty: no board)
 *   eimIdColumnId: column holding the eImmigration client id on the board, or null
 *   linkedItemIds: Set of monday item ids already linked to some client
 * @returns {{ status: 'linked'|'matched_by_id'|'ambiguous'|'unmatched',
 *             itemIds: string[], candidates: [{ itemId, name, score, linkedElsewhere }],
 *             reason: string }}
 */
export function matchClient(client, { links, items = [], eimIdColumnId = null, linkedItemIds = new Set() }) {
  const approved = links.get(client.id) || []
  if (approved.length) {
    return { status: 'linked', itemIds: approved.map((l) => l.externalId), candidates: [], reason: 'Approved link' }
  }

  if (eimIdColumnId && client.eimmigrationClientId) {
    const want = String(client.eimmigrationClientId).trim().toLowerCase()
    const hits = items.filter((it) => {
      const cell = it.columns?.[eimIdColumnId]
      return cell && String(cell.text ?? '').trim().toLowerCase() === want
    })
    if (hits.length === 1 && !linkedItemIds.has(hits[0].id)) {
      return { status: 'matched_by_id', itemIds: [hits[0].id], candidates: [], reason: 'eImmigration ID on the monday item' }
    }
    if (hits.length > 1) {
      // Several items carry the same id: one per case is legitimate, but
      // which ones belong is a human decision.
      return {
        status: 'ambiguous',
        itemIds: [],
        candidates: hits.map((it) => ({ itemId: it.id, name: it.name, score: 1, linkedElsewhere: linkedItemIds.has(it.id) })),
        reason: 'Several monday items carry this eImmigration ID',
      }
    }
  }

  const candidates = items
    .map((it) => ({ itemId: it.id, name: it.name, score: nameSimilarity(client.displayName, it.name), linkedElsewhere: linkedItemIds.has(it.id) }))
    .filter((c) => c.score >= CANDIDATE_THRESHOLD)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, 5)

  if (candidates.length) {
    const exactCount = candidates.filter((c) => c.score === 1).length
    return {
      status: 'ambiguous',
      itemIds: [],
      candidates,
      reason: exactCount > 1
        ? 'Several monday items have this exact name'
        : 'Name looks similar; confirm before linking',
    }
  }
  return { status: 'unmatched', itemIds: [], candidates: [], reason: items.length ? 'No similar name on the board' : 'No monday board connected' }
}

/** Load approved links as Map<clientId, [{ externalId, externalLabel }]>. */
export async function loadLinks(db, system = 'monday') {
  const { rows } = await db.query(
    'SELECT client_id, external_id, external_label FROM billing_client_links WHERE system = $1',
    [system]
  )
  const links = new Map()
  const linkedItemIds = new Set()
  for (const r of rows) {
    const id = Number(r.client_id)
    if (!links.has(id)) links.set(id, [])
    links.get(id).push({ externalId: r.external_id, externalLabel: r.external_label })
    linkedItemIds.add(r.external_id)
  }
  return { links, linkedItemIds }
}

export default { normalizeName, nameTokens, nameSimilarity, matchClient, loadLinks }
