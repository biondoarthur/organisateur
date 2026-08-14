const DAY_MS = 24 * 60 * 60 * 1000

export const PRIORITIES = [
  { value: 1, label: 'Basse' },
  { value: 2, label: 'Normale' },
  { value: 3, label: 'Haute' },
  { value: 4, label: 'Urgente' },
]

export const DIFFICULTIES = [
  { value: 1, label: 'Facile' },
  { value: 2, label: 'Accessible' },
  { value: 3, label: 'Intermédiaire' },
  { value: 4, label: 'Difficile' },
  { value: 5, label: 'Très difficile' },
]

const WORK_WINDOWS = {
  weekday: [[17 * 60, 20 * 60 + 30]],
  weekend: [[10 * 60, 13 * 60], [14 * 60, 18 * 60]],
}

export const DEFAULT_TASK_MINUTES = 60

export function toDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function dateFromKey(value) {
  const [year, month, day] = String(value).split('-').map(Number)
  return new Date(year, month - 1, day, 12)
}

export function timeToMinutes(value) {
  const [hours, minutes] = String(value || '00:00').split(':').map(Number)
  return hours * 60 + minutes
}

export function minutesToTime(value) {
  const minutes = Math.max(0, Math.round(value / 15) * 15)
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
}

export function rangesOverlap(firstStart, firstEnd, secondStart, secondEnd) {
  return firstStart < secondEnd && secondStart < firstEnd
}

export function eventOccursOnDate(event, date) {
  const dateKey = toDateKey(date)
  if (event.date === dateKey) return true
  const start = dateFromKey(event.date)
  if (date < start) return false
  if (event.recurrence === 'weekly') return date.getDay() === start.getDay()
  if (event.recurrence === 'monthly') return date.getDate() === start.getDate()
  return false
}

export function getTaskMinutes(task) {
  const minutes = Number(task?.estimatedMinutes)
  return Number.isFinite(minutes) && minutes > 0 ? Math.min(24 * 60, Math.max(15, Math.round(minutes / 15) * 15)) : DEFAULT_TASK_MINUTES
}

export function getPriorityLabel(value) {
  return PRIORITIES.find((item) => item.value === Number(value))?.label || 'Normale'
}

export function getDifficultyLabel(value) {
  return DIFFICULTIES.find((item) => item.value === Number(value))?.label || 'Intermédiaire'
}

function dayWindows(date) {
  return date.getDay() === 0 || date.getDay() === 6 ? WORK_WINDOWS.weekend : WORK_WINDOWS.weekday
}

function makeId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  return `study-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function rangeFor(item) {
  return { start: timeToMinutes(item.startTime || item.start), end: timeToMinutes(item.endTime || item.end) }
}

function blockedRangesForDate(date, { courses = [], events = [], sessions = [] } = {}) {
  const dateKey = toDateKey(date)
  const ranges = []
  courses.filter((course) => course.day && date.getDay() === ({ Lundi: 1, Mardi: 2, Mercredi: 3, Jeudi: 4, Vendredi: 5 }[course.day])).forEach((course) => {
    const start = timeToMinutes(course.time)
    ranges.push({ start, end: start + 60, label: course.subject })
  })
  events.filter((event) => eventOccursOnDate(event, date)).forEach((event) => {
    const range = rangeFor(event)
    ranges.push({ ...range, label: event.title })
  })
  sessions.filter((session) => session.date === dateKey && ['proposed', 'accepted', 'done'].includes(session.status)).forEach((session) => {
    const range = rangeFor(session)
    ranges.push({ ...range, label: session.title })
  })
  return ranges
}

function findFreeSlot(date, duration, blocked) {
  const now = new Date()
  const minimum = toDateKey(date) === toDateKey(now) ? Math.ceil((now.getHours() * 60 + now.getMinutes()) / 15) * 15 : 0
  for (const [windowStart, windowEnd] of dayWindows(date)) {
    for (let start = Math.max(windowStart, minimum); start + duration <= windowEnd; start += 15) {
      if (!blocked.some((range) => rangesOverlap(start, start + duration, range.start, range.end))) {
        return { start, end: start + duration }
      }
    }
  }
  return null
}

function dateRange(start, end) {
  const dates = []
  for (let current = new Date(start); current <= end; current = new Date(current.getTime() + DAY_MS)) dates.push(new Date(current))
  return dates
}

export function generateStudyPlan({ homework = [], courses = [], events = [], existingSessions = [], startDate = new Date(), horizonDays = 21 } = {}) {
  const today = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate(), 12)
  const pending = homework
    .filter((task) => !task.done)
    .map((task) => ({ ...task, due: dateFromKey(task.dueDate) }))
    .sort((first, second) => first.due - second.due || Number(second.priority || 2) - Number(first.priority || 2) || Number(second.difficulty || 3) - Number(first.difficulty || 3))
  const latestDueDate = pending.reduce((latest, task) => task.due > latest ? task.due : latest, new Date(today.getTime() + horizonDays * DAY_MS))
  const endDate = new Date(Math.max(latestDueDate.getTime(), today.getTime() + horizonDays * DAY_MS))
  const sessions = []
  const dayLoads = new Map()
  const taskDayCounts = new Map()
  const unscheduled = []

  for (const task of pending) {
    let remaining = getTaskMinutes(task)
    const lastDate = task.due < today ? today : task.due
    const candidateDates = dateRange(today, new Date(Math.min(lastDate.getTime(), endDate.getTime())))
    while (remaining > 0) {
      const chunk = Math.min(60, remaining)
      const duration = Math.max(15, Math.round(chunk / 15) * 15)
      const choices = candidateDates
        .map((date) => ({ date, key: toDateKey(date), load: dayLoads.get(toDateKey(date)) || 0, taskCount: taskDayCounts.get(`${task.id}:${toDateKey(date)}`) || 0 }))
        .filter((choice) => choice.load + duration <= 180)
        .sort((first, second) => first.taskCount - second.taskCount || first.load - second.load || first.date - second.date)

      let scheduled = null
      for (const choice of choices) {
        const blocked = blockedRangesForDate(choice.date, { courses, events, sessions: [...existingSessions, ...sessions] })
        const slot = findFreeSlot(choice.date, duration, blocked)
        if (!slot) continue
        scheduled = { ...choice, slot }
        break
      }

      if (!scheduled) {
        unscheduled.push({ taskId: task.id, title: task.title, remainingMinutes: remaining })
        break
      }

      sessions.push({
        id: makeId(),
        taskId: task.id,
        title: `Travail — ${task.title}`,
        date: scheduled.key,
        startTime: minutesToTime(scheduled.slot.start),
        endTime: minutesToTime(scheduled.slot.end),
        minutes: duration,
        status: 'proposed',
      })
      dayLoads.set(scheduled.key, scheduled.load + duration)
      taskDayCounts.set(`${task.id}:${scheduled.key}`, scheduled.taskCount + 1)
      remaining -= duration
    }
  }

  return { sessions, unscheduled, horizon: { from: toDateKey(today), to: toDateKey(endDate) } }
}

export function getDailyWorkload(sessions, dateKey, includeProposed = true) {
  return sessions
    .filter((session) => session.date === dateKey && (includeProposed || ['accepted', 'done'].includes(session.status)))
    .reduce((total, session) => total + (Number(session.minutes) || Math.max(0, timeToMinutes(session.endTime) - timeToMinutes(session.startTime))), 0)
}
