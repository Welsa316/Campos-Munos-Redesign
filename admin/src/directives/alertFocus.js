// An inline confirmation (role="alertdialog": "Delete this note?", "Revoke
// access?") takes focus when it appears, so a keyboard or screen-reader user
// is on the question, and gives it back to what opened it when it goes,
// instead of dropping focus to the page. The button marked data-autofocus
// (Cancel, for anything destructive) gets it; otherwise the first button.
// Esc is the component's to handle (@keydown.esc), since it owns the state.
export const vAlertFocus = {
  mounted(el) {
    el._alertOpener = document.activeElement
    const target = el.querySelector('[data-autofocus]:not([disabled])') || el.querySelector('button:not([disabled])')
    target?.focus()
  },
  beforeUnmount(el) {
    el._alertHadFocus = el.contains(document.activeElement)
  },
  unmounted(el) {
    const back = el._alertOpener
    el._alertOpener = null
    // Only when focus would otherwise be lost: inside the closing dialog, or nowhere.
    const lost = el._alertHadFocus || document.activeElement === document.body
    if (lost && back && document.contains(back) && typeof back.focus === 'function') back.focus()
  },
}
