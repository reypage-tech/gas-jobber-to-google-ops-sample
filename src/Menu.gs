function onOpen() {
  SpreadsheetApp.getUi().createMenu('Ops')
    .addItem('1. Import Jobber CSVs from Drive', 'importFromDriveFolder')
    .addItem('2. Create client folders', 'ensureClientFolders')
    .addItem('3. Create visits from recurring rules and sync', 'generateAndSync')
    .addItem('4. Sync jobs to calendars only', 'syncJobsToCalendar')
    .addSeparator()
    .addItem('Review: flag stale and duplicate records', 'flagRecords')
    .addItem('Review: update migration tracker', 'updateMigrationTracker')
    .addToUi();
}

/** Optional hourly trigger so calendars stay current after edits in the Jobs sheet. */
function installHourlySync() {
  ScriptApp.newTrigger('generateAndSync').timeBased().everyHours(1).create();
}
