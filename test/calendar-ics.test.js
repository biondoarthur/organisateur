import test from 'node:test'
import assert from 'node:assert/strict'
import { buildCalendarIcs } from '../api/_calendar-ics.js'
import { cleanCalendar } from '../api/calendar.js'

const id = '6ba7b810-9dad-11d1-80b4-00c04fd430c8'

test('génère des UID stables, les devoirs et le fuseau Europe/Paris', () => {
  const ics = buildCalendarIcs({
    courses: [{ id, subject: 'Maths', day: 'Lundi', time: '09:00', room: '204' }],
    homework: [{ id, subject: 'Français', title: 'Lire le chapitre 2', dueDate: '2026-10-25', done: false }],
    events: [{ id, title: 'Sport', date: '2026-10-25', startTime: '18:00', endTime: '19:00', category: 'Sport', location: '', note: '' }],
    includeReviewReminders: true,
  })
  assert.match(ics, new RegExp(`UID:course-${id}@mon-planning\\.local`))
  assert.match(ics, /DTSTART;TZID=Europe\/Paris:/)
  assert.match(ics, /RRULE:FREQ=WEEKLY;BYDAY=MO/)
  assert.match(ics, /UID:revision-.*-3@mon-planning\.local/)
  assert.match(ics, /UID:homework-.*@mon-planning\.local/)
  assert.match(ics, /DTSTART;VALUE=DATE:20261025/)
})

test('échappe les champs ICS et ne duplique pas les UID lors d’une mise à jour', () => {
  const calendar = {
    courses: [],
    homework: [],
    events: [{ id, title: 'Réunion; équipe, été', date: '2026-10-25', startTime: '18:00', endTime: '19:00', category: 'Personnel', location: 'Salle A, étage 2', note: 'ligne 1\nligne 2' }],
  }
  const first = buildCalendarIcs(calendar)
  const second = buildCalendarIcs(calendar)
  assert.equal(first, second)
  assert.match(first, /SUMMARY:Réunion\\; équipe\\, été/)
  assert.match(first, /DESCRIPTION:Personnel\. ligne 1\\nligne 2 Ajouté/)
  assert.equal((first.match(new RegExp(`UID:personal-${id}@mon-planning\\.local`, 'g')) || []).length, 1)
})

test('valide le contrat API du calendrier et rejette les données client invalides', () => {
  const valid = { courses: [], homework: [], events: [], includeReviewReminders: false }
  assert.deepEqual(cleanCalendar(valid), valid)
  assert.throws(() => cleanCalendar({ ...valid, events: [{ id: 'bad', title: 'x' }] }), /Événement invalide/)
  assert.throws(() => cleanCalendar({ ...valid, includeReviewReminders: 'true' }), /Données de calendrier invalides/)
})
