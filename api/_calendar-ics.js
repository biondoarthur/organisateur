const courseWeekdays = { Lundi: 1, Mardi: 2, Mercredi: 3, Jeudi: 4, Vendredi: 5 }
const icsWeekdays = { Lundi: 'MO', Mardi: 'TU', Mercredi: 'WE', Jeudi: 'TH', Vendredi: 'FR' }

function escapeIcs(value = '') {
  return String(value).replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,')
}

function formatLocal(date) {
  return `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, '0')}${String(date.getUTCDate()).padStart(2, '0')}T${String(date.getUTCHours()).padStart(2, '0')}${String(date.getUTCMinutes()).padStart(2, '0')}00`
}

function formatUtc(date) {
  return `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, '0')}${String(date.getUTCDate()).padStart(2, '0')}T${String(date.getUTCHours()).padStart(2, '0')}${String(date.getUTCMinutes()).padStart(2, '0')}${String(date.getUTCSeconds()).padStart(2, '0')}Z`
}

function nextCourseDate(course) {
  const [hours, minutes] = course.time.split(':').map(Number)
  const date = new Date()
  // Calendar values are deliberately represented as French wall time through
  // UTC components, then emitted with TZID below. This avoids Vercel's UTC
  // runtime shifting a 09:00 Paris course into a different hour.
  const daysUntilCourse = (courseWeekdays[course.day] - date.getUTCDay() + 7) % 7
  date.setUTCDate(date.getUTCDate() + daysUntilCourse)
  date.setUTCHours(hours, minutes, 0, 0)
  if (date <= new Date()) date.setUTCDate(date.getUTCDate() + 7)
  return date
}

function eventDateTime(event, field) {
  const [year, month, day] = event.date.split('-').map(Number)
  const [hours, minutes] = event[field].split(':').map(Number)
  return new Date(Date.UTC(year, month - 1, day, hours, minutes, 0, 0))
}

function foldLine(line) {
  const encoder = new TextEncoder()
  const folded = []
  let current = ''
  let bytes = 0
  for (const character of line) {
    const characterBytes = encoder.encode(character).length
    if (bytes + characterBytes > 75) {
      folded.push(current)
      current = ' '
      bytes = 1
    }
    current += character
    bytes += characterBytes
  }
  folded.push(current)
  return folded.join('\r\n')
}

function eventLines({ uid, start, end, summary, description, location = '', recurrence = '' }) {
  const lines = ['BEGIN:VEVENT', `UID:${uid}@mon-planning.local`, `DTSTAMP:${formatUtc(new Date())}`, 'SEQUENCE:0', `DTSTART;TZID=Europe/Paris:${formatLocal(start)}`, `DTEND;TZID=Europe/Paris:${formatLocal(end)}`, `SUMMARY:${escapeIcs(summary)}`, `DESCRIPTION:${escapeIcs(description)}`, 'STATUS:CONFIRMED', 'TRANSP:OPAQUE', 'X-MON-PLANNING:TRUE']
  if (location) lines.splice(7, 0, `LOCATION:${escapeIcs(location)}`)
  if (recurrence) lines.splice(7, 0, recurrence)
  lines.push('END:VEVENT')
  return lines
}

function allDayEventLines(homework) {
  const [year, month, day] = homework.dueDate.split('-').map(Number)
  const dueDate = new Date(Date.UTC(year, month - 1, day, 12))
  const followingDay = new Date(dueDate)
  followingDay.setDate(followingDay.getDate() + 1)
  const date = homework.dueDate.replaceAll('-', '')
  const endDate = `${followingDay.getUTCFullYear()}${String(followingDay.getUTCMonth() + 1).padStart(2, '0')}${String(followingDay.getUTCDate()).padStart(2, '0')}`
  return ['BEGIN:VEVENT', `UID:homework-${homework.id}@mon-planning.local`, `DTSTAMP:${formatUtc(new Date())}`, 'SEQUENCE:0', `DTSTART;VALUE=DATE:${date}`, `DTEND;VALUE=DATE:${endDate}`, `SUMMARY:${escapeIcs(`Devoir à rendre — ${homework.subject}`)}`, `DESCRIPTION:${escapeIcs(homework.title)}`, 'STATUS:CONFIRMED', 'TRANSP:TRANSPARENT', 'X-MON-PLANNING:TRUE', 'END:VEVENT']
}

export function buildCalendarIcs(calendar) {
  const courses = Array.isArray(calendar.courses) ? calendar.courses : []
  const homework = Array.isArray(calendar.homework) ? calendar.homework : []
  const events = Array.isArray(calendar.events) ? calendar.events : []
  const plannerSessions = Array.isArray(calendar.plannerSessions) ? calendar.plannerSessions.filter((session) => ['accepted', 'done'].includes(session.status)) : []
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Mon Planning//Calendrier personnel//FR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:Mon Planning']

  courses.forEach((course) => {
    const start = nextCourseDate(course)
    const end = new Date(start.getTime() + 60 * 60 * 1000)
    lines.push(...eventLines({ uid: `course-${course.id}`, start, end, summary: course.subject, description: `Cours de ${course.subject}, le ${course.day} à ${course.time}.${course.room ? ` Salle : ${course.room}.` : ''} Ajouté depuis Mon Planning.`, location: course.room, recurrence: `RRULE:FREQ=WEEKLY;BYDAY=${icsWeekdays[course.day]}` }))
    if (calendar.includeReviewReminders) [3, 7].forEach((daysAfter) => {
      const reminderStart = new Date(start)
      reminderStart.setUTCDate(reminderStart.getUTCDate() + daysAfter)
      reminderStart.setUTCHours(19, 0, 0, 0)
      lines.push(...eventLines({ uid: `revision-${course.id}-${daysAfter}`, start: reminderStart, end: new Date(reminderStart.getTime() + 30 * 60 * 1000), summary: `Réviser ${course.subject} — cours du ${course.day.toLowerCase()}`, description: `Rappel J+${daysAfter} : révise ${course.subject}, après le cours du ${course.day} à ${course.time}.` }))
    })
  })
  homework.forEach((item) => lines.push(...allDayEventLines(item)))
  events.forEach((event) => lines.push(...eventLines({ uid: `personal-${event.id}`, start: eventDateTime(event, 'startTime'), end: eventDateTime(event, 'endTime'), summary: event.title, description: `${event.category}.${event.note ? ` ${event.note}` : ''} Ajouté depuis Mon Planning.`, location: event.location, recurrence: event.recurrence && event.recurrence !== 'none' ? `RRULE:FREQ=${event.recurrence.toUpperCase()}` : '' })))
  plannerSessions.forEach((session) => lines.push(...eventLines({ uid: `study-${session.id}`, start: eventDateTime(session, 'startTime'), end: eventDateTime(session, 'endTime'), summary: session.title, description: 'Séance proposée par le planificateur intelligent de Mon Planning.' })))
  lines.push('END:VCALENDAR')
  return `${lines.map(foldLine).join('\r\n')}\r\n`
}
