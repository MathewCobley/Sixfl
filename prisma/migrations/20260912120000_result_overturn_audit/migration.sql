-- Empty additive audit table: deployment does NOT overturn any existing result.
CREATE TABLE "MatchResultOverturn" (
  "id" TEXT PRIMARY KEY,
  "matchResultId" TEXT NOT NULL UNIQUE REFERENCES "MatchResult"("id") ON DELETE RESTRICT,
  "fixtureId" TEXT NOT NULL UNIQUE,
  "homeTeamId" TEXT NOT NULL, "awayTeamId" TEXT NOT NULL,
  "homeTeamName" TEXT NOT NULL, "awayTeamName" TEXT NOT NULL,
  "originalHomeScore" INTEGER NOT NULL CHECK ("originalHomeScore" >= 0),
  "originalAwayScore" INTEGER NOT NULL CHECK ("originalAwayScore" >= 0),
  "originalEnteredAt" TIMESTAMP(3) NOT NULL,
  "awardedHomeScore" INTEGER NOT NULL, "awardedAwayScore" INTEGER NOT NULL,
  "reasonCode" TEXT NOT NULL CHECK ("reasonCode" IN ('PLAYER_LIMIT','INELIGIBLE_PLAYER','OTHER_COMPETITION_BREACH')),
  "evidenceNote" TEXT NOT NULL, "rulesBasis" TEXT NOT NULL,
  "decidedByUserId" TEXT NOT NULL, "decidedByName" TEXT NOT NULL,
  "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "overturn_award_score" CHECK (
    ("awardedHomeScore" = 3 AND "awardedAwayScore" = 0) OR
    ("awardedHomeScore" = 0 AND "awardedAwayScore" = 3)
  )
);
CREATE INDEX "MatchResultOverturn_decidedAt_idx" ON "MatchResultOverturn"("decidedAt");

CREATE FUNCTION sixfl_overturn_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'An overturned-result decision is immutable. A further change requires a separate audited review.';
END $$;
CREATE TRIGGER sixfl_overturn_immutable_trigger BEFORE UPDATE OR DELETE ON "MatchResultOverturn"
FOR EACH ROW EXECUTE FUNCTION sixfl_overturn_immutable();

CREATE FUNCTION sixfl_overturned_result_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE decision "MatchResultOverturn"%ROWTYPE;
BEGIN
  SELECT * INTO decision FROM "MatchResultOverturn" WHERE "matchResultId" = OLD.id;
  IF decision.id IS NULL THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'SIXFL has overturned this result; its history cannot be deleted.'; END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW."fixtureId" IS DISTINCT FROM OLD."fixtureId"
    OR NEW."enteredAt" IS DISTINCT FROM OLD."enteredAt" THEN
    RAISE EXCEPTION 'The original result identity and entry time must be retained.';
  END IF;
  IF NEW."homeScore" IS DISTINCT FROM OLD."homeScore" OR NEW."awayScore" IS DISTINCT FROM OLD."awayScore" THEN
    IF current_setting('sixfl.result_overturn_id', true) IS DISTINCT FROM decision.id
      OR NEW."homeScore" <> decision."awardedHomeScore" OR NEW."awayScore" <> decision."awardedAwayScore" THEN
      RAISE EXCEPTION 'SIXFL has overturned this result. Ordinary score editing cannot replace the awarded result.';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER sixfl_overturned_result_guard_trigger BEFORE UPDATE OR DELETE ON "MatchResult"
FOR EACH ROW EXECUTE FUNCTION sixfl_overturned_result_guard();
