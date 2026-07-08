// ========================================
// File: src/app/(admin)/admin/fixtures/drop-team/page.tsx
// ========================================

import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { NotificationDispatchStatus, Prisma } from "@prisma/client";

import AdminCard from "@/components/admin/AdminCard";
import { voidFixtureMatchFeeChargesOrThrow } from "@/lib/payments/fixture-match-fees";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "Drop Team From Draft Fixtures | SIXFL Admin",
};

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type DraftCountRow = {
  teamId: string;
  leagueId: string;
  leagueName: string;
  leagueSeason: string | null;
  draftFixtureCount: number;
};

function getSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function getNotice(params: Record<string, string | string[] | undefined>) {
  const removed = Number(getSearchParam(params.removed) || 0);
  const teamName = getSearchParam(params.teamName) || "Team";

  if (getSearchParam(params.dropped) === "success") {
    return `${teamName} removed from ${removed} draft fixture${removed === 1 ? "" : "s"}.`;
  }

  if (getSearchParam(params.dropped) === "none") {
    return `No draft fixtures found for ${teamName}.`;
  }

  return null;
}

async function cancelQueuedFixtureDispatches(fixtureIds: string[]) {
  if (fixtureIds.length === 0) return;

  await prisma.notificationDispatch.updateMany({
    where: {
      status: NotificationDispatchStatus.QUEUED,
      OR: fixtureIds.flatMap((fixtureId) => [
        { sourceId: fixtureId },
        { sourceId: { startsWith: `${fixtureId}:` } },
      ]),
    },
    data: {
      status: NotificationDispatchStatus.CANCELLED,
      cancelledAt: new Date(),
      failureReason: "Team dropped out before draft fixture was published.",
    },
  });

  const charges = await prisma.paymentCharge.findMany({
    where: { fixtureId: { in: fixtureIds } },
    select: { id: true },
  });

  if (charges.length > 0) {
    await prisma.notificationDispatch.updateMany({
      where: {
        status: NotificationDispatchStatus.QUEUED,
        sourceType: { in: ["FIXTURE_MATCH_FEE", "FIXTURE_MATCH_FEE_REMINDER"] },
        sourceId: { in: charges.map((charge) => charge.id) },
      },
      data: {
        status: NotificationDispatchStatus.CANCELLED,
        cancelledAt: new Date(),
        failureReason: "Team dropped out before draft fixture was published.",
      },
    });
  }
}

async function markLeagueSeasonTeamInactive(input: {
  teamId: string;
  leagueId: string;
}) {
  try {
    await prisma.$executeRaw(Prisma.sql`
      UPDATE "LeagueSeasonTeam"
      SET "isActive" = false, "updatedAt" = NOW()
      WHERE "teamId" = ${input.teamId}
        AND "leagueId" = ${input.leagueId}
    `);
  } catch (error) {
    console.error("Could not mark LeagueSeasonTeam inactive", error);
  }
}

async function dropTeamFromDraftFixturesAction(formData: FormData) {
  "use server";

  await requireAdmin();

  const teamId = String(formData.get("teamId") ?? "").trim();
  const leagueId = String(formData.get("leagueId") ?? "").trim();
  const markInactive = String(formData.get("markInactive") ?? "") === "on";

  if (!teamId || !leagueId) {
    redirect("/admin/fixtures/drop-team?dropped=missing");
  }

  const [team, league, draftFixtures] = await Promise.all([
    prisma.team.findUnique({ where: { id: teamId }, select: { id: true, name: true } }),
    prisma.league.findUnique({ where: { id: leagueId }, select: { id: true, name: true, slug: true } }),
    prisma.fixture.findMany({
      where: {
        leagueId,
        publishedAt: null,
        result: null,
        OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }],
      },
      select: { id: true },
    }),
  ]);

  if (!team || !league) redirect("/admin/fixtures/drop-team?dropped=missing");

  const fixtureIds = draftFixtures.map((fixture) => fixture.id);

  if (fixtureIds.length === 0) {
    if (markInactive) await markLeagueSeasonTeamInactive({ teamId, leagueId });
    redirect(`/admin/fixtures/drop-team?dropped=none&teamName=${encodeURIComponent(team.name)}`);
  }

  await prisma.$transaction(async (tx) => {
    await voidFixtureMatchFeeChargesOrThrow(fixtureIds, tx);

    await tx.fixture.deleteMany({
      where: { id: { in: fixtureIds } },
    });
  });

  await cancelQueuedFixtureDispatches(fixtureIds);

  if (markInactive) await markLeagueSeasonTeamInactive({ teamId, leagueId });

  revalidatePath("/admin/fixtures");
  revalidatePath("/admin/fixtures/drop-team");
  revalidatePath(`/admin/leagues/${leagueId}`);
  revalidatePath(`/admin/leagues/${leagueId}/fixtures`);

  if (league.slug) {
    revalidatePath(`/leagues/${league.slug}`);
    revalidatePath(`/leagues/${league.slug}/fixtures`);
  }

  redirect(
    `/admin/fixtures/drop-team?dropped=success&removed=${fixtureIds.length}&teamName=${encodeURIComponent(team.name)}`,
  );
}

