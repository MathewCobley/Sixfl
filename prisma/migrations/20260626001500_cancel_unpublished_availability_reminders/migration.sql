-- ========================================
-- Migration: cancel managed squad availability reminders for unpublished fixtures
-- ========================================

UPDATE "NotificationDispatch" nd
SET
  "status" = 'CANCELLED',
  "cancelledAt" = NOW(),
  "failureReason" = 'Cancelled because the fixture is still draft/unpublished.'
FROM "Fixture" f
WHERE nd."sourceType" IN (
    'MANAGED_SQUAD_AVAILABILITY_REQUEST',
    'MANAGED_SQUAD_AVAILABILITY_CHASE_24H',
    'MANAGED_SQUAD_AVAILABILITY_CHASE_72H'
  )
  AND nd."status" = 'QUEUED'
  AND f."publishedAt" IS NULL
  AND f."id" = COALESCE(
    NULLIF(nd."metadata" ->> 'fixtureId', ''),
    NULLIF(SPLIT_PART(nd."sourceId", ':', 1), '')
  );
