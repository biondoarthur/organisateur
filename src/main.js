import './style.css'
import { apiUrl } from './lib/api.js'
import { DIFFICULTIES, PRIORITIES, dateFromKey, eventOccursOnDate, generateStudyPlan, getDailyWorkload, getDifficultyLabel, getPriorityLabel, getTaskMinutes, minutesToTime, rangesOverlap, timeToMinutes, toDateKey } from './lib/planner.js'
import { readCalendarSync, readPlanningData, readPlanningSettings, writeCalendarSync, writePlanningData, writePlanningSettings } from './lib/storage.js'

const initialDate = new Date()
const state = {
  page: 'dashboard',
  calendarDate: new Date(initialDate.getFullYear(), initialDate.getMonth(), initialDate.getDate(), 12),
  calendarView: 'month',
  calendarFilter: 'all',
  homeworkSearch: '',
  homeworkStatus: 'todo',
  homeworkKind: 'all',
  hostedSync: readCalendarSync(localStorage),
  hostedSyncStatus: '',
  plannerWarnings: [],
  data: readPlanningData(localStorage),
  settings: readPlanningSettings(localStorage),
}

const icons = { dashboard: '▦', schedule: '◫', homework: '✓', calendar: '◷', planner: '✦', plus: '+', close: '×', trash: '⌫', edit: '✎', arrowLeft: '‹', arrowRight: '›', check: '✓', empty: '☼', search: '⌕', clock: '◷' }
const personalCategories = ['Personnel', 'Sport', 'Équitation', 'Rendez-vous', 'Sortie', 'Vacances', 'École', 'Autre']
const categoryClasses = { Personnel: 'personal', Sport: 'sport', Équitation: 'riding', 'Rendez-vous': 'appointment', Sortie: 'outing', Vacances: 'holiday', École: 'school', Autre: 'other' }
const courseWeekdays = { Lundi: 1, Mardi: 2, Mercredi: 3, Jeudi: 4, Vendredi: 5 }
const icsWeekdays = { Lundi: 'MO', Mardi: 'TU', Mercredi: 'WE', Jeudi: 'TH', Vendredi: 'FR' }
const weekDays = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche']

const pages = {
  dashboard: { label: 'Tableau de bord', title: 'Tableau de bord', icon: icons.dashboard },
  schedule: { label: 'Cours', title: 'Cours', icon: icons.schedule },
  homework: { label: 'Tâches', title: 'Tâches et devoirs', icon: icons.homework },
  calendar: { label: 'Calendrier', title: 'Calendrier', icon: icons.calendar },
  planner: { label: 'Planificateur', title: 'Planificateur intelligent', icon: icons.planner },
}

let pageContent
let pageTitle
let organizeButton
let modalBackdrop

function createId() {
  return globalThis.crypto?.randomUUID?.() || `item-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function saveData() {
  writePlanningData(localStorage, state.data)
  writePlanningSettings(localStorage, state.settings)
  queueHostedCalendarSync()
}

function calendarPayload() {
  return {
    courses: state.data.courses,
    homework: state.data.homework,
    events: state.data.events,
    plannerSessions: state.data.plannerSessions,
    includeReviewReminders: state.settings.includeReviewReminders,
  }
}

function hostedFeedUrl(config = state.hostedSync) {
  return `${apiUrl('/api/calendar.ics')}?id=${config.calendarId}`
}

async function sendHostedCalendar(config) {
  const response = await fetch(apiUrl('/api/calendar'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...config, calendar: calendarPayload() }) })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(result.error || 'Synchronisation impossible.')
}

function queueHostedCalendarSync() {
  if (!state.hostedSync) return
  window.clearTimeout(queueHostedCalendarSync.timeout)
  queueHostedCalendarSync.timeout = window.setTimeout(async () => {
    state.hostedSyncStatus = 'Mise à jour du flux…'
    try {
      await sendHostedCalendar(state.hostedSync)
      state.hostedSyncStatus = 'Synchronisé automatiquement.'
      if (state.page === 'calendar') renderPage()
    } catch {
      state.hostedSyncStatus = 'La mise à jour automatique a échoué. Vérifie la configuration du flux.'
      if (state.page === 'calendar') renderPage()
    }
  }, 500)
}

async function activateHostedCalendarSync() {
  const config = { calendarId: createId(), editToken: createId() }
  state.hostedSyncStatus = 'Activation de la synchronisation…'
  renderPage()
  try {
    await sendHostedCalendar(config)
    state.hostedSync = config
    state.hostedSyncStatus = 'Synchronisation automatique active.'
    writeCalendarSync(localStorage, config)
    renderPage()
    showToast('Flux automatique créé. Abonne-toi à son URL dans Apple Calendar.')
  } catch (error) {
    state.hostedSyncStatus = error.message
    renderPage()
  }
}

async function copyHostedFeedUrl() {
  try {
    await navigator.clipboard.writeText(hostedFeedUrl())
    showToast('Lien du calendrier copié.')
  } catch {
    const input = document.querySelector('#hostedFeedUrl')
    input?.select()
    document.execCommand('copy')
    showToast('Lien du calendrier copié.')
  }
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' })[character])
}

function dateFromInput(value) {
  return dateFromKey(value)
}

function toDateInputValue(date) {
  return toDateKey(date)
}

function formatDate(date, options = { day: 'numeric', month: 'short' }) {
  return new Intl.DateTimeFormat('fr-FR', options).format(date).replace('.', '')
}

function formatDateLong(date) {
  return new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }).format(date)
}

function formatMinutes(minutes) {
  const total = Math.max(0, Number(minutes) || 0)
  if (total < 60) return `${total} min`
  const hours = Math.floor(total / 60)
  const remaining = total % 60
  return remaining ? `${hours} h ${remaining} min` : `${hours} h`
}

function formatRange(start, end) {
  return start && end ? `${start} – ${end}` : 'Toute la journée'
}

function startOfDay(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12)
}

function addDays(date, amount) {
  const result = new Date(date)
  result.setDate(result.getDate() + amount)
  return result
}

function mondayOf(date) {
  const result = startOfDay(date)
  const offset = (result.getDay() + 6) % 7
  result.setDate(result.getDate() - offset)
  return result
}

function eventDateTime(event, field) {
  const date = dateFromInput(event.date)
  const [hours, minutes] = event[field].split(':').map(Number)
  date.setHours(hours, minutes, 0, 0)
  return date
}

function nextCourseDate(course) {
  const [hours, minutes] = course.time.split(':').map(Number)
  const date = new Date()
  date.setSeconds(0, 0)
  const daysUntilCourse = (courseWeekdays[course.day] - date.getDay() + 7) % 7
  date.setDate(date.getDate() + daysUntilCourse)
  date.setHours(hours, minutes, 0, 0)
  if (date <= new Date()) date.setDate(date.getDate() + 7)
  return date
}

function formatIcsLocal(date) {
  return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}T${String(date.getHours()).padStart(2, '0')}${String(date.getMinutes()).padStart(2, '0')}00`
}

function formatIcsUtc(date) {
  return `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, '0')}${String(date.getUTCDate()).padStart(2, '0')}T${String(date.getUTCHours()).padStart(2, '0')}${String(date.getUTCMinutes()).padStart(2, '0')}${String(date.getUTCSeconds()).padStart(2, '0')}Z`
}

function escapeIcs(value = '') {
  return String(value).replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,')
}

function foldIcsLine(line) {
  const encoder = new TextEncoder()
  const lines = []
  let current = ''
  let bytes = 0
  for (const character of line) {
    const characterBytes = encoder.encode(character).length
    if (bytes + characterBytes > 75) {
      lines.push(current)
      current = ' '
      bytes = 1
    }
    current += character
    bytes += characterBytes
  }
  lines.push(current)
  return lines.join('\r\n')
}

