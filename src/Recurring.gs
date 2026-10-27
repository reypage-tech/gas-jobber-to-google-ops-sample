/**
 * Recurring cleaning schedules.
 * Each RecurringRules row (site, crew, weekday, every N weeks, service window, start/end)
 * creates visit rows in Jobs for the next few weeks. JobId = RuleId-YYYYMMDD, so running it
 * again never duplicates, and a visit the office already edited is left as it is.
 */
var WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function ymd_(d) {
  return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
}
function parseDay_(v) {
  if (v instanceof Date) return new Date(v.getFullYear(), v.getMonth(), v.getDate());
  var p = String(v).split('-');
  return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
}
function minutes_(hhmm) { var p = String(hhmm).split(':'); return Number(p[0]) * 60 + Number(p[1] || 0); }

function datesForRule_(rule, from, to) {
  var wd = WEEKDAYS.indexOf(String(rule.Weekday).slice(0, 3));
  if (wd < 0) throw new Error('Rule ' + rule.RuleId + ': unknown weekday "' + rule.Weekday + '"');
  var every = Math.max(1, Number(rule.IntervalWeeks) || 1);
  var first = parseDay_(rule.StartDate);
  while (first.getDay() !== wd) first.setDate(first.getDate() + 1);
  var last = rule.EndDate ? parseDay_(rule.EndDate) : to;
  if (last > to) last = to;
  var out = [];
  for (var d = new Date(first.getTime()); d <= last; d.setDate(d.getDate() + 7 * every)) {
    if (d >= from) out.push(new Date(d.getTime()));
  }
  return out;
}

function generateVisitsFromRules(today) {
  var from = today ? parseDay_(today) : parseDay_(new Date());
  var to = new Date(from.getTime()); to.setDate(to.getDate() + CONFIG.GENERATE_DAYS_AHEAD);
  var rules = readTable_(getSheet_(CONFIG.SHEETS.RULES, CONFIG.RULE_HEADERS));
  var jobsSh = getSheet_(CONFIG.SHEETS.JOBS, CONFIG.JOB_HEADERS);
  var have = {};
  readTable_(jobsSh).forEach(function (j) { have[String(j.JobId)] = true; });
  var res = { added: 0, existing: 0, errors: [] };

  rules.forEach(function (r) {
    if (String(r.Active).toUpperCase() !== 'TRUE') return;
    try {
      var dur = minutes_(r.WindowEnd) - minutes_(r.WindowStart);
      if (dur <= 0) throw new Error('Rule ' + r.RuleId + ': window end must be after start');
      datesForRule_(r, from, to).forEach(function (d) {
        var id = r.RuleId + '-' + ymd_(d).replace(/-/g, '');
        if (have[id]) { res.existing++; return; }
        jobsSh.appendRow(CONFIG.JOB_HEADERS.map(function (h) {
          return ({ JobId: id, ClientId: r.ClientId, Date: ymd_(d), Start: r.WindowStart, DurationMin: dur,
            Crew: r.Crew, Status: 'Scheduled',
            Instructions: 'Service window ' + r.WindowStart + '-' + r.WindowEnd + (r.Instructions ? '. ' + r.Instructions : '') })[h] || '';
        }));
        have[id] = true; res.added++;
      });
    } catch (e) { res.errors.push(e.message); }
  });
  log_('generateVisitsFromRules', '', JSON.stringify(res));
  return res;
}

/** Menu / trigger entry: create upcoming visits, then push them to calendars. */
function generateAndSync() {
  var g = generateVisitsFromRules();
  var s = syncJobsToCalendar();
  return { generated: g, synced: s };
}
