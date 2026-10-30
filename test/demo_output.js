// node test/demo_output.js : runs the mock flow end to end (import, recurring visits,
// crew calendar sync, record check, completion form) on the same mocks as test/ops.test.js
// and prints the resulting sheet rows, calendar events and office summary as plain tables.
// docs/local_test_output.png is rendered from this output by docs/render_local_test_output.py.
const { load, data } = require('./mocks');

function printTable(title, headers, rows) {
  console.log('\n=== ' + title + ' (' + rows.length + ' row' + (rows.length === 1 ? '' : 's') + ') ===');
  const widths = headers.map((h, i) => Math.max(String(h).length, ...rows.map(r => String(r[i]).length)));
  const line = cells => cells.map((c, i) => String(c).padEnd(widths[i])).join(' | ');
  console.log(line(headers));
  console.log(widths.map(w => '-'.repeat(w)).join('-+-'));
  rows.forEach(r => console.log(line(r)));
}

function sheetTable(env, name, columns) {
  const rows = env.sheets[name].rows;
  const head = rows[0];
  const idx = columns.map(c => head.indexOf(c));
  return rows.slice(1).map(r => idx.map(i => r[i]));
}

const env = load();

const importClients = env.ctx.importClientsCsv(data('clients.csv'));
console.log('Import clients: ' + JSON.stringify(importClients));
const importVisits = env.ctx.importVisitsCsv(data('visits.csv'));
console.log('Import visits: ' + JSON.stringify(importVisits));

const crewSh = env.ctx.getSheet_('Crew', env.ctx.CONFIG.CREW_HEADERS);
data('crew.csv').trim().split('\n').slice(1).forEach(l => crewSh.appendRow(l.split(',')));

const rulesSh = env.ctx.getSheet_('RecurringRules', env.ctx.CONFIG.RULE_HEADERS);
data('recurring_rules.csv').trim().split('\n').slice(1).forEach(l => rulesSh.appendRow(l.split(',')));

const generated = env.ctx.generateVisitsFromRules('2026-10-27');
console.log('Generate recurring visits: ' + JSON.stringify(generated));

const sync1 = env.ctx.syncJobsToCalendar();
console.log('Calendar sync (before completion form): ' + JSON.stringify(sync1));

const flagged = env.ctx.flagRecords('2026-10-27', 6);
console.log('Record check: ' + JSON.stringify(flagged));

const tracker = env.ctx.updateMigrationTracker();
console.log('Migration tracker: ' + JSON.stringify(tracker));

const lines = data('completion_form_responses.csv').trim().split('\n');
const head = lines[0].split(',');
const submissions = lines.slice(1).map(l => {
  const v = l.split(',');
  const namedValues = {};
  head.forEach((h, i) => { namedValues[h] = [v[i]]; });
  return { namedValues };
});
submissions.forEach(s => {
  const result = env.ctx.onFormSubmit(s);
  console.log('Completion form (Visit ID ' + s.namedValues['Visit ID'][0] + '): ' + result);
});

const sync2 = env.ctx.syncJobsToCalendar();
console.log('Calendar sync (after completion form): ' + JSON.stringify(sync2));

printTable('Clients', ['ClientId', 'ClientName', 'ServiceType', 'Address'],
  sheetTable(env, 'Clients', ['ClientId', 'ClientName', 'ServiceType', 'Address']));

printTable('Jobs', ['JobId', 'ClientId', 'Date', 'Start', 'Crew', 'Status', 'EventId', 'CalendarId'],
  sheetTable(env, 'Jobs', ['JobId', 'ClientId', 'Date', 'Start', 'Crew', 'Status', 'EventId', 'CalendarId']));

printTable('ReviewQueue', ['RecordId', 'Issue', 'Detail'],
  sheetTable(env, 'ReviewQueue', ['RecordId', 'Issue', 'Detail']));

printTable('MigrationTracker', ['Area', 'Imported', 'Flagged', 'Verified', 'Status'],
  sheetTable(env, 'MigrationTracker', ['Area', 'Imported', 'Flagged', 'Verified', 'Status']));

printTable('CompletionReports', ['Timestamp', 'VisitId', 'Crew', 'Completed', 'Result'],
  sheetTable(env, 'CompletionReports', ['Timestamp', 'VisitId', 'Crew', 'Completed', 'Result']));

printTable('FollowUps', ['VisitId', 'ClientId', 'Crew', 'Type', 'Detail', 'Status'],
  sheetTable(env, 'FollowUps', ['VisitId', 'ClientId', 'Crew', 'Type', 'Detail', 'Status']));

function localStamp(d) {
  const p = n => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
}
const crewNames = { CALENDAR_ID_TEAM_NORTH: 'Team North', CALENDAR_ID_TEAM_SOUTH: 'Team South' };
const eventRows = [];
Object.keys(env.calendars).forEach(calId => {
  const events = env.calendars[calId].events;
  Object.keys(events).forEach(id => {
    const ev = events[id];
    eventRows.push([crewNames[calId] || calId, ev.id, localStamp(new Date(ev.s)), ev.title]);
  });
});
eventRows.sort((a, b) => (a[0] + a[2]).localeCompare(b[0] + b[2]));
printTable('Calendar events', ['Crew', 'EventId', 'Start', 'Title'], eventRows);

const summary = env.ctx.buildCompletionSummary('2026-11-02');
console.log('\n=== Completion summary ===');
console.log(summary);