function buildIcsEvent({ uid, start, end, summary, description, location = '', recurrence = '', allDay = false }) {
  if (allDay) {
    const nextDay = new Date(end)
    return ['BEGIN:VEVENT', `UID:${uid}@mon-planning.local`, `DTSTAMP:${formatIcsUtc(new Date())}`, 'SEQUENCE:0', `DTSTART;VALUE=DATE:${formatIcsLocal(start).slice(0, 8)}`, `DTEND;VALUE=DATE:${formatIcsLocal(nextDay).slice(0, 8)}`, `SUMMARY:${escapeIcs(summary)}`, `DESCRIPTION:${escapeIcs(description)}`, 'STATUS:CONFIRMED', 'TRANSP:TRANSPARENT', 'X-MON-PLANNING:TRUE', 'END:VEVENT']
  }
  const lines = ['BEGIN:VEVENT', `UID:${uid}@mon-planning.local`, `DTSTAMP:${formatIcsUtc(new Date())}`, 'SEQUENCE:0', `DTSTART;TZID=Europe/Paris:${formatIcsLocal(start)}`, `DTEND;TZID=Europe/Paris:${formatIcsLocal(end)}`, `SUMMARY:${escapeIcs(summary)}`, `DESCRIPTION:${escapeIcs(description)}`, 'STATUS:CONFIRMED', 'TRANSP:OPAQUE', 'X-MON-PLANNING:TRUE']
  if (location) lines.splice(7, 0, `LOCATION:${escapeIcs(location)}`)
  if (recurrence) lines.splice(7, 0, recurrence)
  lines.push('END:VEVENT')
  return lines
}

function createCalendarFile() {
  const courses = [...state.data.courses].sort((a, b) => `${a.day}${a.time}${a.subject}`.localeCompare(`${b.day}${b.time}${b.subject}`))
  const events = [...state.data.events].sort((a, b) => `${a.date}${a.startTime}${a.title}`.localeCompare(`${b.date}${b.startTime}${b.title}`))
  const sessions = state.data.plannerSessions.filter((session) => ['accepted', 'done'].includes(session.status)).sort((a, b) => `${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`))
  const signature = JSON.stringify({ courses, homework: state.data.homework, events, sessions, includeReviewReminders: state.settings.includeReviewReminders })
  if (signature === createCalendarFile.lastSignature) {
    showToast('Ce fichier est déjà à jour. Modifie un élément avant de l’exporter à nouveau.')
    return
  }

  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Mon Planning//Calendrier personnel//FR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:Mon Planning', 'X-WR-TIMEZONE:Europe/Paris']
  for (const course of courses) {
    const start = nextCourseDate(course)
    const end = new Date(start.getTime() + 60 * 60 * 1000)
    const roomText = course.room ? ` Salle : ${course.room}.` : ''
    lines.push(...buildIcsEvent({ uid: `course-${course.id}`, start, end, summary: course.subject, description: `Cours de ${course.subject}, le ${course.day} à ${course.time}.${roomText} Ajouté depuis Mon Planning.`, location: course.room, recurrence: `RRULE:FREQ=WEEKLY;BYDAY=${icsWeekdays[course.day]}` }))
    if (state.settings.includeReviewReminders) [3, 7].forEach((daysAfter) => {
      const reminderStart = new Date(start)
      reminderStart.setDate(reminderStart.getDate() + daysAfter)
      reminderStart.setHours(19, 0, 0, 0)
      lines.push(...buildIcsEvent({ uid: `revision-${course.id}-${daysAfter}`, start: reminderStart, end: new Date(reminderStart.getTime() + 30 * 60 * 1000), summary: `Réviser ${course.subject} — cours du ${course.day.toLowerCase()}`, description: `Rappel J+${daysAfter} : révise ${course.subject}, après le cours du ${course.day} à ${course.time}.` }))
    })
  }
  for (const homework of state.data.homework) {
    const start = dateFromInput(homework.dueDate)
    const end = addDays(start, 1)
    lines.push(...buildIcsEvent({ uid: `homework-${homework.id}`, start, end, summary: `${homework.kind} à rendre — ${homework.subject}`, description: homework.title, allDay: true }))
  }
  for (const event of events) {
    lines.push(...buildIcsEvent({ uid: `personal-${event.id}`, start: eventDateTime(event, 'startTime'), end: eventDateTime(event, 'endTime'), summary: event.title, description: `${event.category}.${event.note ? ` ${event.note}` : ''} Ajouté depuis Mon Planning.`, location: event.location, recurrence: event.recurrence && event.recurrence !== 'none' ? `RRULE:FREQ=${event.recurrence.toUpperCase()}` : '' }))
  }
  for (const session of sessions) {
    lines.push(...buildIcsEvent({ uid: `study-${session.id}`, start: eventDateTime(session, 'startTime'), end: eventDateTime(session, 'endTime'), summary: session.title, description: 'Séance créée par le planificateur intelligent de Mon Planning.' }))
  }
  lines.push('END:VCALENDAR')
  const contents = `${lines.map(foldIcsLine).join('\r\n')}\r\n`
  const link = document.createElement('a')
  link.href = URL.createObjectURL(new Blob([contents], { type: 'text/calendar;charset=utf-8' }))
  link.download = 'mon-planning-emploi-du-temps.ics'
  document.body.append(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(link.href)
  createCalendarFile.lastSignature = signature
  state.calendarExported = true
  renderPage()
  const exportedCount = courses.length + state.data.homework.length + events.length + sessions.length
  showToast(`${exportedCount} élément${exportedCount > 1 ? 's' : ''} exporté${exportedCount > 1 ? 's' : ''} vers Apple Calendar.`)
}

function emptyState(icon, title, text, action = '') {
  return `<div class="empty-state"><span class="empty-icon">${icon}</span><h3>${title}</h3><p>${text}</p>${action}</div>`
}

function renderAppShell() {
  document.querySelector('#app').innerHTML = `
    <div class="app-shell">
      <aside class="sidebar">
        <a class="brand" href="#dashboard" aria-label="Mon Planning, tableau de bord"><span class="brand-mark">M</span><span>Mon <b>Planning</b></span></a>
        <p class="nav-label">ORGANISATION</p>
        <nav aria-label="Navigation principale">
          ${Object.entries(pages).map(([key, page]) => `<button class="nav-button" data-page="${key}"><span class="nav-icon">${page.icon}</span><span>${page.label}</span></button>`).join('')}
        </nav>
        <div class="sidebar-tip"><span>${icons.planner}</span><div><strong>Ton espace reste local</strong><p>Les données sont sauvegardées automatiquement sur cet appareil.</p></div></div>
      </aside>
      <main class="main-content">
        <header class="topbar"><div><p class="greeting">Bonjour ! <span>Prêt·e pour ta journée ?</span></p><h1 id="pageTitle">Tableau de bord</h1></div><div class="header-actions"><button class="button button-secondary" id="organizeButton"><span>${icons.planner}</span> Organiser ma semaine</button><button class="button button-primary" data-open-modal="homework"><span>${icons.plus}</span> Ajouter une tâche</button></div></header>
        <div id="pageContent" class="page-content"></div>
      </main>
      <button class="mobile-add button button-primary" data-open-modal="homework" aria-label="Ajouter une tâche">${icons.plus}</button>
      <div class="toast" id="toast" role="status" aria-live="polite"></div>
      <div class="modal-backdrop" id="modalBackdrop" hidden></div>
    </div>`
  pageContent = document.querySelector('#pageContent')
  pageTitle = document.querySelector('#pageTitle')
  organizeButton = document.querySelector('#organizeButton')
  modalBackdrop = document.querySelector('#modalBackdrop')
  organizeButton.addEventListener('click', () => { generatePlan(); state.page = 'planner'; renderPage() })
}

