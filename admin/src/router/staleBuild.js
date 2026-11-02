// After a deploy, a tab opened earlier still asks for the previous build's
// screen files (each screen is its own file, named by its contents), and
// those are gone. The import fails and the click silently does nothing. The
// fix is to load the page fresh, which fetches the new build.
//
// Once per destination: if the fresh page fails the same way, the problem is
// not a stale tab, and reloading again would loop.

const KEY = 'cm-stale-build-reload'
const STALE = /dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS/i

export const isStaleBuildError = (err) => STALE.test(String(err?.message || err || ''))

/** Returns true when it started a reload. */
export function reloadForStaleBuild(err, href, { storage, assign }) {
  if (!isStaleBuildError(err)) return false
  try {
    if (storage.getItem(KEY) === href) return false
    storage.setItem(KEY, href)
  } catch {
    // Storage blocked: reload anyway; a loop needs the fresh page to fail too.
  }
  assign(href)
  return true
}

/** A navigation that worked: a later deploy may need a reload again. */
export function clearStaleBuildMark(storage) {
  try { storage.removeItem(KEY) } catch { /* storage blocked */ }
}
