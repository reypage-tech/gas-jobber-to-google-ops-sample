function onOpen() {
  SpreadsheetApp.getUi().createMenu('Ops')
    .addItem('1. Import Jobber CSVs from Drive', 'importFromDriveFolder')
    .addItem('2. Create client folders', 'ensureClientFolders')
    .addItem('3. Create visits from recurring rules and sync', 'generateAndSync')
    .addItem('4. Sync jobs to calendars only', 'syncJobsToCalendar')
    .addItem('5. Office summary of completion reports (today)', 'showTodaySummary')
    .addSeparator()
    .addItem('Review: flag stale and duplicate records', 'flagRecords')
    .addItem('Review: update migration tracker', 'updateMigrationTracker')
    .addToUi();
}

/** Optional hourly trigger so calendars stay current after edits in the Jobs sheet. */
function installHourlySync() {
  ScriptApp.newTrigger('generateAndSync').timeBased().everyHours(1).create();
}

/** Run once after linking the Google Form to this Sheet. */
function installFormTrigger() {
  ScriptApp.newTrigger('onFormSubmit').forSpreadsheet(SpreadsheetApp.getActiveSpreadsheet()).onFormSubmit().create();
}
