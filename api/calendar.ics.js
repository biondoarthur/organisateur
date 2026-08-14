import { neon } from '@neondatabase/serverless'
import { buildCalendarIcs } from './_calendar-ics.js'

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export default async function handler(request, response) {
  const id = request.query.id
  if (!uuid.test(id || '')) return response.status(400).send('Identifiant de calendrier invalide.')
  if (!process.env.DATABASE_URL) return response.status(503).send('Synchronisation non configurée.')
  try {
    const sql = neon(process.env.DATABASE_URL)
    const result = await sql`SELECT calendar FROM mon_planning_calendars WHERE id = ${id}`
    if (!result.length) return response.status(404).send('Calendrier introuvable.')
    response.setHeader('Content-Type', 'text/calendar; charset=utf-8')
    response.setHeader('Content-Disposition', 'inline; filename="mon-planning.ics"')
    response.setHeader('Cache-Control', 'private, max-age=300')
    response.setHeader('X-Robots-Tag', 'noindex, nofollow')
    return response.status(200).send(buildCalendarIcs(result[0].calendar))
  } catch (error) {
    console.error('Calendar feed error', error)
    if (error?.code === '42P01') return response.status(404).send('Calendrier introuvable.')
    return response.status(500).send('Impossible de générer le calendrier.')
  }
}
