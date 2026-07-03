-- Dry-run merge plan for the Harrogate Spring/Summer 2026 duplicate Team rows.
-- READ ONLY. This script does not update, delete, archive or merge anything.
-- Run this first and review every conflict section before any real merge script is used.

CREATE TEMP TABLE _team_merge_pairs (
  team_name TEXT NOT NULL,
  canonical_team_id TEXT NOT NULL,
  duplicate_team_id TEXT NOT NULL,
  note TEXT
) ON COMMIT DROP;

INSERT INTO _team_merge_pairs (team_name, canonical_team_id, duplicate_team_id, note) VALUES
  ('Crescent United', 'cmpst3m8e0kl5po1dqn2ja4kp', 'e2c977db-3b15-40ce-a4b2-f8eaebbc3069', 'Spring row has real squad/payment/comms history'),
  ('Dynamo Kebab', 'cmorkui2h00n7mr1d0zzxfjq2', 'd5b067d4-a252-4e09-925f-9275daf3f1c6', 'Spring row has real squad/payment history'),
  ('Reece''s Set Pieces', 'cmphkkbxd0097os1d8m8g3d05', '657df6ac-b6ce-47df-b580-0232abfa649f', 'Spring row has payment/confirmation history'),
  ('Rossett Vets', 'cmn4rvxzx0001uvcseoo9kaa1', 'eabab5dc-fc3f-4280-916a-e632b819396a', 'Spring row has captain/payment history'),
  ('Roy''s Boys', 'cmmxyo31z0001p31drhij6bct', 'b6c3a37b-b77e-43b8-8e8c-f6d96ebd22c3', 'Spring row has captain/payment history'),
  ('Six Offenders', 'cmn9l1k7l0002uvv0stn4imiz', '7fa65d83-0682-4990-b33c-44780415c865', 'Spring row has more history'),
  ('The Fat B*st*rds FC', '5a364f3b-4d20-4b9f-b307-f7a044fc1a5e', 'cmpgshl7601mtoc1dl9quru8x', 'Summer row has current squad so it is canonical'),
  ('Wenlock Warriors', 'cmmvci80z0003nq1dd3smshm7', 'ed8190f7-06d9-4c0f-9b49-e3b8d6b7a80f', 'Spring row has captain/payment history'),
  ('Wetherby Wanderers', 'cmqk15pg6001hpl1dm9ew8hgu', '675a2963-677d-48a1-aee4-54041e17fa93', 'Spring row has squad/prospect/comms history'),
  ('What a Struijk', 'cmmzenxr60009p31dwzyfp4h8', 'dac0c97d-14dd-41b3-8a99-b48830009ba0', 'Spring row has real squad/payment/result history');

\echo '=== MERGE PAIRS ==='
SELECT
  p.team_name,
  p.canonical_team_id,
  canonical.name AS canonical_name,
  canonical."leagueId" AS canonical_league_id,
  canonical."divisionId" AS canonical_division_id,
  p.duplicate_team_id,
  duplicate.name AS duplicate_name,
  duplicate."leagueId" AS duplicate_league_id,
  duplicate."divisionId" AS duplicate_division_id,
  p.note
FROM _team_merge_pairs p
JOIN "Team" canonical ON canonical.id = p.canonical_team_id
JOIN "Team" duplicate ON duplicate.id = p.duplicate_team_id
ORDER BY p.team_name;

\echo '=== ROWS THAT WOULD MOVE BY TABLE ==='
SELECT p.team_name, 'TeamMember' AS table_name, COUNT(*) AS rows_to_move
FROM _team_merge_pairs p JOIN "TeamMember" x ON x."teamId" = p.duplicate_team_id
GROUP BY p.team_name
UNION ALL
SELECT p.team_name, 'TeamPlayerProspect', COUNT(*)
FROM _team_merge_pairs p JOIN "TeamPlayerProspect" x ON x."teamId" = p.duplicate_team_id
GROUP BY p.team_name
UNION ALL
SELECT p.team_name, 'Fixture homeTeamId', COUNT(*)
FROM _team_merge_pairs p JOIN "Fixture" x ON x."homeTeamId" = p.duplicate_team_id
GROUP BY p.team_name
UNION ALL
SELECT p.team_name, 'Fixture awayTeamId', COUNT(*)
FROM _team_merge_pairs p JOIN "Fixture" x ON x."awayTeamId" = p.duplicate_team_id
GROUP BY p.team_name
UNION ALL
SELECT p.team_name, 'PaymentCharge', COUNT(*)
FROM _team_merge_pairs p JOIN "PaymentCharge" x ON x."teamId" = p.duplicate_team_id
GROUP BY p.team_name
UNION ALL
SELECT p.team_name, 'PaymentTransaction', COUNT(*)
FROM _team_merge_pairs p JOIN "PaymentTransaction" x ON x."teamId" = p.duplicate_team_id
GROUP BY p.team_name
UNION ALL
SELECT p.team_name, 'PlayerMatchFee', COUNT(*)
FROM _team_merge_pairs p JOIN "PlayerMatchFee" x ON x."teamId" = p.duplicate_team_id
GROUP BY p.team_name
UNION ALL
SELECT p.team_name, 'FixtureCaptainConfirmation', COUNT(*)
FROM _team_merge_pairs p JOIN "FixtureCaptainConfirmation" x ON x."teamId" = p.duplicate_team_id
GROUP BY p.team_name
UNION ALL
SELECT p.team_name, 'MessageThread', COUNT(*)
FROM _team_merge_pairs p JOIN "MessageThread" x ON x."teamId" = p.duplicate_team_id
GROUP BY p.team_name
UNION ALL
SELECT p.team_name, 'MatchResultTeamMeta', COUNT(*)
FROM _team_merge_pairs p JOIN "MatchResultTeamMeta" x ON x."teamId" = p.duplicate_team_id
GROUP BY p.team_name
UNION ALL
SELECT p.team_name, 'ResultDispute', COUNT(*)
FROM _team_merge_pairs p JOIN "ResultDispute" x ON x."teamId" = p.duplicate_team_id
GROUP BY p.team_name
UNION ALL
SELECT p.team_name, 'LeagueSeasonTeam', COUNT(*)
FROM _team_merge_pairs p JOIN "LeagueSeasonTeam" x ON x."teamId" = p.duplicate_team_id
GROUP BY p.team_name
ORDER BY team_name, table_name;

