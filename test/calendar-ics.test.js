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
  const valid = { courses: [], homework: [], events: [], plannerSessions: [], includeReviewReminders: false }
  assert.deepEqual(cleanCalendar(valid), valid)
  assert.throws(() => cleanCalendar({ ...valid, events: [{ id: 'bad', title: 'x' }] }), /Événement invalide/)
  assert.throws(() => cleanCalendar({ ...valid, plannerSessions: [{ id, taskId: id, title: 'x', date: '2026-10-25', startTime: '18:00', endTime: '19:00', minutes: 60, status: 'broken' }] }), /Séance de travail invalide/)
  assert.throws(() => cleanCalendar({ ...valid, includeReviewReminders: 'true' }), /Données de calendrier invalides/)
})

test('exporte les séances acceptées et les événements récurrents avec des UID stables', () => {
  const ics = buildCalendarIcs({
    courses: [],
    homework: [],
    events: [{ id, title: 'Cours de piano', date: '2026-10-25', startTime: '18:00', endTime: '19:00', category: 'Personnel', recurrence: 'weekly', location: '', note: '' }],
    plannerSessions: [{ id: '6ba7b811-9dad-11d1-80b4-00c04fd430c8', taskId: id, title: 'Réviser les fractions', date: '2026-10-24', startTime: '10:00', endTime: '10:45', minutes: 45, status: 'accepted' }],
  })
  assert.match(ics, /RRULE:FREQ=WEEKLY/)
  assert.match(ics, /UID:study-6ba7b811-9dad-11d1-80b4-00c04fd430c8@mon-planning\.local/)
  assert.doesNotMatch(ics, /status-proposed/)
})
