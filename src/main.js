import './style.css'

const storageKey = 'mon-planning-data-v1'
const syncStorageKey = 'mon-planning-hosted-calendar-v1'
const today = new Date()
const state = {
  page: 'dashboard',
  calendarDate: new Date(today.getFullYear(), today.getMonth(), 1),
  includeReviewReminders: false,
  lastCalendarExportSignature: null,
  calendarExported: false,
  hostedSync: loadHostedSync(),
  hostedSyncStatus: '',
  data: loadData(),
}

const icons = {
  dashboard: '▦', schedule: '◫', homework: '✓', calendar: '◷', plus: '+', close: '×', trash: '⌫', arrowLeft: '‹', arrowRight: '›', sparkles: '✦', book: '▤', check: '✓', empty: '☼',
}

const personalCategories = ['Personnel', 'Sport', 'Équitation', 'Rendez-vous', 'Sortie', 'Vacances', 'École', 'Autre']
const categoryClasses = { Personnel: 'personal', Sport: 'sport', Équitation: 'riding', 'Rendez-vous': 'appointment', Sortie: 'outing', Vacances: 'holiday', École: 'school', Autre: 'other' }

const pages = {
  dashboard: { label: 'Tableau de bord', title: 'Tableau de bord', icon: icons.dashboard },
  schedule: { label: 'Emploi du temps', title: 'Emploi du temps', icon: icons.schedule },
  homework: { label: 'Devoirs', title: 'Mes devoirs', icon: icons.homework },
  calendar: { label: 'Calendrier', title: 'Calendrier', icon: icons.calendar },
}

function loadData() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey))
    return { courses: Array.isArray(saved?.courses) ? saved.courses : [], homework: Array.isArray(saved?.homework) ? saved.homework : [], events: Array.isArray(saved?.events) ? saved.events : [] }
  } catch {
    return { courses: [], homework: [], events: [] }
  }
}

function loadHostedSync() {
  try {
    const config = JSON.parse(localStorage.getItem(syncStorageKey))
    return /^[0-9a-f-]{36}$/i.test(config?.calendarId || '') && /^[0-9a-f-]{36}$/i.test(config?.editToken || '') ? config : null
  } catch {
    return null
  }
}

function saveData() {
  localStorage.setItem(storageKey, JSON.stringify(state.data))
  queueHostedCalendarSync()
}

function calendarPayload() {
  return { courses: state.data.courses, homework: state.data.homework, events: state.data.events, includeReviewReminders: state.includeReviewReminders }
}

function hostedFeedUrl(config = state.hostedSync) {
  return `${window.location.origin}/api/calendar.ics?id=${config.calendarId}`
}

