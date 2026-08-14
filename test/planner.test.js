import test from 'node:test'
import assert from 'node:assert/strict'
import { generateStudyPlan, getDailyWorkload, rangesOverlap, timeToMinutes } from '../src/lib/planner.js'

const taskId = '6ba7b810-9dad-11d1-80b4-00c04fd430c8'

test('répartit une tâche longue sur plusieurs jours disponibles', () => {
  const result = generateStudyPlan({
    startDate: new Date(2026, 9, 19, 12),
    horizonDays: 5,
    homework: [{ id: taskId, title: 'Préparer le contrôle', subject: 'Maths', dueDate: '2026-10-23', estimatedMinutes: 150, difficulty: 4, priority: 4, done: false }],
  })
  assert.equal(result.unscheduled.length, 0)
  assert.equal(result.sessions.reduce((sum, session) => sum + session.minutes, 0), 150)
  assert.ok(new Set(result.sessions.map((session) => session.date)).size > 1)
  for (let index = 0; index < result.sessions.length; index += 1) {
    for (let next = index + 1; next < result.sessions.length; next += 1) {
      if (result.sessions[index].date !== result.sessions[next].date) continue
      assert.equal(rangesOverlap(timeToMinutes(result.sessions[index].startTime), timeToMinutes(result.sessions[index].endTime), timeToMinutes(result.sessions[next].startTime), timeToMinutes(result.sessions[next].endTime)), false)
    }
  }
})

test('évite les cours et événements déjà présents', () => {
  const result = generateStudyPlan({
    startDate: new Date(2026, 9, 19, 12),
    horizonDays: 1,
    courses: [{ id: 'course-1', subject: 'Français', day: 'Lundi', time: '17:00' }],
    events: [{ id: 'event-1', title: 'Rendez-vous', date: '2026-10-19', startTime: '18:00', endTime: '19:00', recurrence: 'none' }],
    homework: [{ id: taskId, title: 'Lire', subject: 'Français', dueDate: '2026-10-20', estimatedMinutes: 45, done: false }],
  })
  assert.equal(result.sessions.length, 1)
  assert.equal(result.sessions[0].date, '2026-10-19')
  assert.ok(timeToMinutes(result.sessions[0].startTime) >= 19 * 60 || timeToMinutes(result.sessions[0].endTime) <= 17 * 60)
})

test('calcule la charge quotidienne et les chevauchements', () => {
  const sessions = [{ date: '2026-10-19', startTime: '17:00', endTime: '17:45', minutes: 45, status: 'proposed' }, { date: '2026-10-19', startTime: '18:00', endTime: '19:00', minutes: 60, status: 'accepted' }]
  assert.equal(getDailyWorkload(sessions, '2026-10-19'), 105)
  assert.equal(getDailyWorkload(sessions, '2026-10-19', false), 60)
  assert.equal(rangesOverlap(17 * 60, 18 * 60, 17 * 60 + 30, 19 * 60), true)
})
