// ========================================
// File: src/app/captain/team/[teamid]/availability/reset/page.tsx
// ========================================

import Link from "next/link";
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { Prisma } from "@prisma/client";

import { formatDateTimeInLondon } from "@/lib/datetime/london";
import { publishedFixtureWhere } from "@/lib/fixtures/publishing";
import { prisma } from "@/lib/prisma";
import { requireCaptain } from "@/lib/requireCaptain";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "Reset Fixture Availability | SIXFL",
};

type SearchParams = {
  saved?: string;
  error?: string;
};

const AVAILABILITY_SOURCE_TYPES = [
  "CAPTAIN_AVAILABILITY_SMS_CHASE",
  "MANAGED_SQUAD_AVAILABILITY_REQUEST",
  "MANAGED_SQUAD_AVAILABILITY_CHASE_24H",
  "MANAGED_SQUAD_AVAILABILITY_CHASE_72H",
] as const;

function formatDateTime(value: Date) {
  return formatDateTimeInLondon(value, {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getSavedMessage(value?: string) {
  if (value === "reset") return "Fixture availability has been reset. Old responses and chase history for this fixture have been cleared from the availability view.";
  return value ? decodeURIComponent(value) : null;
}

function getResetSourceId(input: { fixtureId: string; teamMemberId: string }) {
  return `${input.fixtureId}:${input.teamMemberId}`;
}

async function resetFixtureAvailabilityAction(formData: FormData) {
  "use server";

  const teamid = String(formData.get("teamid") ?? "").trim();
  const fixtureId = String(formData.get("fixtureId") ?? "").trim();
  await requireCaptain(teamid);

  if (!teamid || !fixtureId) redirect("/captain");

  const [team, fixture] = await Promise.all([
    prisma.team.findUnique({
      where: { id: teamid },
      select: { id: true, members: { select: { id: true } } },
    }),
    prisma.fixture.findFirst({
      where: {
        id: fixtureId,
        ...publishedFixtureWhere,
        OR: [{ homeTeamId: teamid }, { awayTeamId: teamid }],
      },
      select: { id: true },
    }),
  ]);

  if (!team || !fixture) {
    redirect(`/captain/team/${teamid}/availability/reset?error=${encodeURIComponent("Fixture not found for this team.")}`);
  }

  const teamMemberIds = team.members.map((member) => member.id);
  const sourceIds = teamMemberIds.map((teamMemberId) => getResetSourceId({ fixtureId, teamMemberId }));
  const archivedPrefix = `reset-${Date.now()}`;

  await prisma.$transaction([
    prisma.fixtureAvailability.deleteMany({
      where: {
        fixtureId,
        teamMemberId: { in: teamMemberIds },
      },
    }),
    sourceIds.length > 0
      ? prisma.$executeRaw(Prisma.sql`
          UPDATE "NotificationDispatch"
          SET
            "sourceId" = ${archivedPrefix} || ':' || "sourceId",
            "status" = CASE
              WHEN "status" IN ('QUEUED', 'PROCESSING') THEN 'CANCELLED'::"NotificationDispatchStatus"
              ELSE "status"
            END,
            "cancelledAt" = CASE
              WHEN "status" IN ('QUEUED', 'PROCESSING') THEN NOW()
              ELSE "cancelledAt"
            END,
            "failureReason" = COALESCE("failureReason", 'Archived because fixture availability was reset after postponement/rearrangement.')
          WHERE "sourceType" IN (${Prisma.join(AVAILABILITY_SOURCE_TYPES)})
            AND "sourceId" IN (${Prisma.join(sourceIds)})
        `)
      : prisma.$executeRaw(Prisma.sql`SELECT 1`),
  ]);

  revalidatePath(`/captain/team/${teamid}/availability`);
  revalidatePath(`/captain/team/${teamid}/availability/reset`);
  revalidatePath(`/captain/team/${teamid}/fixtures/${fixtureId}/selection`);

  redirect(`/captain/team/${teamid}/availability/reset?saved=reset`);
}

export default async function ResetFixtureAvailabilityPage({
  params,
  searchParams,
}: {
  params: Promise<{ teamid: string }>;
  searchParams?: Promise<SearchParams>;
}) {
  const { teamid } = await params;
  const sp = (await searchParams) ?? {};
  await requireCaptain(teamid);

  const team = await prisma.team.findUnique({
    where: { id: teamid },
    select: {
      id: true,
      name: true,
      league: { select: { name: true, season: true, venueName: true } },
      members: { select: { id: true } },
    },
  });

  if (!team) notFound();

  const since = new Date();
  since.setDate(since.getDate() - 30);

  const fixtures = await prisma.fixture.findMany({
    where: {
      ...publishedFixtureWhere,
      OR: [{ homeTeamId: teamid }, { awayTeamId: teamid }],
      kickoffAt: { gte: since },
      status: { in: ["SCHEDULED", "POSTPONED"] },
    },
    orderBy: [{ kickoffAt: "asc" }],
    take: 20,
    include: {
      homeTeam: { select: { name: true } },
      awayTeam: { select: { name: true } },
      venue: { select: { name: true } },
      availabilities: {
        where: { teamMember: { teamId: teamid } },
        select: { response: true, teamMemberId: true },
      },
    },
  });

  const savedMessage = getSavedMessage(sp.saved);
  const errorMessage = sp.error ? decodeURIComponent(sp.error) : null;

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-3xl border border-amber-400/20 bg-amber-500/10 p-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-100/70">Fixture reset</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">Reset availability for a rearranged fixture</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-amber-50/75">
          Use this after a postponed fixture has been rearranged. It clears old player availability responses and hides old chase history so players can be chased again for the new date.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link href={`/captain/team/${teamid}/availability`} className="inline-flex items-center rounded-full border border-white/10 bg-black/20 px-4 py-2 text-sm font-medium text-white/80 transition hover:bg-black/30">
            Back to availability
          </Link>
          <Link href={`/captain/team/${teamid}/fixtures`} className="inline-flex items-center rounded-full border border-white/10 bg-black/20 px-4 py-2 text-sm font-medium text-white/80 transition hover:bg-black/30">
            Open fixtures
          </Link>
        </div>
      </section>

      {savedMessage ? (
        <section className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4 text-sm text-emerald-100">{savedMessage}</section>
      ) : null}
      {errorMessage ? (
        <section className="rounded-2xl border border-red-400/20 bg-red-500/10 p-4 text-sm text-red-100">{errorMessage}</section>
      ) : null}

      <section className="rounded-3xl border border-white/10 bg-white/[0.04]">
        <div className="border-b border-white/10 px-6 py-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">{team.name}</p>
          <h2 className="mt-2 text-xl font-semibold text-white">Recent / upcoming fixtures</h2>
          <p className="mt-2 text-sm text-white/55">
            {team.league?.name ?? "No league"}{team.league?.season ? ` · ${team.league.season}` : ""}
          </p>
        </div>

        <div className="divide-y divide-white/10">
          {fixtures.length === 0 ? (
            <div className="px-6 py-10 text-sm text-white/55">No recent or upcoming scheduled/postponed fixtures found.</div>
          ) : null}

          {fixtures.map((fixture) => {
            const responded = fixture.availabilities.filter((item) => item.response !== "NO_RESPONSE").length;
            const noResponse = Math.max(team.members.length - responded, 0);
            const available = fixture.availabilities.filter((item) => item.response === "AVAILABLE").length;
            const maybe = fixture.availabilities.filter((item) => item.response === "MAYBE").length;
            const unavailable = fixture.availabilities.filter((item) => item.response === "UNAVAILABLE").length;

            return (
              <article key={fixture.id} className="px-6 py-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-semibold text-white">{fixture.homeTeam.name} vs {fixture.awayTeam.name}</h3>
                      <span className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/60">{fixture.status.toLowerCase()}</span>
                    </div>
                    <p className="mt-1 text-sm text-white/60">{formatDateTime(fixture.kickoffAt)} · {fixture.venue?.name ?? team.league?.venueName ?? "Venue TBC"}</p>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs">
                      <span className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1 text-emerald-100">Available {available}</span>
                      <span className="rounded-full border border-amber-400/20 bg-amber-500/10 px-3 py-1 text-amber-100">Maybe {maybe}</span>
                      <span className="rounded-full border border-red-400/20 bg-red-500/10 px-3 py-1 text-red-100">Unavailable {unavailable}</span>
                      <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-white/70">No response {noResponse}</span>
                    </div>
                  </div>

                  <form action={resetFixtureAvailabilityAction} className="rounded-2xl border border-red-400/20 bg-red-500/10 p-3">
                    <input type="hidden" name="teamid" value={teamid} />
                    <input type="hidden" name="fixtureId" value={fixture.id} />
                    <button type="submit" className="inline-flex w-full items-center justify-center rounded-xl border border-red-300/30 bg-red-500/15 px-4 py-2.5 text-sm font-semibold text-red-50 transition hover:bg-red-500/25">
                      Reset availability
                    </button>
                    <p className="mt-2 max-w-xs text-xs leading-5 text-red-100/65">
                      Clears all current responses for this fixture and allows new chases for the rearranged date.
                    </p>
                  </form>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
