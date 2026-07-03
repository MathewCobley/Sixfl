// ========================================
// File: src/app/(admin)/admin/audits/team-merge-dry-run/page.tsx
// ========================================

import AdminCard from "@/components/admin/AdminCard";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const mergePairs = [
  { name: "Crescent United", canonicalTeamId: "cmpst3m8e0kl5po1dqn2ja4kp", duplicateTeamId: "e2c977db-3b15-40ce-a4b2-f8eaebbc3069" },
  { name: "Dynamo Kebab", canonicalTeamId: "cmorkui2h00n7mr1d0zzxfjq2", duplicateTeamId: "d5b067d4-a252-4e09-925f-9275daf3f1c6" },
  { name: "Reece's Set Pieces", canonicalTeamId: "cmphkkbxd0097os1d8m8g3d05", duplicateTeamId: "657df6ac-b6ce-47df-b580-0232abfa649f" },
  { name: "Rossett Vets", canonicalTeamId: "cmn4rvxzx0001uvcseoo9kaa1", duplicateTeamId: "eabab5dc-fc3f-4280-916a-e632b819396a" },
  { name: "Roy's Boys", canonicalTeamId: "cmmxyo31z0001p31drhij6bct", duplicateTeamId: "b6c3a37b-b77e-43b8-8e8c-f6d96ebd22c3" },
  { name: "Six Offenders", canonicalTeamId: "cmn9l1k7l0002uvv0stn4imiz", duplicateTeamId: "7fa65d83-0682-4990-b33c-44780415c865" },
  { name: "The Fat B*st*rds FC", canonicalTeamId: "5a364f3b-4d20-4b9f-b307-f7a044fc1a5e", duplicateTeamId: "cmpgshl7601mtoc1dl9quru8x" },
  { name: "Wenlock Warriors", canonicalTeamId: "cmmvci80z0003nq1dd3smshm7", duplicateTeamId: "ed8190f7-06d9-4c0f-9b49-e3b8d6b7a80f" },
  { name: "Wetherby Wanderers", canonicalTeamId: "cmqk15pg6001hpl1dm9ew8hgu", duplicateTeamId: "675a2963-677d-48a1-aee4-54041e17fa93" },
  { name: "What a Struijk", canonicalTeamId: "cmmzenxr60009p31dwzyfp4h8", duplicateTeamId: "dac0c97d-14dd-41b3-8a99-b48830009ba0" },
] as const;

type CountRow = {
  label: string;
  count: number;
};

type ConflictRow = {
  type: string;
  detail: string;
};

