export const DATA_STORAGE_KEY = 'mon-planning-data-v1'
export const CALENDAR_SYNC_STORAGE_KEY = 'mon-planning-hosted-calendar-v1'

const uuid = /^[0-9a-f-]{36}$/i

function emptyPlanningData() {
  return { courses: [], homework: [], events: [] }
}

function parseStoredValue(storage, key) {
  try {
    return JSON.parse(storage.getItem(key))
  } catch {
    return null
  }
}

function isPlanningData(value) {
  return value && typeof value === 'object' && (
    Array.isArray(value.courses) || Array.isArray(value.homework) || Array.isArray(value.events)
  )
}

function normalizePlanningData(value) {
  return {
    courses: Array.isArray(value?.courses) ? value.courses : [],
    homework: Array.isArray(value?.homework) ? value.homework : [],
    events: Array.isArray(value?.events) ? value.events : [],
  }
}

function scopedValues(storage, key, predicate = () => true) {
  const values = []
  for (let index = 0; index < storage.length; index += 1) {
    const storedKey = storage.key(index)
    if (!storedKey?.startsWith(`${key}:`)) continue
    const value = parseStoredValue(storage, storedKey)
    if (predicate(value)) values.push(value)
  }
  return values
}

function mergePlanningData(values) {
  const merged = emptyPlanningData()
  for (const value of values) {
    const normalized = normalizePlanningData(value)
    for (const key of Object.keys(merged)) {
      const existingIds = new Map(merged[key].map((item, index) => [item.id, index]))
      for (const item of normalized[key]) {
        if (item.id && existingIds.has(item.id)) merged[key][existingIds.get(item.id)] = item
        else {
          existingIds.set(item.id, merged[key].length)
          merged[key].push(item)
        }
      }
    }
  }
  return merged
}

export function readPlanningData(storage) {
  const current = parseStoredValue(storage, DATA_STORAGE_KEY)
  const sources = [
    ...(isPlanningData(current) ? [current] : []),
    ...scopedValues(storage, DATA_STORAGE_KEY, isPlanningData),
  ]
  if (!sources.length) return emptyPlanningData()

  const migrated = mergePlanningData(sources)
  if (migrated.courses.length || migrated.homework.length || migrated.events.length) {
    try {
      storage.setItem(DATA_STORAGE_KEY, JSON.stringify(migrated))
    } catch {
      // Continue with the in-memory copy if storage is temporarily unavailable.
    }
  }
  return migrated
}

export function writePlanningData(storage, data) {
  storage.setItem(DATA_STORAGE_KEY, JSON.stringify(normalizePlanningData(data)))
}

export function isCalendarSyncConfig(value) {
  return Boolean(
    value && uuid.test(value.calendarId || '') && uuid.test(value.editToken || ''),
  )
}

export function readCalendarSync(storage) {
  const current = parseStoredValue(storage, CALENDAR_SYNC_STORAGE_KEY)
  if (isCalendarSyncConfig(current)) return current

  const migrated = scopedValues(storage, CALENDAR_SYNC_STORAGE_KEY)
    .find((value) => isCalendarSyncConfig(value))
  if (!migrated) return null
  try {
    storage.setItem(CALENDAR_SYNC_STORAGE_KEY, JSON.stringify(migrated))
  } catch {
    // Continue with the in-memory copy if storage is temporarily unavailable.
  }
  return migrated
}

export function writeCalendarSync(storage, config) {
  if (!isCalendarSyncConfig(config)) throw new Error('Configuration de synchronisation invalide.')
  storage.setItem(CALENDAR_SYNC_STORAGE_KEY, JSON.stringify(config))
}
