-- One-time cleanup of already obsolete SMS, including quiet-hours queues.
-- Never touch email, unrelated SMS, sent/accepted messages or in-flight workers.
-- Keep content and audit history; CANCELLED rows cannot be selected for delivery.
DO $$
DECLARE cancelled_count INTEGER;
BEGIN
  WITH cancelled AS (
    UPDATE "NotificationDispatch" d SET "status" = 'CANCELLED',
      "cancelledAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP,
      "failureReason" = 'Replacement request closed — unsent SMS cancelled.'
    WHERE d."channel"::text = 'SMS' AND d."status"::text IN ('QUEUED', 'FAILED')
      AND d."sentAt" IS NULL AND d."providerMessageId" IS NULL
      AND d."metadata"->>'origin' IN ('night-board-last-minute-replacement', 'night-board-last-minute-replacement-resolved')
      AND NOT EXISTS (
        SELECT 1 FROM "NotificationAttempt" a WHERE a."dispatchId" = d."id" AND a."status"::text = 'SUCCESS'
      )
      AND NOT EXISTS (
        SELECT 1 FROM "MessageEntry" e WHERE e."notificationDispatchId" = d."id"
          AND (e."sentAt" IS NOT NULL OR e."providerMessageId" IS NOT NULL OR e."twilioMessageSid" IS NOT NULL)
      )
      AND (
        d."metadata"->>'origin' = 'night-board-last-minute-replacement-resolved'
        OR EXISTS (
          SELECT 1 FROM "LastMinuteReplacementResolution" r
          WHERE r."fixtureId" = d."metadata"->>'fixtureId'
            AND r."droppedTeamId" = d."metadata"->>'droppedTeamId'
        )
        OR NOT EXISTS (
          SELECT 1 FROM "Fixture" f WHERE f."id" = d."metadata"->>'fixtureId'
            AND f."publishedAt" IS NOT NULL AND f."status"::text = 'SCHEDULED'
            AND f."kickoffAt" > CURRENT_TIMESTAMP
            AND d."metadata"->>'droppedTeamId' IN (f."homeTeamId", f."awayTeamId")
            AND d."metadata"->>'opponentTeamId' IN (f."homeTeamId", f."awayTeamId")
        )
      )
    RETURNING d."id"
  ), history AS (
    UPDATE "MessageEntry" m SET "providerStatus" = 'CANCELLED: Replacement request closed — unsent SMS cancelled.', "updatedAt" = CURRENT_TIMESTAMP
    FROM cancelled c WHERE m."notificationDispatchId" = c."id"
      AND m."channel"::text = 'SMS' AND m."sentAt" IS NULL
      AND m."providerMessageId" IS NULL AND m."twilioMessageSid" IS NULL
    RETURNING m."id"
  ) SELECT COUNT(*)::int INTO cancelled_count FROM cancelled;
  RAISE NOTICE 'Replacement SMS cleanup: % unsent messages cancelled', cancelled_count;
END $$;