function homeworkStatus(item) {
  const today = toDateInputValue(new Date())
  if (item.done) return 'Terminé'
  if (item.dueDate < today) return 'En retard'
  if (item.dueDate === today) return 'Aujourd’hui'
  return formatDate(dateFromInput(item.dueDate))
}

function homeworkItem(item, compact = false) {
  const date = dateFromInput(item.dueDate)
  return `<article class="homework-item ${item.done ? 'is-done' : ''} ${item.dueDate < toDateInputValue(new Date()) && !item.done ? 'is-overdue' : ''}">
    <label class="check-control" title="Marquer comme terminé"><input type="checkbox" data-toggle-homework="${item.id}" ${item.done ? 'checked' : ''}><span></span></label>
    <div class="date-badge"><strong>${date.getDate()}</strong><span>${formatDate(date, { month: 'short' })}</span></div>
    <div class="homework-details"><div class="item-title-row"><span class="kind-badge kind-${item.kind.toLowerCase()}" >${escapeHtml(item.kind)}</span><h3>${escapeHtml(item.subject)}</h3></div><p>${escapeHtml(item.title)}</p>${compact ? '' : `<div class="item-meta"><span>${icons.clock} ${formatMinutes(getTaskMinutes(item))}</span><span class="priority-${item.priority}">${escapeHtml(getPriorityLabel(item.priority))}</span><span>${escapeHtml(getDifficultyLabel(item.difficulty))}</span></div>`}</div>
    <div class="homework-actions"><span class="due-label ${item.dueDate < toDateInputValue(new Date()) && !item.done ? 'danger' : ''}">${homeworkStatus(item)}</span><button class="icon-button" data-edit-homework="${item.id}" aria-label="Modifier ${escapeHtml(item.title)}">${icons.edit}</button><button class="icon-button delete-button" data-delete-homework="${item.id}" aria-label="Supprimer ${escapeHtml(item.title)}">${icons.trash}</button></div>
  </article>`
}

function agendaItem(item) {
  const editAttribute = item.type === 'event' ? `data-edit-event="${item.id}"` : item.type === 'homework' ? `data-edit-homework="${item.id}"` : item.type === 'course' ? `data-edit-course="${item.id}"` : `data-edit-session="${item.id}"`
  const label = item.type === 'course' ? 'Cours' : item.type === 'homework' ? item.item.kind : item.type === 'session' ? 'Travail' : item.item.category
  const title = item.type === 'homework' ? item.item.title : item.item.subject || item.item.title
  return `<article class="agenda-item agenda-${item.type} ${item.item.done ? 'is-done' : ''}"><div class="agenda-time">${item.allDay ? 'Toute la journée' : formatRange(item.startTime, item.endTime)}</div><button class="agenda-main" ${editAttribute}><span class="agenda-type">${escapeHtml(label)}</span><strong>${escapeHtml(title)}</strong>${item.type === 'course' ? `<small>${escapeHtml(item.item.room || 'Salle non précisée')}</small>` : item.type === 'homework' ? `<small>${escapeHtml(item.item.subject)}</small>` : ''}</button></article>`
}

function itemsForDate(date) {
  const dateKey = toDateInputValue(date)
  const items = []
  state.data.courses.filter((course) => courseWeekdays[course.day] === date.getDay()).forEach((course) => {
    const start = timeToMinutes(course.time)
    items.push({ type: 'course', item: course, date, startTime: course.time, endTime: minutesToTime(start + 60) })
  })
  state.data.events.filter((event) => eventOccursOnDate(event, date)).forEach((event) => items.push({ type: 'event', item: event, date, startTime: event.startTime, endTime: event.endTime }))
  state.data.homework.filter((item) => item.dueDate === dateKey).forEach((item) => items.push({ type: 'homework', item, date, allDay: true }))
  state.data.plannerSessions.filter((session) => session.date === dateKey && ['accepted', 'done'].includes(session.status)).forEach((session) => items.push({ type: 'session', item: session, date, startTime: session.startTime, endTime: session.endTime }))
  const filtered = state.calendarFilter === 'all' ? items : items.filter((item) => item.type === state.calendarFilter)
  return filtered.sort((first, second) => (first.allDay ? -1 : second.allDay ? 1 : first.startTime.localeCompare(second.startTime)))
}

function renderDashboard() {
  const today = startOfDay()
  const pending = state.data.homework.filter((item) => !item.done)
  const completed = state.data.homework.length - pending.length
  const overdue = pending.filter((item) => item.dueDate < toDateInputValue(today))
  const weekMinutes = Array.from({ length: 7 }, (_, index) => getDailyWorkload(state.data.plannerSessions, toDateInputValue(addDays(today, index))))
  const completion = state.data.homework.length ? Math.round((completed / state.data.homework.length) * 100) : 0
  return `<section class="hero-card"><div><p class="eyebrow">TON ESPACE DE CONCENTRATION</p><h2>Une semaine plus claire commence ici.</h2><p>Centralise tes cours, visualise tes échéances et transforme tes devoirs en séances réalistes.</p><div class="hero-actions"><button class="button button-light" data-page="planner">${icons.planner} Construire mon plan</button><button class="text-button hero-text-button" data-open-modal="homework">Ajouter une tâche <span>→</span></button></div></div><span class="hero-art">✦</span></section>
    <section class="stat-grid" aria-label="Résumé de l’organisation"><article class="stat-card purple"><span class="stat-icon">${icons.schedule}</span><p>COURS</p><strong>${state.data.courses.length}</strong><small>créneau${state.data.courses.length > 1 ? 'x' : ''} récurrent${state.data.courses.length > 1 ? 's' : ''}</small></article><article class="stat-card orange"><span class="stat-icon">${icons.homework}</span><p>À FAIRE</p><strong>${pending.length}</strong><small>${overdue.length ? `${overdue.length} en retard` : 'échéances à venir'}</small></article><article class="stat-card blue"><span class="stat-icon">${icons.clock}</span><p>TRAVAIL PLANIFIÉ</p><strong>${formatMinutes(weekMinutes.reduce((sum, value) => sum + value, 0))}</strong><small>sur les 7 prochains jours</small></article><article class="stat-card green"><span class="stat-icon">${icons.check}</span><p>PROGRESSION</p><strong>${completion}%</strong><small>${completed} tâche${completed > 1 ? 's' : ''} terminée${completed > 1 ? 's' : ''}</small></article></section>
    <div class="dashboard-grid"><section class="panel"><div class="panel-heading"><div><p class="eyebrow">AUJOURD’HUI</p><h2>Mon agenda</h2></div><button class="text-button" data-page="calendar">Ouvrir le calendrier <span>→</span></button></div>${itemsForDate(today).length ? `<div class="agenda-list">${itemsForDate(today).slice(0, 5).map(agendaItem).join('')}</div>` : emptyState(icons.calendar, 'Une journée légère', 'Aucun cours, devoir ou rendez-vous n’est prévu aujourd’hui.', '<button class="button button-secondary" data-open-modal="event">Ajouter un événement</button>')}</section><section class="panel workload-panel"><div class="panel-heading"><div><p class="eyebrow">CHARGE À VENIR</p><h2>Garde le bon rythme</h2></div><span class="panel-icon">${icons.planner}</span></div><div class="workload-chart">${weekMinutes.map((minutes, index) => `<div class="workload-bar"><div class="bar-track"><span style="height:${Math.min(100, Math.round((minutes / 180) * 100))}%" title="${formatMinutes(minutes)}"></span></div><strong>${minutes ? formatMinutes(minutes) : '—'}</strong><small>${formatDate(addDays(today, index), { weekday: 'short' })}</small></div>`).join('')}</div><p class="panel-footnote">Objectif indicatif : 3 h de travail concentré maximum par jour.</p></section></div>
    <section class="panel dashboard-panel"><div class="panel-heading"><div><p class="eyebrow">PROCHAINES ÉCHÉANCES</p><h2>Ce qu’il ne faut pas oublier</h2></div><button class="text-button" data-page="homework">Voir toutes les tâches <span>→</span></button></div>${pending.length ? `<div class="compact-list">${pending.sort((a, b) => a.dueDate.localeCompare(b.dueDate)).slice(0, 4).map((item) => homeworkItem(item, true)).join('')}</div>` : emptyState(icons.check, 'Tout est à jour', 'Ajoute une nouvelle tâche quand tu en as besoin.', '<button class="button button-secondary" data-open-modal="homework">Ajouter une tâche</button>')}</section>`
}

