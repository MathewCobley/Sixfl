// ========================================
// File: src/app/captain/team/[teamid]/fixtures/page.tsx
// ========================================

import { revalidatePath } from "next/cache";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { FixtureCaptainConfirmationStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireCaptain } from "@/lib/requireCaptain";
import { formatDateTimeInLondon } from "@/lib/datetime/london";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "Captain Fixtures | SIXFL",
};

type SearchParams = {
  saved?: string;
  error?: string;
};

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

function getFixtureSummary(input: {
  homeTeamName: string;
  awayTeamName: string;
}) {
  return `${input.homeTeamName} vs ${input.awayTeamName}`;
}

function getCaptainFixtureLabel(input: {
  homeTeamName: string;
  awayTeamName: string;
  isHome: boolean;
}) {
  return input.isHome ? `vs ${input.awayTeamName}` : `at ${input.homeTeamName}`;
}

function getResultLabel(goalsFor: number, goalsAgainst: number) {
  if (goalsFor > goalsAgainst) return "Win";
  if (goalsFor < goalsAgainst) return "Loss";
  return "Draw";
}

function getCountdownLabel(kickoffAt: Date) {
  const now = new Date();
  const diffMs = kickoffAt.getTime() - now.getTime();

  if (diffMs <= 0) return "Kick-off time reached";

  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);

  if (diffDays >= 2) return `${diffDays} days to go`;
  if (diffHours >= 24) return "Tomorrow";
  if (diffHours >= 1) {
    return `${diffHours} hour${diffHours === 1 ? "" : "s"} to go`;
  }

  return "Today";
}

function getFriendlyErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    if (error.message.includes("Fixture not found")) {
      return "That fixture could not be found.";
    }

    if (error.message.includes("does not belong to the selected team")) {
      return "That fixture is not linked to this team.";
    }

    if (error.message.includes("not available for confirmation")) {
      return "Only scheduled upcoming fixtures can be confirmed.";
    }

    if (error.message.includes("Issue note must be at least")) {
      return "Please add a short note so SIXFL knows what the issue is.";
    }

    return error.message;
  }

  return "Something went wrong while saving.";
}

function getFixtureConfirmationSummary(input: {
  confirmation:
    | {
        status: FixtureCaptainConfirmationStatus;
        note: string | null;
        confirmedAt: Date | null;
        issueRaisedAt: Date | null;
        lastChasedAt: Date | null;
      }
    | null
    | undefined;
  kickoffAt: Date;
}) {
  const confirmation = input.confirmation ?? null;
  const diffMs = input.kickoffAt.getTime() - Date.now();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

  if (confirmation?.status === "CONFIRMED") {
    return {
      label: "Fixture confirmed",
      tone: "emerald" as const,
      helper: confirmation.confirmedAt
        ? `Confirmed ${formatShortDateTime(confirmation.confirmedAt)}`
        : "Confirmed",
    };
  }

  if (confirmation?.status === "ISSUE_RAISED") {
    return {
      label: "Issue raised",
      tone: "amber" as const,
      helper: confirmation.issueRaisedAt
        ? `Raised ${formatShortDateTime(confirmation.issueRaisedAt)}`
        : "Awaiting review",
    };
  }

  if (diffHours <= 24) {
    return {
      label: "Overdue",
      tone: "red" as const,
      helper:
        confirmation?.lastChasedAt != null
          ? `Reminder sent ${formatShortDateTime(confirmation.lastChasedAt)}`
          : "Confirmation needed urgently",
    };
  }

  if (diffHours <= 72) {
    return {
      label: "Awaiting confirmation",
      tone: "amber" as const,
      helper:
        confirmation?.lastChasedAt != null
          ? `Reminder sent ${formatShortDateTime(confirmation.lastChasedAt)}`
          : "Please confirm before matchday",
    };
  }

  return {
    label: "Awaiting confirmation",
    tone: "neutral" as const,
    helper:
      confirmation?.lastChasedAt != null
        ? `Reminder sent ${formatShortDateTime(confirmation.lastChasedAt)}`
        : "Confirmation window open",
  };
}

