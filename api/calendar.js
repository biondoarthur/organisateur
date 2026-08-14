import { neon } from '@neondatabase/serverless'

const allowedKeys = ['courses', 'homework', 'events', 'includeReviewReminders']
const weekdays = new Set(['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi'])
const categories = new Set(['Personnel', 'Sport', 'Équitation', 'Rendez-vous', 'Sortie', 'Vacances', 'École', 'Autre'])
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const date = /^\d{4}-\d{2}-\d{2}$/
const time = /^(?:[01]\d|2[0-3]):[0-5]\d$/

function text(value, limit) {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= limit
}

function cleanCalendar(value) {
  const calendar = {}
  allowedKeys.forEach((key) => { calendar[key] = value?.[key] ?? (key === 'includeReviewReminders' ? false : []) })
  if (!Array.isArray(calendar.courses) || !Array.isArray(calendar.homework) || !Array.isArray(calendar.events) || typeof calendar.includeReviewReminders !== 'boolean') throw new Error('Données de calendrier invalides.')
  if (calendar.courses.length > 300 || calendar.homework.length > 1000 || calendar.events.length > 1000) throw new Error('Trop d’éléments dans le calendrier.')
  calendar.courses.forEach((item) => { if (!uuid.test(item?.id || '') || !text(item.subject, 40) || !weekdays.has(item.day) || !time.test(item.time || '') || (item.room && !text(item.room, 40))) throw new Error('Cours invalide.') })
  calendar.homework.forEach((item) => { if (!uuid.test(item?.id || '') || !text(item.subject, 40) || !text(item.title, 100) || !date.test(item.dueDate || '') || typeof item.done !== 'boolean') throw new Error('Devoir invalide.') })
  calendar.events.forEach((item) => { if (!uuid.test(item?.id || '') || !text(item.title, 100) || !date.test(item.date || '') || !time.test(item.startTime || '') || !time.test(item.endTime || '') || item.endTime <= item.startTime || !categories.has(item.category) || (item.location && !text(item.location, 100)) || (item.note && (!text(item.note, 300)))) throw new Error('Événement invalide.') })
  return calendar
}

export default async function handler(request, response) {
  if (request.method !== 'POST') return response.status(405).json({ error: 'Méthode non autorisée.' })
  if (!process.env.DATABASE_URL) return response.status(503).json({ error: 'Le serveur de synchronisation n’est pas encore configuré.' })
  const { calendarId, editToken, calendar } = request.body || {}
  if (!uuid.test(calendarId || '') || !uuid.test(editToken || '')) return response.status(400).json({ error: 'Identifiants de synchronisation invalides.' })
  try {
    const data = cleanCalendar(calendar)
    const sql = neon(process.env.DATABASE_URL)
    await sql`CREATE TABLE IF NOT EXISTS mon_planning_calendars (id uuid PRIMARY KEY, edit_token uuid NOT NULL, calendar jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())`
    const existing = await sql`SELECT edit_token FROM mon_planning_calendars WHERE id = ${calendarId}`
    if (existing.length && existing[0].edit_token !== editToken) return response.status(403).json({ error: 'Cette synchronisation appartient à un autre appareil.' })
    if (existing.length) await sql`UPDATE mon_planning_calendars SET calendar = ${JSON.stringify(data)}::jsonb, updated_at = now() WHERE id = ${calendarId}`
    else await sql`INSERT INTO mon_planning_calendars (id, edit_token, calendar) VALUES (${calendarId}, ${editToken}, ${JSON.stringify(data)}::jsonb)`
    return response.status(200).json({ ok: true })
  } catch (error) {
    console.error('Calendar sync error', error)
    return response.status(500).json({ error: 'Impossible de sauvegarder le calendrier.' })
  }
}

export { cleanCalendar }