function filteredHomework() {
  return state.data.homework.filter((item) => {
    const query = state.homeworkSearch.trim().toLowerCase()
    const matchesSearch = !query || `${item.title} ${item.subject} ${item.kind}`.toLowerCase().includes(query)
    const matchesStatus = state.homeworkStatus === 'all' || (state.homeworkStatus === 'todo' ? !item.done : item.done)
    const matchesKind = state.homeworkKind === 'all' || item.kind === state.homeworkKind
    return matchesSearch && matchesStatus && matchesKind
  }).sort((first, second) => Number(first.done) - Number(second.done) || first.dueDate.localeCompare(second.dueDate) || Number(second.priority) - Number(first.priority))
}

function renderHomework() {
  const items = filteredHomework()
  const pending = state.data.homework.filter((item) => !item.done).length
  return `<section class="page-intro"><div><p class="eyebrow">TES ÉCHÉANCES</p><h2>Tâches et devoirs</h2><p>Ajoute une durée et une priorité pour que le planificateur répartisse ton travail.</p></div><button class="button button-primary" data-open-modal="homework"><span>${icons.plus}</span> Ajouter une tâche</button></section><section class="panel homework-panel"><div class="toolbar"><label class="search-field"><span>${icons.search}</span><input data-homework-search data-focus-key="homework-search" value="${escapeHtml(state.homeworkSearch)}" placeholder="Rechercher une tâche…" aria-label="Rechercher une tâche"></label><select data-homework-status aria-label="Filtrer par état"><option value="todo" ${state.homeworkStatus === 'todo' ? 'selected' : ''}>À faire (${pending})</option><option value="all" ${state.homeworkStatus === 'all' ? 'selected' : ''}>Toutes</option><option value="done" ${state.homeworkStatus === 'done' ? 'selected' : ''}>Terminées</option></select><select data-homework-kind aria-label="Filtrer par type"><option value="all" ${state.homeworkKind === 'all' ? 'selected' : ''}>Tous les types</option>${['Devoir', 'Contrôle', 'Tâche'].map((kind) => `<option value="${kind}" ${state.homeworkKind === kind ? 'selected' : ''}>${kind}s</option>`).join('')}</select></div><div class="list-summary"><span>${items.length} résultat${items.length > 1 ? 's' : ''}</span><span>${formatMinutes(state.data.homework.filter((item) => !item.done).reduce((sum, item) => sum + getTaskMinutes(item), 0))} de travail estimé</span></div>${items.length ? `<div class="homework-list">${items.map((item) => homeworkItem(item)).join('')}</div>` : emptyState(icons.search, 'Aucune tâche trouvée', state.homeworkSearch ? 'Essaie avec un autre mot-clé ou enlève un filtre.' : 'Ajoute ta première tâche pour commencer à organiser ta semaine.', '<button class="button button-primary" data-open-modal="homework">Ajouter une tâche</button>')}</section>`
}

function renderSchedule() {
  const coursesByDay = (day) => state.data.courses.filter((course) => course.day === day).sort((first, second) => first.time.localeCompare(second.time))
  return `<section class="page-intro"><div><p class="eyebrow">TA SEMAINE RÉCURRENTE</p><h2>Cours</h2><p>Retrouve tes horaires, puis utilise-les pour libérer automatiquement des créneaux de travail.</p></div><button class="button button-primary" data-open-modal="course"><span>${icons.plus}</span> Ajouter un cours</button></section><section class="schedule-board">${weekDays.slice(0, 5).map((day) => `<div class="day-column"><div class="day-title"><div><h3>${day}</h3><span>${coursesByDay(day).length} cours</span></div><button class="icon-button day-add" data-open-modal="course" aria-label="Ajouter un cours le ${day}" data-prefill-day="${day}">${icons.plus}</button></div><div class="day-courses">${coursesByDay(day).length ? coursesByDay(day).map((course) => `<article class="course-card"><span class="course-time">${escapeHtml(course.time)}</span><div><h4>${escapeHtml(course.subject)}</h4><p>${escapeHtml(course.room || 'Salle non précisée')}</p></div><div class="item-actions"><button class="icon-button" data-edit-course="${course.id}" aria-label="Modifier ${escapeHtml(course.subject)}">${icons.edit}</button><button class="icon-button delete-button" data-delete-course="${course.id}" aria-label="Supprimer ${escapeHtml(course.subject)}">${icons.trash}</button></div></article>`).join('') : '<div class="day-empty">Aucun cours</div>'}</div></div>`).join('')}</section>`
}

function calendarViewButton(view, label) {
  return `<button class="view-button ${state.calendarView === view ? 'active' : ''}" data-calendar-view="${view}">${label}</button>`
}

function calendarEventMarkup(item) {
  const editAttribute = item.type === 'event' ? `data-edit-event="${item.item.id}"` : item.type === 'homework' ? `data-edit-homework="${item.item.id}"` : item.type === 'course' ? `data-edit-course="${item.item.id}"` : `data-edit-session="${item.item.id}"`
  const deleteAttribute = item.type === 'event' ? `data-delete-event="${item.item.id}"` : item.type === 'homework' ? `data-delete-homework="${item.item.id}"` : item.type === 'course' ? `data-delete-course="${item.item.id}"` : `data-delete-session="${item.item.id}"`
  const title = item.type === 'course' ? item.item.subject : item.type === 'homework' ? item.item.subject : item.type === 'session' ? item.item.title : item.item.title
  const time = item.allDay ? 'Échéance' : item.startTime
  return `<article class="calendar-event event-${item.type} category-${item.type === 'event' ? categoryClasses[item.item.category] || 'other' : item.type}" title="${escapeHtml(title)}"><button class="calendar-event-main" ${editAttribute}><span>${escapeHtml(time)}</span> ${escapeHtml(title)}</button><button class="calendar-event-action" ${deleteAttribute} aria-label="Supprimer ${escapeHtml(title)}">${icons.close}</button></article>`
}

function renderMonthCalendar() {
  const view = state.calendarDate
  const year = view.getFullYear()
  const month = view.getMonth()
  const firstDay = new Date(year, month, 1)
  const offset = (firstDay.getDay() + 6) % 7
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells = Array.from({ length: offset + daysInMonth }, (_, index) => {
    if (index < offset) return '<div class="calendar-cell outside"></div>'
    const day = index - offset + 1
    const date = new Date(year, month, day, 12)
    const isToday = toDateInputValue(date) === toDateInputValue(new Date())
    const items = itemsForDate(date)
    return `<div class="calendar-cell ${isToday ? 'is-today' : ''}"><strong>${day}</strong><div class="calendar-cell-events">${items.slice(0, 4).map(calendarEventMarkup).join('')}${items.length > 4 ? `<span class="more-events">+${items.length - 4} autres</span>` : ''}</div></div>`
  }).join('')
  return `<div class="calendar-weekdays">${weekDays.map((day) => `<span>${day.slice(0, 3)}</span>`).join('')}</div><div class="calendar-grid">${cells}</div>`
}

