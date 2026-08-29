// ========================================
// File: src/app/captain/team/[teamid]/fixtures/page.tsx
// ========================================

import { revalidatePath } from "next/cache";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { FixtureCaptainConfirmationStatus } from "@prisma/client";

import TeamShirt from "@/components/fixtures/TeamShirt";
import SixflTvFixtureBadge from "@/components/sixfl-tv/SixflTvFixtureBadge";
import { formatDateTimeInLondon } from "@/lib/datetime/london";
import { prisma } from "@/lib/prisma";
import { requireCaptain } from "@/lib/requireCaptain";
import { getTeamKitColours } from "@/lib/teams/kit-colours";
import {
  fixtureHasPlaceholderTeam,
  getFixturePlaceholderTeamIds,
} from "@/lib/teams/fixture-placeholders";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "Captain Fixtures | SIXFL",
};

const TEAM_UNAVAILABLE_NOTE =
  "Team unavailable: captain has told SIXFL they cannot fulfil this fixture.";
const FIXTURE_RESPONSE_LOCK_HOURS = 72;
const FIXTURE_RESPONSE_LOCK_MS = FIXTURE_RESPONSE_LOCK_HOURS * 60 * 60 * 1000;
const SIXFL_FIXTURE_EMAIL = "hello@sixfl.co.uk";

type SearchParams = {
  saved?: string;
  error?: string;
  fixtureId?: string;
};

type ConfirmationSummary = {
  label: string;
  tone: "emerald" | "amber" | "red" | "neutral";
  helper: string;
};

type FixtureTeam = {
  id: string;
  name: string;
};

function TeamNameWithShirt({
  team,
  colour,
}: {
  team: FixtureTeam;
  colour: string | null;
}) {
  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      <TeamShirt colour={colour} teamName={team.name} />
      <span className="truncate">{team.name}</span>
    </span>
  );
}

function FixtureTeamPair({
  homeTeam,
  awayTeam,
  colours,
}: {
  homeTeam: FixtureTeam;
  awayTeam: FixtureTeam;
  colours: Map<string, string | null>;
}) {
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
      <TeamNameWithShirt
        team={homeTeam}
        colour={colours.get(homeTeam.id) ?? null}
      />
      <span className="text-white/45">vs</span>
      <TeamNameWithShirt
        team={awayTeam}
        colour={colours.get(awayTeam.id) ?? null}
      />
    </span>
  );
}

