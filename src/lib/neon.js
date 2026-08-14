import { createAuthClient } from '@neondatabase/neon-js/auth'
import { diagnoseAuthConfiguration } from './auth-utils.js'

const authUrl = import.meta.env.VITE_NEON_AUTH_URL

export const authConfiguration = diagnoseAuthConfiguration()
export const isAuthConfigured = authConfiguration.status === 'configured'

let authClient = null
if (isAuthConfigured) {
  try {
    authClient = createAuthClient(authUrl)
  } catch {
    authClient = null
    authConfiguration.status = 'unavailable'
  }
}

export { authClient }