function renderAgendaCalendar() {
  const dates = state.calendarView === 'day' ? [state.calendarDate] : Array.from({ length: 7 }, (_, index) => addDays(mondayOf(state.calendarDate), index))
  return `<div class="agenda-calendar ${state.calendarView === 'day' ? 'single-day' : ''}">${dates.map((date) => `<section class="agenda-day ${toDateInputValue(date) === toDateInputValue(new Date()) ? 'is-today' : ''}"><header><div><span>${formatDate(date, { weekday: 'long' })}</span><strong>${date.getDate()} ${formatDate(date, { month: 'long' })}</strong></div><button class="icon-button" data-open-modal="event" data-prefill-date="${toDateInputValue(date)}" aria-label="Ajouter un événement le ${formatDateLong(date)}">${icons.plus}</button></header>${itemsForDate(date).length ? `<div class="agenda-list">${itemsForDate(date).map(agendaItem).join('')}</div>` : '<p class="agenda-empty">Rien de prévu</p>'}</section>`).join('')}</div>`
}

function renderCalendar() {
  const monthLabel = state.calendarDate.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
  const viewLabel = state.calendarView === 'month' ? monthLabel : state.calendarView === 'week' ? `Semaine du ${formatDate(mondayOf(state.calendarDate), { day: 'numeric', month: 'long' })}` : formatDateLong(state.calendarDate)
  const canExport = state.data.courses.length || state.data.homework.length || state.data.events.length || state.data.plannerSessions.some((session) => ['accepted', 'done'].includes(session.status))
  const reminderOption = state.data.courses.length ? `<label class="toggle-control"><input type="checkbox" data-include-reminders ${state.settings.includeReviewReminders ? 'checked' : ''}><span class="toggle-track"></span><span><strong>Inclure les rappels J+3 / J+7</strong><small>Deux créneaux de révision après chaque prochain cours.</small></span></label>` : '<p class="sync-no-reminder">Les rappels J+3 / J+7 apparaissent dès qu’un cours est ajouté.</p>'
  const syncContent = canExport ? `<div class="sync-actions">${reminderOption}<button class="button button-primary" data-export-calendar><span>⌄</span> Exporter vers Apple Calendar</button></div>` : emptyState(icons.calendar, 'Ton calendrier est vide', 'Ajoute un cours, une tâche ou un événement pour commencer.', '<button class="button button-secondary" data-open-modal="event">Ajouter un événement</button>')
  const automaticSync = state.hostedSync ? `<div class="hosted-sync-active"><strong>Synchronisation automatique active</strong><p>${escapeHtml(state.hostedSyncStatus || 'Chaque modification est envoyée vers ton flux privé.')}</p><div class="feed-url"><input id="hostedFeedUrl" value="${escapeHtml(hostedFeedUrl())}" readonly aria-label="URL privée du calendrier"><button class="button button-secondary" data-copy-hosted-feed>Copier le lien</button></div><p class="sync-note">Abonne-toi une seule fois à ce lien dans Apple Calendar. Ne le partage pas : il donne accès à ton calendrier en lecture seule.</p></div>` : `<div class="hosted-sync-intro"><p>Crée un lien privé au format .ics. Tes cours, tâches, séances acceptées et événements seront envoyés automatiquement ; Apple Calendar actualisera l’abonnement à son rythme.</p><button class="button button-primary" data-enable-hosted-sync>Activer la synchronisation automatique</button>${state.hostedSyncStatus ? `<p class="sync-error">${escapeHtml(state.hostedSyncStatus)}</p>` : ''}</div>`
  return `<section class="calendar-header"><div><p class="eyebrow">TON TEMPS, TES PRIORITÉS</p><h2>${viewLabel.charAt(0).toUpperCase() + viewLabel.slice(1)}</h2><p class="calendar-subtitle">Cours, échéances, travail concentré et rendez-vous au même endroit.</p></div><div class="calendar-header-actions"><button class="button button-primary" data-open-modal="event"><span>${icons.plus}</span> Ajouter un événement</button><div class="calendar-controls"><div class="view-switch" aria-label="Vue du calendrier">${calendarViewButton('month', 'Mois')}${calendarViewButton('week', 'Semaine')}${calendarViewButton('day', 'Jour')}</div><div class="month-controls"><button class="icon-button" data-calendar-nav="previous" aria-label="Période précédente">${icons.arrowLeft}</button><button class="button button-secondary" data-calendar-today>Aujourd’hui</button><button class="icon-button" data-calendar-nav="next" aria-label="Période suivante">${icons.arrowRight}</button></div></div></div></section><section class="panel calendar-panel"><div class="calendar-toolbar"><label>Afficher<select data-calendar-filter aria-label="Filtrer le calendrier"><option value="all" ${state.calendarFilter === 'all' ? 'selected' : ''}>Tout</option><option value="course" ${state.calendarFilter === 'course' ? 'selected' : ''}>Cours</option><option value="homework" ${state.calendarFilter === 'homework' ? 'selected' : ''}>Échéances</option><option value="session" ${state.calendarFilter === 'session' ? 'selected' : ''}>Travail planifié</option><option value="event" ${state.calendarFilter === 'event' ? 'selected' : ''}>Événements</option></select></label></div>${state.calendarView === 'month' ? renderMonthCalendar() : renderAgendaCalendar()}</section><section class="panel hosted-sync-panel"><div class="sync-heading"><div><p class="eyebrow">SYNCHRONISATION AUTOMATIQUE</p><h2>Garde Apple Calendar à jour</h2><p>Apple s’abonne à un flux privé généré par Mon Planning.</p></div><span class="sync-icon">↻</span></div>${automaticSync}</section><section class="panel sync-panel"><div class="sync-heading"><div><p class="eyebrow">EXPORT LOCAL</p><h2>Créer un fichier Apple Calendar</h2><p>Le fichier .ics est généré sur cet appareil. Aucune donnée iCloud n’est demandée.</p></div><span class="sync-icon">◷</span></div>${syncContent}<p class="sync-note">Les éléments conservent des identifiants stables afin d’éviter les doublons. <a href="https://support.apple.com/fr-fr/guide/calendar/icl1023/mac" target="_blank" rel="noreferrer">Aide Apple pour importer un fichier .ics</a></p></section>`
}

function renderPlannerSession(session) {
  const task = state.data.homework.find((item) => item.id === session.taskId)
  return `<article class="planner-session status-${session.status}"><div class="session-date"><strong>${dateFromInput(session.date).getDate()}</strong><span>${formatDate(dateFromInput(session.date), { month: 'short' })}</span></div><div class="session-details"><div class="item-title-row"><span class="status-badge">${session.status === 'proposed' ? 'Suggestion' : session.status === 'done' ? 'Terminée' : 'Acceptée'}</span><h3>${escapeHtml(session.title)}</h3></div><p>${formatRange(session.startTime, session.endTime)} · ${formatMinutes(session.minutes)}${task ? ` · ${escapeHtml(task.subject)}` : ''}</p></div><div class="session-actions">${session.status === 'proposed' ? `<button class="button button-secondary small-button" data-accept-session="${session.id}">Accepter</button>` : `<button class="button button-secondary small-button" data-toggle-session="${session.id}">${session.status === 'done' ? 'À refaire' : 'Terminer'}</button>`}<button class="icon-button" data-edit-session="${session.id}" aria-label="Modifier la séance">${icons.edit}</button><button class="icon-button delete-button" data-delete-session="${session.id}" aria-label="Supprimer la séance">${icons.trash}</button></div></article>`
}

