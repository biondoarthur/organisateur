export function diagnoseAuthConfiguration(value) {
  if (typeof value !== 'string' || !value.trim()) return { status: 'missing' }
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:') return { status: 'invalid', reason: 'protocol' }
    if (!url.hostname) return { status: 'invalid', reason: 'hostname' }
    return { status: 'configured', origin: url.origin, pathname: url.pathname }
  } catch {
    return { status: 'invalid', reason: 'url' }
  }
}

export function normalizeSessionResponse(result) {
  if (result?.error) throw result.error
  if (result && Object.hasOwn(result, 'data')) return result.data
  if (result && Object.hasOwn(result, 'session')) return result
  return result || null
}

export function storageKeyForUser(key, userId) {
  return userId ? `${key}:${userId}` : null
}

export function authErrorMessage(error, fallback = 'Une erreur est survenue. Réessaie dans un instant.') {
  const source = error?.error || error
  const code = String(source?.code || '').toLowerCase()
  if (['invalid_credentials', 'invalid_email_or_password', 'invalid_password', 'user_not_found'].includes(code)) return 'E-mail ou mot de passe incorrect.'
  if (['email_not_confirmed', 'email_not_verified'].includes(code)) return 'Vérifie ton e-mail avant de te connecter.'
  if (['user_already_exists', 'email_exists', 'email_already_exists'].includes(code)) return 'Un compte existe déjà avec cette adresse e-mail.'
  if (['over_request_rate_limit', 'over_email_send_rate_limit', 'too_many_requests'].includes(code)) return 'Trop de tentatives. Réessaie dans quelques minutes.'
  if (['weak_password', 'password_too_short', 'password_too_long'].includes(code)) return 'Choisis un mot de passe plus robuste.'
  if (['email_address_invalid', 'invalid_email'].includes(code)) return 'Cette adresse e-mail est invalide.'
  if (['session_expired', 'session_not_found', 'failed_to_get_session', 'bad_jwt'].includes(code)) return 'Ta session a expiré. Connecte-toi à nouveau.'
  if (code === 'auth_not_configured') return 'L’authentification doit être configurée avant de pouvoir se connecter.'
  if (code === 'auth_unavailable') return 'Le service d’authentification est indisponible dans ce déploiement.'
  if (code === 'auth_timeout') return 'Le service d’authentification met trop de temps à répondre.'
  if (source?.name === 'TypeError' || source?.status === 0) return 'Le service d’authentification est momentanément inaccessible.'
  return fallback
}
