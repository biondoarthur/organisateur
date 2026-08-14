import test from 'node:test'
import assert from 'node:assert/strict'
import { diagnoseAuthConfiguration, normalizeSessionResponse, storageKeyForUser } from '../src/lib/auth-utils.js'

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