function renderPlanner() {
  const pending = state.data.homework.filter((item) => !item.done)
  const totalMinutes = pending.reduce((sum, item) => sum + getTaskMinutes(item), 0)
  const sessions = [...state.data.plannerSessions].sort((first, second) => `${first.date}${first.startTime}`.localeCompare(`${second.date}${second.startTime}`))
  const proposedCount = sessions.filter((session) => session.status === 'proposed').length
  const acceptedMinutes = sessions.filter((session) => ['accepted', 'done'].includes(session.status)).reduce((sum, session) => sum + session.minutes, 0)
  return `<section class="page-intro"><div><p class="eyebrow">ORGANISATION ASSISTÉE</p><h2>Planificateur intelligent</h2><p>Répartis tes tâches dans des créneaux disponibles, en tenant compte de tes cours et rendez-vous.</p></div><div class="planner-actions"><button class="button button-secondary" data-enable-notifications>${state.settings.notificationsEnabled ? 'Notifications activées' : 'Activer les notifications'}</button><button class="button button-primary" data-generate-plan><span>${icons.planner}</span> Générer un plan</button></div></section><section class="stat-grid planner-stats"><article class="stat-card purple"><p>TÂCHES À PLANIFIER</p><strong>${pending.length}</strong><small>${formatMinutes(totalMinutes)} estimées</small></article><article class="stat-card blue"><p>SÉANCES ACCEPTÉES</p><strong>${sessions.filter((session) => ['accepted', 'done'].includes(session.status)).length}</strong><small>${formatMinutes(acceptedMinutes)} programmées</small></article><article class="stat-card orange"><p>SUGGESTIONS</p><strong>${proposedCount}</strong><small>à valider ou modifier</small></article></section><section class="panel planner-explainer"><div class="planner-explainer-icon">${icons.planner}</div><div><h3>Comment ça marche ?</h3><p>Le planificateur travaille par tranches de 15 minutes, évite tes cours et événements, limite la charge à environ 3 heures par jour et répartit les tâches avant leur date limite.</p></div><button class="text-button" data-page="homework">Modifier mes tâches <span>→</span></button></section>${state.plannerWarnings.length ? `<section class="warning-panel"><strong>Quelques séances n’ont pas trouvé de place</strong><p>${state.plannerWarnings.map((warning) => `${escapeHtml(warning.title)} (${formatMinutes(warning.remainingMinutes)})`).join(' · ')}</p><button class="text-button" data-page="calendar">Voir mes contraintes <span>→</span></button></section>` : ''}<section class="panel planner-panel"><div class="panel-heading"><div><p class="eyebrow">TON PROGRAMME</p><h2>Séances proposées</h2></div>${proposedCount ? '<button class="button button-secondary" data-accept-all>Accepter toutes les suggestions</button>' : ''}</div>${sessions.length ? `<div class="planner-session-list">${sessions.map(renderPlannerSession).join('')}</div>` : emptyState(icons.planner, 'Aucun plan généré', pending.length ? 'Ajoute les durées, priorités et difficultés de tes tâches, puis génère un programme.' : 'Ajoute d’abord une tâche ou un devoir à planifier.', '<button class="button button-primary" data-open-modal="homework">Ajouter une tâche</button>')}</section>`
}

function renderPage(preserveFocus = false) {
  const focused = preserveFocus ? document.activeElement?.dataset?.focusKey : null
  const selection = preserveFocus && document.activeElement?.selectionStart
  const renderers = { dashboard: renderDashboard, schedule: renderSchedule, homework: renderHomework, calendar: renderCalendar, planner: renderPlanner }
  pageTitle.textContent = pages[state.page].title
  organizeButton.hidden = !['dashboard', 'planner'].includes(state.page)
  pageContent.innerHTML = renderers[state.page]()
  document.querySelectorAll('.nav-button').forEach((button) => button.classList.toggle('active', button.dataset.page === state.page))
  if (focused) {
    const input = document.querySelector(`[data-focus-key="${focused}"]`)
    input?.focus()
    if (selection !== undefined && input?.setSelectionRange) input.setSelectionRange(selection, selection)
  }
}

function showToast(message) {
  const toast = document.querySelector('#toast')
  toast.textContent = message
  toast.classList.add('show')
  window.clearTimeout(showToast.timeout)
  showToast.timeout = window.setTimeout(() => toast.classList.remove('show'), 3000)
}

function optionList(options, selected) {
  return options.map((option) => `<option value="${option.value}" ${Number(selected) === option.value ? 'selected' : ''}>${option.label}</option>`).join('')
}

function formValue(item, key, fallback = '') {
  return escapeHtml(item?.[key] ?? fallback)
}

function openModal(type, item = null, prefill = {}) {
  const isHomework = type === 'homework'
  const isEvent = type === 'event'
  const isSession = type === 'session'
  const editing = Boolean(item)
  const defaultDate = prefill.date || toDateInputValue(new Date())
  const formFields = isHomework ? `<label>Matière<input name="subject" required maxlength="40" value="${formValue(item, 'subject')}" placeholder="Ex. Mathématiques"></label><label>Intitulé<input name="title" required maxlength="100" value="${formValue(item, 'title')}" placeholder="Ex. Exercices page 42"></label><div class="form-row"><label>Type<select name="kind">${['Devoir', 'Contrôle', 'Tâche'].map((kind) => `<option ${item?.kind === kind ? 'selected' : ''}>${kind}</option>`).join('')}</select></label><label>À rendre le<input name="dueDate" type="date" required value="${formValue(item, 'dueDate', defaultDate)}"></label></div><div class="form-row"><label>Durée estimée<input name="estimatedMinutes" type="number" min="15" max="1440" step="15" required value="${formValue(item, 'estimatedMinutes', 60)}"><small class="field-help">En minutes</small></label><label>Priorité<select name="priority">${optionList(PRIORITIES, item?.priority || 2)}</select></label></div><label>Difficulté<select name="difficulty">${optionList(DIFFICULTIES, item?.difficulty || 3)}</select></label>` : isEvent ? `<label>Titre<input name="title" required maxlength="100" value="${formValue(item, 'title')}" placeholder="Ex. Rendez-vous chez le dentiste"></label><label>Date<input name="date" type="date" required value="${formValue(item, 'date', defaultDate)}"></label><div class="form-row"><label>Début<input name="startTime" type="time" required value="${formValue(item, 'startTime', '18:00')}"></label><label>Fin<input name="endTime" type="time" required value="${formValue(item, 'endTime', '19:00')}"></label></div><div class="form-row"><label>Catégorie<select name="category">${personalCategories.map((category) => `<option ${item?.category === category ? 'selected' : ''}>${category}</option>`).join('')}</select></label><label>Récurrence<select name="recurrence"><option value="none" ${!item?.recurrence || item.recurrence === 'none' ? 'selected' : ''}>Aucune</option><option value="weekly" ${item?.recurrence === 'weekly' ? 'selected' : ''}>Chaque semaine</option><option value="monthly" ${item?.recurrence === 'monthly' ? 'selected' : ''}>Chaque mois</option></select></label></div><label>Lieu <span class="optional">(facultatif)</span><input name="location" maxlength="100" value="${formValue(item, 'location')}" placeholder="Ex. Centre équestre"></label><label>Note <span class="optional">(facultatif)</span><textarea name="note" maxlength="300" placeholder="Détails utiles…">${formValue(item, 'note')}</textarea></label>` : isSession ? `<label>Intitulé<input name="title" required maxlength="120" value="${formValue(item, 'title', 'Séance de travail')}"></label><div class="form-row"><label>Date<input name="date" type="date" required value="${formValue(item, 'date', defaultDate)}"></label><label>État<select name="status"><option value="proposed" ${item?.status === 'proposed' ? 'selected' : ''}>Suggestion</option><option value="accepted" ${item?.status === 'accepted' ? 'selected' : ''}>Acceptée</option><option value="done" ${item?.status === 'done' ? 'selected' : ''}>Terminée</option></select></label></div><div class="form-row"><label>Début<input name="startTime" type="time" required value="${formValue(item, 'startTime', '17:00')}"></label><label>Fin<input name="endTime" type="time" required value="${formValue(item, 'endTime', '18:00')}"></label></div>` : `<label>Matière<input name="subject" required maxlength="40" value="${formValue(item, 'subject')}" placeholder="Ex. Français"></label><div class="form-row"><label>Jour<select name="day">${weekDays.slice(0, 5).map((day) => `<option ${item?.day === day || (!item && (prefill.day || 'Lundi') === day) ? 'selected' : ''}>${day}</option>`).join('')}</select></label><label>Heure<input name="time" type="time" required value="${formValue(item, 'time', '08:00')}"></label></div><label>Salle <span class="optional">(facultatif)</span><input name="room" maxlength="40" value="${formValue(item, 'room')}" placeholder="Ex. Salle 204"></label>`
  const title = editing ? (isHomework ? 'Modifier la tâche' : isEvent ? 'Modifier l’événement' : isSession ? 'Modifier la séance' : 'Modifier le cours') : (isHomework ? 'Ajouter une tâche' : isEvent ? 'Ajouter un événement' : 'Ajouter un cours')
  const subtitle = isHomework ? 'Une estimation réaliste aide le planificateur à mieux répartir ton travail.' : isEvent ? 'Les événements récurrents apparaîtront automatiquement dans tes vues et ton calendrier Apple.' : isSession ? 'Déplace cette séance sans perdre le lien avec la tâche d’origine.' : 'Ce créneau sera aussi pris en compte par le planificateur intelligent.'
  modalBackdrop.innerHTML = `<section class="modal" role="dialog" aria-modal="true" aria-labelledby="modalTitle"><button class="modal-close" data-close-modal aria-label="Fermer">${icons.close}</button><p class="eyebrow">${editing ? 'MODIFIER' : 'NOUVEL ÉLÉMENT'}</p><h2 id="modalTitle">${title}</h2><p class="modal-subtitle">${subtitle}</p><form id="itemForm" data-type="${type}" data-mode="${editing ? 'edit' : 'add'}" data-item-id="${item?.id || ''}">${formFields}<p class="form-message" aria-live="polite"></p><button class="button button-primary modal-submit" type="submit">${editing ? 'Enregistrer les changements' : `${icons.plus} Ajouter`}</button></form></section>`
  modalBackdrop.hidden = false
  document.body.classList.add('modal-open')
  modalBackdrop.querySelector('input')?.focus()
}

