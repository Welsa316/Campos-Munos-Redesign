// Picks the monday.com provider from env. Policy (docs/billing-automation-plan.md 2.2):
//   MONDAY_PROVIDER        'mock' (default) or 'api'. Anything else, or 'api'
//                          without MONDAY_API_TOKEN, is a configuration error.
//                          There is never a silent fallback to mock.
//   MONDAY_API_VERSION     API-Version header, default DEFAULT_MONDAY_API_VERSION.
//   MONDAY_WRITES_ENABLED  'true' to allow real writes. Until then the api
//                          provider refuses updateItemColumns without a network
//                          call (defence in depth; the apply service should
//                          also force dry-run).
import { createMondayApiProvider, DEFAULT_MONDAY_API_VERSION } from './api.js'
import { createMockMondayProvider } from './mock.js'

export class MondayConfigError extends Error {
  constructor(message) {
    super(message)
    this.name = 'MondayConfigError'
    this.code = 'monday_not_configured'
  }
}

export function mondayWritesEnabled(env = process.env) {
  return String(env.MONDAY_WRITES_ENABLED ?? '').trim().toLowerCase() === 'true'
}

export function mondayProviderMode(env = process.env) {
  const raw = String(env.MONDAY_PROVIDER ?? '').trim().toLowerCase()
  if (raw === '' || raw === 'mock') return 'mock'
  if (raw === 'api') return 'api'
  throw new MondayConfigError(`MONDAY_PROVIDER must be 'mock' or 'api'`)
}

/**
 * @param {Object} [env]
 * @param {Object} [deps]  { fetchImpl, sleep, log, seed } passed through for tests
 */
export function createMondayProvider(env = process.env, deps = {}) {
  const mode = mondayProviderMode(env)
  if (mode === 'mock') return createMockMondayProvider({ seed: deps.seed })

  const token = String(env.MONDAY_API_TOKEN ?? '').trim()
  if (!token) throw new MondayConfigError('MONDAY_PROVIDER=api requires MONDAY_API_TOKEN')
  const provider = createMondayApiProvider({
    token,
    apiVersion: String(env.MONDAY_API_VERSION ?? '').trim() || DEFAULT_MONDAY_API_VERSION,
    ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}),
    ...(deps.sleep ? { sleep: deps.sleep } : {}),
    log: deps.log,
  })
  const writesEnabled = mondayWritesEnabled(env)
  if (writesEnabled) return { ...provider, writesEnabled }
  return {
    ...provider,
    writesEnabled,
    async updateItemColumns(_boardId, itemId) {
      return {
        ok: false,
        itemId: String(itemId),
        error: { code: 'writes_disabled', retryable: false, message: 'monday.com writes are disabled (MONDAY_WRITES_ENABLED is not true)' },
      }
    },
  }
}

export { DEFAULT_MONDAY_API_VERSION }
export default createMondayProvider