\echo '=== UNIQUE CONFLICTS TO RESOLVE BEFORE APPLYING ==='
\echo 'TeamMember conflicts: same user already exists on canonical team'
SELECT p.team_name, dup.id AS duplicate_member_id, keep.id AS canonical_member_id, dup."userId", u.email
FROM _team_merge_pairs p
JOIN "TeamMember" dup ON dup."teamId" = p.duplicate_team_id
JOIN "TeamMember" keep ON keep."teamId" = p.canonical_team_id AND keep."userId" = dup."userId"
LEFT JOIN "User" u ON u.id = dup."userId"
ORDER BY p.team_name, u.email;

\echo 'PaymentCharge conflicts: same fixture already has canonical charge'
SELECT p.team_name, dup.id AS duplicate_charge_id, keep.id AS canonical_charge_id, dup."fixtureId"
FROM _team_merge_pairs p
JOIN "PaymentCharge" dup ON dup."teamId" = p.duplicate_team_id AND dup."fixtureId" IS NOT NULL
JOIN "PaymentCharge" keep ON keep."teamId" = p.canonical_team_id AND keep."fixtureId" = dup."fixtureId"
ORDER BY p.team_name, dup."fixtureId";

\echo 'FixtureCaptainConfirmation conflicts: same fixture already has canonical confirmation'
SELECT p.team_name, dup.id AS duplicate_confirmation_id, keep.id AS canonical_confirmation_id, dup."fixtureId"
FROM _team_merge_pairs p
JOIN "FixtureCaptainConfirmation" dup ON dup."teamId" = p.duplicate_team_id
JOIN "FixtureCaptainConfirmation" keep ON keep."teamId" = p.canonical_team_id AND keep."fixtureId" = dup."fixtureId"
ORDER BY p.team_name, dup."fixtureId";

\echo 'MatchResultTeamMeta conflicts: same result already has canonical metadata'
SELECT p.team_name, dup.id AS duplicate_meta_id, keep.id AS canonical_meta_id, dup."matchResultId"
FROM _team_merge_pairs p
JOIN "MatchResultTeamMeta" dup ON dup."teamId" = p.duplicate_team_id
JOIN "MatchResultTeamMeta" keep ON keep."teamId" = p.canonical_team_id AND keep."matchResultId" = dup."matchResultId"
ORDER BY p.team_name, dup."matchResultId";

\echo 'LeagueSeasonTeam conflicts: canonical already has an entry in same league'
SELECT p.team_name, dup.id AS duplicate_season_team_id, keep.id AS canonical_season_team_id, dup."leagueId", dup."divisionId"
FROM _team_merge_pairs p
JOIN "LeagueSeasonTeam" dup ON dup."teamId" = p.duplicate_team_id
JOIN "LeagueSeasonTeam" keep ON keep."teamId" = p.canonical_team_id AND keep."leagueId" = dup."leagueId"
ORDER BY p.team_name, dup."leagueId";

\echo 'Fixture self-conflicts: merge would make a fixture have same team home and away'
SELECT p.team_name, f.id AS fixture_id, f."homeTeamId", f."awayTeamId", f."kickoffAt"
FROM _team_merge_pairs p
JOIN "Fixture" f ON (
  (f."homeTeamId" = p.duplicate_team_id AND f."awayTeamId" = p.canonical_team_id)
  OR
  (f."awayTeamId" = p.duplicate_team_id AND f."homeTeamId" = p.canonical_team_id)
)
ORDER BY p.team_name, f."kickoffAt";

\echo '=== DRY RUN COMPLETE ==='
\echo 'If any conflict query above returns rows, do not run an apply script until those rows have a specific handling rule.'