function closeModal() {
  modalBackdrop.hidden = true
  modalBackdrop.innerHTML = ''
  document.body.classList.remove('modal-open')
}

function findConflicts(record, type) {
  if (type === 'course') {
    const start = timeToMinutes(record.time)
    const conflicts = state.data.courses.filter((course) => course.id !== record.id && course.day === record.day && rangesOverlap(start, start + 60, timeToMinutes(course.time), timeToMinutes(course.time) + 60)).map((course) => `cours de ${course.subject}`)
    return [...new Set(conflicts)]
  }
  if (!['event', 'session'].includes(type)) return []
  const conflicts = []
  const start = timeToMinutes(record.startTime)
  const end = timeToMinutes(record.endTime)
  state.data.events.filter((event) => event.id !== record.id && eventOccursOnDate(event, dateFromInput(record.date))).forEach((event) => {
    if (rangesOverlap(start, end, timeToMinutes(event.startTime), timeToMinutes(event.endTime))) conflicts.push(event.title)
  })
  state.data.courses.filter((course) => courseWeekdays[course.day] === dateFromInput(record.date).getDay() && (type !== 'event' || true)).forEach((course) => {
    const courseStart = timeToMinutes(course.time)
    if (rangesOverlap(start, end, courseStart, courseStart + 60)) conflicts.push(`cours de ${course.subject}`)
  })
  state.data.plannerSessions.filter((session) => session.id !== record.id && session.date === record.date && ['accepted', 'done'].includes(session.status)).forEach((session) => {
    if (rangesOverlap(start, end, timeToMinutes(session.startTime), timeToMinutes(session.endTime))) conflicts.push(session.title)
  })
  return [...new Set(conflicts)]
}

function generatePlan() {
  const acceptedSessions = state.data.plannerSessions.filter((session) => ['accepted', 'done'].includes(session.status))
  const result = generateStudyPlan({ homework: state.data.homework, courses: state.data.courses, events: state.data.events, existingSessions: acceptedSessions, startDate: new Date() })
  state.data.plannerSessions = [...acceptedSessions, ...result.sessions]
  state.plannerWarnings = result.unscheduled
  saveData()
  showToast(result.sessions.length ? `${result.sessions.length} séance${result.sessions.length > 1 ? 's' : ''} proposée${result.sessions.length > 1 ? 's' : ''}.` : 'Aucun créneau disponible pour le moment.')
}

async function enableNotifications() {
  if (!('Notification' in window)) {
    showToast('Les notifications ne sont pas disponibles sur cet appareil.')
    return
  }
  const permission = Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission
  if (permission !== 'granted') {
    showToast('Les notifications restent désactivées dans les réglages du navigateur.')
    return
  }
  state.settings.notificationsEnabled = true
  saveData()
  const next = state.data.homework.filter((item) => !item.done).sort((first, second) => first.dueDate.localeCompare(second.dueDate))[0]
  if (next) new Notification('Mon Planning', { body: `${next.kind} à préparer : ${next.title} (${homeworkStatus(next)}).` })
  renderPage()
  showToast('Notifications activées pour les rappels à l’ouverture de l’application.')
}

function deleteItem(type, id) {
  const collections = { homework: 'homework', event: 'events', course: 'courses', session: 'plannerSessions' }
  const collection = collections[type]
  const item = state.data[collection].find((entry) => entry.id === id)
  if (!item || !window.confirm(`Supprimer ${type === 'homework' ? `« ${item.title} » et ses séances proposées` : `« ${item.title || item.subject} »`} ?`)) return
  state.data[collection] = state.data[collection].filter((entry) => entry.id !== id)
  if (type === 'homework') state.data.plannerSessions = state.data.plannerSessions.filter((session) => session.taskId !== id)
  saveData()
  renderPage()
  showToast(`${type === 'homework' ? 'Tâche' : type === 'course' ? 'Cours' : type === 'session' ? 'Séance' : 'Événement'} supprimé${type === 'event' ? '' : 'e'}.`)
}

function updateItemFromForm(form) {
  const values = new FormData(form)
  const type = form.dataset.type
  const id = form.dataset.itemId
  const mode = form.dataset.mode
  const common = mode === 'edit' ? { id } : { id: createId() }
  if (type === 'homework') {
    const item = { ...common, subject: values.get('subject').trim(), title: values.get('title').trim(), dueDate: values.get('dueDate'), done: state.data.homework.find((entry) => entry.id === id)?.done || false, kind: values.get('kind'), estimatedMinutes: Number(values.get('estimatedMinutes')), difficulty: Number(values.get('difficulty')), priority: Number(values.get('priority')) }
    state.data.homework = mode === 'edit' ? state.data.homework.map((entry) => entry.id === id ? item : entry) : [...state.data.homework, item]
    return item
  }
  if (type === 'course') {
    const item = { ...common, subject: values.get('subject').trim(), day: values.get('day'), time: values.get('time'), room: values.get('room').trim() }
    state.data.courses = mode === 'edit' ? state.data.courses.map((entry) => entry.id === id ? item : entry) : [...state.data.courses, item]
    return item
  }
  if (type === 'event') {
    const item = { ...common, title: values.get('title').trim(), date: values.get('date'), startTime: values.get('startTime'), endTime: values.get('endTime'), category: values.get('category'), recurrence: values.get('recurrence'), location: values.get('location').trim(), note: values.get('note').trim() }
    state.data.events = mode === 'edit' ? state.data.events.map((entry) => entry.id === id ? item : entry) : [...state.data.events, item]
    return item
  }
  const item = { ...common, taskId: state.data.plannerSessions.find((entry) => entry.id === id)?.taskId || createId(), title: values.get('title').trim(), date: values.get('date'), startTime: values.get('startTime'), endTime: values.get('endTime'), minutes: Math.max(15, timeToMinutes(values.get('endTime')) - timeToMinutes(values.get('startTime'))), status: values.get('status') }
  state.data.plannerSessions = mode === 'edit' ? state.data.plannerSessions.map((entry) => entry.id === id ? { ...entry, ...item } : entry) : [...state.data.plannerSessions, item]
  return item
}

