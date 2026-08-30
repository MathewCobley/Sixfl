-- Older captain responses stored a hard-coded note that sounded as though the
-- captain had contacted SIXFL directly. They had actually selected the online
-- No option, and the old form did not collect a reason.
UPDATE "FixtureCaptainConfirmation"
SET
  "note" = 'Team unavailable: the captain selected “No — our team cannot play” on the SIXFL fixture page. This was an online response; the previous form did not collect a reason.',
  "updatedAt" = NOW()
WHERE "status"::text = 'ISSUE_RAISED'
  AND BTRIM(COALESCE("note", '')) = 'Team unavailable: captain has told SIXFL they cannot fulfil this fixture.';
