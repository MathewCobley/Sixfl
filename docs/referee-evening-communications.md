# Referee evening communications

## Single source and identity

`src/lib/referees/evening-notifications.ts` owns all referee booking/reminder delivery.
The notification identity is referee + Europe/London calendar date, not fixture,
pitch, league or cashup. Financial RefereeNight records are unchanged.
Database triggers capture assignment/publication/time/venue/status changes atomically,
including deletes, bulk updates and old/new referees or dates. Team-only/pitch-only
edits, results and cashup reconciliation cannot restart the timer.

## Delivery contract

* One booking email after 60 quiet minutes following the last assignment change.
* One SMS at 24 hours before the first kick-off (or catch up after a delayed job).
  Confirmed referees get a reminder; pending referees get a confirmation request.
  Declined bookings do not receive automatic reminders.
* Late bookings leave one hour between email and SMS where possible, shortened to
  avoid missing kick-off. Within four hours, the booking/update need not wait for
  the settling period. Urgent SMS can bypass quiet hours only when the recipient's
  existing urgent-SMS preference allows it.
* Changes to arrival, first/last kick-off, expected finish or venue get a combined
  update; ordinary internal fixture/team/pitch changes do not. Urgent changes use
  one SMS rather than another email plus SMS. A sent urgent SMS replaces the routine
  reminder, but a subsequent genuinely important change can still be notified.
* Arrival is 15 minutes before the first kick-off. Expected finish uses each
  league's configured `minutesPerGame`; missing duration is explicitly TBC.
* Several venues appear as separate work windows in the same email/SMS.

## Safety and deployment

The additive migration creates the evening state/token tables, atomic capture
triggers, a unique outbox index and editable System Templates. Existing template
edits are never overwritten. The two superseded night email templates are retired.
Only legacy automatic QUEUED/FAILED notices are cancelled; already sent/in-flight
messages cannot be recalled, and personal replies, finance and availability notices
are unaffected. Both enqueue and delivery guards block obsolete automation.

Per-evening row locks and transactional template queuing prevent duplicate jobs.
An atomic queue claim prevents simultaneous cron/manual delivery of the same row.
Current assignments, generation, time window and attendance status are checked at
send time. A provider-accepted message is never marked retryable merely because
subsequent history recording fails. Unknown provider outcomes still require admin
review: this is not a claim of exactly-once delivery across arbitrary outages.

Confirmation tokens are hashed, bound to the current working hours and expire.
A link GET is read-only; attendance requires an explicit form POST. Confirmation
updates the entire evening and the existing admin/night-board attendance warnings.
Older issued night links and authenticated dashboard responses join the same state.
The existing notifications cron owns the job; no Railway schedule change is needed.

## Verification

`tests/referee-evening-comms.test.ts` protects timing/content/source invariants after
full prebuild. `tests/referee-evening-database.test.ts` runs only against a disposable
localhost PostgreSQL service (`sixfl_referee_test`), with no provider API keys. It
exercises cutover, concurrent queue creation and claiming, trigger rollback, stale
messages, confirmations, duration edits and London midnight grouping.
Never run the isolated database setup commands against a production database.
