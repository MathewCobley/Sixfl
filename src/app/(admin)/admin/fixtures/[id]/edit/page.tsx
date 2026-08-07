import Link from "next/link";
import { notFound } from "next/navigation";
import { Prisma } from "@prisma/client";

import AdminCard from "@/components/admin/AdminCard";
import FixtureEditForm from "@/components/admin/fixtures/FixtureEditForm";
import {
  toLondonDateInputValue,
  toLondonTimeInputValue,
} from "@/lib/datetime/london";
import { ensureSeasonTeamRowsForLeague } from "@/lib/league-season-teams";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function getParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function safeReturnTo(value: string) {
  return value === "/admin/fixtures" || value.startsWith("/admin/fixtures?")
    ? value
    : "/admin/fixtures";
}

function formatMoneyInputValue(amountPence: number | null) {
  return amountPence === null ? "" : (amountPence / 100).toFixed(2);
}

type SeasonTeamLink = {
  leagueId: string;
  teamId: string;
  divisionId: string | null;
};

async function getSeasonTeamLinks() {
  try {
    return await prisma.$queryRaw<SeasonTeamLink[]>(Prisma.sql`
      SELECT "leagueId", "teamId", "divisionId"
      FROM "LeagueSeasonTeam"
      WHERE "isActive" = true
    `);
  } catch (error) {
    console.error("Fixture edit page could not load LeagueSeasonTeam links", error);
    return [];
  }
}

export default async function EditFixturePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();

  const { id } = await params;
  const query = (await searchParams) ?? {};
  const returnTo = safeReturnTo(getParam(query.returnTo));
  const editError = getParam(query.editError).trim();
  const requestId = getParam(query.requestId).trim();

  const fixture = await prisma.fixture.findUnique({
    where: { id },
    select: {
      id: true,
      leagueId: true,
      divisionId: true,
      homeTeamId: true,
      awayTeamId: true,
      venueId: true,
      refereeId: true,
      kickoffAt: true,
      round: true,
      position: true,
      pitch: true,
      status: true,
      matchFeePence: true,
      publishedAt: true,
      league: { select: { id: true, name: true, season: true } },
      homeTeam: { select: { id: true, name: true } },
      awayTeam: { select: { id: true, name: true } },
    },
  });

  if (!fixture) notFound();

  const leagues = await prisma.league.findMany({
    orderBy: [{ isActive: "desc" }, { name: "asc" }, { season: "asc" }],
    select: { id: true, name: true, season: true, isActive: true },
  });

  // Refresh only the season being edited. This backfills missing legacy rows
  // without touching another competition season while an admin edits a fixture.
  await ensureSeasonTeamRowsForLeague(fixture.leagueId);

  const [allTeams, seasonLinks, venues, referees, charges] = await Promise.all([
    prisma.team.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, leagueId: true },
    }),
    getSeasonTeamLinks(),
    prisma.venue.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }).catch((error) => {
      console.error("Fixture edit page could not load venues", error);
      return [];
    }),
    prisma.user.findMany({
      where: { role: "REFEREE" },
      orderBy: [{ name: "asc" }, { email: "asc" }],
      select: { id: true, name: true, email: true },
    }).catch((error) => {
      console.error("Fixture edit page could not load referees", error);
      return [];
    }),
    prisma.paymentCharge.findMany({
      where: { fixtureId: fixture.id, status: { not: "VOID" } },
      select: { teamId: true, amountPence: true },
    }).catch((error) => {
      console.error("Fixture edit page could not load payment charges", error);
      return [];
    }),
  ]);

  const leagueIdsByTeam = new Map<string, Set<string>>();
  const divisionKeysByTeam = new Map<string, Set<string>>();

  for (const team of allTeams) {
    const ids = leagueIdsByTeam.get(team.id) ?? new Set<string>();
    if (team.leagueId) ids.add(team.leagueId);
    leagueIdsByTeam.set(team.id, ids);
  }

  for (const link of seasonLinks) {
    const ids = leagueIdsByTeam.get(link.teamId) ?? new Set<string>();
    ids.add(link.leagueId);
    leagueIdsByTeam.set(link.teamId, ids);

    if (link.divisionId) {
      const keys = divisionKeysByTeam.get(link.teamId) ?? new Set<string>();
      keys.add(`${link.leagueId}:${link.divisionId}`);
      divisionKeysByTeam.set(link.teamId, keys);
    }
  }

  const homeCharge = charges.find((charge) => charge.teamId === fixture.homeTeamId);
  const awayCharge = charges.find((charge) => charge.teamId === fixture.awayTeamId);
  const hasTeamSpecificCharges = charges.length > 0;
  const legacyFixtureFee = hasTeamSpecificCharges ? null : fixture.matchFeePence ?? null;
  const homeFee = homeCharge?.amountPence ?? legacyFixtureFee;
  const awayFee = awayCharge?.amountPence ?? legacyFixtureFee;

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <div>
        <Link href={returnTo} className="text-sm font-medium text-emerald-300 hover:text-emerald-200">
          ← Back to selected fixtures
        </Link>
        <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-300/80">
          Edit fixture
        </p>
        <h1 className="mt-2 text-3xl font-black tracking-tight text-white sm:text-4xl">
          {fixture.homeTeam.name} vs {fixture.awayTeam.name}
        </h1>
        <p className="mt-3 text-sm text-white/55">
          {fixture.league.name}
          {fixture.league.season ? ` · ${fixture.league.season}` : ""}
          {fixture.publishedAt === null ? " · Draft changes are not visible to teams until published" : " · Published fixture"}
        </p>
      </div>

      {editError ? (
        <section className="rounded-2xl border border-red-400/30 bg-red-500/10 px-5 py-4 text-sm text-red-50" role="alert">
          <div className="font-semibold">Fixture changes were not saved</div>
          <div className="mt-1 leading-6 text-red-50/80">{editError}</div>
          {requestId ? <div className="mt-1 text-xs text-red-50/50">Reference: {requestId}</div> : null}
        </section>
      ) : null}

      <AdminCard className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 md:p-8">
        <FixtureEditForm
          returnTo={returnTo}
          fixture={{
            id: fixture.id,
            leagueId: fixture.leagueId,
            divisionId: fixture.divisionId,
            homeTeamId: fixture.homeTeamId,
            awayTeamId: fixture.awayTeamId,
            venueId: fixture.venueId,
            refereeId: fixture.refereeId,
            kickoffDate: toLondonDateInputValue(fixture.kickoffAt),
            kickoffTime: toLondonTimeInputValue(fixture.kickoffAt),
            round: fixture.round,
            position: fixture.position,
            pitch: fixture.pitch,
            status: fixture.status,
            homeMatchFeePounds: formatMoneyInputValue(homeFee),
            awayMatchFeePounds: formatMoneyInputValue(awayFee),
          }}
          leagues={leagues}
          teams={allTeams.map((team) => ({
            id: team.id,
            name: team.name,
            leagueIds: Array.from(leagueIdsByTeam.get(team.id) ?? []),
            divisionKeys: Array.from(divisionKeysByTeam.get(team.id) ?? []),
          }))}
          venues={venues}
          referees={referees}
        />
      </AdminCard>
    </div>
  );
}
