/** Small helpers: read a sheet as objects keyed by header, write rows back. */
function getSheet_(name, headers) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(headers);
  }
  return sh;
}

function readTable_(sh) {
  var values = sh.getDataRange().getValues();
  var headers = values[0];
  return values.slice(1).map(function (row, i) {
    var obj = { _row: i + 2 };
    headers.forEach(function (h, c) { obj[h] = row[c]; });
    return obj;
  });
}

function writeCell_(sh, headers, rowNum, header, value) {
  var col = headers.indexOf(header) + 1;
  if (col < 1) throw new Error('Missing column: ' + header);
  sh.getRange(rowNum, col).setValue(value);
}

function log_(action, id, detail) {
  var sh = getSheet_(CONFIG.SHEETS.LOG, ['Time', 'Action', 'Id', 'Detail']);
  sh.appendRow([new Date(), action, id, detail]);
}
