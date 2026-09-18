-- Keep the editable SIXFL TV Priority launch email aligned with the current score weights.
-- Narrow replacements preserve any other administrator edits to the template.
UPDATE "EmailTemplate"
SET
  body = REPLACE(
    REPLACE(
      body,
      '• Payment on time — 10 points. Late payment earns only 2 points.',
      '• Payment on time — 6 points. Late payment earns only 2 points.'
    ),
    '• Core match card completed by 6pm the day after the match — 4 points. This means players who played, goalscorers and Player of the Match.',
    '• Core match card completed by 6pm the day after the match — 8 points. This means players who played, goalscorers and Player of the Match.'
  ),
  "updatedAt" = CURRENT_TIMESTAMP
WHERE key = 'sixfl-tv-priority-launch-email'
  AND (
    body LIKE '%Payment on time — 10 points.%'
    OR body LIKE '%Core match card completed by 6pm the day after the match — 4 points.%'
  );
