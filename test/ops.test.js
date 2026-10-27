const test = require('node:test'), assert = require('node:assert');
const { load, data } = require('./mocks');
function setup() {
  const env = load();
  env.ctx.importClientsCsv(data('clients.csv'));
  env.ctx.importVisitsCsv(data('visits.csv'));
  const crew = env.ctx.getSheet_('Crew', env.ctx.CONFIG.CREW_HEADERS);
  data('crew.csv').trim().split('\n').slice(1).forEach(l => crew.appendRow(l.split(',')));
  return env;
}
const col = (env, sheet, h) => env.sheets[sheet].rows[0].indexOf(h);

test('import is an upsert: second run adds nothing', () => {
  const env = setup();
  assert.strictEqual(env.sheets.Clients.rows.length, 5);
  assert.strictEqual(env.sheets.Jobs.rows.length, 6);
  const r = env.ctx.importVisitsCsv(data('visits.csv'));
  assert.deepStrictEqual({ ...r }, { added: 0, updated: 0 });
});

test('import rejects a CSV with a missing column', () => {
  const env = load();
  assert.throws(() => env.ctx.importClientsCsv('Name,Notes\nx,y'), /missing column "Client ID"/);
});

test('client folders are created once and linked', () => {
  const env = setup();
  assert.strictEqual(env.ctx.ensureClientFolders(), 4);
  assert.strictEqual(env.ctx.ensureClientFolders(), 0);
  assert.strictEqual(env.folders.length, 4);
  assert.match(String(env.sheets.Clients.rows[1][col(env, 'Clients', 'FolderUrl')]), /drive\.example/);
});

test('calendar sync creates active jobs only, skips drafts and cancellations', () => {
  const env = setup();
  const r = env.ctx.syncJobsToCalendar();
  assert.strictEqual(r.created, 2); assert.strictEqual(r.skipped, 3); assert.strictEqual(r.errors.length, 0);
  const ev = Object.values(env.calendars.CALENDAR_ID_TEAM_NORTH.events)[0];
  assert.strictEqual(ev.location, '100 Example St Unit 1');
  assert.strictEqual(ev.e - ev.s, 120 * 60000);
});

test('second sync updates the same events, no duplicates', () => {
  const env = setup();
  env.ctx.syncJobsToCalendar();
  const r = env.ctx.syncJobsToCalendar();
  assert.strictEqual(r.created, 0); assert.strictEqual(r.updated, 2);
  assert.strictEqual(Object.keys(env.calendars.CALENDAR_ID_TEAM_SOUTH.events).length, 1);
});

test('cancelling a job removes its event and clears EventId', () => {
  const env = setup();
  env.ctx.syncJobsToCalendar();
  const jobs = env.sheets.Jobs.rows, s = col(env, 'Jobs', 'Status'), e = col(env, 'Jobs', 'EventId');
  jobs[2][s] = 'Cancelled';
  const r = env.ctx.syncJobsToCalendar();
  assert.strictEqual(r.deleted, 1);
  assert.strictEqual(jobs[2][e], '');
  assert.strictEqual(Object.keys(env.calendars.CALENDAR_ID_TEAM_SOUTH.events).length, 0);
});

test('unknown crew is reported, other rows still sync', () => {
  const env = setup();
  env.sheets.Jobs.rows[1][col(env, 'Jobs', 'Crew')] = 'Team West';
  const r = env.ctx.syncJobsToCalendar();
  assert.strictEqual(r.created, 1);
  assert.match(r.errors[0], /V-5001: No calendar for crew "Team West"/);
});

