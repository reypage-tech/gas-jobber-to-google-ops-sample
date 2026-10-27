/**
 * Completion reporting from a Google Form linked to this Sheet.
 * Form questions (titles must match): Visit ID, Crew, Completed (Yes/No), Issues, Supplies low, Notes.
 *
 * On each submit:
 *  - the answer is always written to CompletionReports with a Result, so nothing is lost,
 *  - the Visit ID must exist in Jobs, otherwise a "Check report" follow-up is raised,
 *  - Completed = Yes sets the visit Status to Completed. On the next sync the calendar event
 *    stays as history with a '[Done] ' title prefix (see Calendar.gs),
 *  - Completed = No, issues, low supplies and a crew that does not match the visit become FollowUps.
 */
var FORM_FIELDS = { VisitId: 'Visit ID', Crew: 'Crew', Completed: 'Completed', Issues: 'Issues', SuppliesLow: 'Supplies low', Notes: 'Notes' };

function answer_(e, title) {
  var v = e && e.namedValues ? e.namedValues[title] : '';
  return String(Array.isArray(v) ? v[0] || '' : v || '').trim();
}

function addFollowUp_(visitId, clientId, crew, type, detail, when) {
  getSheet_(CONFIG.SHEETS.FOLLOWUPS, CONFIG.FOLLOWUP_HEADERS)
    .appendRow([when, visitId, clientId, crew, type, detail, 'Open']);
}

function onFormSubmit(e) {
  var r = {};
  Object.keys(FORM_FIELDS).forEach(function (k) { r[k] = answer_(e, FORM_FIELDS[k]); });
  var ts = answer_(e, 'Timestamp') || ymd_(new Date());
  var done = /^y/i.test(r.Completed);

  var jobsSh = getSheet_(CONFIG.SHEETS.JOBS, CONFIG.JOB_HEADERS);
  var job = null;
  readTable_(jobsSh).forEach(function (j) { if (String(j.JobId) === r.VisitId) job = j; });

  var result;
  if (!r.VisitId || !job) {
    result = 'Unknown VisitId';
    addFollowUp_(r.VisitId, '', r.Crew, 'Check report', 'Visit ID not found in Jobs. ' + r.Notes, ts);
  } else {
    if (r.Crew && job.Crew && r.Crew !== job.Crew) {
      addFollowUp_(r.VisitId, job.ClientId, r.Crew, 'Crew mismatch', 'Scheduled for ' + job.Crew, ts);
    }
    if (done) {
      if (job.Status === CONFIG.COMPLETED_STATUS) {
        result = 'Already completed';
      } else {
        writeCell_(jobsSh, CONFIG.JOB_HEADERS, job._row, 'Status', CONFIG.COMPLETED_STATUS);
        result = 'Marked completed';
      }
    } else {
      result = 'Not completed';
      addFollowUp_(r.VisitId, job.ClientId, r.Crew, 'Not completed', r.Notes || 'No reason given', ts);
    }
    if (r.Issues) addFollowUp_(r.VisitId, job.ClientId, r.Crew, 'Issue', r.Issues, ts);
    if (r.SuppliesLow) addFollowUp_(r.VisitId, job.ClientId, r.Crew, 'Supplies', r.SuppliesLow, ts);
  }

  getSheet_(CONFIG.SHEETS.REPORTS, CONFIG.REPORT_HEADERS)
    .appendRow([ts, r.VisitId, r.Crew, done ? 'Yes' : 'No', r.Issues, r.SuppliesLow, r.Notes, result]);
  log_('onFormSubmit', r.VisitId, result);
  return result;
}

/** Plain-text summary for the office for one date (YYYY-MM-DD, matched on the report timestamp). */
function buildCompletionSummary(day) {
  var d = day || ymd_(new Date());
  var reports = readTable_(getSheet_(CONFIG.SHEETS.REPORTS, CONFIG.REPORT_HEADERS))
    .filter(function (x) { return String(x.Timestamp).indexOf(d) === 0; });
  var open = readTable_(getSheet_(CONFIG.SHEETS.FOLLOWUPS, CONFIG.FOLLOWUP_HEADERS))
    .filter(function (f) { return f.Status === 'Open'; });
  var count = function (res) { return reports.filter(function (x) { return x.Result === res; }).length; };
  var lines = [
    'Completion summary ' + d,
    'Reports: ' + reports.length,
    'Completed: ' + (count('Marked completed') + count('Already completed')),
    'Not completed: ' + count('Not completed'),
    'Unknown visit ids: ' + count('Unknown VisitId'),
    'Open follow-ups: ' + open.length
  ];
  open.forEach(function (f) { lines.push('- ' + f.Type + ' | ' + f.VisitId + ' | ' + f.Detail); });
  return lines.join('\n');
}

function showTodaySummary() {
  SpreadsheetApp.getUi().alert(buildCompletionSummary());
}

/** Optional: email the summary to the address in Script property OFFICE_SUMMARY_EMAIL (skipped if unset). */
function emailTodaySummary() {
  var to = PropertiesService.getScriptProperties().getProperty(CONFIG.OFFICE_EMAIL_PROP);
  if (!to) return false;
  MailApp.sendEmail(to, 'Completion summary ' + ymd_(new Date()), buildCompletionSummary());
  return true;
}
