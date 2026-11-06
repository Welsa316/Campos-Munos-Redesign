/**
 * Keeps only the latest of overlapping loads: a slow answer to an earlier
 * filter or poll must not overwrite the answer to the newer one.
 *   const latest = latestOnly()
 *   const r = await latest(() => get(url)); if (!r.current) return
 * A superseded load that fails is ignored too.
 */
export function latestOnly() {
  let n = 0
  return async (fn) => {
    const id = ++n
    try {
      const value = await fn()
      return id === n ? { current: true, value } : { current: false }
    } catch (err) {
      if (id !== n) return { current: false }
      throw err
    }
  }
}
