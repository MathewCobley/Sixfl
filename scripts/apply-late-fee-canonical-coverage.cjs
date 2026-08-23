const fs = require("node:fs");
const path = require("node:path");

const actionsPath = path.join(
  process.cwd(),
  "src/app/(admin)/admin/fixtures/late-fees/actions.ts",
);
const pagePath = path.join(
  process.cwd(),
  "src/app/(admin)/admin/fixtures/late-fees/page.tsx",
);

let source = fs.readFileSync(actionsPath, "utf8");

const ledgerImport =
  'import { getTeamPaymentLedger } from "@/lib/payments/team-payment-ledger";';
if (!source.includes(ledgerImport)) {
  const anchor = 'import { getPublicSiteUrl } from "@/lib/stripe/client";';
  if (!source.includes(anchor)) {
    throw new Error("Late-fee canonical coverage import anchor is missing.");
  }
  source = source.replace(anchor, `${ledgerImport}\n${anchor}`);
}

const oldDecisionCoverage = `    if (!charge || charge.status === "PAID" || charge.status === "VOID") {
      throw new Error("Charge is not open for late payment fee management.");
    }

    teamName = charge.teamName;
    const overdueAt = charge.dueDate
      ? new Date(charge.dueDate.getTime() + PAYMENT_LATE_FEE_GRACE_PERIOD_MS)
      : null;
    const isLateFeeEligible = Boolean(overdueAt && overdueAt <= now);
    const outstandingBeforeDecision = charge.amountPence - charge.paidTotalPence;
`;

const newDecisionCoverage = `    if (!charge || charge.status === "VOID") {
      throw new Error("Charge is not open for late payment fee management.");
    }

    teamName = charge.teamName;
    const paymentLedger = await getTeamPaymentLedger(charge.teamId);
    const ledgerEntry =
      paymentLedger?.entries.find((entry) => entry.chargeId === charge.id) ?? null;
    const coveredPence = ledgerEntry?.coveredPence ?? charge.paidTotalPence;
    const outstandingBeforeDecision =
      ledgerEntry?.outstandingPence ??
      Math.max(charge.amountPence - coveredPence, 0);

    if (
      charge.status === "PAID" ||
      ledgerEntry?.displayStatus === "PAID" ||
      outstandingBeforeDecision <= 0
    ) {
      throw new Error("Charge is already fully covered and cannot receive a late payment fee.");
    }

    const overdueAt = charge.dueDate
      ? new Date(charge.dueDate.getTime() + PAYMENT_LATE_FEE_GRACE_PERIOD_MS)
      : null;
    const isLateFeeEligible = Boolean(overdueAt && overdueAt <= now);
`;

if (!source.includes(newDecisionCoverage)) {
  if (!source.includes(oldDecisionCoverage)) {
    throw new Error("Late-fee decision coverage anchor is missing.");
  }
  source = source.replace(oldDecisionCoverage, newDecisionCoverage);
}

source = source.replaceAll(
  "paidTotalPence: charge.paidTotalPence,",
  "paidTotalPence: coveredPence,",
);

const functionStart = source.indexOf("export async function getPaymentLateFeeRows() {");
const functionEndMarker = "\n\nexport type LateConfirmationFeeRow = {";
const functionEnd = source.indexOf(functionEndMarker, functionStart);

if (functionStart < 0 || functionEnd < 0) {
  throw new Error("Late-fee rows function anchors are missing.");
}

