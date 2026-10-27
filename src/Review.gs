/**
 * Record check for the paid review milestone.
 * flagRecords(): stale clients (no visit in N months) and likely duplicate clients
 *   (same normalized name or same normalized address) go to ReviewQueue. Append only,
 *   keyed, so the office's Resolved ticks are kept between runs.
 * updateMigrationTracker(): one row per data area with Imported, Flagged (open), Verified
 *   (typed by the office) and a Status.
 */
function norm_(s) {
  return String(s || '').toLowerCase()
    .replace(/\(.*?\)/g, ' ')
    .replace(/\b(street|st|avenue|ave|road|rd|suite|ste|unit|inc|llc|co)\b\.?/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ').trim();
}

function flagRecords(today, staleMonths) {
  var now = today ? parseDay_(today) : parseDay_(new Date());
  var months = staleMonths || CONFIG.STALE_MONTHS;
  var cutoff = new Date(now.getTime()); cutoff.setMonth(cutoff.getMonth() - months);
  var clients = readTable_(getSheet_(CONFIG.SHEETS.CLIENTS, CONFIG.CLIENT_HEADERS));
  var jobs = readTable_(getSheet_(CONFIG.SHEETS.JOBS, CONFIG.JOB_HEADERS));
  var sh = getSheet_(CONFIG.SHEETS.REVIEW, CONFIG.REVIEW_HEADERS);
  var known = {};
  readTable_(sh).forEach(function (r) { known[r.Key] = true; });
  var found = [];

  var lastVisit = {};
  jobs.forEach(function (j) {
    if (j.Status === CONFIG.CANCELLED_STATUS) return;
    var d = parseDay_(j.Date);
    if (!lastVisit[j.ClientId] || d > lastVisit[j.ClientId]) lastVisit[j.ClientId] = d;
  });
  clients.forEach(function (c) {
    var lv = lastVisit[c.ClientId];
    if (!lv || lv < cutoff) {
      found.push(['Clients', c.ClientId, 'Stale', lv ? 'Last visit ' + ymd_(lv) : 'No visits on record']);
    }
  });

  [['ClientName', 'Duplicate name'], ['Address', 'Duplicate address']].forEach(function (pair) {
    var groups = {};
    clients.forEach(function (c) {
      var k = norm_(c[pair[0]]);
      if (k) (groups[k] = groups[k] || []).push(c.ClientId);
    });
    Object.keys(groups).forEach(function (k) {
      var ids = groups[k];
      if (ids.length < 2) return;
      ids.forEach(function (id) {
        found.push(['Clients', id, pair[1], 'Same as ' + ids.filter(function (x) { return x !== id; }).join(', ')]);
      });
    });
  });

  var added = 0;
  found.forEach(function (f) {
    var key = f[0] + '|' + f[1] + '|' + f[2];
    if (known[key]) return;
    sh.appendRow([key, f[0], f[1], f[2], f[3], ymd_(now), '']);
    known[key] = true; added++;
  });
  log_('flagRecords', '', 'found ' + found.length + ', new ' + added);
  return { found: found.length, added: added };
}

function updateMigrationTracker() {
  var counts = {
    Clients: readTable_(getSheet_(CONFIG.SHEETS.CLIENTS, CONFIG.CLIENT_HEADERS)).length,
    Visits: readTable_(getSheet_(CONFIG.SHEETS.JOBS, CONFIG.JOB_HEADERS)).length,
    RecurringRules: readTable_(getSheet_(CONFIG.SHEETS.RULES, CONFIG.RULE_HEADERS)).length,
    ClientFolders: readTable_(getSheet_(CONFIG.SHEETS.CLIENTS, CONFIG.CLIENT_HEADERS)).filter(function (c) { return c.FolderUrl; }).length
  };
  var open = {};
  readTable_(getSheet_(CONFIG.SHEETS.REVIEW, CONFIG.REVIEW_HEADERS)).forEach(function (r) {
    if (String(r.Resolved).toUpperCase() !== 'TRUE') open[r.Area] = (open[r.Area] || 0) + 1;
  });
  open.Visits = open.Visits || 0;
  var sh = getSheet_(CONFIG.SHEETS.TRACKER, CONFIG.TRACKER_HEADERS);
  var H = CONFIG.TRACKER_HEADERS;
  var rows = {};
  readTable_(sh).forEach(function (r) { rows[r.Area] = r; });
  var out = {};
  Object.keys(counts).forEach(function (area) {
    var imported = counts[area], flagged = open[area] || 0;
    var row = rows[area];
    var verified = row ? Number(row.Verified) || 0 : 0;
    var status = imported === 0 ? 'Not started'
      : flagged > 0 ? 'Needs review'
      : verified >= imported ? 'Done' : 'Verifying';
    if (!row) {
      sh.appendRow([area, imported, flagged, 0, status, new Date()]);
    } else {
      writeCell_(sh, H, row._row, 'Imported', imported);
      writeCell_(sh, H, row._row, 'Flagged', flagged);
      writeCell_(sh, H, row._row, 'Status', status);
      writeCell_(sh, H, row._row, 'Updated', new Date());
    }
    out[area] = { imported: imported, flagged: flagged, verified: verified, status: status };
  });
  return out;
}
