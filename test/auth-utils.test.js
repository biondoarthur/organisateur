import test from 'node:test'
import assert from 'node:assert/strict'
import { authErrorMessage, diagnoseAuthConfiguration, normalizeSessionResponse, storageKeyForUser } from '../src/lib/auth-utils.js'

test('diagnostique les configurations Neon Auth sans exposer leur valeur', () => {
  assert.deepEqual(diagnoseAuthConfiguration(''), { status: 'missing' })
  assert.deepEqual(diagnoseAuthConfiguration('not-a-url'), { status: 'invalid', reason: 'url' })
  assert.deepEqual(diagnoseAuthConfiguration('http://auth.example.test'), { status: 'invalid', reason: 'protocol' })
  assert.deepEqual(diagnoseAuthConfiguration('https://auth.example.test/neondb/auth'), {
    status: 'configured',
    origin: 'https://auth.example.test',
    pathname: '/neondb/auth',
  })
})

test('normalise la réponse Better Auth et rejette ses erreurs', () => {
  const session = { session: { token: 'private' }, user: { id: 'user-a' } }
  assert.deepEqual(normalizeSessionResponse({ data: session }), session)
  assert.equal(normalizeSessionResponse({ data: { session: null, user: null } }).user, null)
  assert.throws(() => normalizeSessionResponse({ error: new Error('failure') }), /failure/)
})

test('isole les clés de stockage entre utilisateurs', () => {
  assert.equal(storageKeyForUser('mon-planning-data-v1', 'user-a'), 'mon-planning-data-v1:user-a')
  assert.equal(storageKeyForUser('mon-planning-data-v1', 'user-b'), 'mon-planning-data-v1:user-b')
  assert.notEqual(storageKeyForUser('mon-planning-data-v1', 'user-a'), storageKeyForUser('mon-planning-data-v1', 'user-b'))
  assert.equal(storageKeyForUser('mon-planning-data-v1', null), null)
})

test('traduit les codes Neon Auth réels sans afficher de détails techniques', () => {
  assert.equal(authErrorMessage({ code: 'invalid_credentials' }), 'E-mail ou mot de passe incorrect.')
  assert.equal(authErrorMessage({ code: 'email_not_confirmed' }), 'Vérifie ton e-mail avant de te connecter.')
  assert.equal(authErrorMessage({ code: 'user_already_exists' }), 'Un compte existe déjà avec cette adresse e-mail.')
  assert.equal(authErrorMessage({ code: 'weak_password' }), 'Choisis un mot de passe plus robuste.')
  assert.equal(authErrorMessage({ code: 'over_request_rate_limit' }), 'Trop de tentatives. Réessaie dans quelques minutes.')
  assert.equal(authErrorMessage({ code: 'auth_not_configured' }), 'L’authentification doit être configurée avant de pouvoir se connecter.')
  assert.equal(authErrorMessage({ code: 'internal_error' }), 'Une erreur est survenue. Réessaie dans un instant.')
})