// 0. bug fixes
test('crew change moves the event: removed from old calendar, created on new one', () => {
  const env = setup();
  env.ctx.syncJobsToCalendar();
  const jobs = env.sheets.Jobs.rows;
  jobs[2][col(env, 'Jobs', 'Crew')] = 'Team North';   // V-5002 South -> North
  const r = env.ctx.syncJobsToCalendar();
  assert.strictEqual(r.moved, 1);
  assert.strictEqual(Object.keys(env.calendars.CALENDAR_ID_TEAM_SOUTH.events).length, 0);
  assert.strictEqual(Object.keys(env.calendars.CALENDAR_ID_TEAM_NORTH.events).length, 2);
  assert.strictEqual(jobs[2][col(env, 'Jobs', 'CalendarId')], 'CALENDAR_ID_TEAM_NORTH');
  const r2 = env.ctx.syncJobsToCalendar();
  assert.strictEqual(r2.created, 0);
  assert.strictEqual(Object.keys(env.calendars.CALENDAR_ID_TEAM_NORTH.events).length, 2);
});

test('status back to Draft removes the event', () => {
  const env = setup();
  env.ctx.syncJobsToCalendar();
  const jobs = env.sheets.Jobs.rows;
  jobs[1][col(env, 'Jobs', 'Status')] = 'Draft';
  const r = env.ctx.syncJobsToCalendar();
  assert.strictEqual(r.deleted, 1);
  assert.strictEqual(Object.keys(env.calendars.CALENDAR_ID_TEAM_NORTH.events).length, 0);
  assert.strictEqual(jobs[1][col(env, 'Jobs', 'EventId')], '');
});

// 1. recurring
function addRules(env) {
  const sh = env.ctx.getSheet_('RecurringRules', env.ctx.CONFIG.RULE_HEADERS);
  data('recurring_rules.csv').trim().split('\n').slice(1).forEach(l => sh.appendRow(l.split(',')));
}
test('recurring rules create weekly and biweekly visits, skip inactive rules', () => {
  const env = setup(); addRules(env);
  const r = env.ctx.generateVisitsFromRules('2026-10-27');   // window to 2026-11-24
  // R-01 Mondays 11/02, 11/09, 11/16, 11/23 = 4; R-02 every 2nd Thu from 11/05: 11/05, 11/19 = 2
  assert.strictEqual(r.added, 6);
  const ids = env.sheets.Jobs.rows.map(x => x[0]);
  assert.ok(ids.includes('R-01-20261102') && ids.includes('R-02-20261119'));
  assert.ok(!ids.includes('R-02-20261112'));
  assert.ok(!ids.some(i => String(i).startsWith('R-03')));
  const row = env.sheets.Jobs.rows.find(x => x[0] === 'R-02-20261105');
  assert.strictEqual(row[col(env, 'Jobs', 'DurationMin')], 90);
  assert.match(row[col(env, 'Jobs', 'Instructions')], /Service window 07:00-08:30/);
});

test('recurring generation is idempotent and keeps office edits', () => {
  const env = setup(); addRules(env);
  env.ctx.generateVisitsFromRules('2026-10-27');
  const row = env.sheets.Jobs.rows.find(x => x[0] === 'R-01-20261109');
  row[col(env, 'Jobs', 'Start')] = '19:00';
  const r = env.ctx.generateVisitsFromRules('2026-10-27');
  assert.strictEqual(r.added, 0); assert.strictEqual(r.existing, 6);
  assert.strictEqual(row[col(env, 'Jobs', 'Start')], '19:00');
});

test('generated visits sync to the crew calendars', () => {
  const env = setup(); addRules(env);
  env.ctx.generateVisitsFromRules('2026-10-27');
  const s = env.ctx.syncJobsToCalendar();
  assert.strictEqual(s.created, 8);
  assert.strictEqual(s.errors.length, 0);
});

test('bad rule window is reported', () => {
  const env = setup();
  env.ctx.getSheet_('RecurringRules', env.ctx.CONFIG.RULE_HEADERS)
    .appendRow(['R-09', 'C-1001', 'Team North', 'Tue', 1, '10:00', '09:00', '2026-11-01', '', '', 'TRUE']);
  const r = env.ctx.generateVisitsFromRules('2026-10-27');
  assert.match(r.errors[0], /window end must be after start/);
});

