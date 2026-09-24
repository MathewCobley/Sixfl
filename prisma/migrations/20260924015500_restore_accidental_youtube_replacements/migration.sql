BEGIN;

CREATE TEMP TABLE "_SixflRestoreYoutubeHighlights" ON COMMIT DROP AS
WITH target AS (
  SELECT
    f."id" AS "fixtureId",
    CASE
      WHEN (
        (home."name"='Dynamo Kebab' AND away."name"='Inter Maignan' AND mr."homeScore"=3 AND mr."awayScore"=1)
        OR
        (home."name"='Inter Maignan' AND away."name"='Dynamo Kebab' AND mr."homeScore"=1 AND mr."awayScore"=3)
      ) THEN 'Dynamo Kebab 3-1 Inter Maignan'
      WHEN (
        (home."name"='Taking Part FC' AND away."name"='The Units' AND mr."homeScore"=4 AND mr."awayScore"=2)
        OR
        (home."name"='The Units' AND away."name"='Taking Part FC' AND mr."homeScore"=2 AND mr."awayScore"=4)
      ) THEN 'Taking Part FC 4-2 The Units'
      ELSE NULL
    END AS "fixtureLabel"
  FROM "Fixture" f
  JOIN "Team" home ON home."id"=f."homeTeamId"
  JOIN "Team" away ON away."id"=f."awayTeamId"
  JOIN "MatchResult" mr ON mr."fixtureId"=f."id"
  WHERE (
      (home."name" IN ('Dynamo Kebab','Inter Maignan')
       AND away."name" IN ('Dynamo Kebab','Inter Maignan')
       AND home."name"<>away."name"
       AND (f."kickoffAt" AT TIME ZONE 'Europe/London')::date=DATE '2026-09-15')
      OR
      (home."name" IN ('Taking Part FC','The Units')
       AND away."name" IN ('Taking Part FC','The Units')
       AND home."name"<>away."name"
       AND (f."kickoffAt" AT TIME ZONE 'Europe/London')::date=DATE '2026-09-09')
    )
),
picked AS (
  SELECT
    t."fixtureId",
    t."fixtureLabel",
    accidental."id" AS "accidentalPublishId",
    accidental."youtubeUrl" AS "accidentalUrl",
    accidental."youtubeVideoId" AS "accidentalVideoId",
    accidental."createdAt" AS "accidentalCreatedAt",
    original."id" AS "originalPublishId",
    original."youtubeUrl" AS "originalUrl",
    original."youtubeVideoId" AS "originalVideoId"
  FROM target t
  JOIN LATERAL (
    SELECT p."id",p."youtubeUrl",p."youtubeVideoId",p."createdAt"
    FROM "SixflTvYoutubePublish" p
    WHERE p."fixtureId"=t."fixtureId"
      AND p."kind"='HIGHLIGHTS'
      AND p."state"='READY'
      AND p."requestedByActor"='automatic-youtube-replacement'
      AND p."youtubeUrl" IS NOT NULL
      AND p."youtubeVideoId" IS NOT NULL
      AND p."createdAt" >= TIMESTAMPTZ '2026-09-24 00:00:00+00'
    ORDER BY p."createdAt" DESC,p."id" DESC
    LIMIT 1
  ) accidental ON TRUE
  JOIN LATERAL (
    SELECT p."id",p."youtubeUrl",p."youtubeVideoId"
    FROM "SixflTvYoutubePublish" p
    WHERE p."fixtureId"=t."fixtureId"
      AND p."kind"='HIGHLIGHTS'
      AND p."state"='READY'
      AND p."youtubeUrl" IS NOT NULL
      AND p."youtubeVideoId" IS NOT NULL
      AND p."createdAt" < accidental."createdAt"
    ORDER BY p."completedAt" DESC NULLS LAST,p."createdAt" DESC,p."id" DESC
    LIMIT 1
  ) original ON TRUE
  WHERE t."fixtureLabel" IS NOT NULL
)
SELECT * FROM picked;

DO $$
DECLARE
  row_count integer;
  bad_current integer;
BEGIN
  SELECT COUNT(*) INTO row_count FROM "_SixflRestoreYoutubeHighlights";
  IF row_count <> 2 THEN
    RAISE EXCEPTION 'Expected exactly 2 accidental YouTube replacement fixtures, found %', row_count;
  END IF;

  SELECT COUNT(*) INTO bad_current
  FROM "_SixflRestoreYoutubeHighlights" r
  JOIN "Fixture" f ON f."id"=r."fixtureId"
  WHERE split_part(COALESCE(f."sixflTvUrl",''), E'\n', 1) <> r."accidentalUrl";

  IF bad_current <> 0 THEN
    RAISE EXCEPTION 'Refusing restore: % fixture(s) no longer point at the accidental replacement URL', bad_current;
  END IF;
END $$;

UPDATE "Fixture" f
SET
  "sixflTvUrl" =
    r."originalUrl" ||
    CASE
      WHEN strpos(COALESCE(f."sixflTvUrl",''), E'\n') > 0
        THEN substr(f."sixflTvUrl", strpos(f."sixflTvUrl", E'\n'))
      ELSE ''
    END,
  "sixflTvRecorded"=TRUE,
  "updatedAt"=NOW()
FROM "_SixflRestoreYoutubeHighlights" r
WHERE f."id"=r."fixtureId";

UPDATE "SixflTvYoutubePublish" p
SET
  "state"='FAILED',
  "error"='Accidental automatic replacement published during the 24 Sep 2026 worker restart. Original SIXFL highlights link restored; remove this YouTube upload manually.',
  "busyUntil"=NULL,
  "updatedAt"=NOW()
FROM "_SixflRestoreYoutubeHighlights" r
WHERE p."id"=r."accidentalPublishId"
  AND p."state"='READY';

DO $$
DECLARE
  restored integer;
BEGIN
  SELECT COUNT(*) INTO restored
  FROM "_SixflRestoreYoutubeHighlights" r
  JOIN "Fixture" f ON f."id"=r."fixtureId"
  WHERE split_part(COALESCE(f."sixflTvUrl",''), E'\n', 1)=r."originalUrl";

  IF restored <> 2 THEN
    RAISE EXCEPTION 'YouTube highlights restore verification failed: % of 2 fixtures restored', restored;
  END IF;
END $$;

COMMIT;
