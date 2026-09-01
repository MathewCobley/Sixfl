const fs = require("node:fs");
const path = require("node:path");

const file = "src/lib/payments/team-autopay.ts";
const absolute = path.join(process.cwd(), ...file.split("/"));

function replaceRequired(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) {
    throw new Error(`Saved-card fee safety source missing: ${label}`);
  }
  return source.replace(before, after);
}

let source = fs.readFileSync(absolute, "utf8");

source = replaceRequired(
  source,
  `  amountPence: number;\n  paidPence: number;\n  dueDate: Date | null;`,
  `  amountPence: number;\n  paidPence: number;\n  autoPayCapPence: number | null;\n  dueDate: Date | null;`,
  "DueAutoPayCharge safe cap field",
);

source = replaceRequired(
  source,
  `      pc."amountPence"::int AS "amountPence",\n      COALESCE(SUM(tx."amountPence"), 0)::int AS "paidPence",\n      pc."dueDate"`,
  `      pc."amountPence"::int AS "amountPence",\n      COALESCE(SUM(tx."amountPence"), 0)::int AS "paidPence",\n      COALESCE(\n        t."standardMatchFeePence",\n        CASE\n          WHEN f."homeTeamId" = pc."teamId" THEN f."homeMatchFeePence"\n          WHEN f."awayTeamId" = pc."teamId" THEN f."awayMatchFeePence"\n          ELSE NULL\n        END,\n        f."matchFeePence"\n      )::int AS "autoPayCapPence",\n      pc."dueDate"`,
  "saved-card query fee authority",
);

// The verified fee cap is selected alongside SUM(tx.amountPence), so every
// Team/Fixture column referenced by that expression must be part of GROUP BY.
// Anchor the replacement to the GROUP BY clause itself. A previous version
// matched the same column sequence in SELECT and accidentally added the fields
// there instead, leaving PostgreSQL to reject the aggregate query at runtime.
source = replaceRequired(
  source,
  `    GROUP BY\n      pc."id",\n      pc."teamId",\n      t."name",\n      t."stripeCustomerId",\n      t."stripeDefaultPaymentMethodId",\n      t."autoPaySetupCheckoutSessionId",\n      pc."fixtureId",`,
  `    GROUP BY\n      pc."id",\n      pc."teamId",\n      t."name",\n      t."stripeCustomerId",\n      t."stripeDefaultPaymentMethodId",\n      t."autoPaySetupCheckoutSessionId",\n      t."standardMatchFeePence",\n      f."homeTeamId",\n      f."awayTeamId",\n      f."homeMatchFeePence",\n      f."awayMatchFeePence",\n      f."matchFeePence",\n      pc."fixtureId",`,
  "saved-card query fee authority grouping",
);

source = replaceRequired(
  source,
  `  for (const row of rows) {\n    const outstandingPence = row.amountPence - row.paidPence;\n\n    if (outstandingPence <= 0) {`,
  `  for (const row of rows) {\n    const autoPayCapPence = row.autoPayCapPence;\n\n    if (autoPayCapPence === null) {\n      const message =\n        "Automatic payment blocked because SIXFL could not verify this team's agreed match fee.";\n      await db.$executeRaw(Prisma.sql\`\n        UPDATE "Team"\n        SET\n          "autoPayLastFailureAt" = NOW(),\n          "autoPayLastFailureReason" = \${message}\n        WHERE "id" = \${row.teamId}\n      \`);\n      results.push({\n        chargeId: row.chargeId,\n        teamId: row.teamId,\n        status: "skipped",\n        amountPence: 0,\n        message,\n      });\n      continue;\n    }\n\n    let chargeAmountPence = row.amountPence;\n\n    if (chargeAmountPence > autoPayCapPence) {\n      if (row.paidPence > 0) {\n        const message =\n          \`Automatic payment blocked: stored charge \${chargeAmountPence}p exceeds the verified team fee \${autoPayCapPence}p and money is already recorded against the charge. Admin review is required.\`;\n        await db.$executeRaw(Prisma.sql\`\n          UPDATE "Team"\n          SET\n            "autoPayLastFailureAt" = NOW(),\n            "autoPayLastFailureReason" = \${message}\n          WHERE "id" = \${row.teamId}\n        \`);\n        results.push({\n          chargeId: row.chargeId,\n          teamId: row.teamId,\n          status: "skipped",\n          amountPence: 0,\n          message,\n        });\n        continue;\n      }\n\n      if (autoPayCapPence <= 0) {\n        await db.$executeRaw(Prisma.sql\`\n          UPDATE "PaymentCharge"\n          SET "status" = 'VOID'::"PaymentChargeStatus"\n          WHERE "id" = \${row.chargeId}\n            AND "status" <> 'VOID'::"PaymentChargeStatus"\n        \`);\n        results.push({\n          chargeId: row.chargeId,\n          teamId: row.teamId,\n          status: "skipped",\n          amountPence: 0,\n          message: "Automatic payment blocked because the verified team match fee is £0.00.",\n        });\n        continue;\n      }\n\n      await db.$executeRaw(Prisma.sql\`\n        UPDATE "PaymentCharge"\n        SET\n          "amountPence" = \${autoPayCapPence},\n          "status" = 'OPEN'::"PaymentChargeStatus"\n        WHERE "id" = \${row.chargeId}\n          AND "status" <> 'VOID'::"PaymentChargeStatus"\n      \`);\n\n      console.warn("Corrected saved-card charge down to verified team fee before Stripe debit", {\n        chargeId: row.chargeId,\n        teamId: row.teamId,\n        storedAmountPence: row.amountPence,\n        verifiedFeePence: autoPayCapPence,\n      });\n      chargeAmountPence = autoPayCapPence;\n    }\n\n    const outstandingPence = chargeAmountPence - row.paidPence;\n\n    if (outstandingPence <= 0) {`,
  "saved-card charge cap",
);

source = replaceRequired(
  source,
  `          metadata: {\n            type: "team_matchday_auto_payment",\n            teamId: row.teamId,\n            chargeId: row.chargeId,\n            fixtureId: row.fixtureId,\n          },`,
  `          metadata: {\n            type: "team_matchday_auto_payment",\n            teamId: row.teamId,\n            chargeId: row.chargeId,\n            fixtureId: row.fixtureId,\n            verifiedTeamFeePence: String(autoPayCapPence),\n            storedChargePence: String(row.amountPence),\n          },`,
  "saved-card Stripe audit metadata",
);

source = replaceRequired(
  source,
  `          idempotencyKey: \`sixfl_matchday_autopay_\${row.chargeId}\`,`,
  `          idempotencyKey: \`sixfl_matchday_autopay_\${row.chargeId}_\${chargeAmountPence}\`,`,
  "saved-card amount-aware idempotency key",
);

fs.writeFileSync(absolute, source, "utf8");
console.log(
  "Saved-card autopay now verifies the team's agreed fee and cannot debit above it.",
);
