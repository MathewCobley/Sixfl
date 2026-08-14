const fs = require("node:fs");
const path = require("node:path");

const filePath = path.join(process.cwd(), "src/lib/payments/team-credits.ts");
let source = fs.readFileSync(filePath, "utf8");

if (!source.includes("credit_used_totals_policy")) {
  const marker = "}\n\nexport async function syncTeamCreditLedgerSources(";
  const markerIndex = source.indexOf(marker);
  if (markerIndex < 0) {
    throw new Error("Team credit source reconciliation marker was not found.");
  }

  const correction = `

  // credit_used_totals_policy
  // When existing team credit is used against a fixture before fresh player
  // money arrives, that credit is part of the fixture coverage. Only the fresh
  // cash above the remaining balance becomes new credit, but the used credit
  // must be included when calculating where that remaining balance starts.
  await db.$executeRaw(Prisma.sql\`
    WITH player_totals AS (
      SELECT
        pmf."teamId",
        pmf."fixtureId",
        SUM(pmf."amountPence")::int AS "playerPaidPence"
      FROM "PlayerMatchFee" pmf
      WHERE pmf."teamId" IN (\${Prisma.join(teamIds)})
        AND pmf."status" = 'PAID'
      GROUP BY pmf."teamId", pmf."fixtureId"
    ),
    real_team_totals AS (
      SELECT
        transaction."chargeId",
        SUM(transaction."amountPence")::int AS "teamPaidPence"
      FROM "PaymentTransaction" transaction
      WHERE transaction."teamId" IN (\${Prisma.join(teamIds)})
        AND transaction."chargeId" IS NOT NULL
        AND COALESCE(transaction."reference", '') <> 'TEAM_CREDIT'
        AND LOWER(COALESCE(transaction."notes", '')) NOT LIKE '%team credit used%'
        AND LOWER(COALESCE(transaction."notes", '')) NOT LIKE '%player match fee paid online%'
        AND LOWER(COALESCE(transaction."notes", '')) NOT LIKE '%player fee id:%'
      GROUP BY transaction."chargeId"
    ),
    credit_used_totals AS (
      SELECT
        transaction."chargeId",
        SUM(transaction."amountPence")::int AS "creditUsedPence"
      FROM "PaymentTransaction" transaction
      WHERE transaction."teamId" IN (\${Prisma.join(teamIds)})
        AND transaction."chargeId" IS NOT NULL
        AND (
          transaction."reference" = 'TEAM_CREDIT'
          OR LOWER(COALESCE(transaction."notes", '')) LIKE '%team credit used%'
        )
      GROUP BY transaction."chargeId"
    ),
    expected_credit AS (
      SELECT
        CONCAT('tcred_player_overpay_', pc."teamId", '_', pc."fixtureId") AS "id",
        pc."teamId",
        pc."fixtureId",
        pc."id" AS "chargeId",
        pc."amountPence" AS "chargeAmountPence",
        COALESCE(pt."playerPaidPence", 0)::int AS "playerPaidPence",
        COALESCE(rt."teamPaidPence", 0)::int AS "teamPaidPence",
        COALESCE(cu."creditUsedPence", 0)::int AS "creditUsedPence",
        (
          COALESCE(pt."playerPaidPence", 0) +
          COALESCE(rt."teamPaidPence", 0)
        )::int AS "freshCashPence",
        LEAST(
          (
            COALESCE(pt."playerPaidPence", 0) +
            COALESCE(rt."teamPaidPence", 0)
          )::int,
          GREATEST(
            COALESCE(pt."playerPaidPence", 0) +
            COALESCE(rt."teamPaidPence", 0) +
            COALESCE(cu."creditUsedPence", 0) -
            pc."amountPence",
            0
          )::int
        )::int AS "surplusPence"
      FROM "PaymentCharge" pc
      JOIN "Team" team ON team."id" = pc."teamId"
      JOIN "Fixture" fixture ON fixture."id" = pc."fixtureId"
      LEFT JOIN player_totals pt
        ON pt."teamId" = pc."teamId"
       AND pt."fixtureId" = pc."fixtureId"
      LEFT JOIN real_team_totals rt
        ON rt."chargeId" = pc."id"
      LEFT JOIN credit_used_totals cu
        ON cu."chargeId" = pc."id"
      WHERE pc."teamId" IN (\${Prisma.join(teamIds)})
        AND team."teamMode"::text = 'STANDARD'
        AND (
          team."standardCreditStartedAt" IS NULL
          OR fixture."kickoffAt" >= team."standardCreditStartedAt"
        )
        AND pc."fixtureId" IS NOT NULL
        AND pc."status" <> 'VOID'
    )
    INSERT INTO "TeamCreditLedgerEntry" (
      "id",
      "teamId",
      "sourceFixtureId",
      "chargeId",
      "entryType",
      "amountPence",
      "description"
    )
    SELECT
      ec."id",
      ec."teamId",
      ec."fixtureId",
      ec."chargeId",
      'CREDIT_ADDED'::"TeamCreditLedgerEntryType",
      ec."surplusPence",
      CONCAT(
        'Fixture overpayment added to team credit. Players paid £',
        TO_CHAR((ec."playerPaidPence"::numeric / 100), 'FM999999990.00'),
        ', the team paid £',
        TO_CHAR((ec."teamPaidPence"::numeric / 100), 'FM999999990.00'),
        ' and £',
        TO_CHAR((ec."creditUsedPence"::numeric / 100), 'FM999999990.00'),
        ' of existing credit was used against a £',
        TO_CHAR((ec."chargeAmountPence"::numeric / 100), 'FM999999990.00'),
        ' fixture charge.'
      )
    FROM expected_credit ec
    WHERE ec."surplusPence" > 0
    ON CONFLICT ("id") DO UPDATE SET
      "teamId" = EXCLUDED."teamId",
      "sourceFixtureId" = EXCLUDED."sourceFixtureId",
      "chargeId" = EXCLUDED."chargeId",
      "amountPence" = EXCLUDED."amountPence",
      "description" = EXCLUDED."description"
  \`);

  await db.$executeRaw(Prisma.sql\`
    WITH player_totals AS (
      SELECT pmf."teamId", pmf."fixtureId", SUM(pmf."amountPence")::int AS "playerPaidPence"
      FROM "PlayerMatchFee" pmf
      WHERE pmf."teamId" IN (\${Prisma.join(teamIds)})
        AND pmf."status" = 'PAID'
      GROUP BY pmf."teamId", pmf."fixtureId"
    ),
    real_team_totals AS (
      SELECT transaction."chargeId", SUM(transaction."amountPence")::int AS "teamPaidPence"
      FROM "PaymentTransaction" transaction
      WHERE transaction."teamId" IN (\${Prisma.join(teamIds)})
        AND transaction."chargeId" IS NOT NULL
        AND COALESCE(transaction."reference", '') <> 'TEAM_CREDIT'
        AND LOWER(COALESCE(transaction."notes", '')) NOT LIKE '%team credit used%'
        AND LOWER(COALESCE(transaction."notes", '')) NOT LIKE '%player match fee paid online%'
        AND LOWER(COALESCE(transaction."notes", '')) NOT LIKE '%player fee id:%'
      GROUP BY transaction."chargeId"
    ),
    credit_used_totals AS (
      SELECT transaction."chargeId", SUM(transaction."amountPence")::int AS "creditUsedPence"
      FROM "PaymentTransaction" transaction
      WHERE transaction."teamId" IN (\${Prisma.join(teamIds)})
        AND transaction."chargeId" IS NOT NULL
        AND (
          transaction."reference" = 'TEAM_CREDIT'
          OR LOWER(COALESCE(transaction."notes", '')) LIKE '%team credit used%'
        )
      GROUP BY transaction."chargeId"
    ),
    valid_ids AS (
      SELECT CONCAT('tcred_player_overpay_', pc."teamId", '_', pc."fixtureId") AS "id"
      FROM "PaymentCharge" pc
      JOIN "Team" team ON team."id" = pc."teamId"
      JOIN "Fixture" fixture ON fixture."id" = pc."fixtureId"
      LEFT JOIN player_totals pt
        ON pt."teamId" = pc."teamId" AND pt."fixtureId" = pc."fixtureId"
      LEFT JOIN real_team_totals rt ON rt."chargeId" = pc."id"
      LEFT JOIN credit_used_totals cu ON cu."chargeId" = pc."id"
      WHERE pc."teamId" IN (\${Prisma.join(teamIds)})
        AND team."teamMode"::text = 'STANDARD'
        AND (
          team."standardCreditStartedAt" IS NULL
          OR fixture."kickoffAt" >= team."standardCreditStartedAt"
        )
        AND pc."fixtureId" IS NOT NULL
        AND pc."status" <> 'VOID'
        AND LEAST(
          COALESCE(pt."playerPaidPence", 0) + COALESCE(rt."teamPaidPence", 0),
          GREATEST(
            COALESCE(pt."playerPaidPence", 0) +
            COALESCE(rt."teamPaidPence", 0) +
            COALESCE(cu."creditUsedPence", 0) - pc."amountPence",
            0
          )
        ) > 0
    )
    DELETE FROM "TeamCreditLedgerEntry" entry
    WHERE entry."teamId" IN (\${Prisma.join(teamIds)})
      AND entry."id" LIKE 'tcred_player_overpay_%'
      AND NOT EXISTS (
        SELECT 1 FROM valid_ids current_ids WHERE current_ids."id" = entry."id"
      )
  \`);
`;

  source = source.slice(0, markerIndex) + correction + source.slice(markerIndex);
}

fs.writeFileSync(filePath, source, "utf8");

if (!source.includes("credit_used_totals_policy")) {
  throw new Error("Credit replenishment policy was not applied.");
}

console.log(
  "Team credit replenishment now counts credit already used on the fixture when calculating fresh cash overpayment.",
);
