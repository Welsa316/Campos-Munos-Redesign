// toast({ text, tone, undo }) from anywhere in the portal. Call it once the
// server has confirmed what it reports; tone 'error' stays until dismissed.
import { reactive } from 'vue'
import { createToastQueue } from './toastQueue.js'

const queue = createToastQueue()
export const toasts = reactive({ items: [] })
queue.subscribe((items) => { toasts.items = items.slice() })

export const toast = (opts) => queue.show(typeof opts === 'string' ? { text: opts } : opts)
export const toastQueue = queue
export function useToast() {
  return { toast, dismiss: queue.dismiss }
}
