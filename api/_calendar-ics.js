const courseWeekdays = { Lundi: 1, Mardi: 2, Mercredi: 3, Jeudi: 4, Vendredi: 5 }
const icsWeekdays = { Lundi: 'MO', Mardi: 'TU', Mercredi: 'WE', Jeudi: 'TH', Vendredi: 'FR' }

function escapeIcs(value = '') {
  return String(value).replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,')
}

function formatLocal(date) {
  return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}T${String(date.getHours()).padStart(2, '0')}${String(date.getMinutes()).padStart(2, '0')}00`
}

function formatUtc(date) {
  return `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, '0')}${String(date.getUTCDate()).padStart(2, '0')}T${String(date.getUTCHours()).padStart(2, '0')}${String(date.getUTCMinutes()).padStart(2, '0')}${String(date.getUTCSeconds()).padStart(2, '0')}Z`
}

function nextCourseDate(course) {
  const [hours, minutes] = course.time.split(':').map(Number)
  const date = new Date()
  const daysUntilCourse = (courseWeekdays[course.day] - date.getDay() + 7) % 7
  date.setDate(date.getDate() + daysUntilCourse)
  date.setHours(hours, minutes, 0, 0)
  if (date <= new Date()) date.setDate(date.getDate() + 7)
  return date
}

function eventDateTime(event, field) {
  const [year, month, day] = event.date.split('-').map(Number)
  const [hours, minutes] = event[field].split(':').map(Number)
  return new Date(year, month - 1, day, hours, minutes, 0, 0)
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
  const lines = ['BEGIN:VEVENT', `UID:${uid}@mon-planning.local`, `DTSTAMP:${formatUtc(new Date())}`, 'SEQUENCE:0', `DTSTART:${formatLocal(start)}`, `DTEND:${formatLocal(end)}`, `SUMMARY:${escapeIcs(summary)}`, `DESCRIPTION:${escapeIcs(description)}`, 'STATUS:CONFIRMED', 'TRANSP:OPAQUE', 'X-MON-PLANNING:TRUE']
  if (location) lines.splice(7, 0, `LOCATION:${escapeIcs(location)}`)
  if (recurrence) lines.splice(7, 0, recurrence)
  lines.push('END:VEVENT')
  return lines
}

function allDayEventLines(homework) {
  const dueDate = new Date(`${homework.dueDate}T12:00:00`)
  const followingDay = new Date(dueDate)
  followingDay.setDate(followingDay.getDate() + 1)
  const date = homework.dueDate.replaceAll('-', '')
  const endDate = `${followingDay.getFullYear()}${String(followingDay.getMonth() + 1).padStart(2, '0')}${String(followingDay.getDate()).padStart(2, '0')}`
  return ['BEGIN:VEVENT', `UID:homework-${homework.id}@mon-planning.local`, `DTSTAMP:${formatUtc(new Date())}`, 'SEQUENCE:0', `DTSTART;VALUE=DATE:${date}`, `DTEND;VALUE=DATE:${endDate}`, `SUMMARY:${escapeIcs(`Devoir à rendre — ${homework.subject}`)}`, `DESCRIPTION:${escapeIcs(homework.title)}`, 'STATUS:CONFIRMED', 'TRANSP:TRANSPARENT', 'X-MON-PLANNING:TRUE', 'END:VEVENT']
}

export function buildCalendarIcs(calendar) {
  const courses = Array.isArray(calendar.courses) ? calendar.courses : []
  const homework = Array.isArray(calendar.homework) ? calendar.homework : []
  const events = Array.isArray(calendar.events) ? calendar.events : []
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Mon Planning//Calendrier personnel//FR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:Mon Planning']

  courses.forEach((course) => {
    const start = nextCourseDate(course)
    const end = new Date(start.getTime() + 60 * 60 * 1000)
    lines.push(...eventLines({ uid: `course-${course.id}`, start, end, summary: course.subject, description: `Cours de ${course.subject}, le ${course.day} à ${course.time}.${course.room ? ` Salle : ${course.room}.` : ''} Ajouté depuis Mon Planning.`, location: course.room, recurrence: `RRULE:FREQ=WEEKLY;BYDAY=${icsWeekdays[course.day]}` }))
    if (calendar.includeReviewReminders) [3, 7].forEach((daysAfter) => {
      const reminderStart = new Date(start)
      reminderStart.setDate(reminderStart.getDate() + daysAfter)
      reminderStart.setHours(19, 0, 0, 0)
      lines.push(...eventLines({ uid: `revision-${course.id}-${daysAfter}`, start: reminderStart, end: new Date(reminderStart.getTime() + 30 * 60 * 1000), summary: `Réviser ${course.subject} — cours du ${course.day.toLowerCase()}`, description: `Rappel J+${daysAfter} : révise ${course.subject}, après le cours du ${course.day} à ${course.time}.` }))
    })
  })
  homework.forEach((item) => lines.push(...allDayEventLines(item)))
  events.forEach((event) => lines.push(...eventLines({ uid: `personal-${event.id}`, start: eventDateTime(event, 'startTime'), end: eventDateTime(event, 'endTime'), summary: event.title, description: `${event.category}.${event.note ? ` ${event.note}` : ''} Ajouté depuis Mon Planning.`, location: event.location })))
  lines.push('END:VCALENDAR')
  return `${lines.map(foldLine).join('\r\n')}\r\n`
}
