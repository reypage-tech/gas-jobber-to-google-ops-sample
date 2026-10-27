/**
 * Import Jobber CSV exports (clients and visits) into the Sheets.
 * Upsert by Jobber id, so running it twice does not create duplicates.
 */
var CLIENT_MAP = { 'Client ID': 'ClientId', 'Name': 'ClientName', 'Service Address': 'Address', 'Service Type': 'ServiceType', 'Notes': 'Notes' };
var VISIT_MAP = { 'Visit ID': 'JobId', 'Client ID': 'ClientId', 'Date': 'Date', 'Start Time': 'Start', 'Duration (min)': 'DurationMin', 'Assigned To': 'Crew', 'Status': 'Status', 'Instructions': 'Instructions' };

function mapCsv_(csvText, map) {
  var rows = Utilities.parseCsv(csvText);
  var head = rows[0].map(function (h) { return String(h).trim(); });
  Object.keys(map).forEach(function (k) {
    if (head.indexOf(k) < 0) throw new Error('CSV is missing column "' + k + '"');
  });
  return rows.slice(1).filter(function (r) { return r.join('').trim() !== ''; }).map(function (r) {
    var o = {};
    Object.keys(map).forEach(function (k) { o[map[k]] = String(r[head.indexOf(k)]).trim(); });
    return o;
  });
}

function upsert_(sheetName, headers, keyName, records) {
  var sh = getSheet_(sheetName, headers);
  var existing = readTable_(sh);
  var byKey = {};
  existing.forEach(function (r) { byKey[String(r[keyName])] = r; });
  var added = 0, updated = 0;
  records.forEach(function (rec) {
    var cur = byKey[String(rec[keyName])];
    if (cur) {
      var changed = false;
      Object.keys(rec).forEach(function (h) {
        if (String(cur[h]) !== String(rec[h])) {
          writeCell_(sh, headers, cur._row, h, rec[h]);
          changed = true;
        }
      });
      if (changed) updated++;
    } else {
      sh.appendRow(headers.map(function (h) { return rec[h] !== undefined ? rec[h] : ''; }));
      added++;
    }
  });
  return { added: added, updated: updated };
}

function importClientsCsv(csvText) {
  var res = upsert_(CONFIG.SHEETS.CLIENTS, CONFIG.CLIENT_HEADERS, 'ClientId', mapCsv_(csvText, CLIENT_MAP));
  log_('importClients', '', JSON.stringify(res));
  return res;
}

function importVisitsCsv(csvText) {
  var res = upsert_(CONFIG.SHEETS.JOBS, CONFIG.JOB_HEADERS, 'JobId', mapCsv_(csvText, VISIT_MAP));
  log_('importVisits', '', JSON.stringify(res));
  return res;
}

/** Menu entry: read clients.csv and visits.csv from the import folder in Drive. */
function importFromDriveFolder() {
  var id = PropertiesService.getScriptProperties().getProperty(CONFIG.IMPORT_FOLDER_PROP);
  var folder = DriveApp.getFolderById(id);
  var out = {};
  [['clients.csv', importClientsCsv], ['visits.csv', importVisitsCsv]].forEach(function (pair) {
    var it = folder.getFilesByName(pair[0]);
    if (it.hasNext()) out[pair[0]] = pair[1](it.next().getBlob().getDataAsString());
  });
  return out;
}