export default async function DropTeamFromDraftFixturesPage({ searchParams }: PageProps) {
  await requireAdmin();

  const params = (await searchParams) ?? {};
  const notice = getNotice(params);

  const [teams, leagues, draftCounts] = await Promise.all([
    prisma.team.findMany({
      orderBy: [{ name: "asc" }],
      select: {
        id: true,
        name: true,
        leagueId: true,
        league: { select: { id: true, name: true, season: true } },
      },
    }),
    prisma.league.findMany({
      orderBy: [{ isActive: "desc" }, { name: "asc" }, { season: "asc" }],
      select: { id: true, name: true, season: true, isActive: true },
    }),
    prisma.$queryRaw<DraftCountRow[]>(Prisma.sql`
      SELECT
        t."id" AS "teamId",
        l."id" AS "leagueId",
        l."name" AS "leagueName",
        l."season" AS "leagueSeason",
        COUNT(f."id")::int AS "draftFixtureCount"
      FROM "Team" t
      JOIN "League" l ON l."id" = t."leagueId"
      LEFT JOIN "Fixture" f
        ON f."leagueId" = l."id"
        AND f."publishedAt" IS NULL
        AND f."result" IS NULL
        AND (f."homeTeamId" = t."id" OR f."awayTeamId" = t."id")
      GROUP BY t."id", l."id", l."name", l."season"
      ORDER BY t."name" ASC
    `),
  ]);

  const draftCountByTeamLeague = new Map(
    draftCounts.map((row) => [`${row.teamId}:${row.leagueId}`, row.draftFixtureCount]),
  );

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <div>
        <Link href="/admin/fixtures" className="text-sm font-medium text-emerald-300 hover:text-emerald-200">
          ← Back to fixtures
        </Link>
        <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.24em] text-red-300/80">
          Draft fixture clean-up
        </p>
        <h1 className="mt-2 text-3xl font-black tracking-tight text-white sm:text-4xl">
          Drop a team from draft fixtures
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-white/60">
          Use this when a team drops out before fixtures have gone live. It only deletes unpublished draft fixtures involving that team. Published, completed and resulted fixtures are left alone.
        </p>
      </div>

      {notice ? (
        <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4 text-sm text-emerald-100">
          {notice}
        </div>
      ) : null}

      <AdminCard className="rounded-3xl border border-red-400/20 bg-red-500/[0.05] p-6">
        <form action={dropTeamFromDraftFixturesAction} className="space-y-5">
          <div className="rounded-2xl border border-red-400/20 bg-black/25 p-4 text-sm leading-6 text-red-100/80">
            This deletes draft fixtures. It should not be used for published fixtures or completed matches. For published games, use postponed/cancelled or replace the team properly.
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2 text-sm font-semibold text-white">
              Team dropping out
              <select name="teamId" className="h-12 w-full rounded-2xl border border-white/10 bg-black/40 px-4 text-sm text-white outline-none focus:border-red-400/40">
                <option value="">Choose team</option>
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name} · {team.league?.name ?? "No league"}{team.league?.season ? ` ${team.league.season}` : ""}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-2 text-sm font-semibold text-white">
              League to clean
              <select name="leagueId" className="h-12 w-full rounded-2xl border border-white/10 bg-black/40 px-4 text-sm text-white outline-none focus:border-red-400/40">
                <option value="">Choose league</option>
                {leagues.map((league) => (
                  <option key={league.id} value={league.id}>
                    {league.name}{league.season ? ` · ${league.season}` : ""}{league.isActive ? "" : " · inactive"}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="flex items-start gap-3 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/70">
            <input type="checkbox" name="markInactive" defaultChecked className="mt-1" />
            <span>
              <span className="block font-semibold text-white">Mark team inactive in this league season as well</span>
              <span className="mt-1 block text-white/50">This helps stop the team being picked up again by season-team tools. It keeps the team record for history.</span>
            </span>
          </label>

          <button type="submit" className="inline-flex h-12 items-center justify-center rounded-2xl bg-red-400 px-6 text-sm font-semibold text-black transition hover:bg-red-300">
            Remove from draft fixtures
          </button>
        </form>
      </AdminCard>

      <AdminCard className="rounded-3xl border border-white/10 bg-white/[0.03] p-6">
        <h2 className="text-xl font-semibold text-white">Draft fixture counts</h2>
        <div className="mt-4 divide-y divide-white/10">
          {teams.map((team) => {
            const leagueId = team.league?.id ?? team.leagueId;
            const count = draftCountByTeamLeague.get(`${team.id}:${leagueId}`) ?? 0;
            if (count === 0) return null;
            return (
              <div key={team.id} className="flex items-center justify-between gap-4 py-3 text-sm">
                <div>
                  <div className="font-semibold text-white">{team.name}</div>
                  <div className="text-white/45">{team.league?.name ?? "No league"}{team.league?.season ? ` · ${team.league.season}` : ""}</div>
                </div>
                <div className="rounded-full border border-amber-400/20 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-100">
                  {count} draft fixture{count === 1 ? "" : "s"}
                </div>
              </div>
            );
          })}
        </div>
      </AdminCard>
    </div>
  );
}
