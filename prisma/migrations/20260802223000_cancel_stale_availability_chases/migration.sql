-- Prevent already-queued availability reminders from being delivered after a
-- fixture has passed or stopped being an active scheduled fixture.
UPDATE "NotificationDispatch" AS dispatch
SET
  "status" = 'CANCELLED'::"NotificationDispatchStatus",
  "cancelledAt" = COALESCE(dispatch."cancelledAt", CURRENT_TIMESTAMP),
  "failureReason" = COALESCE(
    dispatch."failureReason",
    'Availability chase cancelled because the fixture has passed, is postponed, or is no longer scheduled.'
  ),
  "updatedAt" = CURRENT_TIMESTAMP
FROM "Fixture" AS fixture
WHERE dispatch."sourceType" IN (
  'CAPTAIN_AVAILABILITY_SMS_CHASE',
  'MANAGED_SQUAD_AVAILABILITY_REQUEST',
  'MANAGED_SQUAD_AVAILABILITY_CHASE_24H',
  'MANAGED_SQUAD_AVAILABILITY_CHASE_72H'
)
  AND dispatch."sourceId" IS NOT NULL
  AND split_part(dispatch."sourceId", ':', 1) = fixture."id"
  AND dispatch."status" IN (
    'QUEUED'::"NotificationDispatchStatus",
    'PROCESSING'::"NotificationDispatchStatus"
  )
  AND (
    fixture."status"::text <> 'SCHEDULED'
    OR fixture."kickoffAt" <= CURRENT_TIMESTAMP
  );
