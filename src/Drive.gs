/** One Drive folder per client (photos, contracts, checklists). Link saved in Clients!FolderUrl. */
function ensureClientFolders() {
  var root = DriveApp.getFolderById(PropertiesService.getScriptProperties().getProperty(CONFIG.ROOT_FOLDER_PROP));
  var sh = getSheet_(CONFIG.SHEETS.CLIENTS, CONFIG.CLIENT_HEADERS);
  var created = 0;
  readTable_(sh).forEach(function (c) {
    if (c.FolderUrl) return;
    var name = c.ClientName + ' (' + c.ClientId + ')';
    var it = root.getFoldersByName(name);
    var folder = it.hasNext() ? it.next() : root.createFolder(name);
    writeCell_(sh, CONFIG.CLIENT_HEADERS, c._row, 'FolderUrl', folder.getUrl());
    created++;
  });
  log_('ensureClientFolders', '', 'linked ' + created);
  return created;
}
