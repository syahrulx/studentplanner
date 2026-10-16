/**
 * Phone calendar auto-sync: what changes and, more importantly, what never does.
 * Run: npx --yes tsx tests/calendarSync.test.ts
 */
import assert from 'node:assert/strict';
import type { Event as DeviceEvent } from 'expo-calendar';
import { calendarEventToTask } from '../src/lib/calendarImport';
import { calendarFields, calendarSource, phoneStateByTaskId, planCalendarSync } from '../src/lib/calendarSync';
import type { Task } from '../src/types';

const titles = new Map([['CAL1', 'CA26006 UMPSA']]);
const ev = (id: string, start: string, extra: Partial<DeviceEvent> = {}) =>
  ({ id, calendarId: 'CAL1', title: 'Club Open Day', startDate: start, endDate: start, allDay: false, location: 'DK1', notes: '', ...extra }) as DeviceEvent;
const imported = (e: DeviceEvent): Task => calendarEventToTask(e, 'CAL1', 'CA26006 UMPSA');
const plan = (tasks: Task[], events: DeviceEvent[], snaps = {}) => planCalendarSync(tasks, phoneStateByTaskId(events, titles), snaps);

// The ticket: moved from 17 to 18 Oct on the phone, untouched in Rencana -> follows.
const e17 = ev('EV1:X', '2026-10-17T08:00:00');
const t = imported(e17);
assert.ok(calendarSource(t), 'iOS event ids with ":" still parse');
const snap = { [t.id]: calendarFields(t) };
let r = plan([t], [ev('EV1:X', '2026-10-18T09:30:00')], snap);
assert.deepEqual(r.updates[0].changes, { dueDate: '2026-10-18', dueTime: '09:30' });

// Nothing moved -> nothing written.
assert.equal(plan([t], [e17], snap).updates.length, 0);

// Student changed the date in Rencana -> their date wins, even if the phone moves too.
const edited = { ...t, dueDate: '2026-10-20' };
r = plan([edited], [ev('EV1:X', '2026-10-18T08:00:00')], snap);
assert.equal(r.updates.length, 0);
// ...but a phone rename still comes through, since the title wasn't edited here.
r = plan([edited], [ev('EV1:X', '2026-10-18T08:00:00', { title: 'Club Day (moved)' })], snap);
assert.deepEqual(Object.keys(r.updates[0].changes), ['title']);

// Done, deleted on the phone, repeating, or not from the calendar -> untouched.
assert.equal(plan([{ ...t, isDone: true }], [ev('EV1:X', '2026-10-18T08:00:00')], snap).updates.length, 0);
r = plan([t], [], snap);
assert.equal(r.updates.length, 0);
assert.deepEqual(r.snapshots, snap, 'a missing event keeps its snapshot');
assert.equal(plan([t], [ev('EV1:X', '2026-10-18T08:00:00', { recurrenceRule: { frequency: 'weekly' } as any })], snap).updates.length, 0);
assert.equal(plan([t], [ev('EV1:X', '2026-10-18T08:00:00'), ev('EV1:X', '2026-10-25T08:00:00')], snap).updates.length, 0);
const own: Task = { ...t, id: 'manual-1', sourceMessage: undefined };
assert.equal(plan([own], [ev('EV1:X', '2026-10-18T08:00:00')], snap).updates.length, 0);

// Imported before this version (no snapshot): untouched title/notes -> date follows the phone.
assert.deepEqual(plan([t], [ev('EV1:X', '2026-10-18T08:00:00')]).updates[0].changes, { dueDate: '2026-10-18' });
// ...edited title -> trust nothing this time, and remember the phone's values.
r = plan([{ ...t, title: 'My own name' }], [ev('EV1:X', '2026-10-18T08:00:00')]);
assert.equal(r.updates.length, 0);
assert.equal(r.snapshots[t.id].dueDate, '2026-10-18');

// Snapshots of tasks deleted in Rencana are dropped.
assert.deepEqual(plan([], [e17], snap).snapshots, {});

console.log('calendarSync: all tests passed');
