/** Settings live in one place so the owner can change them without touching logic. */
var CONFIG = {
  SHEETS: { CLIENTS: 'Clients', JOBS: 'Jobs', CREW: 'Crew', LOG: 'SyncLog', RULES: 'RecurringRules', REVIEW: 'ReviewQueue', TRACKER: 'MigrationTracker', REPORTS: 'CompletionReports', FOLLOWUPS: 'FollowUps' },
  CLIENT_HEADERS: ['ClientId', 'ClientName', 'Address', 'ServiceType', 'Notes', 'FolderUrl'],
  JOB_HEADERS: ['JobId', 'ClientId', 'Date', 'Start', 'DurationMin', 'Crew', 'Status', 'Instructions', 'EventId', 'CalendarId', 'LastSynced'],
  CREW_HEADERS: ['Crew', 'CalendarId'],
  RULE_HEADERS: ['RuleId', 'ClientId', 'Crew', 'Weekday', 'IntervalWeeks', 'WindowStart', 'WindowEnd', 'StartDate', 'EndDate', 'Instructions', 'Active'],
  REVIEW_HEADERS: ['Key', 'Area', 'RecordId', 'Issue', 'Detail', 'Found', 'Resolved'],
  TRACKER_HEADERS: ['Area', 'Imported', 'Flagged', 'Verified', 'Status', 'Updated'],
  REPORT_HEADERS: ['Timestamp', 'VisitId', 'Crew', 'Completed', 'Issues', 'SuppliesLow', 'Notes', 'Result'],
  FOLLOWUP_HEADERS: ['Created', 'VisitId', 'ClientId', 'Crew', 'Type', 'Detail', 'Status'],
  COMPLETED_STATUS: 'Completed',
  OFFICE_EMAIL_PROP: 'OFFICE_SUMMARY_EMAIL',
  GENERATE_DAYS_AHEAD: 28,
  STALE_MONTHS: 6,
  ROOT_FOLDER_PROP: 'CLIENT_ROOT_FOLDER_ID',
  IMPORT_FOLDER_PROP: 'IMPORT_FOLDER_ID',
  ACTIVE_STATUSES: ['Scheduled', 'Confirmed'],
  CANCELLED_STATUS: 'Cancelled'
};
