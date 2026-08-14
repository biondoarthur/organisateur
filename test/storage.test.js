import test from 'node:test'
import assert from 'node:assert/strict'
import {
  CALENDAR_SYNC_STORAGE_KEY,
  DATA_STORAGE_KEY,
  readCalendarSync,
  readPlanningData,
  writeCalendarSync,
  writePlanningData,
} from '../src/lib/storage.js'

function createStorage(initial = {}) {
  const values = new Map(Object.entries(initial))
  return {
    get length() { return values.size },
    key(index) { return [...values.keys()][index] ?? null },
    getItem(key) { return values.has(key) ? values.get(key) : null },
    setItem(key, value) { values.set(key, String(value)) },
  }
}

const firstCourse = { id: 'course-1', subject: 'Maths', day: 'Lundi', time: '09:00', room: '' }
const firstSync = {
  calendarId: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
  editToken: '6ba7b811-9dad-11d1-80b4-00c04fd430c8',
}

test('utilise le stockage global et migre les anciennes clés sans les supprimer', () => {
  const storage = createStorage({
    [`${DATA_STORAGE_KEY}:ancienne-cle`]: JSON.stringify({ courses: [firstCourse], homework: [], events: [] }),
  })

  const data = readPlanningData(storage)

  assert.deepEqual(data.courses, [firstCourse])
  assert.deepEqual(JSON.parse(storage.getItem(DATA_STORAGE_KEY)), data)
  assert.ok(storage.getItem(`${DATA_STORAGE_KEY}:ancienne-cle`))
})

test('conserve la configuration de calendrier lors du passage au stockage global', () => {
  const storage = createStorage({
    [`${CALENDAR_SYNC_STORAGE_KEY}:ancienne-cle`]: JSON.stringify(firstSync),
  })

  assert.deepEqual(readCalendarSync(storage), firstSync)
  assert.deepEqual(JSON.parse(storage.getItem(CALENDAR_SYNC_STORAGE_KEY)), firstSync)
})

test('écrit uniquement des données de planning et une configuration valide', () => {
  const storage = createStorage()
  writePlanningData(storage, { courses: [firstCourse], homework: null, events: null })
  writeCalendarSync(storage, firstSync)

  assert.deepEqual(JSON.parse(storage.getItem(DATA_STORAGE_KEY)), { courses: [firstCourse], homework: [], events: [] })
  assert.deepEqual(JSON.parse(storage.getItem(CALENDAR_SYNC_STORAGE_KEY)), firstSync)
  assert.throws(() => writeCalendarSync(storage, { calendarId: 'invalid' }), /invalide/)
})
