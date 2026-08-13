-- Northallerton Nomads was converted from MANAGED to STANDARD before
-- standardCreditStartedAt was introduced. Without a boundary, historical
-- managed-squad overpayments can be reconstructed as standard-team credit.
--
-- There is no historic team-mode audit table, so repair only the known affected
-- current STANDARD row. updatedAt is the safest persisted proxy for the mode
-- change available on that row and deliberately errs on the side of not carrying
-- managed-period money into the standard-team ledger.
WITH target_team AS (
  SELECT "id", "updatedAt"
  FROM "Team"
  WHERE LOWER("name") = 'northallerton nomads'
    AND "teamMode"::text = 'STANDARD'
  ORDER BY "updatedAt" DESC
  LIMIT 1
)
UPDATE "Team" team
SET "standardCreditStartedAt" = COALESCE(team."standardCreditStartedAt", target_team."updatedAt")
FROM target_team
WHERE team."id" = target_team."id";

-- Remove ledger rows whose underlying fixture/payment belongs to the managed
-- period. This uses the source fixture/charge date rather than ledger createdAt,
-- because a historical surplus may have been recalculated and inserted later.
DELETE FROM "TeamCreditLedgerEntry" credit
WHERE credit."teamId" = (
  SELECT "id"
  FROM "Team"
  WHERE LOWER("name") = 'northallerton nomads'
    AND "teamMode"::text = 'STANDARD'
  ORDER BY "updatedAt" DESC
  LIMIT 1
)
AND EXISTS (
  SELECT 1
  FROM "Team" team
  LEFT JOIN "PaymentCharge" charge ON charge."id" = credit."chargeId"
  LEFT JOIN "Fixture" source_fixture
    ON source_fixture."id" = COALESCE(
      credit."sourceFixtureId",
      credit."fixtureId",
      charge."fixtureId"
    )
  WHERE team."id" = credit."teamId"
    AND team."standardCreditStartedAt" IS NOT NULL
    AND COALESCE(
      source_fixture."kickoffAt",
      charge."dueDate",
      credit."createdAt"
    ) < team."standardCreditStartedAt"
);
