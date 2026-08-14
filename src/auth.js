import { authClient, authConfiguration, isAuthConfigured } from './lib/neon.js'
import { normalizeSessionResponse } from './lib/auth-utils.js'

function requireClient() {
  if (!authClient) {
    const message = authConfiguration.status === 'missing'
      ? 'L’authentification Neon n’est pas configurée dans ce déploiement.'
      : 'Le client Neon Auth n’est pas disponible dans ce déploiement.'
    throw new Error(message)
  }
  return authClient
}

export async function getCurrentSession() {
  const result = await requireClient().getSession()
  // The Better Auth client returns { data: { session, user } }. Keep this
  // provider-specific shape here so the rest of the app has one source of truth.
  return normalizeSessionResponse(result)
}

export async function signIn(email, password) {
  return requireClient().signIn.email({ email, password })
}

export async function signUp(email, password, name) {
  return requireClient().signUp.email({ email, password, name })
}

export async function signOut() {
  return requireClient().signOut()
}

export function authErrorMessage(error, fallback = 'Une erreur est survenue. Réessaie dans un instant.') {
  const source = error?.error || error
  const code = String(source?.code || '').toUpperCase()
  if (code === 'INVALID_EMAIL_OR_PASSWORD' || code === 'USER_NOT_FOUND' || code === 'INVALID_PASSWORD') return 'E-mail ou mot de passe incorrect.'
  if (code === 'EMAIL_NOT_VERIFIED') return 'Vérifie ton e-mail avant de te connecter.'
  if (code === 'USER_ALREADY_EXISTS' || code === 'EMAIL_ALREADY_EXISTS') return 'Un compte existe déjà avec cette adresse e-mail.'
  if (code === 'TOO_MANY_REQUESTS') return 'Trop de tentatives. Réessaie dans quelques minutes.'
  if (source?.name === 'TypeError' || source?.status === 0) return 'Le service d’authentification est momentanément inaccessible.'
  return fallback
}

export { authConfiguration, isAuthConfigured }
