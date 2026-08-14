import { createAuthClient } from '@neondatabase/neon-js/auth'
import { diagnoseAuthConfiguration } from './auth-utils.js'

const authUrl = import.meta.env.VITE_NEON_AUTH_URL

const configuration = diagnoseAuthConfiguration()

let authClient = null
if (configuration.status === 'configured') {
  try {
    authClient = createAuthClient(authUrl)
  } catch {
    authClient = null
    configuration.status = 'unavailable'
  }
}

export const authConfiguration = configuration
export const isAuthConfigured = Boolean(authClient)
export { authClient }