function getToneClasses(tone: "emerald" | "amber" | "red" | "neutral") {
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

async function confirmFixtureAction(formData: FormData) {
  "use server";

  const teamid = String(formData.get("teamid") ?? "");
  const fixtureId = String(formData.get("fixtureId") ?? "");
  const access = await requireCaptain(teamid);

  try {
    const fixture = await prisma.fixture.findUnique({
      where: { id: fixtureId },
      select: {
        id: true,
        kickoffAt: true,
        status: true,
        homeTeamId: true,
        awayTeamId: true,
      },
    });

    if (!fixture) {
      throw new Error("Fixture not found.");
    }

    if (fixture.homeTeamId !== teamid && fixture.awayTeamId !== teamid) {
      throw new Error("This fixture does not belong to the selected team.");
    }

    if (fixture.status !== "SCHEDULED" || fixture.kickoffAt <= new Date()) {
      throw new Error("This fixture is not available for confirmation.");
    }

    await prisma.fixtureCaptainConfirmation.upsert({
      where: {
        fixtureId_teamId: {
          fixtureId,
          teamId: teamid,
        },
      },
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

    revalidatePath(`/captain/team/${teamid}`);
    revalidatePath(`/captain/team/${teamid}/fixtures`);
    revalidatePath(`/admin/fixtures`);
    redirect(`/captain/team/${teamid}/fixtures?saved=confirmed`);
  } catch (error) {
    const message = encodeURIComponent(getFriendlyErrorMessage(error));
    redirect(`/captain/team/${teamid}/fixtures?error=${message}`);
  }
}

async function raiseFixtureIssueAction(formData: FormData) {
  "use server";

  const teamid = String(formData.get("teamid") ?? "");
  const fixtureId = String(formData.get("fixtureId") ?? "");
  const note = String(formData.get("note") ?? "").trim();

  const access = await requireCaptain(teamid);

  try {
    if (note.length < 10) {
      throw new Error("Issue note must be at least 10 characters.");
    }

    const fixture = await prisma.fixture.findUnique({
      where: { id: fixtureId },
      select: {
        id: true,
        kickoffAt: true,
        status: true,
        homeTeamId: true,
        awayTeamId: true,
      },
    });

    if (!fixture) {
      throw new Error("Fixture not found.");
    }

    if (fixture.homeTeamId !== teamid && fixture.awayTeamId !== teamid) {
      throw new Error("This fixture does not belong to the selected team.");
    }

    if (fixture.status !== "SCHEDULED" || fixture.kickoffAt <= new Date()) {
      throw new Error("This fixture is not available for confirmation.");
    }

    await prisma.fixtureCaptainConfirmation.upsert({
      where: {
        fixtureId_teamId: {
          fixtureId,
          teamId: teamid,
        },
      },
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

    revalidatePath(`/captain/team/${teamid}`);
    revalidatePath(`/captain/team/${teamid}/fixtures`);
    revalidatePath(`/admin/fixtures`);
    redirect(`/captain/team/${teamid}/fixtures?saved=issue`);
  } catch (error) {
    const message = encodeURIComponent(getFriendlyErrorMessage(error));
    redirect(`/captain/team/${teamid}/fixtures?error=${message}`);
  }
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
        kickoffAt: { gte: new Date() },
      },
      orderBy: [{ kickoffAt: "asc" }],
      take: 12,
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
        result: { isNot: null },
      },
      orderBy: [{ kickoffAt: "desc" }],
      take: 6,
      include: {
        homeTeam: { select: { id: true, name: true } },
        awayTeam: { select: { id: true, name: true } },
        result: {
          include: {
            teamMetadata: true,
          },
        },
      },
    }),
  ]);

  if (!team) {
    notFound();
  }

  const nextFixture = upcomingFixtures[0] ?? null;
  const nextConfirmation = nextFixture?.captainConfirmations[0] ?? null;
  const nextStatus = nextFixture
    ? getFixtureConfirmationSummary({
        confirmation: nextConfirmation,
        kickoffAt: nextFixture.kickoffAt,
      })
    : null;

  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-[2rem] border border-emerald-400/15 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.16),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.03))] shadow-[0_24px_80px_rgba(0,0,0,0.3)]">
        <div className="grid gap-8 px-6 py-6 lg:grid-cols-[1.15fr_0.85fr] lg:px-8 lg:py-8">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-300/80">
              Fixture confirmation
            </p>

            <h2 className="mt-3 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
              {nextFixture
                ? getFixtureSummary({
                    homeTeamName: nextFixture.homeTeam.name,
                    awayTeamName: nextFixture.awayTeam.name,
                  })
                : "No upcoming fixture"}
            </h2>

            <p className="mt-3 max-w-2xl text-sm text-white/70 sm:text-base">
              {nextFixture
                ? `${formatDateTime(nextFixture.kickoffAt)} · ${
                    nextFixture.venue?.name ??
                    team.league?.venueName ??
                    "Venue TBC"
                  }`
                : "Your next match will appear here as soon as it is scheduled."}
            </p>

            {nextFixture && nextStatus ? (
              <>
                <div className="mt-5 flex flex-wrap gap-2">
                  <span
                    className={`rounded-full border px-3 py-1 text-xs font-medium ${getToneClasses(
                      nextStatus.tone,
                    )}`}
                  >
                    {nextStatus.label}
                  </span>
                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white/75">
                    {getCountdownLabel(nextFixture.kickoffAt)}
                  </span>
                </div>

                <p className="mt-4 text-sm text-white/55">{nextStatus.helper}</p>
              </>
            ) : null}

            {filters.saved === "confirmed" ? (
              <div className="mt-5 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4 text-sm text-emerald-100">
                Fixture confirmed successfully.
              </div>
            ) : null}

            {filters.saved === "issue" ? (
              <div className="mt-5 rounded-2xl border border-amber-400/20 bg-amber-500/10 p-4 text-sm text-amber-100">
                Fixture issue raised successfully. Admin can now review it.
              </div>
            ) : null}

            {filters.error ? (
              <div className="mt-5 rounded-2xl border border-red-400/20 bg-red-500/10 p-4 text-sm text-red-100">
                {filters.error}
              </div>
            ) : null}
          </div>

          <div className="space-y-4">
            {nextFixture ? (
              <>
                <form action={confirmFixtureAction}>
                  <input type="hidden" name="teamid" value={team.id} />
                  <input type="hidden" name="fixtureId" value={nextFixture.id} />

                  <button
                    type="submit"
                    className="inline-flex w-full items-center justify-center rounded-2xl border border-emerald-400/30 bg-emerald-500/15 px-5 py-4 text-sm font-medium text-emerald-50 transition hover:bg-emerald-500/20"
                  >
                    Confirm fixture
                  </button>
                </form>

                <form
                  action={raiseFixtureIssueAction}
                  className="rounded-[1.5rem] border border-white/10 bg-black/20 p-4"
                >
                  <input type="hidden" name="teamid" value={team.id} />
                  <input type="hidden" name="fixtureId" value={nextFixture.id} />

                  <label className="block text-sm font-medium text-white">
                    Need help with this fixture?
                  </label>
                  <p className="mt-1 text-sm text-white/50">
                    Raise an issue early so SIXFL can review it before matchday.
                  </p>

                  <textarea
                    name="note"
                    rows={4}
                    placeholder="Example: We may not have enough players available and need help reviewing this fixture."
                    defaultValue={nextConfirmation?.status === "ISSUE_RAISED" ? nextConfirmation.note ?? "" : ""}
                    className="mt-3 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none"
                  />

                  <button
                    type="submit"
                    className="mt-3 inline-flex items-center rounded-full border border-amber-400/30 bg-amber-500/10 px-4 py-2 text-sm font-medium text-amber-100 transition hover:bg-amber-500/15"
                  >
                    Raise fixture issue
                  </button>
                </form>
              </>
            ) : (
              <div className="rounded-[1.5rem] border border-white/10 bg-black/20 p-5 text-sm text-white/60">
                No upcoming fixture to confirm right now.
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="grid gap-8 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="rounded-[2rem] border border-white/10 bg-white/[0.04]">
          <div className="flex items-center justify-between border-b border-white/10 px-6 py-5">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
                Upcoming fixtures
              </p>
              <h2 className="mt-2 text-xl font-semibold text-white">
                Match list
              </h2>
            </div>

            <Link
              href={`/captain/team/${teamid}`}
              className="inline-flex items-center rounded-full border border-white/10 bg-black/20 px-4 py-2 text-sm font-medium text-white/80 transition hover:border-emerald-400/30 hover:bg-emerald-500/10 hover:text-white"
            >
              Back to overview
            </Link>
          </div>

          <div className="divide-y divide-white/10">
            {upcomingFixtures.length === 0 ? (
              <div className="px-6 py-10 text-sm text-white/55">
                No upcoming fixtures yet.
              </div>
            ) : (
              upcomingFixtures.map((fixture, index) => {
                const isHome = fixture.homeTeamId === teamid;
                const confirmation = fixture.captainConfirmations[0] ?? null;
                const status = getFixtureConfirmationSummary({
                  confirmation,
                  kickoffAt: fixture.kickoffAt,
                });

                return (
                  <div
                    key={fixture.id}
                    className="flex flex-col gap-4 px-6 py-5 lg:flex-row lg:items-center lg:justify-between"
                  >
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-base font-semibold text-white">
                          {getCaptainFixtureLabel({
                            homeTeamName: fixture.homeTeam.name,
                            awayTeamName: fixture.awayTeam.name,
                            isHome,
                          })}
                        </div>

                        {index === 0 ? (
                          <span className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-100">
                            Next up
                          </span>
                        ) : null}
                      </div>

                      <div className="mt-1 text-sm text-white/60">
                        {formatDateTime(fixture.kickoffAt)}
                      </div>

                      <div className="mt-2 text-sm text-white/50">
                        {fixture.venue?.name ??
                          team.league?.venueName ??
                          "Venue TBC"}
                      </div>
                    </div>

                    <div className="flex flex-col items-start gap-2 lg:items-end">
                      <span
                        className={`rounded-full border px-3 py-1 text-xs font-medium ${getToneClasses(
                          status.tone,
                        )}`}
                      >
                        {status.label}
                      </span>
                      <span className="text-xs uppercase tracking-[0.14em] text-white/45">
                        {getCountdownLabel(fixture.kickoffAt)}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-[2rem] border border-white/10 bg-white/[0.04]">
            <div className="border-b border-white/10 px-6 py-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
                Recent results
              </p>
              <h2 className="mt-2 text-xl font-semibold text-white">
                Latest scores
              </h2>
            </div>

            <div className="divide-y divide-white/10">
              {recentResults.length === 0 ? (
                <div className="px-6 py-10 text-sm text-white/55">
                  No results recorded yet.
                </div>
              ) : (
                recentResults.map((fixture) => {
                  const isHome = fixture.homeTeamId === teamid;
                  const opponent = isHome
                    ? fixture.awayTeam.name
                    : fixture.homeTeam.name;
                  const goalsFor = isHome
                    ? fixture.result!.homeScore
                    : fixture.result!.awayScore;
                  const goalsAgainst = isHome
                    ? fixture.result!.awayScore
                    : fixture.result!.homeScore;
                  const resultLabel = getResultLabel(goalsFor, goalsAgainst);
                  const teamMeta = fixture.result!.teamMetadata.find(
                    (item) => item.teamId === teamid,
                  );

                  return (
                    <div key={fixture.id} className="px-6 py-5">
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <div className="text-base font-semibold text-white">
                            {opponent}
                          </div>
                          <div className="mt-1 text-sm text-white/60">
                            {formatDateTime(fixture.kickoffAt)}
                          </div>
                        </div>

                        <div className="text-right">
                          <div className="text-lg font-semibold text-white">
                            {goalsFor} - {goalsAgainst}
                          </div>
                          <div className="mt-1 text-xs uppercase tracking-[0.14em] text-white/45">
                            {resultLabel}
                          </div>
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2 text-xs">
                        {(teamMeta?.goalsRecorded ?? 0) < goalsFor ? (
                          <span className="rounded-full bg-amber-500/15 px-3 py-1 text-amber-200">
                            Needs scorers
                          </span>
                        ) : null}
                        {!teamMeta?.playerOfMatchName ? (
                          <span className="rounded-full bg-amber-500/15 px-3 py-1 text-amber-200">
                            Needs POM
                          </span>
                        ) : null}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
              Before matchday
            </p>
            <h2 className="mt-2 text-xl font-semibold text-white">
              Confirmation flow
            </h2>

            <div className="mt-4 space-y-3 text-sm text-white/65">
              <p>Captains can now move fixtures through these states:</p>
              <ul className="space-y-2 pl-5 text-white/60">
                <li>Awaiting confirmation</li>
                <li>Confirmed</li>
                <li>Issue raised</li>
                <li>Overdue</li>
              </ul>
              <p className="pt-1 text-white/50">
                The last step after this is wiring automated chase reminders into
                your messaging layer.
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}