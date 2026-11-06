/**
 * Keeps only the latest of overlapping loads: a slow answer to an earlier
 * filter or poll must not overwrite the answer to the newer one.
 *   const latest = latestOnly()
 *   const r = await latest(() => get(url)); if (!r.current) return
 * A superseded load that fails is ignored too. latest.cancel() supersedes
 * whatever is in flight without starting anything (a dialog closing).
 */
export function latestOnly() {
  let n = 0
  const latest = async (fn) => {
    const id = ++n
    try {
      const value = await fn()
      return id === n ? { current: true, value } : { current: false }
    } catch (err) {
      if (id !== n) return { current: false }
      throw err
    }
  }
  latest.cancel = () => { n++ }
  return latest
}
