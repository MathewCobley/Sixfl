-- Keep the editable SIXFL TV Priority launch email aligned with the single-score model.
-- One headline score only: reliability 80 + audience 10 + participation 10 = 100.
UPDATE "EmailTemplate"
SET
  body = REPLACE(
    body,
    E'HOW THE SCORE WORKS\n\nYour score is based on your last five completed fixtures, with up to 20 points available per match:\n\n• Payment on time — 6 points. Late payment earns only 2 points.\n• Fixture confirmed by the 72-hour deadline — 4 points.\n• Core match card completed by 6pm the day after the match — 8 points. This means players who played, goalscorers and Player of the Match.\n• Assists recorded — 1 bonus point.\n• Player ratings completed — 1 bonus point.\n\nTeams need at least 60/100 and must regularly complete their core match cards to qualify for recorded-pitch priority. New teams start with a provisional score while they build their first five-match history.',
    E'HOW THE SCORE WORKS\n\nThere is one SIXFL TV Priority Score out of 100:\n\n• Reliability — up to 80 points. This comes from your recent match administration: match cards, payment, fixture confirmation, assists and ratings.\n• Audience — up to 10 points. SIXFL TV viewing is compared with teams in your current division. A View index of 100 means division-average viewing.\n• Participation — up to 10 points. Players can earn this for the team by taking part in SIXFL goal nominations and voting.\n\nTeams need at least 60/100 overall and must still meet the underlying reliability and core match-card minimums. New teams begin with provisional reliability and build audience and participation points as their SIXFL history develops.'
  ),
  "updatedAt" = CURRENT_TIMESTAMP
WHERE key = 'sixfl-tv-priority-launch-email';
