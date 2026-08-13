import { neon } from '@neondatabase/serverless'

const allowedKeys = ['courses', 'homework', 'events', 'includeReviewReminders']

function cleanCalendar(value) {
  const calendar = {}
  allowedKeys.forEach((key) => { calendar[key] = value?.[key] ?? (key === 'includeReviewReminders' ? false : []) })
  if (!Array.isArray(calendar.courses) || !Array.isArray(calendar.homework) || !Array.isArray(calendar.events) || typeof calendar.includeReviewReminders !== 'boolean') throw new Error('Données de calendrier invalides.')
  return calendar
}

export default async function handler(request, response) {
  if (request.method !== 'POST') return response.status(405).json({ error: 'Méthode non autorisée.' })
  if (!process.env.DATABASE_URL) return response.status(503).json({ error: 'Le serveur de synchronisation n’est pas encore configuré.' })
  const { calendarId, editToken, calendar } = request.body || {}
  if (!/^[0-9a-f-]{36}$/i.test(calendarId || '') || !/^[0-9a-f-]{36}$/i.test(editToken || '')) return response.status(400).json({ error: 'Identifiants de synchronisation invalides.' })
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
