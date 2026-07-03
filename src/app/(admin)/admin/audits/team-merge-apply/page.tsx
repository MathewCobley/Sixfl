// ========================================
// File: src/app/(admin)/admin/audits/team-merge-apply/page.tsx
// ========================================

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import AdminCard from "@/components/admin/AdminCard";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const CONFIRM_TEXT = "MERGE HARROGATE TEAMS";

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

type MergePair = (typeof mergePairs)[number];
type Tx = Prisma.TransactionClient;

type CountRow = { count: number };

type TeamSummaryRow = {
  id: string;
  name: string;
  leagueName: string | null;
  leagueSeason: string | null;
  divisionName: string | null;
};

function getString(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

async function getCount(tx: Tx, sql: Prisma.Sql) {
  const rows = await tx.$queryRaw<CountRow[]>(sql);
  return Number(rows[0]?.count ?? 0);
}

async function assertNoRows(tx: Tx, pair: MergePair, label: string, sql: Prisma.Sql) {
  const count = await getCount(tx, sql);
  if (count > 0) {
    throw new Error(`${pair.name}: ${label} has ${count} blocking conflict(s). Re-run dry-run and handle manually before merge.`);
  }
}

async function assertNoBlockingConflicts(tx: Tx, pair: MergePair) {
  await assertNoRows(tx, pair, "payment charge", Prisma.sql`
    SELECT COUNT(*)::int AS count
    FROM "PaymentCharge" dup
    JOIN "PaymentCharge" keep
      ON keep."teamId" = ${pair.canonicalTeamId}
     AND keep."fixtureId" = dup."fixtureId"
    WHERE dup."teamId" = ${pair.duplicateTeamId}
      AND dup."fixtureId" IS NOT NULL
  `);

  await assertNoRows(tx, pair, "fixture confirmation", Prisma.sql`
    SELECT COUNT(*)::int AS count
    FROM "FixtureCaptainConfirmation" dup
    JOIN "FixtureCaptainConfirmation" keep
      ON keep."teamId" = ${pair.canonicalTeamId}
     AND keep."fixtureId" = dup."fixtureId"
    WHERE dup."teamId" = ${pair.duplicateTeamId}
  `);

  await assertNoRows(tx, pair, "result metadata", Prisma.sql`
    SELECT COUNT(*)::int AS count
    FROM "MatchResultTeamMeta" dup
    JOIN "MatchResultTeamMeta" keep
      ON keep."teamId" = ${pair.canonicalTeamId}
     AND keep."matchResultId" = dup."matchResultId"
    WHERE dup."teamId" = ${pair.duplicateTeamId}
  `);

  await assertNoRows(tx, pair, "league season team", Prisma.sql`
    SELECT COUNT(*)::int AS count
    FROM "LeagueSeasonTeam" dup
    JOIN "LeagueSeasonTeam" keep
      ON keep."teamId" = ${pair.canonicalTeamId}
     AND keep."leagueId" = dup."leagueId"
    WHERE dup."teamId" = ${pair.duplicateTeamId}
  `);

  await assertNoRows(tx, pair, "fixture self-match", Prisma.sql`
    SELECT COUNT(*)::int AS count
    FROM "Fixture" f
    WHERE (f."homeTeamId" = ${pair.duplicateTeamId} AND f."awayTeamId" = ${pair.canonicalTeamId})
       OR (f."awayTeamId" = ${pair.duplicateTeamId} AND f."homeTeamId" = ${pair.canonicalTeamId})
  `);
}

async function mergeConflictingTeamMembers(tx: Tx, pair: MergePair) {
  const conflicts = await tx.$queryRaw<Array<{ duplicateMemberId: string; canonicalMemberId: string }>>(Prisma.sql`
    SELECT dup."id" AS "duplicateMemberId", keep."id" AS "canonicalMemberId"
    FROM "TeamMember" dup
    JOIN "TeamMember" keep
      ON keep."teamId" = ${pair.canonicalTeamId}
     AND keep."userId" = dup."userId"
    WHERE dup."teamId" = ${pair.duplicateTeamId}
  `);

  for (const conflict of conflicts) {
    await tx.$executeRaw(Prisma.sql`
      UPDATE "FixtureAvailability" dup
      SET "teamMemberId" = ${conflict.canonicalMemberId}, "updatedAt" = NOW()
      WHERE dup."teamMemberId" = ${conflict.duplicateMemberId}
        AND NOT EXISTS (
          SELECT 1 FROM "FixtureAvailability" keep
          WHERE keep."fixtureId" = dup."fixtureId"
            AND keep."teamMemberId" = ${conflict.canonicalMemberId}
        )
    `);

    await tx.$executeRaw(Prisma.sql`
      UPDATE "FixtureSelection" dup
      SET "teamMemberId" = ${conflict.canonicalMemberId}, "updatedAt" = NOW()
      WHERE dup."teamMemberId" = ${conflict.duplicateMemberId}
        AND NOT EXISTS (
          SELECT 1 FROM "FixtureSelection" keep
          WHERE keep."fixtureId" = dup."fixtureId"
            AND keep."teamMemberId" = ${conflict.canonicalMemberId}
        )
    `);

    await tx.$executeRaw(Prisma.sql`
      UPDATE "PlayerMatchFee" dup
      SET "teamMemberId" = ${conflict.canonicalMemberId}, "updatedAt" = NOW()
      WHERE dup."teamMemberId" = ${conflict.duplicateMemberId}
        AND NOT EXISTS (
          SELECT 1 FROM "PlayerMatchFee" keep
          WHERE keep."fixtureId" = dup."fixtureId"
            AND keep."teamMemberId" = ${conflict.canonicalMemberId}
        )
    `);

    const remainingChildren = await getCount(tx, Prisma.sql`
      SELECT (
        (SELECT COUNT(*) FROM "FixtureAvailability" WHERE "teamMemberId" = ${conflict.duplicateMemberId}) +
        (SELECT COUNT(*) FROM "FixtureSelection" WHERE "teamMemberId" = ${conflict.duplicateMemberId}) +
        (SELECT COUNT(*) FROM "PlayerMatchFee" WHERE "teamMemberId" = ${conflict.duplicateMemberId})
      )::int AS count
    `);

    if (remainingChildren > 0) {
      throw new Error(`${pair.name}: duplicate TeamMember ${conflict.duplicateMemberId} still has ${remainingChildren} child row(s). Merge aborted.`);
    }

    await tx.teamMember.delete({ where: { id: conflict.duplicateMemberId } });
  }
}

async function mergePair(tx: Tx, pair: MergePair) {
  const [canonical, duplicate] = await Promise.all([
    tx.team.findUnique({ where: { id: pair.canonicalTeamId }, select: { id: true } }),
    tx.team.findUnique({ where: { id: pair.duplicateTeamId }, select: { id: true } }),
  ]);

  if (!canonical || !duplicate) {
    throw new Error(`${pair.name}: canonical or duplicate team not found.`);
  }

  await assertNoBlockingConflicts(tx, pair);
  await mergeConflictingTeamMembers(tx, pair);

  await tx.$executeRaw(Prisma.sql`
    UPDATE "TeamMember" dup
    SET "teamId" = ${pair.canonicalTeamId}
    WHERE dup."teamId" = ${pair.duplicateTeamId}
      AND NOT EXISTS (
        SELECT 1 FROM "TeamMember" keep
        WHERE keep."teamId" = ${pair.canonicalTeamId}
          AND keep."userId" = dup."userId"
      )
  `);

  await tx.teamPlayerProspect.updateMany({ where: { teamId: pair.duplicateTeamId }, data: { teamId: pair.canonicalTeamId } });
  await tx.fixture.updateMany({ where: { homeTeamId: pair.duplicateTeamId }, data: { homeTeamId: pair.canonicalTeamId } });
  await tx.fixture.updateMany({ where: { awayTeamId: pair.duplicateTeamId }, data: { awayTeamId: pair.canonicalTeamId } });
  await tx.paymentCharge.updateMany({ where: { teamId: pair.duplicateTeamId }, data: { teamId: pair.canonicalTeamId } });
  await tx.paymentTransaction.updateMany({ where: { teamId: pair.duplicateTeamId }, data: { teamId: pair.canonicalTeamId } });
  await tx.playerMatchFee.updateMany({ where: { teamId: pair.duplicateTeamId }, data: { teamId: pair.canonicalTeamId } });
  await tx.fixtureCaptainConfirmation.updateMany({ where: { teamId: pair.duplicateTeamId }, data: { teamId: pair.canonicalTeamId } });
  await tx.messageThread.updateMany({ where: { teamId: pair.duplicateTeamId }, data: { teamId: pair.canonicalTeamId } });
  await tx.matchResultTeamMeta.updateMany({ where: { teamId: pair.duplicateTeamId }, data: { teamId: pair.canonicalTeamId } });
  await tx.resultDispute.updateMany({ where: { teamId: pair.duplicateTeamId }, data: { teamId: pair.canonicalTeamId } });

  await tx.$executeRaw(Prisma.sql`
    UPDATE "LeagueSeasonTeam"
    SET "teamId" = ${pair.canonicalTeamId}, "updatedAt" = NOW()
    WHERE "teamId" = ${pair.duplicateTeamId}
  `);

  await tx.$executeRaw(Prisma.sql`
    UPDATE "PlayerInterestResponse"
    SET "teamId" = ${pair.canonicalTeamId}
    WHERE "teamId" = ${pair.duplicateTeamId}
  `);

  await tx.team.update({
    where: { id: pair.duplicateTeamId },
    data: {
      leagueId: null,
      divisionId: null,
      isRecruiting: false,
      joinSlug: null,
      managerNotes: `MERGED INTO ${pair.canonicalTeamId} ON ${new Date().toISOString()}`,
    },
  });
}

export async function applyHarrogateTeamMergeAction(formData: FormData) {
  "use server";

  await requireAdmin();

  const confirmation = getString(formData.get("confirmation"));
  if (confirmation !== CONFIRM_TEXT) {
    redirect("/admin/audits/team-merge-apply?error=confirm");
  }

  await prisma.$transaction(async (tx) => {
    for (const pair of mergePairs) {
      await mergePair(tx, pair);
    }
  }, { timeout: 30000 });

  revalidatePath("/admin");
  revalidatePath("/admin/teams");
  revalidatePath("/admin/fixtures");
  revalidatePath("/admin/payments");
  revalidatePath("/admin/audits/team-duplicates");
  revalidatePath("/admin/audits/team-merge-dry-run");

  redirect("/admin/audits/team-merge-apply?merged=1");
}

async function getTeamSummaries() {
  const rows = await prisma.$queryRaw<TeamSummaryRow[]>(Prisma.sql`
    SELECT
      t."id",
      t."name",
      l."name" AS "leagueName",
      l."season" AS "leagueSeason",
      d."name" AS "divisionName"
    FROM "Team" t
    LEFT JOIN "League" l ON l."id" = t."leagueId"
    LEFT JOIN "LeagueDivision" d ON d."id" = t."divisionId"
    WHERE t."id" IN (${Prisma.join(mergePairs.flatMap((pair) => [pair.canonicalTeamId, pair.duplicateTeamId]))})
  `);

  return new Map(rows.map((row) => [row.id, row]));
}

export default async function TeamMergeApplyPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdmin();

  const params = searchParams ? await searchParams : {};
  const merged = params.merged === "1";
  const error = params.error === "confirm";
  const teamById = await getTeamSummaries();

  return (
    <div className="w-full space-y-8 px-4 pb-10 pt-6 sm:px-6 lg:px-8">
      <AdminCard className="rounded-3xl border border-red-500/20 bg-red-500/[0.04] p-6 md:p-8">
        <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-red-200/80">Guarded apply step</div>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">Apply Harrogate team merge</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-white/60">
          This will merge the 10 audited duplicate Spring/Summer team pairs. It keeps the canonical team, moves references, handles duplicate TeamMember conflicts safely, and marks duplicate Team rows as merged by clearing their legacy league/division fields.
        </p>
        {merged ? <div className="mt-5 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">Merge completed.</div> : null}
        {error ? <div className="mt-5 rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">Typed confirmation did not match.</div> : null}
      </AdminCard>

      <AdminCard className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 md:p-8">
        <h2 className="text-xl font-semibold text-white">Merge pairs</h2>
        <div className="mt-5 grid gap-3">
          {mergePairs.map((pair) => {
            const canonical = teamById.get(pair.canonicalTeamId);
            const duplicate = teamById.get(pair.duplicateTeamId);
            return (
              <div key={pair.duplicateTeamId} className="rounded-2xl border border-white/10 bg-black/25 p-4 text-sm text-white/70">
                <div className="font-semibold text-white">{pair.name}</div>
                <div className="mt-2 grid gap-2 lg:grid-cols-2">
                  <div><span className="text-emerald-200">Keep:</span> {canonical?.name ?? "Missing"} <span className="font-mono text-white/40">{pair.canonicalTeamId}</span><div className="text-xs text-white/40">{canonical?.leagueName ?? "No league"} · {canonical?.leagueSeason ?? "No season"} · {canonical?.divisionName ?? "No division"}</div></div>
                  <div><span className="text-amber-200">Merge:</span> {duplicate?.name ?? "Missing"} <span className="font-mono text-white/40">{pair.duplicateTeamId}</span><div className="text-xs text-white/40">{duplicate?.leagueName ?? "No league"} · {duplicate?.leagueSeason ?? "No season"} · {duplicate?.divisionName ?? "No division"}</div></div>
                </div>
              </div>
            );
          })}
        </div>
      </AdminCard>

      {!merged ? (
        <AdminCard className="rounded-3xl border border-red-500/25 bg-black/30 p-6 md:p-8">
          <h2 className="text-xl font-semibold text-white">Confirm apply</h2>
          <p className="mt-2 text-sm leading-6 text-white/60">Type <span className="font-mono text-red-100">{CONFIRM_TEXT}</span> exactly to run the merge.</p>
          <form action={applyHarrogateTeamMergeAction} className="mt-5 flex flex-col gap-3 sm:flex-row">
            <input name="confirmation" className="h-12 flex-1 rounded-2xl border border-white/10 bg-black/40 px-4 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-red-400/40 focus:ring-2 focus:ring-red-400/20" placeholder={CONFIRM_TEXT} />
            <button type="submit" className="inline-flex h-12 items-center justify-center rounded-2xl bg-red-400 px-6 text-sm font-semibold text-black transition hover:bg-red-300">Apply merge</button>
          </form>
        </AdminCard>
      ) : null}
    </div>
  );
}
