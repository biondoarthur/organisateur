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