function formatDateTime(value: Date) {
  return formatDateTimeInLondon(value, {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatShortDateTime(value: Date) {
  return formatDateTimeInLondon(value, {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getResultLabel(goalsFor: number, goalsAgainst: number) {
  if (goalsFor > goalsAgainst) return "Win";
  if (goalsFor < goalsAgainst) return "Loss";
  return "Draw";
}

function getCountdownLabel(kickoffAt: Date) {
  const diffMs = kickoffAt.getTime() - Date.now();
  if (diffMs <= 0) return "Kick-off time reached";

  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);

  if (diffDays >= 2) return `${diffDays} days to go`;
  if (diffHours >= 24) return "Tomorrow";
  if (diffHours >= 1) return `${diffHours} hour${diffHours === 1 ? "" : "s"} to go`;
  return "Today";
}

function isTeamUnavailableNote(note: string | null | undefined) {
  return (note ?? "").startsWith("Team unavailable:");
}

function isFixtureResponseLocked(kickoffAt: Date) {
  return kickoffAt.getTime() - Date.now() <= FIXTURE_RESPONSE_LOCK_MS;
}

function getFriendlyErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    if (
      error.message.includes("TBC fixtures do not use captain confirmations") ||
      error.message.includes("fixture is still provisional")
    ) {
      return "This fixture is still provisional. You do not need to confirm it until the opponent has been confirmed.";
    }
    if (error.message.includes("Fixture not found")) {
      return "That fixture could not be found.";
    }
    if (error.message.includes("does not belong")) {
      return "That fixture is not linked to this team.";
    }
    if (error.message.includes("not available for confirmation")) {
      return "Only published scheduled upcoming fixtures can be confirmed.";
    }
    if (error.message.includes("Fixture response window closed")) {
      return `Late changes and issue reports close online ${FIXTURE_RESPONSE_LOCK_HOURS} hours before kick-off. You can still confirm that your team can play, but please email ${SIXFL_FIXTURE_EMAIL} if your team cannot play or anything needs changing now.`;
    }
    if (error.message.includes("Issue note must be at least")) {
      return "Please add a short note so SIXFL knows what the issue is.";
    }
  }

  return "We could not save that just now. Please try again, or contact SIXFL if it continues.";
}

function getFixtureConfirmationSummary(input: {
  confirmation:
    | {
        status: FixtureCaptainConfirmationStatus;
        note?: string | null;
        confirmedAt: Date | null;
        issueRaisedAt: Date | null;
        lastChasedAt: Date | null;
      }
    | null
    | undefined;
  kickoffAt: Date;
}): ConfirmationSummary {
  const confirmation = input.confirmation ?? null;
  const diffHours = Math.floor((input.kickoffAt.getTime() - Date.now()) / (1000 * 60 * 60));

  if (confirmation?.status === "CONFIRMED") {
    return {
      label: "Team can play",
      tone: "emerald",
      helper: confirmation.confirmedAt ? `Confirmed ${formatShortDateTime(confirmation.confirmedAt)}` : "Confirmed",
    };
  }

  if (
    confirmation?.status === "ISSUE_RAISED" &&
    isTeamUnavailableNote(confirmation.note)
  ) {
    return {
      label: "Team unavailable",
      tone: "red",
      helper: confirmation.issueRaisedAt
        ? `SIXFL notified ${formatShortDateTime(confirmation.issueRaisedAt)}`
        : "SIXFL has been notified",
    };
  }

  if (confirmation?.status === "ISSUE_RAISED") {
    return {
      label: "Issue raised",
      tone: "amber",
      helper: confirmation.issueRaisedAt ? `Raised ${formatShortDateTime(confirmation.issueRaisedAt)}` : "Awaiting review",
    };
  }

  if (diffHours <= FIXTURE_RESPONSE_LOCK_HOURS) {
    return {
      label: "Awaiting confirmation",
      tone: "amber",
      helper: `Within ${FIXTURE_RESPONSE_LOCK_HOURS} hours — you can still confirm your team can play; contact SIXFL directly for any late change or issue`,
    };
  }

  return {
    label: "Awaiting team response",
    tone: "neutral",
    helper: confirmation?.lastChasedAt ? `Reminder sent ${formatShortDateTime(confirmation.lastChasedAt)}` : "Tell SIXFL whether your team can fulfil this fixture",
  };
}

function getToneClasses(tone: ConfirmationSummary["tone"]) {
  switch (tone) {
    case "emerald":
      return "border-emerald-400/20 bg-emerald-500/10 text-emerald-100";
    case "amber":
      return "border-amber-400/20 bg-amber-500/10 text-amber-100";
    case "red":
      return "border-red-400/20 bg-red-500/10 text-red-100";
    default:
      return "border-white/10 bg-white/5 text-white/75";
  }
}

function buildFixtureRedirect(teamid: string, input: { fixtureId: string; saved?: string; error?: string }) {
  const searchParams = new URLSearchParams();
  searchParams.set("fixtureId", input.fixtureId);
  if (input.saved) searchParams.set("saved", input.saved);
  if (input.error) searchParams.set("error", input.error);
  return `/captain/team/${teamid}/fixtures?${searchParams.toString()}`;
}

async function getConfirmableFixture(
  fixtureId: string,
  teamid: string,
  options?: { allowLateConfirmation?: boolean },
) {
  const fixture = await prisma.fixture.findUnique({
    where: { id: fixtureId },
    select: {
      id: true,
      kickoffAt: true,
      status: true,
      publishedAt: true,
      homeTeamId: true,
      awayTeamId: true,
    },
  });

  if (!fixture) throw new Error("Fixture not found.");
  if (fixture.homeTeamId !== teamid && fixture.awayTeamId !== teamid) {
    throw new Error("This fixture does not belong to the selected team.");
  }
  if (
    fixture.publishedAt === null ||
    fixture.status !== "SCHEDULED" ||
    fixture.kickoffAt <= new Date()
  ) {
    throw new Error("This fixture is not available for confirmation.");
  }
  if (await fixtureHasPlaceholderTeam(fixtureId)) {
    throw new Error("This fixture is still provisional.");
  }
  if (
    isFixtureResponseLocked(fixture.kickoffAt) &&
    !options?.allowLateConfirmation
  ) {
    throw new Error("Fixture response window closed.");
  }

  return fixture;
}

function revalidateFixtureConfirmationPaths(teamid: string) {
  revalidatePath(`/captain/team/${teamid}`);
  revalidatePath(`/captain/team/${teamid}/fixtures`);
  revalidatePath("/admin/fixtures");
  revalidatePath("/admin/fixtures/issues");
  revalidatePath("/admin/fixtures/unavailable");
}

async function confirmFixtureAction(formData: FormData) {
  "use server";

  const teamid = String(formData.get("teamid") ?? "").trim();
  const fixtureId = String(formData.get("fixtureId") ?? "").trim();
  const access = await requireCaptain(teamid);

  try {
    await getConfirmableFixture(fixtureId, teamid, {
      allowLateConfirmation: true,
    });

    await prisma.fixtureCaptainConfirmation.upsert({
      where: { fixtureId_teamId: { fixtureId, teamId: teamid } },
      update: {
        status: "CONFIRMED",
        note: null,
        confirmedAt: new Date(),
        issueRaisedAt: null,
        confirmedByUserId: access.user?.id ?? null,
      },
      create: {
        fixtureId,
        teamId: teamid,
        status: "CONFIRMED",
        confirmedAt: new Date(),
        confirmedByUserId: access.user?.id ?? null,
      },
    });

    revalidateFixtureConfirmationPaths(teamid);
  } catch (error) {
    console.error("Captain fixture confirmation failed", error);
    redirect(buildFixtureRedirect(teamid, { fixtureId, error: getFriendlyErrorMessage(error) }));
  }

  redirect(buildFixtureRedirect(teamid, { fixtureId, saved: "confirmed" }));
}

async function markFixtureUnavailableAction(formData: FormData) {
  "use server";

  const teamid = String(formData.get("teamid") ?? "").trim();
  const fixtureId = String(formData.get("fixtureId") ?? "").trim();
  const access = await requireCaptain(teamid);

  try {
    await getConfirmableFixture(fixtureId, teamid);

    await prisma.fixtureCaptainConfirmation.upsert({
      where: { fixtureId_teamId: { fixtureId, teamId: teamid } },
      update: {
        status: "ISSUE_RAISED",
        note: TEAM_UNAVAILABLE_NOTE,
        issueRaisedAt: new Date(),
        confirmedAt: null,
        confirmedByUserId: access.user?.id ?? null,
      },
      create: {
        fixtureId,
        teamId: teamid,
        status: "ISSUE_RAISED",
        note: TEAM_UNAVAILABLE_NOTE,
        issueRaisedAt: new Date(),
        confirmedByUserId: access.user?.id ?? null,
      },
    });

    revalidateFixtureConfirmationPaths(teamid);
  } catch (error) {
    console.error("Captain fixture unavailable submission failed", error);
    redirect(buildFixtureRedirect(teamid, { fixtureId, error: getFriendlyErrorMessage(error) }));
  }

  redirect(buildFixtureRedirect(teamid, { fixtureId, saved: "unavailable" }));
}

async function raiseFixtureIssueAction(formData: FormData) {
  "use server";

  const teamid = String(formData.get("teamid") ?? "").trim();
  const fixtureId = String(formData.get("fixtureId") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();
  const access = await requireCaptain(teamid);

  try {
    if (note.length < 10) throw new Error("Issue note must be at least 10 characters.");

    await getConfirmableFixture(fixtureId, teamid);

    await prisma.fixtureCaptainConfirmation.upsert({
      where: { fixtureId_teamId: { fixtureId, teamId: teamid } },
      update: {
        status: "ISSUE_RAISED",
        note,
        issueRaisedAt: new Date(),
        confirmedAt: null,
        confirmedByUserId: access.user?.id ?? null,
      },
      create: {
        fixtureId,
        teamId: teamid,
        status: "ISSUE_RAISED",
        note,
        issueRaisedAt: new Date(),
        confirmedByUserId: access.user?.id ?? null,
      },
    });

    revalidateFixtureConfirmationPaths(teamid);
  } catch (error) {
    console.error("Captain fixture issue submission failed", error);
    redirect(buildFixtureRedirect(teamid, { fixtureId, error: getFriendlyErrorMessage(error) }));
  }

  redirect(buildFixtureRedirect(teamid, { fixtureId, saved: "issue" }));
}

export default async function CaptainFixturesPage({
  params,
  searchParams,
}: {
  params: Promise<{ teamid: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { teamid } = await params;
  const filters = await searchParams;
  const requestedFixtureId = filters.fixtureId?.trim() || "";

  await requireCaptain(teamid);

  const [team, upcomingFixtures, recentResults] = await Promise.all([
    prisma.team.findUnique({
      where: { id: teamid },
      select: {
        id: true,
        name: true,
        leagueId: true,
        league: {
          select: {
            id: true,
            name: true,
            season: true,
            venueName: true,
            dayOfWeek: true,
          },
        },
      },
    }),
    prisma.fixture.findMany({
      where: {
        OR: [{ homeTeamId: teamid }, { awayTeamId: teamid }],
        publishedAt: { not: null },
        status: "SCHEDULED",
        kickoffAt: { gte: new Date() },
      },
      orderBy: [{ kickoffAt: "asc" }],
      take: 20,
      include: {
        homeTeam: { select: { id: true, name: true } },
        awayTeam: { select: { id: true, name: true } },
        venue: { select: { name: true } },
        captainConfirmations: {
          where: { teamId: teamid },
          select: {
            id: true,
            status: true,
            note: true,
            confirmedAt: true,
            issueRaisedAt: true,
            lastChasedAt: true,
          },
          take: 1,
        },
      },
    }),
    prisma.fixture.findMany({
      where: {
        OR: [{ homeTeamId: teamid }, { awayTeamId: teamid }],
        publishedAt: { not: null },
        result: { isNot: null },
      },
      orderBy: [{ kickoffAt: "desc" }],
      take: 6,
      include: {
        homeTeam: { select: { id: true, name: true } },
        awayTeam: { select: { id: true, name: true } },
        result: { select: { homeScore: true, awayScore: true } },
      },
    }),
  ]);

  if (!team) notFound();

  const fixtureTeamIds = [
    team.id,
    ...upcomingFixtures.flatMap((fixture) => [fixture.homeTeamId, fixture.awayTeamId]),
    ...recentResults.flatMap((fixture) => [fixture.homeTeamId, fixture.awayTeamId]),
  ];
  const [kitColours, placeholderTeamIds] = await Promise.all([
    getTeamKitColours(fixtureTeamIds),
    getFixturePlaceholderTeamIds(fixtureTeamIds),
  ]);
  const fixtureIsProvisional = (fixture: {
    homeTeamId: string;
    awayTeamId: string;
  }) =>
    placeholderTeamIds.has(fixture.homeTeamId) ||
    placeholderTeamIds.has(fixture.awayTeamId);

  const requestedFixture = requestedFixtureId
    ? upcomingFixtures.find((fixture) => fixture.id === requestedFixtureId) ?? null
    : null;
  const selectedFixture = requestedFixture ?? upcomingFixtures[0] ?? null;
  const selectedConfirmation = selectedFixture?.captainConfirmations[0] ?? null;
  const selectedFixtureIsProvisional = Boolean(
    selectedFixture && fixtureIsProvisional(selectedFixture),
  );
  const selectedResponseLocked = Boolean(
    selectedFixture && isFixtureResponseLocked(selectedFixture.kickoffAt),
  );
  const selectedStatus: ConfirmationSummary | null = selectedFixture
    ? selectedFixtureIsProvisional
      ? {
          label: "Opponent TBC",
          tone: "neutral",
          helper:
            "SIXFL is still confirming the other team. You do not need to respond yet.",
        }
      : getFixtureConfirmationSummary({
          confirmation: selectedConfirmation,
          kickoffAt: selectedFixture.kickoffAt,
        })
    : null;
  const isSelectedFixtureConfirmed = selectedConfirmation?.status === "CONFIRMED";
  const isSelectedFixtureUnavailable =
    selectedConfirmation?.status === "ISSUE_RAISED" &&
    isTeamUnavailableNote(selectedConfirmation.note);
  const requestedFixtureWasNotFound = Boolean(requestedFixtureId && !requestedFixture);
  const otherUpcomingFixtures = selectedFixture
    ? upcomingFixtures.filter((fixture) => fixture.id !== selectedFixture.id)
    : upcomingFixtures;
  const selectedFixtureEmailHref = selectedFixture
    ? `mailto:${SIXFL_FIXTURE_EMAIL}?subject=${encodeURIComponent(
        `Fixture response - ${team.name} - ${formatDateTime(selectedFixture.kickoffAt)}`,
      )}`
    : `mailto:${SIXFL_FIXTURE_EMAIL}`;

  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-3xl border border-emerald-400/15 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.16),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.03))] shadow-[0_24px_80px_rgba(0,0,0,0.3)]">
        <div className="grid gap-8 px-6 py-6 lg:grid-cols-[1.15fr_0.85fr] lg:px-8 lg:py-8">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-300/80">Team fixture response</p>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
              {selectedFixture ? (
                <FixtureTeamPair
                  homeTeam={selectedFixture.homeTeam}
                  awayTeam={selectedFixture.awayTeam}
                  colours={kitColours}
                />
              ) : (
                "No upcoming published fixture"
              )}
            </h2>
            {selectedFixture ? (
              <div className="mt-3">
                <SixflTvFixtureBadge
                  recorded={selectedFixture.sixflTvRecorded}
                  url={selectedFixture.sixflTvUrl}
                />
              </div>
            ) : null}
            <p className="mt-3 max-w-2xl text-sm text-white/70 sm:text-base">
              {selectedFixture
                ? `${formatDateTime(selectedFixture.kickoffAt)} · ${selectedFixture.venue?.name ?? team.league?.venueName ?? "Venue TBC"}`
                : "Your next match will appear here once SIXFL publishes the fixture."}
            </p>

            {selectedFixture ? (
              <div className="mt-4 rounded-2xl border border-sky-400/20 bg-sky-500/10 p-4 text-sm leading-6 text-sky-100/85">
                <strong className="text-sky-50">This is about the whole team.</strong>{" "}
                You can confirm that your team can play right up until kick-off. If your team cannot play, you need to change a previous response, or there is another fixture issue, use the online options until {FIXTURE_RESPONSE_LOCK_HOURS} hours before kick-off; after that, contact SIXFL directly. Individual player availability is handled separately in the Availability tab.
              </div>
            ) : null}

            {requestedFixtureWasNotFound ? (
              <div className="mt-4 rounded-2xl border border-amber-400/20 bg-amber-500/10 p-4 text-sm text-amber-100">
                That fixture is not currently published for this team. Showing the next published fixture instead.
              </div>
            ) : null}

            {selectedFixture && selectedStatus ? (
              <>
                <div className="mt-5 flex flex-wrap gap-2">
                  <span className={`rounded-full border px-3 py-1 text-xs font-medium ${getToneClasses(selectedStatus.tone)}`}>
                    {selectedStatus.label}
                  </span>
                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white/75">
                    {getCountdownLabel(selectedFixture.kickoffAt)}
                  </span>
                </div>
                <p className="mt-4 text-sm text-white/55">{selectedStatus.helper}</p>
              </>
            ) : null}

            {filters.saved === "confirmed" ? (
              <div className="mt-5 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4 text-sm text-emerald-100">Thanks — SIXFL has recorded that your team can play this fixture.</div>
            ) : null}
            {filters.saved === "unavailable" ? (
              <div className="mt-5 rounded-2xl border border-red-400/20 bg-red-500/10 p-4 text-sm text-red-100">SIXFL has been told that your team cannot play this fixture. The fixture is now flagged for review.</div>
            ) : null}
            {filters.saved === "issue" ? (
              <div className="mt-5 rounded-2xl border border-amber-400/20 bg-amber-500/10 p-4 text-sm text-amber-100">Fixture issue raised successfully. SIXFL will review it.</div>
            ) : null}
            {filters.error ? (
              <div className="mt-5 rounded-2xl border border-red-400/20 bg-red-500/10 p-4 text-sm text-red-100">{filters.error}</div>
            ) : null}
          </div>

          <div className="space-y-4">
            {selectedFixture ? (
              selectedFixtureIsProvisional ? (
                <div className="rounded-3xl border border-sky-400/20 bg-sky-500/10 p-5 text-sky-50">
                  <p className="text-base font-semibold">No action needed yet</p>
                  <p className="mt-2 text-sm leading-6 text-sky-100/75">
                    SIXFL is still confirming your opponent. Once the other team is known,
                    this page will ask whether your team can play the fixture.
                  </p>
                </div>
              ) : selectedResponseLocked ? (
                <div className="rounded-3xl border border-amber-400/25 bg-amber-500/10 p-5 text-amber-50">
                  <p className="text-base font-semibold">Please confirm your team can play</p>
                  <p className="mt-2 text-sm leading-6 text-amber-100/80">
                    The fixture is now within {FIXTURE_RESPONSE_LOCK_HOURS} hours of kick-off. You will continue to receive reminders until you confirm that your team can play.
                  </p>
                  <p className="mt-3 text-sm leading-6 text-amber-100/80">
                    It is essential to the smooth running of the league that every team confirms its availability.
                  </p>
                  <p className="mt-3 text-sm leading-6 text-amber-100/80">
                    If you do not confirm and your team then fails to attend the match, your team may be liable for both its own match fee and its opponent’s match fee.
                  </p>
                  <p className="mt-3 text-sm leading-6 text-amber-100/80">
                    If your team cannot play, you need to change a previous response, or there is another issue, email SIXFL directly now.
                  </p>

                  <form action={confirmFixtureAction} className="mt-4">
                    <input type="hidden" name="teamid" value={team.id} />
                    <input type="hidden" name="fixtureId" value={selectedFixture.id} />
                    <button
                      type="submit"
                      disabled={isSelectedFixtureConfirmed}
                      className={`inline-flex min-h-12 w-full items-center justify-center rounded-xl border px-4 py-2.5 text-sm font-semibold transition ${
                        isSelectedFixtureConfirmed
                          ? "cursor-not-allowed border-emerald-400/20 bg-emerald-500/10 text-emerald-100/75"
                          : "border-emerald-400/30 bg-emerald-500/15 text-emerald-50 hover:bg-emerald-500/20"
                      }`}
                    >
                      {isSelectedFixtureConfirmed ? "✓ Team can play" : "Yes — we can play"}
                    </button>
                  </form>

                  <a
                    href={selectedFixtureEmailHref}
                    className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-amber-300/25 bg-black/20 px-4 py-2.5 text-sm font-semibold text-amber-50 transition hover:bg-black/30"
                  >
                    Need to change something? Email SIXFL
                  </a>
                  <p className="mt-3 text-xs text-amber-100/65">{SIXFL_FIXTURE_EMAIL}</p>
                </div>
              ) : (
                <>
                  <div className="rounded-3xl border border-white/10 bg-black/20 p-4">
                    <p className="text-base font-semibold text-white">Can your team play this fixture?</p>
                    <p className="mt-1 text-sm leading-6 text-white/55">
                      You can confirm yes at any time before kick-off. If you need to say no, change a response or raise an issue, use the online options until {FIXTURE_RESPONSE_LOCK_HOURS} hours before kick-off; after that, contact SIXFL directly.
                    </p>

                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <form action={confirmFixtureAction}>
                        <input type="hidden" name="teamid" value={team.id} />
                        <input type="hidden" name="fixtureId" value={selectedFixture.id} />
                        <button
                          type="submit"
                          disabled={isSelectedFixtureConfirmed}
                          className={`inline-flex min-h-14 w-full items-center justify-center rounded-2xl border px-5 py-3 text-center text-sm font-semibold transition ${
                            isSelectedFixtureConfirmed
                              ? "cursor-not-allowed border-emerald-400/20 bg-emerald-500/10 text-emerald-100/70"
                              : "border-emerald-400/30 bg-emerald-500/15 text-emerald-50 hover:bg-emerald-500/20"
                          }`}
                        >
                          {isSelectedFixtureConfirmed ? "✓ Team can play" : "Yes — we can play"}
                        </button>
                      </form>

                      <form action={markFixtureUnavailableAction}>
                        <input type="hidden" name="teamid" value={team.id} />
                        <input type="hidden" name="fixtureId" value={selectedFixture.id} />
                        <button
                          type="submit"
                          disabled={isSelectedFixtureUnavailable}
                          className={`inline-flex min-h-14 w-full items-center justify-center rounded-2xl border px-5 py-3 text-center text-sm font-semibold transition ${
                            isSelectedFixtureUnavailable
                              ? "cursor-not-allowed border-red-400/25 bg-red-500/10 text-red-100/75"
                              : "border-red-400/30 bg-red-500/10 text-red-100 hover:bg-red-500/15"
                          }`}
                        >
                          {isSelectedFixtureUnavailable ? "✓ Team marked unavailable" : "No — we cannot play"}
                        </button>
                      </form>
                    </div>
                  </div>

                  <form action={raiseFixtureIssueAction} className="rounded-3xl border border-white/10 bg-black/20 p-4">
                    <input type="hidden" name="teamid" value={team.id} />
                    <input type="hidden" name="fixtureId" value={selectedFixture.id} />
                    <label className="block text-sm font-medium text-white">Different problem with the fixture?</label>
                    <p className="mt-1 text-sm text-white/50">Use this for something other than simply being unavailable, so SIXFL knows what needs reviewing.</p>
                    <textarea
                      name="note"
                      rows={4}
                      placeholder="Example: We may have a venue/time issue or need SIXFL to review another fixture detail."
                      defaultValue={
                        selectedConfirmation?.status === "ISSUE_RAISED" &&
                        !isTeamUnavailableNote(selectedConfirmation.note)
                          ? selectedConfirmation.note ?? ""
                          : ""
                      }
                      className="mt-3 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none"
                    />
                    <button type="submit" className="mt-3 inline-flex items-center rounded-full border border-amber-400/30 bg-amber-500/10 px-4 py-2 text-sm font-medium text-amber-100 transition hover:bg-amber-500/15">
                      Send issue to SIXFL
                    </button>
                  </form>
                </>
              )
            ) : (
              <div className="rounded-3xl border border-white/10 bg-black/20 p-5 text-sm text-white/60">
                No published upcoming fixture to respond to right now.
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="grid gap-8 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="rounded-3xl border border-white/10 bg-white/[0.04]">
          <div className="flex items-center justify-between border-b border-white/10 px-6 py-5">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">Upcoming fixtures</p>
              <h2 className="mt-2 text-xl font-semibold text-white">Other upcoming fixtures</h2>
            </div>
            <Link href={`/captain/team/${teamid}`} className="inline-flex items-center rounded-full border border-white/10 bg-black/20 px-4 py-2 text-sm font-medium text-white/80 transition hover:border-emerald-400/30 hover:bg-emerald-500/10 hover:text-white">
              Back to overview
            </Link>
          </div>

          <div className="divide-y divide-white/10">
            {otherUpcomingFixtures.length === 0 ? (
              <div className="px-6 py-10 text-sm text-white/55">No other published upcoming fixtures yet.</div>
            ) : (
              otherUpcomingFixtures.map((fixture) => {
                const confirmation = fixture.captainConfirmations[0] ?? null;
                const provisional = fixtureIsProvisional(fixture);
                const status: ConfirmationSummary = provisional
                  ? {
                      label: "Opponent TBC",
                      tone: "neutral",
                      helper: "No response needed yet",
                    }
                  : getFixtureConfirmationSummary({
                      confirmation,
                      kickoffAt: fixture.kickoffAt,
                    });
                const isNextUpcoming = upcomingFixtures[0]?.id === fixture.id;

                return (
                  <div key={fixture.id} className="flex flex-col gap-4 px-6 py-5 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-base font-semibold text-white">
                          <FixtureTeamPair
                            homeTeam={fixture.homeTeam}
                            awayTeam={fixture.awayTeam}
                            colours={kitColours}
                          />
                        </div>
                        <SixflTvFixtureBadge
                          recorded={fixture.sixflTvRecorded}
                          url={fixture.sixflTvUrl}
                        />
                        {isNextUpcoming ? (
                          <span className="rounded-full border border-sky-400/20 bg-sky-500/10 px-2.5 py-1 text-[11px] font-medium text-sky-100">Next up</span>
                        ) : null}
                      </div>
                      <div className="mt-1 text-sm text-white/60">{formatDateTime(fixture.kickoffAt)}</div>
                      <div className="mt-2 text-sm text-white/50">{fixture.venue?.name ?? team.league?.venueName ?? "Venue TBC"}</div>
                    </div>

                    <div className="flex flex-col items-start gap-2 lg:items-end">
                      <span className={`rounded-full border px-3 py-1 text-xs font-medium ${getToneClasses(status.tone)}`}>{status.label}</span>
                      <span className="text-xs uppercase tracking-[0.14em] text-white/45">{getCountdownLabel(fixture.kickoffAt)}</span>
                      <Link href={`/captain/team/${teamid}/fixtures?fixtureId=${fixture.id}`} className="mt-1 inline-flex items-center rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-white/70 transition hover:bg-white/[0.08] hover:text-white">
                        Open this fixture
                      </Link>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/[0.04]">
          <div className="flex items-center justify-between border-b border-white/10 px-6 py-5">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">Recent results</p>
              <h2 className="mt-2 text-xl font-semibold text-white">Latest scores</h2>
            </div>
            <Link href={`/captain/team/${teamid}/results`} className="inline-flex items-center rounded-full border border-emerald-400/30 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-100 transition hover:bg-emerald-500/15">
              Open results
            </Link>
          </div>

          <div className="divide-y divide-white/10">
            {recentResults.length === 0 ? (
              <div className="px-6 py-10 text-sm text-white/55">No results recorded yet.</div>
            ) : (
              recentResults.map((fixture) => {
                const isHome = fixture.homeTeamId === teamid;
                const goalsFor = isHome ? fixture.result!.homeScore : fixture.result!.awayScore;
                const goalsAgainst = isHome ? fixture.result!.awayScore : fixture.result!.homeScore;

                return (
                  <div key={fixture.id} className="px-6 py-5">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <div className="text-base font-semibold text-white">
                          <FixtureTeamPair
                            homeTeam={fixture.homeTeam}
                            awayTeam={fixture.awayTeam}
                            colours={kitColours}
                          />
                        </div>
                        <div className="mt-1 text-sm text-white/60">{formatDateTime(fixture.kickoffAt)}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-semibold text-white">{goalsFor} - {goalsAgainst}</div>
                        <div className="mt-1 text-xs uppercase tracking-[0.14em] text-white/45">{getResultLabel(goalsFor, goalsAgainst)}</div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
