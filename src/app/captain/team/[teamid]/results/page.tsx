// ========================================
// File: src/app/captain/team/[teamid]/results/page.tsx
// ========================================

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { ResultDisputeStatus, ResultDisputeType } from "@prisma/client";

import FormListboxField from "@/components/ui/FormListboxField";
import { formatDateTimeInLondon } from "@/lib/datetime/london";
import { prisma } from "@/lib/prisma";
import { requireCaptain } from "@/lib/requireCaptain";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Captain Results | SIXFL",
};

type SearchParams = {
  q?: string;
  outcome?: "W" | "D" | "L";
  needsCompletion?: string;
  saved?: string;
  error?: string;
};

type ScorerRow = {
  name: string;
  goals: number;
  teamMemberId?: string;
};

type MatchPlayerOption = {
  id: string;
  name: string;
  email: string | null;
  role: string;
  isSelectedForFixture: boolean;
};

const RESULT_DISPUTE_WINDOW_HOURS = 72;
const RESULT_DISPUTE_WINDOW_MS =
  RESULT_DISPUTE_WINDOW_HOURS * 60 * 60 * 1000;

const outcomeOptions = [
  { value: "", label: "All outcomes" },
  { value: "W", label: "Wins" },
  { value: "D", label: "Draws" },
  { value: "L", label: "Losses" },
];

const disputeTypeOptions = [
  { value: "GENERAL", label: "General issue" },
  { value: "SCORE", label: "Score issue" },
  { value: "PLAYER", label: "Player / scorer issue" },
];