const canonicalRowsFunction = `export async function getPaymentLateFeeRows() {
  const rows = await prisma.$queryRaw<PaymentLateFeeRow[]>(Prisma.sql\`
    WITH charge_totals AS (
      SELECT
        charge.\"id\" AS \"chargeId\",
        charge.\"teamId\" AS \"teamId\",
        team.\"name\" AS \"teamName\",
        charge.\"title\" AS \"title\",
        charge.\"description\" AS \"description\",
        charge.\"status\"::text AS \"chargeStatus\",
        charge.\"amountPence\" AS \"amountPence\",
        COALESCE(SUM(transaction.\"amountPence\"), 0)::int AS \"paidTotalPence\",
        (charge.\"amountPence\" - COALESCE(SUM(transaction.\"amountPence\"), 0))::int AS \"outstandingPence\",
        charge.\"dueDate\" AS \"dueDate\",
        charge.\"createdAt\" AS \"createdAt\",
        CASE
          WHEN charge.\"dueDate\" IS NULL THEN NULL
          ELSE FLOOR(EXTRACT(EPOCH FROM (NOW() - charge.\"dueDate\")) / 86400)::int
        END AS \"daysLate\",
        CASE
          WHEN charge.\"dueDate\" IS NULL THEN NULL
          ELSE charge.\"dueDate\" + INTERVAL '7 days'
        END AS \"lateFeeEligibleAt\",
        charge.\"latePaymentFeeStatus\"::text AS \"paymentLateFeeStatus\",
        charge.\"latePaymentFeeAmountPence\" AS \"paymentLateFeeAmountPence\",
        charge.\"latePaymentFeeNote\" AS \"paymentLateFeeNote\",
        charge.\"latePaymentFeeWarningAt\" AS \"paymentLateFeeWarningAt\",
        charge.\"latePaymentFeeAppliedAt\" AS \"paymentLateFeeAppliedAt\",
        charge.\"latePaymentFeeWaivedAt\" AS \"paymentLateFeeWaivedAt\",
        fixture.\"id\" AS \"fixtureId\",
        fixture.\"kickoffAt\" AS \"kickoffAt\",
        home_team.\"name\" AS \"homeTeamName\",
        away_team.\"name\" AS \"awayTeamName\"
      FROM \"PaymentCharge\" charge
      INNER JOIN \"Team\" team ON team.\"id\" = charge.\"teamId\"
      LEFT JOIN \"PaymentTransaction\" transaction ON transaction.\"chargeId\" = charge.\"id\"
      LEFT JOIN \"Fixture\" fixture ON fixture.\"id\" = charge.\"fixtureId\"
      LEFT JOIN \"Team\" home_team ON home_team.\"id\" = fixture.\"homeTeamId\"
      LEFT JOIN \"Team\" away_team ON away_team.\"id\" = fixture.\"awayTeamId\"
      WHERE charge.\"status\" IN ('OPEN', 'PART_PAID')
        AND charge.\"latePaymentFeeStatus\" <> 'APPLIED'
      GROUP BY charge.\"id\", team.\"name\", fixture.\"id\", home_team.\"name\", away_team.\"name\"
    )
    SELECT *
    FROM charge_totals
    WHERE \"daysLate\" >= 7
    ORDER BY
      CASE \"paymentLateFeeStatus\"
        WHEN 'NONE' THEN 0
        WHEN 'WARNING' THEN 1
        WHEN 'WAIVED' THEN 2
        ELSE 3
      END,
      \"daysLate\" DESC NULLS LAST,
      \"dueDate\" ASC NULLS LAST,
      \"teamName\" ASC
  \`);

  if (rows.length === 0) return rows;

  const teamIds = Array.from(new Set(rows.map((row) => row.teamId)));
  const ledgers = await Promise.all(
    teamIds.map(async (teamId) => [teamId, await getTeamPaymentLedger(teamId)] as const),
  );
  const ledgerEntryByChargeId = new Map(
    ledgers.flatMap(([, ledger]) =>
      ledger
        ? ledger.entries.map((entry) => [entry.chargeId, entry] as const)
        : [],
    ),
  );

  return rows
    .map((row) => {
      const ledgerEntry = ledgerEntryByChargeId.get(row.chargeId);
      if (!ledgerEntry) return row;

      return {
        ...row,
        chargeStatus: ledgerEntry.displayStatus,
        paidTotalPence: ledgerEntry.coveredPence,
        outstandingPence: ledgerEntry.outstandingPence,
      };
    })
    .filter(
      (row) =>
        row.outstandingPence > 0 &&
        row.chargeStatus !== "PAID" &&
        row.chargeStatus !== "VOID",
    );
}`;

source =
  source.slice(0, functionStart) +
  canonicalRowsFunction +
  source.slice(functionEnd);

if (
  !source.includes(ledgerImport) ||
  !source.includes("ledgerEntry?.coveredPence") ||
  !source.includes("ledgerEntryByChargeId") ||
  !source.includes("Charge is already fully covered")
) {
  throw new Error("Late-fee canonical coverage patch did not apply correctly.");
}

fs.writeFileSync(actionsPath, source, "utf8");

let page = fs.readFileSync(pagePath, "utf8");
page = page.replace(
  '<div>Paid: {formatMoney(row.paidTotalPence)}</div>',
  '<div>Covered: {formatMoney(row.paidTotalPence)}</div>',
);
if (!page.includes("Covered: {formatMoney(row.paidTotalPence)}")) {
  throw new Error("Late-fee covered label anchor is missing.");
}
fs.writeFileSync(pagePath, page, "utf8");

console.log(
  "Late-payment review now uses the same fixture coverage ledger as Team Payments.",
);
