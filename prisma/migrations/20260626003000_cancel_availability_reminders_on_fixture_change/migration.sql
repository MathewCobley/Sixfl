-- ========================================
-- Migration: cancel queued availability reminders when fixture details change
-- ========================================

CREATE OR REPLACE FUNCTION sixfl_cancel_queued_availability_reminders_for_fixture(
  p_fixture_id TEXT,
  p_reason TEXT
)
RETURNS VOID AS $$
BEGIN
  UPDATE "NotificationDispatch" nd
  SET
    "status" = 'CANCELLED',
    "cancelledAt" = NOW(),
    "failureReason" = p_reason
  WHERE nd."sourceType" IN (
      'MANAGED_SQUAD_AVAILABILITY_REQUEST',
      'MANAGED_SQUAD_AVAILABILITY_CHASE_24H',
      'MANAGED_SQUAD_AVAILABILITY_CHASE_72H'
    )
    AND nd."status" = 'QUEUED'
    AND p_fixture_id = COALESCE(
      NULLIF(nd."metadata" ->> 'fixtureId', ''),
      NULLIF(SPLIT_PART(nd."sourceId", ':', 1), '')
    );
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION sixfl_cancel_fixture_availability_reminders_on_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD."kickoffAt" IS DISTINCT FROM NEW."kickoffAt"
     OR OLD."homeTeamId" IS DISTINCT FROM NEW."homeTeamId"
     OR OLD."awayTeamId" IS DISTINCT FROM NEW."awayTeamId"
     OR OLD."venueId" IS DISTINCT FROM NEW."venueId"
     OR OLD."status" IS DISTINCT FROM NEW."status"
     OR (OLD."publishedAt" IS NOT NULL AND NEW."publishedAt" IS NULL) THEN
    PERFORM sixfl_cancel_queued_availability_reminders_for_fixture(
      NEW."id",
      'Cancelled because fixture details changed before the availability reminder was sent.'
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sixfl_cancel_fixture_availability_reminders_on_change_trigger ON "Fixture";
CREATE TRIGGER sixfl_cancel_fixture_availability_reminders_on_change_trigger
AFTER UPDATE OF "kickoffAt", "homeTeamId", "awayTeamId", "venueId", "status", "publishedAt" ON "Fixture"
FOR EACH ROW
EXECUTE FUNCTION sixfl_cancel_fixture_availability_reminders_on_change();
