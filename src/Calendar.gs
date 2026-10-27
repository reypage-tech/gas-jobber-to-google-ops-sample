/**
 * Push Jobs rows to each crew's Google Calendar.
 * EventId and CalendarId columns remember where the event lives, so:
 *  - edits update the same event,
 *  - a crew change removes the event from the old crew calendar before creating it on the new one,
 *  - any status that is not synced (Cancelled, Draft, On hold...) removes the event.
 */
function toStartDate_(dateVal, startVal) {
  var d = dateVal instanceof Date ? dateVal : new Date(String(dateVal) + 'T00:00:00');
  var parts = String(startVal).split(':');
  var s = new Date(d.getTime());
  s.setHours(Number(parts[0]), Number(parts[1] || 0), 0, 0);
  return s;
}

function removeEvent_(sh, j) {
  var removed = false;
  if (j.EventId && j.CalendarId) {
    var ev = CalendarApp.getCalendarById(j.CalendarId).getEventById(j.EventId);
    if (ev) { ev.deleteEvent(); removed = true; }
  }
  writeCell_(sh, CONFIG.JOB_HEADERS, j._row, 'EventId', '');
  writeCell_(sh, CONFIG.JOB_HEADERS, j._row, 'CalendarId', '');
  return removed;
}

function syncJobsToCalendar() {
  var crewMap = {};
  readTable_(getSheet_(CONFIG.SHEETS.CREW, CONFIG.CREW_HEADERS)).forEach(function (r) { crewMap[r.Crew] = r.CalendarId; });
  var clients = {};
  readTable_(getSheet_(CONFIG.SHEETS.CLIENTS, CONFIG.CLIENT_HEADERS)).forEach(function (c) { clients[c.ClientId] = c; });
  var sh = getSheet_(CONFIG.SHEETS.JOBS, CONFIG.JOB_HEADERS);
  var H = CONFIG.JOB_HEADERS;
  var res = { created: 0, updated: 0, moved: 0, deleted: 0, skipped: 0, errors: [] };

  readTable_(sh).forEach(function (j) {
    try {
      if (CONFIG.ACTIVE_STATUSES.indexOf(j.Status) < 0) {
        if (j.EventId) { if (removeEvent_(sh, j)) res.deleted++; }
        else res.skipped++;
        return;
      }
      var calId = crewMap[j.Crew];
      if (!calId) throw new Error('No calendar for crew "' + j.Crew + '"');

      var existing = null;
      if (j.EventId && j.CalendarId && j.CalendarId !== calId) {
        removeEvent_(sh, j);   // crew changed: take it off the old calendar first
        res.moved++;
      } else if (j.EventId) {
        existing = CalendarApp.getCalendarById(calId).getEventById(j.EventId);
      }

      var client = clients[j.ClientId] || { ClientName: j.ClientId, Address: '' };
      var start = toStartDate_(j.Date, j.Start);
      var end = new Date(start.getTime() + Number(j.DurationMin) * 60000);
      var title = client.ClientName + ' | ' + j.JobId;
      var desc = (j.Instructions || '') + (client.FolderUrl ? '\nFolder: ' + client.FolderUrl : '');

      if (existing) {
        existing.setTitle(title);
        existing.setTime(start, end);
        existing.setLocation(client.Address);
        existing.setDescription(desc);
        res.updated++;
      } else {
        var ev = CalendarApp.getCalendarById(calId).createEvent(title, start, end, { location: client.Address, description: desc });
        writeCell_(sh, H, j._row, 'EventId', ev.getId());
        writeCell_(sh, H, j._row, 'CalendarId', calId);
        res.created++;
      }
      writeCell_(sh, H, j._row, 'LastSynced', new Date());
    } catch (e) {
      res.errors.push(j.JobId + ': ' + e.message);
    }
  });
  log_('syncJobsToCalendar', '', JSON.stringify(res));
  return res;
}