// 2. record check and tracker
test('flags stale clients and duplicates by normalized name and address', () => {
  const env = setup();
  const r = env.ctx.flagRecords('2026-10-27', 6);
  const q = env.sheets.ReviewQueue.rows.slice(1).map(x => x[0]);
  assert.ok(q.includes('Clients|C-1003|Stale'));
  assert.ok(q.includes('Clients|C-1004|Stale'));
  assert.ok(q.includes('Clients|C-1001|Duplicate name'));
  assert.ok(q.includes('Clients|C-1004|Duplicate address'));
  assert.ok(!q.includes('Clients|C-1002|Stale'));
  assert.strictEqual(r.found, 6);
  assert.strictEqual(env.ctx.flagRecords('2026-10-27', 6).added, 0);
});

test('migration tracker counts imported, open flags and verified, keeps typed values', () => {
  const env = setup();
  env.ctx.flagRecords('2026-10-27', 6);
  let t = env.ctx.updateMigrationTracker();
  assert.strictEqual(t.Clients.imported, 4);
  assert.strictEqual(t.Clients.flagged, 6);
  assert.strictEqual(t.Clients.status, 'Needs review');
  assert.strictEqual(t.Visits.status, 'Verifying');
  assert.strictEqual(t.RecurringRules.status, 'Not started');
  // office resolves all flags and verifies visits
  const rq = env.sheets.ReviewQueue.rows, res = col(env, 'ReviewQueue', 'Resolved');
  rq.slice(1).forEach(x => { x[res] = 'TRUE'; });
  const tr = env.sheets.MigrationTracker.rows;
  tr.find(x => x[0] === 'Visits')[col(env, 'MigrationTracker', 'Verified')] = 5;
  t = env.ctx.updateMigrationTracker();
  assert.strictEqual(t.Clients.status, 'Verifying');
  assert.strictEqual(t.Visits.status, 'Done');
  assert.strictEqual(tr.find(x => x[0] === 'Visits')[col(env, 'MigrationTracker', 'Verified')], 5);
});

// 3. completion reporting
function submissions() {
  const lines = data('completion_form_responses.csv').trim().split('\n');
  const head = lines[0].split(',');
  return lines.slice(1).map(l => { const v = l.split(','); const nv = {}; head.forEach((h, i) => { nv[h] = [v[i]]; }); return { namedValues: nv }; });
}
test('form submit marks the visit completed and logs low supplies as a follow-up', () => {
  const env = setup();
  assert.strictEqual(env.ctx.onFormSubmit(submissions()[0]), 'Marked completed');
  const job = env.sheets.Jobs.rows.find(x => x[0] === 'V-5001');
  assert.strictEqual(job[col(env, 'Jobs', 'Status')], 'Completed');
  const f = env.sheets.FollowUps.rows.slice(1);
  assert.strictEqual(f.length, 1);
  assert.deepStrictEqual([f[0][4], f[0][5], f[0][6]], ['Supplies', 'Glass cleaner', 'Open']);
  assert.strictEqual(env.sheets.CompletionReports.rows[1][7], 'Marked completed');
});

test('completed visit stays on the calendar as history with a single [Done] prefix', () => {
  const env = setup();
  env.ctx.syncJobsToCalendar();
  env.ctx.onFormSubmit(submissions()[0]);
  const r = env.ctx.syncJobsToCalendar();
  assert.strictEqual(r.deleted, 0); assert.strictEqual(r.done, 1);
  const evs = Object.values(env.calendars.CALENDAR_ID_TEAM_NORTH.events);
  assert.strictEqual(evs.length, 1);
  assert.strictEqual(evs[0].title, '[Done] Sample Client A (fictional) | V-5001');
  const r2 = env.ctx.syncJobsToCalendar();
  assert.strictEqual(r2.done, 0);
  assert.strictEqual(evs[0].title, '[Done] Sample Client A (fictional) | V-5001');
});