function submitItemForm(event) {
  event.preventDefault()
  const form = event.target
  const values = new FormData(form)
  if (form.dataset.type === 'event' && values.get('endTime') <= values.get('startTime')) {
    form.querySelector('.form-message').textContent = 'L’heure de fin doit être après l’heure de début.'
    return
  }
  if (form.dataset.type === 'session' && values.get('endTime') <= values.get('startTime')) {
    form.querySelector('.form-message').textContent = 'La séance doit avoir une durée positive.'
    return
  }
  const preview = form.dataset.type === 'event' ? { id: form.dataset.itemId, date: values.get('date'), startTime: values.get('startTime'), endTime: values.get('endTime') } : form.dataset.type === 'session' ? { id: form.dataset.itemId, date: values.get('date'), startTime: values.get('startTime'), endTime: values.get('endTime') } : form.dataset.type === 'course' ? { id: form.dataset.itemId, day: values.get('day'), time: values.get('time') } : null
  const conflicts = preview ? findConflicts(preview, form.dataset.type) : []
  if (conflicts.length && form.dataset.conflictConfirmed !== 'true') {
    form.dataset.conflictConfirmed = 'true'
    form.querySelector('.form-message').textContent = `Attention : ce créneau chevauche ${conflicts.slice(0, 2).join(' et ')}. Enregistre à nouveau pour confirmer.`
    form.querySelector('.form-message').className = 'form-message warning-message'
    form.querySelector('.modal-submit').textContent = 'Enregistrer malgré le conflit'
    return
  }
  updateItemFromForm(form)
  saveData()
  closeModal()
  renderPage()
  showToast(form.dataset.mode === 'edit' ? 'Modifications enregistrées.' : 'Élément ajouté à ton planning.')
}

document.addEventListener('click', (event) => {
  const pageButton = event.target.closest('[data-page]')
  if (pageButton) { state.page = pageButton.dataset.page; renderPage(); return }
  const editHomework = event.target.closest('[data-edit-homework]')?.dataset.editHomework
  if (editHomework) { openModal('homework', state.data.homework.find((item) => item.id === editHomework)); return }
  const editEvent = event.target.closest('[data-edit-event]')?.dataset.editEvent
  if (editEvent) { openModal('event', state.data.events.find((item) => item.id === editEvent)); return }
  const editCourse = event.target.closest('[data-edit-course]')?.dataset.editCourse
  if (editCourse) { openModal('course', state.data.courses.find((item) => item.id === editCourse)); return }
  const editSession = event.target.closest('[data-edit-session]')?.dataset.editSession
  if (editSession) { openModal('session', state.data.plannerSessions.find((item) => item.id === editSession)); return }
  const modalButton = event.target.closest('[data-open-modal]')
  if (modalButton) { openModal(modalButton.dataset.openModal, null, { date: modalButton.dataset.prefillDate, day: modalButton.dataset.prefillDay }); return }
  if (event.target.closest('[data-close-modal]') || event.target === modalBackdrop) { closeModal(); return }
  const deletes = [['homework', 'delete-homework'], ['course', 'delete-course'], ['event', 'delete-event'], ['session', 'delete-session']]
  for (const [type, attribute] of deletes) {
    const id = event.target.closest(`[data-${attribute}]`)?.dataset[attribute]
    if (id) { deleteItem(type, id); return }
  }
  const direction = event.target.closest('[data-calendar-nav]')?.dataset.calendarNav
  if (direction) {
    const amount = direction === 'next' ? 1 : -1
    if (state.calendarView === 'month') { state.calendarDate.setDate(1); state.calendarDate.setMonth(state.calendarDate.getMonth() + amount) }
    else if (state.calendarView === 'week') state.calendarDate = addDays(state.calendarDate, amount * 7)
    else state.calendarDate = addDays(state.calendarDate, amount)
    renderPage()
    return
  }
  const view = event.target.closest('[data-calendar-view]')?.dataset.calendarView
  if (view) { state.calendarView = view; renderPage(); return }
  if (event.target.closest('[data-calendar-today]')) { state.calendarDate = startOfDay(); renderPage(); return }
  if (event.target.closest('[data-enable-hosted-sync]')) { activateHostedCalendarSync(); return }
  if (event.target.closest('[data-copy-hosted-feed]')) { copyHostedFeedUrl(); return }
  if (event.target.closest('[data-export-calendar]')) { createCalendarFile(); return }
  if (event.target.closest('[data-generate-plan]')) { generatePlan(); state.page = 'planner'; renderPage(); return }
  if (event.target.closest('[data-accept-all]')) { state.data.plannerSessions = state.data.plannerSessions.map((session) => session.status === 'proposed' ? { ...session, status: 'accepted' } : session); saveData(); renderPage(); showToast('Toutes les suggestions ont été acceptées.'); return }
  const acceptSession = event.target.closest('[data-accept-session]')?.dataset.acceptSession
  if (acceptSession) { state.data.plannerSessions = state.data.plannerSessions.map((session) => session.id === acceptSession ? { ...session, status: 'accepted' } : session); saveData(); renderPage(); showToast('Séance ajoutée à ton calendrier.'); return }
  const toggleSession = event.target.closest('[data-toggle-session]')?.dataset.toggleSession
  if (toggleSession) { state.data.plannerSessions = state.data.plannerSessions.map((session) => session.id === toggleSession ? { ...session, status: session.status === 'done' ? 'accepted' : 'done' } : session); saveData(); renderPage(); return }
  if (event.target.closest('[data-enable-notifications]')) { enableNotifications(); return }
})

document.addEventListener('input', (event) => {
  if (!event.target.matches('[data-homework-search]')) return
  state.homeworkSearch = event.target.value
  renderPage(true)
})

document.addEventListener('change', (event) => {
  if (event.target.matches('[data-include-reminders]')) { state.settings.includeReviewReminders = event.target.checked; saveData(); return }
  if (event.target.matches('[data-homework-status]')) { state.homeworkStatus = event.target.value; renderPage(); return }
  if (event.target.matches('[data-homework-kind]')) { state.homeworkKind = event.target.value; renderPage(); return }
  if (event.target.matches('[data-calendar-filter]')) { state.calendarFilter = event.target.value; renderPage(); return }
  if (event.target.matches('[data-toggle-homework]')) {
    const item = state.data.homework.find((homework) => homework.id === event.target.dataset.toggleHomework)
    if (item) { item.done = event.target.checked; saveData(); renderPage(); showToast(item.done ? 'Tâche terminée, bravo !' : 'Tâche remise à faire.') }
  }
})

document.addEventListener('submit', (event) => {
  if (event.target.id === 'itemForm') submitItemForm(event)
})

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !modalBackdrop.hidden) closeModal()
})

renderAppShell()
renderPage()
