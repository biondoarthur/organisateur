import { authClient, authConfiguration, isAuthConfigured } from './lib/neon.js'
import { authErrorMessage, normalizeSessionResponse } from './lib/auth-utils.js'

const AUTH_REQUEST_TIMEOUT_MS = 15000

class AuthTimeoutError extends Error {
  constructor() {
    super('La requête d’authentification a dépassé le délai autorisé.')
    this.name = 'AuthTimeoutError'
    this.code = 'auth_timeout'
  }
}

function withAuthTimeout(task) {
  let timer
  const request = Promise.resolve().then(task)
  const timeout = new Promise((_, reject) => {
    timer = globalThis.setTimeout(() => reject(new AuthTimeoutError()), AUTH_REQUEST_TIMEOUT_MS)
  })
  return Promise.race([request, timeout]).finally(() => globalThis.clearTimeout(timer))
}

function requireClient() {
  if (!authClient) {
    const error = new Error(authConfiguration.status === 'missing'
      ? 'L’authentification Neon n’est pas configurée dans ce déploiement.'
      : 'Le client Neon Auth n’est pas disponible dans ce déploiement.')
    error.code = authConfiguration.status === 'missing' ? 'auth_not_configured' : 'auth_unavailable'
    throw error
  }
  return authClient
}

export async function getCurrentSession() {
  const result = await withAuthTimeout(() => requireClient().getSession())
  // The Better Auth client returns { data: { session, user } }. Keep this
  // provider-specific shape here so the rest of the app has one source of truth.
  return normalizeSessionResponse(result)
}

export async function signIn(email, password) {
  const result = await withAuthTimeout(() => requireClient().signIn.email({ email, password }))
  if (result?.error) throw result.error
  return result
}

export async function signUp(email, password, name) {
  const result = await withAuthTimeout(() => requireClient().signUp.email({ email, password, name }))
  if (result?.error) throw result.error
  return result
}

export async function signOut() {
  const result = await withAuthTimeout(() => requireClient().signOut())
  if (result?.error) throw result.error
  return result
}

export { authConfiguration, authErrorMessage, isAuthConfigured }