test('crew change on a completed visit leaves the event where it is', () => {
  const env = setup();
  env.ctx.syncJobsToCalendar();
  env.ctx.onFormSubmit(submissions()[0]);
  env.ctx.syncJobsToCalendar();
  const job = env.sheets.Jobs.rows.find(x => x[0] === 'V-5001');
  job[col(env, 'Jobs', 'Crew')] = 'Team South';
  const r = env.ctx.syncJobsToCalendar();
  assert.strictEqual(r.moved, 0); assert.strictEqual(r.created, 0);
  assert.strictEqual(Object.keys(env.calendars.CALENDAR_ID_TEAM_NORTH.events).length, 1);
  assert.strictEqual(Object.keys(env.calendars.CALENDAR_ID_TEAM_SOUTH.events).length, 1);
  assert.strictEqual(job[col(env, 'Jobs', 'CalendarId')], 'CALENDAR_ID_TEAM_NORTH');
});

test('cancelled and draft still delete their events', () => {
  const env = setup();
  env.ctx.syncJobsToCalendar();
  const jobs = env.sheets.Jobs.rows, s = col(env, 'Jobs', 'Status');
  jobs[1][s] = 'Cancelled'; jobs[2][s] = 'Draft';
  const r = env.ctx.syncJobsToCalendar();
  assert.strictEqual(r.deleted, 2);
  assert.strictEqual(Object.keys(env.calendars.CALENDAR_ID_TEAM_NORTH.events).length, 0);
  assert.strictEqual(Object.keys(env.calendars.CALENDAR_ID_TEAM_SOUTH.events).length, 0);
});

test('not completed keeps status and raises not-completed and issue follow-ups', () => {
  const env = setup();
  assert.strictEqual(env.ctx.onFormSubmit(submissions()[1]), 'Not completed');
  const job = env.sheets.Jobs.rows.find(x => x[0] === 'V-5002');
  assert.strictEqual(job[col(env, 'Jobs', 'Status')], 'Confirmed');
  const types = env.sheets.FollowUps.rows.slice(1).map(x => x[4]);
  assert.deepStrictEqual(types, ['Not completed', 'Issue']);
});

test('unknown visit id is recorded, not applied, and flagged for checking', () => {
  const env = setup();
  const before = JSON.stringify(env.sheets.Jobs.rows);
  assert.strictEqual(env.ctx.onFormSubmit(submissions()[2]), 'Unknown VisitId');
  assert.strictEqual(JSON.stringify(env.sheets.Jobs.rows), before);
  assert.strictEqual(env.sheets.FollowUps.rows[1][4], 'Check report');
  assert.strictEqual(env.sheets.CompletionReports.rows.length, 2);
});

test('repeat submit and crew mismatch are handled', () => {
  const env = setup();
  const s = submissions()[0];
  env.ctx.onFormSubmit(s);
  s.namedValues.Crew = ['Team South'];
  s.namedValues['Supplies low'] = [''];
  assert.strictEqual(env.ctx.onFormSubmit(s), 'Already completed');
  const types = env.sheets.FollowUps.rows.slice(1).map(x => x[4]);
  assert.deepStrictEqual(types, ['Supplies', 'Crew mismatch']);
});

test('office summary counts the day and lists open follow-ups; email only if set', () => {
  const env = setup();
  submissions().forEach(s => env.ctx.onFormSubmit(s));
  const text = env.ctx.buildCompletionSummary('2026-11-02');
  assert.match(text, /Reports: 3/);
  assert.match(text, /Completed: 1/);
  assert.match(text, /Not completed: 1/);
  assert.match(text, /Unknown visit ids: 1/);
  assert.match(text, /Open follow-ups: 4/);
  assert.match(text, /- Issue \| V-5002 \| Front door locked/);
  assert.strictEqual(env.ctx.emailTodaySummary(), false);
  assert.strictEqual(env.mail.length, 0);
  env.props.OFFICE_SUMMARY_EMAIL = 'office-placeholder';
  assert.strictEqual(env.ctx.emailTodaySummary(), true);
  assert.strictEqual(env.mail.length, 1);
});
