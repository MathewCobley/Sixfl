-- Stable evidence timestamps keep an on-time completion on-time even if a captain
-- later corrects a name, rating or scorer.
ALTER TABLE "MatchResultTeamMeta"
  ADD COLUMN IF NOT EXISTS "priorityCoreCompletedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "priorityAssistsCompletedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "priorityRatingsCompletedAt" TIMESTAMP(3);

-- Best-effort historic backfill from the evidence already stored. Going forward
-- the captain save action records the first moment each requirement becomes complete.
UPDATE "MatchResultTeamMeta" m
SET "priorityCoreCompletedAt" = m."updatedAt"
FROM "MatchResult" r
JOIN "Fixture" f ON f.id = r."fixtureId"
WHERE m."matchResultId" = r.id
  AND m."priorityCoreCompletedAt" IS NULL
  AND COALESCE(trim(m."playerOfMatchName"), '') <> ''
  AND m."goalsRecorded" = CASE WHEN m."teamId" = f."homeTeamId" THEN r."homeScore" ELSE r."awayScore" END
  AND EXISTS (
    SELECT 1 FROM "PlayerMatchPerformance" p
    WHERE p."matchResultId" = m."matchResultId"
      AND p."teamId" = m."teamId"
      AND p.played
      AND p."appearanceRecorded"
  );

UPDATE "MatchResultTeamMeta" m
SET "priorityAssistsCompletedAt" = m."updatedAt"
FROM "MatchResult" r
JOIN "Fixture" f ON f.id = r."fixtureId"
WHERE m."matchResultId" = r.id
  AND m."priorityAssistsCompletedAt" IS NULL
  AND (
    (CASE WHEN m."teamId" = f."homeTeamId" THEN r."homeScore" ELSE r."awayScore" END) = 0
    OR EXISTS (
      SELECT 1 FROM "PlayerMatchPerformance" p
      WHERE p."matchResultId" = m."matchResultId"
        AND p."teamId" = m."teamId"
        AND p.played
        AND p.assists > 0
    )
  );

UPDATE "MatchResultTeamMeta" m
SET "priorityRatingsCompletedAt" = ratings."completedAt"
FROM (
  SELECT "matchResultId", "teamId", MAX("updatedAt") AS "completedAt"
  FROM "PlayerMatchPerformance"
  WHERE played AND "appearanceRecorded"
  GROUP BY "matchResultId", "teamId"
  HAVING COUNT(*) > 0 AND COUNT(rating) = COUNT(*)
) ratings
WHERE m."matchResultId" = ratings."matchResultId"
  AND m."teamId" = ratings."teamId"
  AND m."priorityRatingsCompletedAt" IS NULL;

-- Retire future paid Veo Priority preferences without rewriting historic accepted bookings or charges.
UPDATE "VeoTeamPriority"
SET enabled = FALSE, "updatedAt" = CURRENT_TIMESTAMP
WHERE enabled = TRUE;

UPDATE "VeoFixtureRequest"
SET status = 'UNAVAILABLE', "agreedPence" = 0, revision = revision + 1
WHERE status = 'REQUESTED';

UPDATE "VeoPriorityRequest"
SET status = 'DECLINED', "reviewedAt" = COALESCE("reviewedAt", CURRENT_TIMESTAMP)
WHERE status = 'PENDING';

-- Editable launch email. This migration creates the Campaign Email template only; it does not queue or send mail.
INSERT INTO "EmailTemplate" (
  "id", "key", "name", "description", "audience", "interestType", "subject", "body",
  "ctaLabel", "ctaUrlKey", "isActive", "createdAt", "updatedAt"
) VALUES (
  'sixfl-tv-priority-launch-email',
  'sixfl-tv-priority-launch-email',
  'SIXFL TV Priority — earned score launch',
  'Launch email explaining the free score-based recorded-pitch priority system. Includes each team’s current SIXFL TV Priority Score when sent through Team or League Communications.',
  'TEAM',
  NULL,
  'SIXFL TV Priority is changing — no more extra fee 📹',
  E'Hi {{firstName}},\n\nWe are changing the way SIXFL TV Priority works — and we are scrapping the extra Veo Priority fee.\n\nFrom now on, recorded-pitch priority is earned by teams that help SIXFL run match nights smoothly and keep match information up to date.\n\nYOUR CURRENT SCORE\n\nYour current SIXFL TV Priority Score is **{{sixflTvPriorityScore}}/100**. You can see the same score in your SIXFL team account, together with your recent match-by-match breakdown.\n\nHOW THE SCORE WORKS\n\nYour score is based on your last five completed fixtures, with up to 20 points available per match:\n\n• Payment on time — 10 points. Late payment earns only 2 points.\n• Fixture confirmed by the 72-hour deadline — 4 points.\n• Core match card completed by 6pm the day after the match — 4 points. This means players who played, goalscorers and Player of the Match.\n• Assists recorded — 1 bonus point.\n• Player ratings completed — 1 bonus point.\n\nTeams need at least 60/100 and must regularly complete their core match cards to qualify for recorded-pitch priority. New teams start with a provisional score while they build their first five-match history.\n\nWHAT THIS MEANS\n\nWhen filming spaces are limited, priority will be given to eligible teams with the strongest scores. A high score does not guarantee every match will be recorded, because camera capacity is limited, but teams that consistently confirm, pay and complete their match details will be favoured.\n\nIf a team repeatedly pays late, confirms late or leaves match cards incomplete, its score will fall and it may stop receiving recorded-pitch priority. The score can recover as soon as the team starts completing things on time again.\n\nThere is no extra SIXFL TV Priority fee.\n\nThe match-card deadline is 6pm the day after your fixture so we can finish match reports, player statistics, graphics and SIXFL TV content promptly.\n\nThanks,\nThe SIXFL Team',
  NULL,
  NULL,
  TRUE,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
) ON CONFLICT ("key") DO NOTHING;