async function getDryRunForPair(pair: (typeof mergePairs)[number]) {
  const [canonicalTeam, duplicateTeam] = await Promise.all([
    prisma.team.findUnique({
      where: { id: pair.canonicalTeamId },
      select: { id: true, name: true, league: { select: { name: true, season: true } }, division: { select: { name: true } } },
    }),
    prisma.team.findUnique({
      where: { id: pair.duplicateTeamId },
      select: { id: true, name: true, league: { select: { name: true, season: true } }, division: { select: { name: true } } },
    }),
  ]);

  const [
    teamMembers,
    prospects,
    homeFixtures,
    awayFixtures,
    paymentCharges,
    paymentTransactions,
    playerMatchFees,
    confirmations,
    messageThreads,
    resultMeta,
    resultDisputes,
  ] = await Promise.all([
    prisma.teamMember.count({ where: { teamId: pair.duplicateTeamId } }),
    prisma.teamPlayerProspect.count({ where: { teamId: pair.duplicateTeamId } }),
    prisma.fixture.count({ where: { homeTeamId: pair.duplicateTeamId } }),
    prisma.fixture.count({ where: { awayTeamId: pair.duplicateTeamId } }),
    prisma.paymentCharge.count({ where: { teamId: pair.duplicateTeamId } }),
    prisma.paymentTransaction.count({ where: { teamId: pair.duplicateTeamId } }),
    prisma.playerMatchFee.count({ where: { teamId: pair.duplicateTeamId } }),
    prisma.fixtureCaptainConfirmation.count({ where: { teamId: pair.duplicateTeamId } }),
    prisma.messageThread.count({ where: { teamId: pair.duplicateTeamId } }),
    prisma.matchResultTeamMeta.count({ where: { teamId: pair.duplicateTeamId } }),
    prisma.resultDispute.count({ where: { teamId: pair.duplicateTeamId } }),
  ]);

  const seasonTeamRows = await prisma.$queryRaw<Array<{ id: string; leagueId: string; divisionId: string | null }>>`
    SELECT "id", "leagueId", "divisionId"
    FROM "LeagueSeasonTeam"
    WHERE "teamId" = ${pair.duplicateTeamId}
    ORDER BY "leagueId" ASC
  `;

  const counts: CountRow[] = [
    { label: "TeamMember", count: teamMembers },
    { label: "TeamPlayerProspect", count: prospects },
    { label: "Fixture home", count: homeFixtures },
    { label: "Fixture away", count: awayFixtures },
    { label: "PaymentCharge", count: paymentCharges },
    { label: "PaymentTransaction", count: paymentTransactions },
    { label: "PlayerMatchFee", count: playerMatchFees },
    { label: "FixtureCaptainConfirmation", count: confirmations },
    { label: "MessageThread", count: messageThreads },
    { label: "MatchResultTeamMeta", count: resultMeta },
    { label: "ResultDispute", count: resultDisputes },
    { label: "LeagueSeasonTeam", count: seasonTeamRows.length },
  ];

  const conflicts: ConflictRow[] = [];

  const teamMemberConflicts = await prisma.$queryRaw<Array<{ email: string | null }>>`
    SELECT u."email"
    FROM "TeamMember" dup
    JOIN "TeamMember" keep ON keep."teamId" = ${pair.canonicalTeamId} AND keep."userId" = dup."userId"
    LEFT JOIN "User" u ON u."id" = dup."userId"
    WHERE dup."teamId" = ${pair.duplicateTeamId}
  `;
  for (const conflict of teamMemberConflicts) conflicts.push({ type: "TeamMember", detail: conflict.email ?? "same user already on canonical team" });

  const chargeConflicts = await prisma.$queryRaw<Array<{ fixtureId: string | null }>>`
    SELECT dup."fixtureId"
    FROM "PaymentCharge" dup
    JOIN "PaymentCharge" keep ON keep."teamId" = ${pair.canonicalTeamId} AND keep."fixtureId" = dup."fixtureId"
    WHERE dup."teamId" = ${pair.duplicateTeamId}
      AND dup."fixtureId" IS NOT NULL
  `;
  for (const conflict of chargeConflicts) conflicts.push({ type: "PaymentCharge", detail: `fixture ${conflict.fixtureId}` });

  const confirmationConflicts = await prisma.$queryRaw<Array<{ fixtureId: string }>>`
    SELECT dup."fixtureId"
    FROM "FixtureCaptainConfirmation" dup
    JOIN "FixtureCaptainConfirmation" keep ON keep."teamId" = ${pair.canonicalTeamId} AND keep."fixtureId" = dup."fixtureId"
    WHERE dup."teamId" = ${pair.duplicateTeamId}
  `;
  for (const conflict of confirmationConflicts) conflicts.push({ type: "FixtureCaptainConfirmation", detail: `fixture ${conflict.fixtureId}` });

  const metaConflicts = await prisma.$queryRaw<Array<{ matchResultId: string }>>`
    SELECT dup."matchResultId"
    FROM "MatchResultTeamMeta" dup
    JOIN "MatchResultTeamMeta" keep ON keep."teamId" = ${pair.canonicalTeamId} AND keep."matchResultId" = dup."matchResultId"
    WHERE dup."teamId" = ${pair.duplicateTeamId}
  `;
  for (const conflict of metaConflicts) conflicts.push({ type: "MatchResultTeamMeta", detail: `result ${conflict.matchResultId}` });

  const seasonConflicts = await prisma.$queryRaw<Array<{ leagueId: string; divisionId: string | null }>>`
    SELECT dup."leagueId", dup."divisionId"
    FROM "LeagueSeasonTeam" dup
    JOIN "LeagueSeasonTeam" keep ON keep."teamId" = ${pair.canonicalTeamId} AND keep."leagueId" = dup."leagueId"
    WHERE dup."teamId" = ${pair.duplicateTeamId}
  `;
  for (const conflict of seasonConflicts) conflicts.push({ type: "LeagueSeasonTeam", detail: `league ${conflict.leagueId}, division ${conflict.divisionId ?? "none"}` });

  const fixtureSelfConflicts = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT f."id"
    FROM "Fixture" f
    WHERE (f."homeTeamId" = ${pair.duplicateTeamId} AND f."awayTeamId" = ${pair.canonicalTeamId})
       OR (f."awayTeamId" = ${pair.duplicateTeamId} AND f."homeTeamId" = ${pair.canonicalTeamId})
  `;
  for (const conflict of fixtureSelfConflicts) conflicts.push({ type: "Fixture", detail: `would become self-fixture ${conflict.id}` });

  return {
    pair,
    canonicalTeam,
    duplicateTeam,
    counts,
    conflicts,
    seasonTeamRows,
  };
}

function TeamSummary({ label, team }: { label: string; team: Awaited<ReturnType<typeof getDryRunForPair>>["canonicalTeam"] }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/35">{label}</div>
      <div className="mt-2 font-semibold text-white">{team?.name ?? "Missing team"}</div>
      <div className="mt-1 font-mono text-[11px] text-white/45">{team?.id ?? "—"}</div>
      <div className="mt-2 text-xs text-white/50">
        {team?.league?.name ?? "No league"} · {team?.league?.season ?? "No season"} · {team?.division?.name ?? "No division"}
      </div>
    </div>
  );
}

export default async function TeamMergeDryRunPage() {
  await requireAdmin();

  const dryRuns = await Promise.all(mergePairs.map((pair) => getDryRunForPair(pair)));
  const totalConflicts = dryRuns.reduce((sum, dryRun) => sum + dryRun.conflicts.length, 0);

  return (
    <div className="w-full space-y-8 px-4 pb-10 pt-6 sm:px-6 lg:px-8">
      <AdminCard className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 md:p-8">
        <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-300/80">Read-only dry run</div>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">Team merge dry run</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-white/60">
          This page does not change data. It previews the exact duplicate-to-canonical merge pairs and lists conflicts that need handling before an apply script can be run.
        </p>
        <div className="mt-5 inline-flex rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white/70">
          {dryRuns.length} planned merge pairs · {totalConflicts} conflicts found
        </div>
      </AdminCard>

      {dryRuns.map((dryRun) => (
        <AdminCard key={dryRun.pair.duplicateTeamId} className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 md:p-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/35">{dryRun.pair.name}</div>
              <h2 className="mt-2 text-2xl font-semibold text-white">Merge duplicate into canonical</h2>
            </div>
            <div className={dryRun.conflicts.length ? "rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100" : "rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100"}>
              {dryRun.conflicts.length ? `${dryRun.conflicts.length} conflict(s)` : "No conflicts detected"}
            </div>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <TeamSummary label="Canonical team to keep" team={dryRun.canonicalTeam} />
            <TeamSummary label="Duplicate team to merge" team={dryRun.duplicateTeam} />
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {dryRun.counts.map((item) => (
              <div key={item.label} className="rounded-2xl border border-white/10 bg-black/20 p-3">
                <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/35">{item.label}</div>
                <div className="mt-2 text-xl font-semibold text-white">{item.count}</div>
              </div>
            ))}
          </div>

          {dryRun.conflicts.length ? (
            <div className="mt-5 rounded-2xl border border-amber-400/20 bg-amber-500/10 p-4">
              <div className="text-sm font-semibold text-amber-100">Conflicts to handle before merge</div>
              <ul className="mt-3 space-y-2 text-sm text-amber-50/75">
                {dryRun.conflicts.map((conflict, index) => (
                  <li key={`${conflict.type}-${index}`}>• {conflict.type}: {conflict.detail}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </AdminCard>
      ))}
    </div>
  );
}