function formatDate(date: Date) {
  return formatDateTimeInLondon(date, {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatDateTime(date: Date) {
  return formatDateTimeInLondon(date, {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getResultDisputeDeadline(enteredAt: Date) {
  return new Date(enteredAt.getTime() + RESULT_DISPUTE_WINDOW_MS);
}

function isResultDisputeWindowOpen(enteredAt: Date, now = new Date()) {
  return now.getTime() <= getResultDisputeDeadline(enteredAt).getTime();
}

function getGoalsFor(
  result: { homeScore: number; awayScore: number },
  isHome: boolean,
) {
  return isHome ? result.homeScore : result.awayScore;
}

function getGoalsAgainst(
  result: { homeScore: number; awayScore: number },
  isHome: boolean,
) {
  return isHome ? result.awayScore : result.homeScore;
}

function getOutcome(goalsFor: number, goalsAgainst: number) {
  if (goalsFor > goalsAgainst) return "W";
  if (goalsFor < goalsAgainst) return "L";
  return "D";
}

function getPlayerDisplayName(player: {
  user: { name: string | null; email: string | null };
}) {
  return player.user.name || player.user.email || "Unnamed player";
}

function normalisePlayerName(value: string) {
  return value.trim().toLowerCase();
}

function getRecordedGoalsForPlayer(
  scorers: ScorerRow[],
  player: MatchPlayerOption,
) {
  const byId = scorers.find((scorer) => scorer.teamMemberId === player.id);

  if (byId) {
    return byId.goals;
  }

  const byName = scorers.find(
    (scorer) => normalisePlayerName(scorer.name) === normalisePlayerName(player.name),
  );

  return byName?.goals ?? 0;
}

function getSelectedPomMemberId(
  players: MatchPlayerOption[],
  playerOfMatchName?: string | null,
) {
  if (!playerOfMatchName) return "";

  return (
    players.find(
      (player) =>
        normalisePlayerName(player.name) === normalisePlayerName(playerOfMatchName),
    )?.id ?? ""
  );
}

function parseStoredScorers(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;

      const row = item as Partial<ScorerRow>;
      const name = typeof row.name === "string" ? row.name.trim() : "";
      const goals = Number(row.goals);
      const teamMemberId =
        typeof row.teamMemberId === "string" ? row.teamMemberId : undefined;

      if (!name || !Number.isInteger(goals) || goals < 1) return null;

      return {
        name,
        goals,
        teamMemberId,
      } satisfies ScorerRow;
    })
    .filter((item): item is ScorerRow => Boolean(item));
}

function getFriendlyErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    if (error.message.includes("Scorer goals must be whole numbers")) {
      return "Scorer goals must be whole numbers such as 1, 2, or 3.";
    }

    if (error.message.includes("cannot exceed the official result")) {
      return "Scorer goals cannot be higher than your team’s official score.";
    }

    if (error.message.includes("not in this match squad")) {
      return "Please choose scorers and Player of the Match from your match squad.";
    }

    if (error.message.includes("Result not found")) {
      return "That result could not be found.";
    }

    if (error.message.includes("does not belong to the selected team")) {
      return "That result is not linked to this team.";
    }

    if (error.message.includes("Dispute reason must be")) {
      return "Please enter a short reason for the dispute.";
    }

    if (error.message.includes("An active dispute already exists")) {
      return "There is already an open dispute for this result from your team.";
    }

    if (error.message.includes("Dispute window has closed")) {
      return "This result can only be disputed within 72 hours of being entered.";
    }

    return error.message;
  }

  return "Something went wrong while saving.";
}

async function saveTeamMatchDetails(formData: FormData) {
  "use server";

  const teamid = String(formData.get("teamid") ?? "");
  const resultId = String(formData.get("resultId") ?? "");
  const playerOfMatchTeamMemberId = String(
    formData.get("playerOfMatchTeamMemberId") ?? "",
  ).trim();

  await requireCaptain(teamid);

  try {
    const [result, team] = await Promise.all([
      prisma.matchResult.findUnique({
        where: { id: resultId },
        include: {
          fixture: {
            include: {
              selections: {
                where: {
                  teamMember: {
                    teamId: teamid,
                  },
                },
                select: {
                  teamMemberId: true,
                  selectionStatus: true,
                  teamMember: {
                    select: {
                      id: true,
                      role: true,
                      user: {
                        select: {
                          name: true,
                          email: true,
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      }),
      prisma.team.findUnique({
        where: { id: teamid },
        select: {
          members: {
            orderBy: [{ role: "asc" }, { createdAt: "asc" }],
            select: {
              id: true,
              role: true,
              user: {
                select: {
                  name: true,
                  email: true,
                },
              },
            },
          },
        },
      }),
    ]);

    if (!result) {
      throw new Error("Result not found.");
    }

    if (!team) {
      throw new Error("Team not found.");
    }

    if (
      result.fixture.homeTeamId !== teamid &&
      result.fixture.awayTeamId !== teamid
    ) {
      throw new Error("This result does not belong to the selected team.");
    }

    const selectedPlayers = result.fixture.selections
      .filter((selection) => selection.selectionStatus === "SELECTED")
      .map((selection) => ({
        id: selection.teamMember.id,
        name: getPlayerDisplayName(selection.teamMember),
        email: selection.teamMember.user.email,
        role: selection.teamMember.role,
        isSelectedForFixture: true,
      }));

    const fallbackPlayers = team.members.map((member) => ({
      id: member.id,
      name: getPlayerDisplayName(member),
      email: member.user.email,
      role: member.role,
      isSelectedForFixture: false,
    }));

    const players = selectedPlayers.length > 0 ? selectedPlayers : fallbackPlayers;
    const playerById = new Map(players.map((player) => [player.id, player]));

    const scorers = players
      .map((player) => {
        const rawGoals = String(formData.get(`scorerGoals_${player.id}`) ?? "0");
        const goals = Number(rawGoals);

        if (!Number.isInteger(goals) || goals < 0) {
          throw new Error("Scorer goals must be whole numbers.");
        }

        if (goals < 1) return null;

        return {
          teamMemberId: player.id,
          name: player.name,
          goals,
        } satisfies ScorerRow;
      })
      .filter((item): item is ScorerRow => Boolean(item));

    const isHome = result.fixture.homeTeamId === teamid;
    const goalsExpected = isHome ? result.homeScore : result.awayScore;
    const goalsRecorded = scorers.reduce((sum, row) => sum + row.goals, 0);

    if (goalsRecorded > goalsExpected) {
      throw new Error(
        "Recorded scorer goals cannot exceed the official result.",
      );
    }

    let playerOfMatchName: string | null = null;

    if (playerOfMatchTeamMemberId) {
      const playerOfMatch = playerById.get(playerOfMatchTeamMemberId);

      if (!playerOfMatch) {
        throw new Error("Player of the Match is not in this match squad.");
      }

      playerOfMatchName = playerOfMatch.name;
    }

    await prisma.matchResultTeamMeta.upsert({
      where: {
        matchResultId_teamId: {
          matchResultId: resultId,
          teamId: teamid,
        },
      },
      update: {
        scorers,
        goalsRecorded,
        playerOfMatchName,
      },
      create: {
        matchResultId: resultId,
        teamId: teamid,
        scorers,
        goalsRecorded,
        playerOfMatchName,
      },
    });

    revalidatePath(`/captain/team/${teamid}`);
    revalidatePath(`/captain/team/${teamid}/results`);
    redirect(`/captain/team/${teamid}/results?saved=1`);
  } catch (error) {
    const message = encodeURIComponent(getFriendlyErrorMessage(error));
    redirect(`/captain/team/${teamid}/results?error=${message}`);
  }
}

async function createResultDispute(formData: FormData) {
  "use server";

  const teamid = String(formData.get("teamid") ?? "");
  const resultId = String(formData.get("resultId") ?? "");
  const type = String(formData.get("type") ?? "GENERAL") as ResultDisputeType;
  const description = String(formData.get("description") ?? "").trim();

  const access = await requireCaptain(teamid);

  try {
    const result = await prisma.matchResult.findUnique({
      where: { id: resultId },
      include: {
        fixture: {
          select: {
            homeTeamId: true,
            awayTeamId: true,
          },
        },
      },
    });

    if (!result) {
      throw new Error("Result not found.");
    }

    if (
      result.fixture.homeTeamId !== teamid &&
      result.fixture.awayTeamId !== teamid
    ) {
      throw new Error("This result does not belong to the selected team.");
    }

    if (!isResultDisputeWindowOpen(result.enteredAt)) {
      throw new Error("Dispute window has closed for this result.");
    }

    if (description.length < 10) {
      throw new Error("Dispute reason must be at least 10 characters.");
    }

    const existing = await prisma.resultDispute.findFirst({
      where: {
        matchResultId: resultId,
        teamId: teamid,
        status: {
          in: [ResultDisputeStatus.OPEN, ResultDisputeStatus.REVIEW],
        },
      },
      select: { id: true },
    });

    if (existing) {
      throw new Error("An active dispute already exists for this result.");
    }

    await prisma.resultDispute.create({
      data: {
        matchResultId: resultId,
        teamId: teamid,
        type,
        description,
        createdByUserId: access.user?.id ?? null,
      },
    });

    await prisma.matchResult.update({
      where: { id: resultId },
      data: { isDisputed: true },
    });

    revalidatePath(`/captain/team/${teamid}`);
    revalidatePath(`/captain/team/${teamid}/results`);
    revalidatePath(`/admin/results`);
    redirect(`/captain/team/${teamid}/results?saved=dispute`);
  } catch (error) {
    const message = encodeURIComponent(getFriendlyErrorMessage(error));
    redirect(`/captain/team/${teamid}/results?error=${message}`);
  }
}

export default async function CaptainResultsPage({
  params,
  searchParams,
}: {
  params: Promise<{ teamid: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { teamid } = await params;
  const filters = await searchParams;

  await requireCaptain(teamid);

  const team = await prisma.team.findUnique({
    where: { id: teamid },
    select: {
      id: true,
      name: true,
      members: {
        orderBy: [{ role: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          role: true,
          user: {
            select: {
              name: true,
              email: true,
            },
          },
        },
      },
    },
  });

  if (!team) {
    notFound();
  }

  const fixtures = await prisma.fixture.findMany({
    where: {
      OR: [{ homeTeamId: teamid }, { awayTeamId: teamid }],
      result: { isNot: null },
    },
    orderBy: { kickoffAt: "desc" },
    include: {
      homeTeam: { select: { name: true } },
      awayTeam: { select: { name: true } },
      selections: {
        where: {
          teamMember: {
            teamId: teamid,
          },
        },
        select: {
          teamMemberId: true,
          selectionStatus: true,
          teamMember: {
            select: {
              id: true,
              role: true,
              user: {
                select: {
                  name: true,
                  email: true,
                },
              },
            },
          },
        },
      },
      result: {
        include: {
          teamMetadata: true,
          disputes: {
            where: {
              teamId: teamid,
            },
            orderBy: {
              createdAt: "desc",
            },
          },
        },
      },
    },
  });

  const teamMembersAsPlayers: MatchPlayerOption[] = team.members.map((member) => ({
    id: member.id,
    name: getPlayerDisplayName(member),
    email: member.user.email,
    role: member.role,
    isSelectedForFixture: false,
  }));

  const query = (filters.q ?? "").trim().toLowerCase();

  const rows = fixtures
    .map((fixture) => {
      const isHome = fixture.homeTeamId === teamid;
      const goalsFor = getGoalsFor(fixture.result!, isHome);
      const goalsAgainst = getGoalsAgainst(fixture.result!, isHome);
      const outcome = getOutcome(goalsFor, goalsAgainst);
      const opponent = isHome ? fixture.awayTeam.name : fixture.homeTeam.name;
      const matchDetails =
        fixture.result!.teamMetadata.find((item) => item.teamId === teamid) ??
        null;
      const latestDispute = fixture.result!.disputes[0] ?? null;
      const scorers = parseStoredScorers(matchDetails?.scorers);
      const needsScorers = (matchDetails?.goalsRecorded ?? 0) < goalsFor;
      const needsPom = !matchDetails?.playerOfMatchName;
      const disputeDeadlineAt = getResultDisputeDeadline(
        fixture.result!.enteredAt,
      );
      const isDisputeWindowOpenNow = isResultDisputeWindowOpen(
        fixture.result!.enteredAt,
      );
      const selectedPlayers = fixture.selections
        .filter((selection) => selection.selectionStatus === "SELECTED")
        .map((selection) => ({
          id: selection.teamMember.id,
          name: getPlayerDisplayName(selection.teamMember),
          email: selection.teamMember.user.email,
          role: selection.teamMember.role,
          isSelectedForFixture: true,
        } satisfies MatchPlayerOption));
      const matchPlayers =
        selectedPlayers.length > 0 ? selectedPlayers : teamMembersAsPlayers;
      const isUsingSelectedPlayers = selectedPlayers.length > 0;

      return {
        fixture,
        opponent,
        goalsFor,
        goalsAgainst,
        outcome,
        matchDetails,
        scorers,
        needsScorers,
        needsPom,
        latestDispute,
        disputeDeadlineAt,
        isDisputeWindowOpenNow,
        matchPlayers,
        isUsingSelectedPlayers,
      };
    })
    .filter((row) => {
      if (filters.outcome && row.outcome !== filters.outcome) return false;
      if (
        filters.needsCompletion === "1" &&
        !(row.needsScorers || row.needsPom)
      ) {
        return false;
      }
      if (!query) return true;

      return [
        row.opponent,
        row.matchDetails?.playerOfMatchName ?? "",
        ...row.scorers.map((item) => item.name),
      ]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-3xl border border-emerald-400/15 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.16),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.03))] shadow-[0_24px_80px_rgba(0,0,0,0.3)]">
        <div className="px-6 py-6 lg:px-8 lg:py-8">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-300/80">
            Results
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            Match details
          </h1>
          <p className="mt-3 max-w-3xl text-sm text-white/70 sm:text-base">
            Add your scorers and choose Player of the Match from your selected
            squad. The official score stays locked, and any score dispute must
            be raised within 72 hours.
          </p>
        </div>
      </section>

      {filters.saved === "1" ? (
        <section className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4 text-sm text-emerald-100">
          Match details saved successfully.
        </section>
      ) : null}

      {filters.saved === "dispute" ? (
        <section className="rounded-2xl border border-amber-400/20 bg-amber-500/10 p-4 text-sm text-amber-100">
          Dispute submitted successfully. Admin can now review it.
        </section>
      ) : null}

      {filters.error ? (
        <section className="rounded-2xl border border-red-400/20 bg-red-500/10 p-4 text-sm text-red-100">
          {decodeURIComponent(filters.error)}
        </section>
      ) : null}

      <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
        <h2 className="text-xl font-semibold text-white">Find a result</h2>
        <form className="mt-4 grid gap-3 md:grid-cols-4">
          <input
            type="text"
            name="q"
            defaultValue={filters.q ?? ""}
            placeholder="Search opponent, scorer, POM"
            className="h-12 rounded-xl border border-white/10 bg-[#0d1428] px-4 text-sm text-white outline-none transition placeholder:text-white/40 focus:border-emerald-500/60 focus:ring-2 focus:ring-emerald-500/20"
          />

          <FormListboxField
            name="outcome"
            value={filters.outcome ?? ""}
            options={outcomeOptions}
            placeholder="All outcomes"
          />

          <label className="flex h-12 items-center gap-2 rounded-xl border border-white/10 bg-[#0d1428] px-4 text-sm text-white/80">
            <input
              type="checkbox"
              name="needsCompletion"
              value="1"
              defaultChecked={filters.needsCompletion === "1"}
            />
            Needs completion
          </label>

          <div className="md:col-span-4">
            <button
              type="submit"
              className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm font-medium text-emerald-200 transition hover:bg-emerald-500/15"
            >
              Apply filters
            </button>
          </div>
        </form>
      </section>

      <div className="space-y-4">
        {rows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/10 bg-white/5 p-6 text-white/60">
            No results matched the current filters.
          </div>
        ) : (
          rows.map((row) => {
            const playerOfMatchOptions = [
              { value: "", label: "No Player of the Match yet" },
              ...row.matchPlayers.map((player) => ({
                value: player.id,
                label: player.name,
              })),
            ];
            const selectedPomMemberId = getSelectedPomMemberId(
              row.matchPlayers,
              row.matchDetails?.playerOfMatchName,
            );
            const recordedGoalTotal = row.scorers.reduce(
              (sum, scorer) => sum + scorer.goals,
              0,
            );

            return (
              <section
                key={row.fixture.id}
                className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04] shadow-[0_18px_70px_rgba(0,0,0,0.22)]"
              >
                <div className="border-b border-white/10 px-6 py-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <p className="text-sm text-white/55">
                        {formatDate(row.fixture.kickoffAt)}
                      </p>
                      <h3 className="mt-1 text-2xl font-semibold text-white">
                        {row.fixture.homeTeam.name} {row.fixture.result!.homeScore}-
                        {row.fixture.result!.awayScore} {row.fixture.awayTeam.name}
                      </h3>
                      <p className="mt-2 text-sm text-white/65">
                        Your opponent: {row.opponent}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <span className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1 text-sm text-emerald-200">
                        {row.outcome}
                      </span>
                      <span className="rounded-full border border-white/10 px-3 py-1 text-sm text-white/70">
                        {row.needsScorers || row.needsPom
                          ? "Needs completion"
                          : "Complete"}
                      </span>
                      {row.latestDispute ? (
                        <span className="rounded-full border border-amber-400/30 bg-amber-500/10 px-3 py-1 text-sm text-amber-100">
                          Dispute: {row.latestDispute.status}
                        </span>
                      ) : row.isDisputeWindowOpenNow ? (
                        <span className="rounded-full border border-white/10 px-3 py-1 text-sm text-white/70">
                          Dispute open
                        </span>
                      ) : (
                        <span className="rounded-full border border-white/10 px-3 py-1 text-sm text-white/45">
                          Dispute closed
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="grid gap-0 xl:grid-cols-[0.9fr_1.1fr]">
                  <div className="space-y-4 border-b border-white/10 p-6 xl:border-b-0 xl:border-r">
                    <div className="rounded-2xl border border-white/10 bg-black/15 p-5">
                      <h4 className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-300/80">
                        Current match details
                      </h4>

                      <div className="mt-4 space-y-3">
                        <div>
                          <p className="text-xs font-medium uppercase tracking-[0.16em] text-white/40">
                            Scorers
                          </p>
                          {row.scorers.length > 0 ? (
                            <div className="mt-2 flex flex-wrap gap-2">
                              {row.scorers.map((item) => (
                                <span
                                  key={`${item.teamMemberId ?? item.name}-${item.goals}`}
                                  className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm text-white/80"
                                >
                                  {item.name} × {item.goals}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <p className="mt-2 text-sm text-white/60">
                              No scorers added yet.
                            </p>
                          )}
                        </div>

                        <div>
                          <p className="text-xs font-medium uppercase tracking-[0.16em] text-white/40">
                            Player of the Match
                          </p>
                          <p className="mt-2 text-sm text-white/80">
                            {row.matchDetails?.playerOfMatchName ??
                              "No Player of the Match selected yet."}
                          </p>
                        </div>

                        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-sm text-white/65">
                          Recorded {recordedGoalTotal} of {row.goalsFor} team
                          goals.
                        </div>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-black/15 p-5">
                      <h4 className="text-sm font-semibold uppercase tracking-[0.2em] text-amber-300/80">
                        Result dispute
                      </h4>

                      {row.latestDispute ? (
                        <div className="mt-3 space-y-2 text-sm text-white/75">
                          <p>
                            <span className="text-white/45">Status:</span>{" "}
                            {row.latestDispute.status}
                          </p>
                          <p>
                            <span className="text-white/45">Type:</span>{" "}
                            {row.latestDispute.type}
                          </p>
                          <p>
                            <span className="text-white/45">Reason:</span>{" "}
                            {row.latestDispute.description}
                          </p>
                          <p>
                            <span className="text-white/45">Raised:</span>{" "}
                            {formatDateTime(row.latestDispute.createdAt)}
                          </p>
                          {row.latestDispute.adminNote ? (
                            <p>
                              <span className="text-white/45">Admin note:</span>{" "}
                              {row.latestDispute.adminNote}
                            </p>
                          ) : null}
                        </div>
                      ) : row.isDisputeWindowOpenNow ? (
                        <>
                          <p className="mt-3 text-sm text-white/60">
                            You can raise a dispute until{" "}
                            {formatDateTime(row.disputeDeadlineAt)}.
                          </p>

                          <form action={createResultDispute} className="mt-3">
                            <input type="hidden" name="teamid" value={team.id} />
                            <input
                              type="hidden"
                              name="resultId"
                              value={row.fixture.result!.id}
                            />

                            <FormListboxField
                              name="type"
                              value="GENERAL"
                              options={disputeTypeOptions}
                              placeholder="Select dispute type"
                            />

                            <textarea
                              name="description"
                              rows={4}
                              placeholder="Explain what is wrong with this result or why it needs review."
                              className="mt-3 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/40 focus:border-amber-500/60 focus:ring-2 focus:ring-amber-500/20"
                            />

                            <button
                              type="submit"
                              className="mt-3 rounded-full border border-amber-400/30 bg-amber-500/10 px-4 py-2 text-sm font-medium text-amber-100 transition hover:bg-amber-500/15"
                            >
                              Raise dispute
                            </button>
                          </form>
                        </>
                      ) : (
                        <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-white/65">
                          This result can no longer be disputed. The 72-hour
                          dispute window closed on{" "}
                          {formatDateTime(row.disputeDeadlineAt)}.
                        </div>
                      )}
                    </div>
                  </div>

                  <form action={saveTeamMatchDetails} className="p-6">
                    <input type="hidden" name="teamid" value={team.id} />
                    <input
                      type="hidden"
                      name="resultId"
                      value={row.fixture.result!.id}
                    />

                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <h4 className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-300/80">
                          Update scorers & Player of the Match
                        </h4>
                        <p className="mt-2 max-w-2xl text-sm text-white/60">
                          Use the squad list below instead of typing names. This
                          keeps names consistent and avoids spelling mistakes.
                        </p>
                      </div>
                      <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white/65">
                        {row.isUsingSelectedPlayers
                          ? "Selected squad"
                          : "Full squad fallback"}
                      </span>
                    </div>

                    <div className="mt-5 rounded-2xl border border-white/10 bg-black/15">
                      <div className="grid grid-cols-[1fr_96px] gap-3 border-b border-white/10 px-4 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-white/45">
                        <span>Player</span>
                        <span className="text-right">Goals</span>
                      </div>

                      {row.matchPlayers.length > 0 ? (
                        <div className="divide-y divide-white/10">
                          {row.matchPlayers.map((player) => (
                            <label
                              key={player.id}
                              className="grid grid-cols-[1fr_96px] items-center gap-3 px-4 py-3"
                            >
                              <span>
                                <span className="block text-sm font-medium text-white">
                                  {player.name}
                                </span>
                                <span className="block text-xs text-white/45">
                                  {player.role.replace("_", " ").toLowerCase()}
                                  {player.email ? ` · ${player.email}` : ""}
                                </span>
                              </span>
                              <input
                                type="number"
                                name={`scorerGoals_${player.id}`}
                                defaultValue={getRecordedGoalsForPlayer(
                                  row.scorers,
                                  player,
                                )}
                                min={0}
                                max={row.goalsFor}
                                inputMode="numeric"
                                className="h-11 w-full rounded-xl border border-white/10 bg-[#0d1428] px-3 text-right text-sm font-semibold text-white outline-none transition focus:border-emerald-500/60 focus:ring-2 focus:ring-emerald-500/20"
                              />
                            </label>
                          ))}
                        </div>
                      ) : (
                        <div className="p-4 text-sm text-white/60">
                          No squad players are available for this team yet.
                        </div>
                      )}
                    </div>

                    <div className="mt-5">
                      <FormListboxField
                        name="playerOfMatchTeamMemberId"
                        label="Player of the Match"
                        value={selectedPomMemberId}
                        options={playerOfMatchOptions}
                        placeholder="Choose from squad"
                        disabled={row.matchPlayers.length === 0}
                      />
                    </div>

                    <div className="mt-5 flex flex-col gap-3 rounded-2xl border border-emerald-400/15 bg-emerald-500/10 p-4 text-sm text-emerald-50/80 sm:flex-row sm:items-center sm:justify-between">
                      <span>
                        Total scorer goals must not be higher than the official
                        {" "}score of {row.goalsFor}.
                      </span>
                      <button
                        type="submit"
                        disabled={row.matchPlayers.length === 0}
                        className="rounded-full border border-emerald-400/30 bg-emerald-500/15 px-4 py-2 text-sm font-medium text-emerald-100 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Save match details
                      </button>
                    </div>
                  </form>
                </div>
              </section>
            );
          })
        )}
      </div>
    </div>
  );
}
