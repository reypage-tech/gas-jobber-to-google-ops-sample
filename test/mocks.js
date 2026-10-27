// Stand-in Google services for local tests. Not the real APIs.
const fs = require('fs'), path = require('path'), vm = require('vm');
function parseCsv(t) { return t.trim().split(/\r?\n/).map(l => l.split(',')); }
function makeSheet(name) {
  const rows = [];
  return { name, rows,
    appendRow(r) { rows.push(r.slice()); },
    getDataRange() { return { getValues: () => rows.map(r => r.slice()) }; },
    getRange(r, c) { return { setValue(v) { while (rows[r-1].length < c) rows[r-1].push(''); rows[r-1][c-1] = v; } }; } };
}
function load() {
  const sheets = {}, calendars = {}, folders = [], props = {};
  let evSeq = 0;
  const makeCal = id => { const events = {}; return calendars[id] = { events,
    createEvent(title, s, e, o) { const id2 = 'ev' + (++evSeq); const ev = { id: id2, title, s, e, ...o,
      getId: () => id2, setTitle(t) { ev.title = t; }, setTime(a, b) { ev.s = a; ev.e = b; },
      setLocation(l) { ev.location = l; }, setDescription(d) { ev.description = d; }, deleteEvent() { delete events[id2]; } };
      events[id2] = ev; return ev; },
    getEventById: id2 => events[id2] || null }; };
  const root = { getFoldersByName: n => { const f = folders.filter(x => x.name === n); return { hasNext: () => f.length > 0, next: () => f.shift() }; },
    createFolder: n => { const f = { name: n, getUrl: () => 'https://drive.example/folder/' + encodeURIComponent(n) }; folders.push(f); return f; } };
  const ctx = {
    SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheetByName: n => sheets[n] || null, insertSheet: n => (sheets[n] = makeSheet(n)) }) },
    CalendarApp: { getCalendarById: id => calendars[id] || makeCal(id) },
    DriveApp: { getFolderById: () => root },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] || 'root' }) },
    Utilities: { parseCsv }, Date, JSON, console };
  vm.createContext(ctx);
  const dir = path.join(__dirname, '..', 'src');
  for (const f of ['Config.gs', 'Sheets.gs', 'Import.gs', 'Drive.gs', 'Calendar.gs', 'Recurring.gs', 'Review.gs', 'Menu.gs'])
    vm.runInContext(fs.readFileSync(path.join(dir, f), 'utf8'), ctx, { filename: f });
  return { ctx, sheets, calendars, folders };
}
module.exports = { load, data: f => fs.readFileSync(path.join(__dirname, '..', 'sample_data', f), 'utf8') };
