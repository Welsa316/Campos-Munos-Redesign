// Wait for a promise, but never longer than `ms`: true when it settled in
// time, false when the wait gave up. For waits that only improve a result
// (web fonts before splitting text) and must never hold the page.
export function settleWithin(promise, ms) {
  let timer
  const gaveUp = new Promise((resolve) => { timer = setTimeout(() => resolve(false), ms) })
  const settled = Promise.resolve(promise).then(() => true, () => true)
  return Promise.race([settled, gaveUp]).finally(() => clearTimeout(timer))
}
