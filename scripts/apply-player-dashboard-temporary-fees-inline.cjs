const fs = require("node:fs");
const path = require("node:path");

const filePath = path.join(
  process.cwd(),
  "src/app/player/team/[teamid]/page.tsx",
);

let source = fs.readFileSync(filePath, "utf8");

function replaceRequired(before, after, label) {
  if (source.includes(after)) return;
  if (!source.includes(before)) {
    throw new Error(`Expected ${label} source was not found in player dashboard.`);
  }
  source = source.replace(before, after);
}

const normaliseEmailBlock = `function normaliseEmail(value: string | null | undefined) {
  const email = value?.trim().toLowerCase();
  return email || null;
}`;

const temporaryFeeTypeBlock = `${normaliseEmailBlock}

type TemporaryDashboardMatchFeeRow = {
  id: string;
  fixtureId: string;
  teamId: string;
  teamName: string;
  amountPence: number;
  status: PlayerMatchFeeStatus;
  paymentUrl: string | null;
  createdAt: Date;
  paidAt: Date | null;
  kickoffAt: Date;
  homeTeamId: string;
  homeTeamName: string;
  awayTeamName: string;
};`;

replaceRequired(
  normaliseEmailBlock,
  temporaryFeeTypeBlock,
  "temporary-player fee row type anchor",
);

// Admin player preview must use the previewed player's User id, not the admin's.
source = source.replaceAll(
  'user: { select: { email: true, name: true } },',
  'user: { select: { id: true, email: true, name: true } },',
);

const feeOwnerAnchor = `  const [upcomingFixtures, recentFixtures, squadMembers, playerFees] = await Promise.all([`;
const temporaryFeeQuery = `  const temporaryFeeUserId = previewMembership?.user.id ?? user.id;
  const temporaryPlayerFees = await prisma.$queryRaw<TemporaryDashboardMatchFeeRow[]>\`
    SELECT
      fee."id",
      fee."fixtureId",
      fee."teamId",
      team."name" AS "teamName",
      fee."amountPence",
      fee."status",
      fee."paymentUrl",
      fee."createdAt",
      fee."paidAt",
      fixture."kickoffAt",
      fixture."homeTeamId",
      home_team."name" AS "homeTeamName",
      away_team."name" AS "awayTeamName"
    FROM "PlayerMatchFee" fee
    INNER JOIN "Team" team ON team."id" = fee."teamId"
    INNER JOIN "Fixture" fixture ON fixture."id" = fee."fixtureId"
    INNER JOIN "Team" home_team ON home_team."id" = fixture."homeTeamId"
    INNER JOIN "Team" away_team ON away_team."id" = fixture."awayTeamId"
    WHERE fee."temporaryUserId" = \${temporaryFeeUserId}
      AND fixture."publishedAt" IS NOT NULL
      AND fee."status" IN (
        'OPEN'::"PlayerMatchFeeStatus",
        'PAID'::"PlayerMatchFeeStatus",
        'WAIVED'::"PlayerMatchFeeStatus",
        'CANCELLED'::"PlayerMatchFeeStatus"
      )
    ORDER BY fee."createdAt" DESC
  \`;

${feeOwnerAnchor}`;

replaceRequired(
  feeOwnerAnchor,
  temporaryFeeQuery,
  "temporary-player fee query anchor",
);

const summaryAnchor = `  const openFees = playerFees.filter((fee) => fee.status === PlayerMatchFeeStatus.OPEN);
  const paidFees = playerFees.filter((fee) => fee.status === PlayerMatchFeeStatus.PAID);
  const waivedFees = playerFees.filter((fee) => fee.status === PlayerMatchFeeStatus.WAIVED);`;

const combinedSummary = `  const allPlayerFees = [
    ...playerFees.map((fee) => ({ ...fee, temporaryTeamName: null as string | null })),
    ...temporaryPlayerFees.map((fee) => ({
      id: fee.id,
      fixtureId: fee.fixtureId,
      teamMemberId: null,
      prospectId: null,
      amountPence: fee.amountPence,
      status: fee.status,
      paymentUrl: fee.paymentUrl,
      createdAt: fee.createdAt,
      paidAt: fee.paidAt,
      prospect: null,
      fixture: {
        kickoffAt: fee.kickoffAt,
        homeTeamId: fee.homeTeamId,
        homeTeam: { name: fee.homeTeamName },
        awayTeam: { name: fee.awayTeamName },
      },
      temporaryTeamName: fee.teamName,
    })),
  ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  const openFees = allPlayerFees.filter((fee) => fee.status === PlayerMatchFeeStatus.OPEN);
  const paidFees = allPlayerFees.filter((fee) => fee.status === PlayerMatchFeeStatus.PAID);
  const waivedFees = allPlayerFees.filter((fee) => fee.status === PlayerMatchFeeStatus.WAIVED);`;

replaceRequired(
  summaryAnchor,
  combinedSummary,
  "combined player fee summary",
);

replaceRequired(
  `            {playerFees.length === 0 ? (`,
  `            {allPlayerFees.length === 0 ? (`,
  "empty player fee state",
);

replaceRequired(
  `              playerFees.map((fee) => (`,
  `              allPlayerFees.map((fee) => (`,
  "player fee ledger rows",
);

const rowBadgeAnchor = `                      <div className="flex flex-wrap items-center gap-2">
                        <span className={\`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold \${getFeeStatusClasses(fee.status)}\`}>
                          {getFeeStatusLabel(fee.status)}
                        </span>`;

const rowBadgeWithTemporaryTeam = `                      <div className="flex flex-wrap items-center gap-2">
                        {fee.temporaryTeamName ? (
                          <span className="inline-flex rounded-full border border-sky-400/25 bg-sky-500/10 px-2.5 py-1 text-xs font-semibold text-sky-100">
                            Temporary player · {fee.temporaryTeamName}
                          </span>
                        ) : null}
                        <span className={\`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold \${getFeeStatusClasses(fee.status)}\`}>
                          {getFeeStatusLabel(fee.status)}
                        </span>`;

replaceRequired(
  rowBadgeAnchor,
  rowBadgeWithTemporaryTeam,
  "temporary-team fee label",
);

fs.writeFileSync(filePath, source, "utf8");

const finalSource = fs.readFileSync(filePath, "utf8");
const requiredMarkers = [
  "TemporaryDashboardMatchFeeRow",
  "const temporaryFeeUserId = previewMembership?.user.id ?? user.id;",
  'fee."temporaryUserId" = ${temporaryFeeUserId}',
  "const allPlayerFees = [",
  "Temporary player · {fee.temporaryTeamName}",
  "{allPlayerFees.length === 0 ? (",
  "allPlayerFees.map((fee) => (",
];

for (const marker of requiredMarkers) {
  if (!finalSource.includes(marker)) {
    throw new Error(`Temporary-player fee integration marker missing: ${marker}`);
  }
}

console.log(
  "Temporary-player match fees now follow the real or previewed player into the main Player match fees ledger and totals.",
);