async function sendHostedCalendar(config) {
  const response = await fetch('/api/calendar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...config, calendar: calendarPayload() }) })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(result.error || 'Synchronisation impossible.')
}

function queueHostedCalendarSync() {
  if (!state.hostedSync) return
  window.clearTimeout(queueHostedCalendarSync.timeout)
  queueHostedCalendarSync.timeout = window.setTimeout(async () => {
    try {
      state.hostedSyncStatus = 'Synchronisé automatiquement.'
      await sendHostedCalendar(state.hostedSync)
      if (state.page === 'calendar') renderPage()
    } catch (error) {
      state.hostedSyncStatus = 'La mise à jour automatique a échoué. Vérifie la configuration Vercel.'
      if (state.page === 'calendar') renderPage()
    }
  }, 500)
}

async function activateHostedCalendarSync() {
  const config = { calendarId: crypto.randomUUID(), editToken: crypto.randomUUID() }
  state.hostedSyncStatus = 'Activation de la synchronisation…'
  renderPage()
  try {
    await sendHostedCalendar(config)
    state.hostedSync = config
    state.hostedSyncStatus = 'Synchronisation automatique active.'
    localStorage.setItem(syncStorageKey, JSON.stringify(config))
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

function formatDate(date) {
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' }).format(date)
}

function dateFromInput(value) {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day)
}

function toDateInputValue(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function eventDateTime(event, field) {
  const [year, month, day] = event.date.split('-').map(Number)
  const [hours, minutes] = event[field].split(':').map(Number)
  return new Date(year, month - 1, day, hours, minutes, 0, 0)
}

const courseWeekdays = { Lundi: 1, Mardi: 2, Mercredi: 3, Jeudi: 4, Vendredi: 5 }
const icsWeekdays = { Lundi: 'MO', Mardi: 'TU', Mercredi: 'WE', Jeudi: 'TH', Vendredi: 'FR' }

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

function buildIcsEvent({ uid, start, end, summary, description, location = '', recurrence = '' }) {
  const lines = [
    'BEGIN:VEVENT',
    `UID:${uid}@mon-planning.local`,
    `DTSTAMP:${formatIcsUtc(new Date())}`,
    'SEQUENCE:0',
    `DTSTART:${formatIcsLocal(start)}`,
    `DTEND:${formatIcsLocal(end)}`,
    `SUMMARY:${escapeIcs(summary)}`,
    `DESCRIPTION:${escapeIcs(description)}`,
    'STATUS:CONFIRMED',
    'TRANSP:OPAQUE',
    'X-MON-PLANNING:TRUE',
  ]
  if (location) lines.splice(7, 0, `LOCATION:${escapeIcs(location)}`)
  if (recurrence) lines.splice(7, 0, recurrence)
  lines.push('END:VEVENT')
  return lines
}

function createCalendarFile() {
  const courses = [...state.data.courses].sort((a, b) => `${a.day}${a.time}${a.subject}`.localeCompare(`${b.day}${b.time}${b.subject}`))
  const events = [...state.data.events].sort((a, b) => `${a.date}${a.startTime}${a.title}`.localeCompare(`${b.date}${b.startTime}${b.title}`))
  const signature = JSON.stringify({ courses, events, includeReviewReminders: state.includeReviewReminders })
  if (signature === state.lastCalendarExportSignature) {
    showToast('Ce fichier a déjà été généré. Modifie un cours avant de créer une nouvelle version.')
    return
  }

  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Mon Planning//Emploi du temps//FR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:Mon Planning']
  for (const course of courses) {
    const start = nextCourseDate(course)
    const end = new Date(start.getTime() + 60 * 60 * 1000)
    const roomText = course.room ? ` Salle : ${course.room}.` : ''
    lines.push(...buildIcsEvent({
      uid: `course-${course.id}`,
      start,
      end,
      summary: course.subject,
      description: `Cours de ${course.subject}, le ${course.day} à ${course.time}.${roomText} Ajouté depuis Mon Planning.`,
      location: course.room,
      recurrence: `RRULE:FREQ=WEEKLY;BYDAY=${icsWeekdays[course.day]}`,
    }))

    if (state.includeReviewReminders) {
      ;[3, 7].forEach((daysAfter, index) => {
        const reminderStart = new Date(start)
        reminderStart.setDate(reminderStart.getDate() + daysAfter)
        reminderStart.setHours(19, 0, 0, 0)
        const reminderEnd = new Date(reminderStart.getTime() + 30 * 60 * 1000)
        lines.push(...buildIcsEvent({
          uid: `revision-${course.id}-${daysAfter}`,
          start: reminderStart,
          end: reminderEnd,
          summary: `Réviser ${course.subject} — cours du ${course.day.toLowerCase()}`,
          description: `Rappel J+${daysAfter} : révise ${course.subject}, après le cours du ${course.day} à ${course.time}.`,
        }))
      })
    }
  }
  for (const event of events) {
    const noteText = event.note ? ` ${event.note}` : ''
    lines.push(...buildIcsEvent({
      uid: `personal-${event.id}`,
      start: eventDateTime(event, 'startTime'),
      end: eventDateTime(event, 'endTime'),
      summary: event.title,
      description: `${event.category}.${noteText} Ajouté depuis Mon Planning.`,
      location: event.location,
    }))
  }
  lines.push('END:VCALENDAR')
  const contents = `${lines.map(foldIcsLine).join('\r\n')}\r\n`
  const blob = new Blob([contents], { type: 'text/calendar;charset=utf-8' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = 'mon-planning-emploi-du-temps.ics'
  document.body.append(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(link.href)
  state.lastCalendarExportSignature = signature
  state.calendarExported = true
  renderPage()
  const exportedCount = courses.length + events.length
  showToast(`${exportedCount} événement${exportedCount > 1 ? 's' : ''} exporté${exportedCount > 1 ? 's' : ''} vers Apple Calendar.`)
}

function emptyState(icon, title, text, action = '') {
  return `<div class="empty-state"><span class="empty-icon">${icon}</span><h3>${title}</h3><p>${text}</p>${action}</div>`
}

document.querySelector('#app').innerHTML = `
  <div class="app-shell">
    <aside class="sidebar">
      <a class="brand" href="#dashboard" aria-label="Mon Planning, tableau de bord"><span class="brand-mark">M</span><span>Mon <b>Planning</b></span></a>
      <p class="nav-label">MON ESPACE</p>
      <nav aria-label="Navigation principale">
        ${Object.entries(pages).map(([key, page]) => `<button class="nav-button" data-page="${key}"><span class="nav-icon">${page.icon}</span><span>${page.label}</span></button>`).join('')}
      </nav>
      <div class="sidebar-tip"><span>${icons.sparkles}</span><div><strong>Reste organisé</strong><p>Ajoute tes cours et devoirs au fur et à mesure.</p></div></div>
    </aside>
    <main class="main-content">
      <header class="topbar"><div><p class="greeting">Bonjour ! <span>Prêt·e pour ta journée ?</span></p><h1 id="pageTitle">Tableau de bord</h1></div><div class="header-actions"><button class="button button-secondary" id="organizeButton"><span>${icons.sparkles}</span> Organiser ma semaine</button><button class="button button-primary" data-open-modal="homework"><span>${icons.plus}</span> Ajouter</button></div></header>
      <div id="pageContent" class="page-content"></div>
    </main>
    <button class="mobile-add button button-primary" data-open-modal="homework" aria-label="Ajouter un devoir">${icons.plus}</button>
    <div class="toast" id="toast" role="status" aria-live="polite"></div>
    <div class="modal-backdrop" id="modalBackdrop" hidden></div>
  </div>
`

const pageContent = document.querySelector('#pageContent')
const pageTitle = document.querySelector('#pageTitle')
const organizeButton = document.querySelector('#organizeButton')
const modalBackdrop = document.querySelector('#modalBackdrop')

function renderDashboard() {
  const upcoming = state.data.homework.filter((item) => !item.done).sort((a, b) => a.dueDate.localeCompare(b.dueDate))
  const completed = state.data.homework.filter((item) => item.done).length
  return `
    <section class="hero-card"><div><p class="eyebrow">TON ESPACE D’ORGANISATION</p><h2>Une semaine sereine<br>commence ici.</h2><p>Centralise tes cours, garde le cap sur tes devoirs et avance à ton rythme.</p><button class="text-button" data-open-modal="homework">Ajouter mon premier devoir <span>→</span></button></div><span class="hero-art">✦</span></section>
    <section class="stat-grid" aria-label="Résumé de la semaine">
      <article class="stat-card purple"><span class="stat-icon">${icons.book}</span><p>COURS</p><strong>${state.data.courses.length}</strong><small>enregistré${state.data.courses.length > 1 ? 's' : ''}</small></article>
      <article class="stat-card orange"><span class="stat-icon">${icons.homework}</span><p>DEVOIRS À FAIRE</p><strong>${upcoming.length}</strong><small>${upcoming.length ? 'à ne pas oublier' : 'tout est à jour !'}</small></article>
      <article class="stat-card green"><span class="stat-icon">${icons.check}</span><p>TERMINÉS</p><strong>${completed}</strong><small>bravo pour tes progrès</small></article>
    </section>
    <section class="panel dashboard-panel"><div class="panel-heading"><div><p class="eyebrow">À NE PAS OUBLIER</p><h2>Prochains devoirs</h2></div><button class="text-button" data-page="homework">Voir tout <span>→</span></button></div>
      ${upcoming.length ? `<div class="compact-list">${upcoming.slice(0, 3).map(homeworkItem).join('')}</div>` : emptyState(icons.empty, 'Rien à rendre pour le moment', 'Ajoute un devoir pour retrouver tes échéances ici.', '<button class="button button-secondary" data-open-modal="homework">Ajouter un devoir</button>')}
    </section>
  `
}

function homeworkItem(item) {
  const date = dateFromInput(item.dueDate)
  return `<article class="homework-item ${item.done ? 'is-done' : ''}"><label class="check-control"><input type="checkbox" data-toggle-homework="${item.id}" ${item.done ? 'checked' : ''}><span></span></label><div class="date-badge"><strong>${date.getDate()}</strong><span>${date.toLocaleDateString('fr-FR', { month: 'short' }).replace('.', '')}</span></div><div class="homework-details"><h3>${escapeHtml(item.subject)}</h3><p>${escapeHtml(item.title)}</p></div><div class="homework-actions"><span class="due-label">${item.done ? 'Terminé' : formatDate(date)}</span><button class="icon-button delete-button" data-delete-homework="${item.id}" aria-label="Supprimer ce devoir">${icons.trash}</button></div></article>`
}

function renderHomework() {
  const sorted = [...state.data.homework].sort((a, b) => Number(a.done) - Number(b.done) || a.dueDate.localeCompare(b.dueDate))
  return `<section class="page-intro"><div><p class="eyebrow">TES PRIORITÉS</p><h2>Ce qu’il te reste à faire</h2><p>Coche un devoir quand il est terminé : tes progrès sont sauvegardés automatiquement.</p></div><button class="button button-primary" data-open-modal="homework"><span>${icons.plus}</span> Ajouter un devoir</button></section>
    <section class="panel homework-panel"><div class="panel-heading"><span class="count-pill">${state.data.homework.filter((item) => !item.done).length} à faire</span></div>${sorted.length ? `<div class="homework-list">${sorted.map(homeworkItem).join('')}</div>` : emptyState(icons.homework, 'Aucun devoir pour l’instant', 'Ajoute ta première tâche pour ne plus rien oublier.', '<button class="button button-primary" data-open-modal="homework">+ Ajouter un devoir</button>')}</section>`
}

function renderSchedule() {
  const days = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi']
  const coursesByDay = (day) => state.data.courses.filter((course) => course.day === day).sort((a, b) => a.time.localeCompare(b.time))
  return `<section class="page-intro"><div><p class="eyebrow">TA SEMAINE EN UN COUP D’ŒIL</p><h2>Mes cours</h2><p>Retrouve facilement les horaires et salles de chaque cours.</p></div><button class="button button-primary" data-open-modal="course"><span>${icons.plus}</span> Ajouter un cours</button></section>
    <section class="schedule-board">${days.map((day) => `<div class="day-column"><div class="day-title"><h3>${day}</h3><span>${coursesByDay(day).length} cours</span></div><div class="day-courses">${coursesByDay(day).length ? coursesByDay(day).map((course) => `<article class="course-card"><span class="course-time">${escapeHtml(course.time)}</span><div><h4>${escapeHtml(course.subject)}</h4><p>${escapeHtml(course.room || 'Salle non précisée')}</p></div><button class="icon-button delete-button" data-delete-course="${course.id}" aria-label="Supprimer ce cours">${icons.trash}</button></article>`).join('') : `<div class="day-empty">Aucun cours</div>`}</div></div>`).join('')}</section>`
}

function renderCalendar() {
  const view = state.calendarDate
  const year = view.getFullYear()
  const month = view.getMonth()
  const firstDay = new Date(year, month, 1)
  const offset = (firstDay.getDay() + 6) % 7
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const monthLabel = view.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
  const cells = Array.from({ length: offset + daysInMonth }, (_, index) => {
    if (index < offset) return '<div class="calendar-cell outside"></div>'
    const day = index - offset + 1
    const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    const homework = state.data.homework.filter((item) => item.dueDate === dateKey)
    const events = state.data.events.filter((item) => item.date === dateKey).sort((a, b) => a.startTime.localeCompare(b.startTime))
    const isToday = dateKey === toDateInputValue(new Date())
    return `<div class="calendar-cell ${isToday ? 'is-today' : ''}"><strong>${day}</strong>${events.map((item) => `<article class="calendar-event personal-event category-${categoryClasses[item.category] || 'other'}" title="${escapeHtml(item.title)} · ${escapeHtml(item.startTime)} à ${escapeHtml(item.endTime)}"><span>${escapeHtml(item.startTime)} ${escapeHtml(item.title)}</span><button data-delete-event="${item.id}" aria-label="Supprimer l’événement ${escapeHtml(item.title)}">${icons.close}</button></article>`).join('')}${homework.map((item) => `<span class="calendar-event school-event ${item.done ? 'is-done' : ''}" title="Devoir · ${escapeHtml(item.subject)} : ${escapeHtml(item.title)}">${escapeHtml(item.subject)}</span>`).join('')}</div>`
  }).join('')
  const canExport = state.data.courses.length || state.data.events.length
  const reminderOption = state.data.courses.length ? `<label class="toggle-control"><input type="checkbox" data-include-reminders ${state.includeReviewReminders ? 'checked' : ''}><span class="toggle-track"></span><span><strong>Inclure les rappels J+3 / J+7</strong><small>Deux créneaux de révision à 19 h après chaque prochain cours.</small></span></label>` : '<p class="sync-no-reminder">Les rappels J+3 / J+7 sont proposés lorsque ton emploi du temps contient des cours.</p>'
  const syncContent = canExport ? `<div class="sync-actions">${reminderOption}<button class="button button-primary" data-export-calendar><span>⌄</span> Synchroniser avec Apple Calendar</button></div>` : emptyState(icons.calendar, 'Ajoute un événement ou un cours', 'Ton calendrier personnel pourra ensuite être exporté vers Apple Calendar.', '<button class="button button-secondary" data-open-modal="event">Ajouter un événement</button>')
  const exportHelp = state.calendarExported ? `<div class="sync-help"><strong>Fichier généré !</strong><span>Sur Mac, ouvre le fichier téléchargé ou utilise Calendrier → Fichier → Importer. Sur iPhone ou iPad, envoie le fichier .ics vers l’appareil puis ouvre-le depuis Fichiers ou Mail pour l’ajouter à Calendrier.</span></div>` : ''
  const automaticSync = state.hostedSync ? `<div class="hosted-sync-active"><strong>Synchronisation automatique active</strong><p>${state.hostedSyncStatus || 'Chaque modification est envoyée vers ton flux privé.'}</p><div class="feed-url"><input id="hostedFeedUrl" value="${escapeHtml(hostedFeedUrl())}" readonly aria-label="URL privée du calendrier"><button class="button button-secondary" data-copy-hosted-feed>Copier le lien</button></div><p class="sync-note">Abonne-toi une seule fois à ce lien dans Apple Calendar. Ne le partage pas : il donne accès à ton calendrier en lecture seule.</p></div>` : `<div class="hosted-sync-intro"><p>Crée un lien privé au format .ics. Les modifications de tes cours, devoirs et événements seront ensuite envoyées automatiquement ; Apple Calendar actualisera l’abonnement à son rythme.</p><button class="button button-primary" data-enable-hosted-sync>Activer la synchronisation automatique</button>${state.hostedSyncStatus ? `<p class="sync-error">${escapeHtml(state.hostedSyncStatus)}</p>` : ''}</div>`
  return `<section class="calendar-header"><div><p class="eyebrow">MON TEMPS, MES PROJETS</p><h2>${monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1)}</h2><p class="calendar-subtitle">École, loisirs, rendez-vous : tout ton quotidien au même endroit.</p></div><div class="calendar-header-actions"><button class="button button-primary" data-open-modal="event"><span>${icons.plus}</span> Ajouter un événement</button><div class="month-controls"><button class="icon-button" data-calendar-nav="previous" aria-label="Mois précédent">${icons.arrowLeft}</button><button class="button button-secondary" data-calendar-today>Aujourd’hui</button><button class="icon-button" data-calendar-nav="next" aria-label="Mois suivant">${icons.arrowRight}</button></div></div></section>
    <section class="panel calendar-panel"><div class="calendar-weekdays"><span>Lun</span><span>Mar</span><span>Mer</span><span>Jeu</span><span>Ven</span><span>Sam</span><span>Dim</span></div><div class="calendar-grid">${cells}</div></section>
    <section class="panel hosted-sync-panel"><div class="sync-heading"><div><p class="eyebrow">SYNCHRONISATION AUTOMATIQUE</p><h2>Garde Apple Calendar à jour</h2><p>Sans connexion iCloud : Apple s’abonne à un flux privé généré par Mon Planning.</p></div><span class="sync-icon">↻</span></div>${automaticSync}</section>
    <section class="panel sync-panel"><div class="sync-heading"><div><p class="eyebrow">SYNCHRONISATION</p><h2>Envoie ton calendrier vers Apple Calendar</h2><p>Événements personnels et emploi du temps sont réunis dans un fichier .ics créé sur ton appareil. Aucune connexion ni donnée iCloud n’est demandée.</p></div><span class="sync-icon">◷</span></div>${syncContent}${exportHelp}<p class="sync-note">Les événements conservent des identifiants stables afin d’éviter les doublons lors d’un nouvel export. <a href="https://support.apple.com/fr-fr/guide/calendar/icl1023/mac" target="_blank" rel="noreferrer">Aide Apple pour importer un fichier .ics</a></p></section>`
}

function renderPage() {
  const renderers = { dashboard: renderDashboard, schedule: renderSchedule, homework: renderHomework, calendar: renderCalendar }
  pageTitle.textContent = pages[state.page].title
  organizeButton.hidden = state.page !== 'dashboard'
  pageContent.innerHTML = renderers[state.page]()
  document.querySelectorAll('.nav-button').forEach((button) => button.classList.toggle('active', button.dataset.page === state.page))
}

function showToast(message) {
  const toast = document.querySelector('#toast')
  toast.textContent = message
  toast.classList.add('show')
  window.clearTimeout(showToast.timeout)
  showToast.timeout = window.setTimeout(() => toast.classList.remove('show'), 2800)
}

function openModal(type) {
  const isHomework = type === 'homework'
  const isEvent = type === 'event'
  const formFields = isHomework ? `<label>Matière<input name="subject" required maxlength="40" placeholder="Ex. Mathématiques"></label><label>À faire<input name="title" required maxlength="100" placeholder="Ex. Exercices page 42"></label><label>À rendre le<input name="dueDate" type="date" required value="${toDateInputValue(new Date())}"></label>` : isEvent ? `<label>Titre<input name="title" required maxlength="100" placeholder="Ex. Rendez-vous chez le dentiste"></label><label>Date<input name="date" type="date" required value="${toDateInputValue(new Date())}"></label><div class="form-row"><label>Début<input name="startTime" type="time" required value="18:00"></label><label>Fin<input name="endTime" type="time" required value="19:00"></label></div><label>Catégorie<select name="category">${personalCategories.map((category) => `<option>${category}</option>`).join('')}</select></label><label>Lieu <span class="optional">(facultatif)</span><input name="location" maxlength="100" placeholder="Ex. Centre équestre"></label><label>Note <span class="optional">(facultatif)</span><textarea name="note" maxlength="300" placeholder="Détails utiles…"></textarea></label>` : `<label>Matière<input name="subject" required maxlength="40" placeholder="Ex. Français"></label><div class="form-row"><label>Jour<select name="day">${['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi'].map((day) => `<option>${day}</option>`).join('')}</select></label><label>Heure<input name="time" type="time" required value="08:00"></label></div><label>Salle <span class="optional">(facultatif)</span><input name="room" maxlength="40" placeholder="Ex. Salle 204"></label>`
  const title = isHomework ? 'Ajouter un devoir' : isEvent ? 'Ajouter un événement' : 'Ajouter un cours'
  const subtitle = isHomework ? 'Ajoute une échéance pour garder l’esprit léger.' : isEvent ? 'Fais de la place pour ce qui compte dans ta vie.' : 'Ajoute un créneau à ton emploi du temps.'
  modalBackdrop.innerHTML = `<section class="modal" role="dialog" aria-modal="true" aria-labelledby="modalTitle"><button class="modal-close" data-close-modal aria-label="Fermer">${icons.close}</button><p class="eyebrow">NOUVEL ÉLÉMENT</p><h2 id="modalTitle">${title}</h2><p class="modal-subtitle">${subtitle}</p><form id="addForm" data-type="${type}">${formFields}<button class="button button-primary modal-submit" type="submit">${icons.plus} Ajouter</button></form></section>`
  modalBackdrop.hidden = false
  document.body.classList.add('modal-open')
  modalBackdrop.querySelector('input').focus()
}

function closeModal() {
  modalBackdrop.hidden = true
  modalBackdrop.innerHTML = ''
  document.body.classList.remove('modal-open')
}

function organizeWeek() {
  organizeButton.disabled = true
  organizeButton.innerHTML = '<span>↻</span> Organisation…'
  window.setTimeout(() => {
    organizeButton.disabled = false
    organizeButton.innerHTML = `<span>${icons.sparkles}</span> Organiser ma semaine`
    showToast(state.data.courses.length || state.data.homework.length ? 'Ta semaine est organisée avec tes données.' : 'Ajoute des cours ou des devoirs pour organiser ta semaine.')
  }, 650)
}

document.addEventListener('click', (event) => {
  const pageButton = event.target.closest('[data-page]')
  if (pageButton) { state.page = pageButton.dataset.page; renderPage(); return }
  const modalButton = event.target.closest('[data-open-modal]')
  if (modalButton) { openModal(modalButton.dataset.openModal); return }
  if (event.target.closest('[data-close-modal]') || event.target === modalBackdrop) { closeModal(); return }
  const homeworkId = event.target.closest('[data-delete-homework]')?.dataset.deleteHomework
  if (homeworkId) { state.data.homework = state.data.homework.filter((item) => item.id !== homeworkId); saveData(); renderPage(); showToast('Devoir supprimé.'); return }
  const courseId = event.target.closest('[data-delete-course]')?.dataset.deleteCourse
  if (courseId) { state.data.courses = state.data.courses.filter((item) => item.id !== courseId); saveData(); renderPage(); showToast('Cours supprimé.'); return }
  const eventId = event.target.closest('[data-delete-event]')?.dataset.deleteEvent
  if (eventId) { state.data.events = state.data.events.filter((item) => item.id !== eventId); saveData(); renderPage(); showToast('Événement supprimé.'); return }
  if (event.target.closest('[data-enable-hosted-sync]')) { activateHostedCalendarSync(); return }
  if (event.target.closest('[data-copy-hosted-feed]')) { copyHostedFeedUrl(); return }
  const direction = event.target.closest('[data-calendar-nav]')?.dataset.calendarNav
  if (direction) { state.calendarDate.setMonth(state.calendarDate.getMonth() + (direction === 'next' ? 1 : -1)); renderPage(); return }
  if (event.target.closest('[data-calendar-today]')) { state.calendarDate = new Date(today.getFullYear(), today.getMonth(), 1); renderPage() }
  if (event.target.closest('[data-export-calendar]')) { createCalendarFile() }
})

document.addEventListener('change', (event) => {
  if (event.target.matches('[data-include-reminders]')) {
    state.includeReviewReminders = event.target.checked
    queueHostedCalendarSync()
    return
  }
  if (!event.target.matches('[data-toggle-homework]')) return
  const item = state.data.homework.find((homework) => homework.id === event.target.dataset.toggleHomework)
  if (item) { item.done = event.target.checked; saveData(); renderPage(); showToast(item.done ? 'Bravo, devoir terminé !' : 'Devoir remis à faire.') }
})

document.addEventListener('submit', (event) => {
  if (event.target.id !== 'addForm') return
  event.preventDefault()
  const form = new FormData(event.target)
  if (event.target.dataset.type === 'homework') state.data.homework.push({ id: crypto.randomUUID(), subject: form.get('subject').trim(), title: form.get('title').trim(), dueDate: form.get('dueDate'), done: false })
  else if (event.target.dataset.type === 'event') {
    if (form.get('endTime') <= form.get('startTime')) { showToast('L’heure de fin doit être après l’heure de début.'); return }
    state.data.events.push({ id: crypto.randomUUID(), title: form.get('title').trim(), date: form.get('date'), startTime: form.get('startTime'), endTime: form.get('endTime'), category: form.get('category'), location: form.get('location').trim(), note: form.get('note').trim() })
  } else state.data.courses.push({ id: crypto.randomUUID(), subject: form.get('subject').trim(), day: form.get('day'), time: form.get('time'), room: form.get('room').trim() })
  saveData(); closeModal(); renderPage(); showToast(event.target.dataset.type === 'homework' ? 'Devoir ajouté à ta liste.' : event.target.dataset.type === 'event' ? 'Événement ajouté à ton calendrier.' : 'Cours ajouté à ton emploi du temps.')
})

organizeButton.addEventListener('click', organizeWeek)
renderPage()

