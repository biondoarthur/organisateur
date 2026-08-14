const productionApiOrigin = 'https://mon-projet-mu-two.vercel.app'

export function apiOrigin() {
  const configured = import.meta.env.VITE_API_BASE_URL?.trim()
  if (configured) return configured.replace(/\/$/, '')
  if (window.location.protocol === 'file:') return productionApiOrigin
  return window.location.origin
}

export function apiUrl(path) {
  return `${apiOrigin()}${path.startsWith('/') ? path : `/${path}`}`
}
