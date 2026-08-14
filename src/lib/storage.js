export const DATA_STORAGE_KEY = 'mon-planning-data-v1'
export const CALENDAR_SYNC_STORAGE_KEY = 'mon-planning-hosted-calendar-v1'
export const SETTINGS_STORAGE_KEY = 'mon-planning-settings-v1'

const uuid = /^[0-9a-f-]{36}$/i

function emptyPlanningData() {
  return { courses: [], homework: [], events: [], plannerSessions: [] }
}

function numberInRange(value, fallback, minimum, maximum) {
  const number = Number(value)
  return Number.isFinite(number) ? Math.min(maximum, Math.max(minimum, number)) : fallback
}

function normalizeId(value, prefix, index) {
  return typeof value === 'string' && value.trim() ? value : `${prefix}-${index + 1}`
}

function normalizeHomework(item, index) {
  return {
    id: normalizeId(item?.id, 'homework', index),
    subject: typeof item?.subject === 'string' ? item.subject.trim().slice(0, 40) : '',
    title: typeof item?.title === 'string' ? item.title.trim().slice(0, 100) : '',
    dueDate: typeof item?.dueDate === 'string' ? item.dueDate : '',
    done: Boolean(item?.done),
    kind: ['Devoir', 'Contrôle', 'Tâche'].includes(item?.kind) ? item.kind : 'Devoir',
    estimatedMinutes: numberInRange(item?.estimatedMinutes, 60, 15, 1440),
    difficulty: numberInRange(item?.difficulty, 3, 1, 5),
    priority: numberInRange(item?.priority, 2, 1, 4),
  }
}

function normalizeEvent(item, index) {
  return {
    id: normalizeId(item?.id, 'event', index),
    title: typeof item?.title === 'string' ? item.title.trim().slice(0, 100) : '',
    date: typeof item?.date === 'string' ? item.date : '',
    startTime: typeof item?.startTime === 'string' ? item.startTime : '18:00',
    endTime: typeof item?.endTime === 'string' ? item.endTime : '19:00',
    category: typeof item?.category === 'string' ? item.category : 'Autre',
    location: typeof item?.location === 'string' ? item.location.trim().slice(0, 100) : '',
    note: typeof item?.note === 'string' ? item.note.trim().slice(0, 300) : '',
    recurrence: ['none', 'weekly', 'monthly'].includes(item?.recurrence) ? item.recurrence : 'none',
  }
}

function normalizeSession(item, index) {
  return {
    id: normalizeId(item?.id, 'study', index),
    taskId: normalizeId(item?.taskId, 'homework', index),
    title: typeof item?.title === 'string' ? item.title.trim().slice(0, 120) : 'Séance de travail',
    date: typeof item?.date === 'string' ? item.date : '',
    startTime: typeof item?.startTime === 'string' ? item.startTime : '17:00',
    endTime: typeof item?.endTime === 'string' ? item.endTime : '18:00',
    minutes: numberInRange(item?.minutes, 60, 15, 240),
    status: ['proposed', 'accepted', 'done'].includes(item?.status) ? item.status : 'proposed',
  }
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
    courses: Array.isArray(value?.courses) ? value.courses.map((item, index) => ({
      id: normalizeId(item?.id, 'course', index),
      subject: typeof item?.subject === 'string' ? item.subject.trim().slice(0, 40) : '',
      day: typeof item?.day === 'string' ? item.day : 'Lundi',
      time: typeof item?.time === 'string' ? item.time : '08:00',
      room: typeof item?.room === 'string' ? item.room.trim().slice(0, 40) : '',
    })) : [],
    homework: Array.isArray(value?.homework) ? value.homework.map(normalizeHomework) : [],
    events: Array.isArray(value?.events) ? value.events.map(normalizeEvent) : [],
    plannerSessions: Array.isArray(value?.plannerSessions) ? value.plannerSessions.map(normalizeSession) : [],
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

export function readPlanningSettings(storage) {
  const value = parseStoredValue(storage, SETTINGS_STORAGE_KEY)
  return {
    includeReviewReminders: Boolean(value?.includeReviewReminders),
    notificationsEnabled: Boolean(value?.notificationsEnabled),
  }
}

export function writePlanningSettings(storage, settings) {
  storage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({
    includeReviewReminders: Boolean(settings?.includeReviewReminders),
    notificationsEnabled: Boolean(settings?.notificationsEnabled),
  }))
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
