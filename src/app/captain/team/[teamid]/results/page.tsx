// ========================================
// File: src/app/captain/team/[teamid]/results/page.tsx
// ========================================

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { ResultDisputeStatus, ResultDisputeType } from "@prisma/client";

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
};

function formatDate(date: Date) {
  return date.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
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

function parseScorers(input: string) {
  return input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(/[|,]/).map((part) => part.trim());

      if (parts.length < 2 || !parts[0]) {
        throw new Error(
          `Scorer line must look like Name|2. Invalid line: ${line}`,
        );
      }

      const goals = Number(parts[1]);

      if (!Number.isInteger(goals) || goals < 1) {
        throw new Error(
          `Goals must be a whole number. Invalid line: ${line}`,
        );
      }

      return {
        name: parts[0],
        goals,
      } satisfies ScorerRow;
    });
}

function getFriendlyErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    if (error.message.includes("Scorer line must look like")) {
      return "Enter scorers one per line in the format Name|Goals.";
    }

    if (error.message.includes("Goals must be a whole number")) {
      return "Scorer goals must be whole numbers such as 1, 2, or 3.";
    }

    if (error.message.includes("cannot exceed the official result")) {
      return "Scorer goals cannot be higher than your team’s official score.";
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

    return error.message;
  }

  return "Something went wrong while saving.";
}

async function saveTeamMetadata(formData: FormData) {
  "use server";

  const teamid = String(formData.get("teamid") ?? "");
  const resultId = String(formData.get("resultId") ?? "");
  const scorerText = String(formData.get("scorers") ?? "");
  const playerOfMatchName = String(
    formData.get("playerOfMatchName") ?? "",
  ).trim();

  await requireCaptain(teamid);

  try {
    const result = await prisma.matchResult.findUnique({
      where: { id: resultId },
      include: {
        fixture: {
          select: {
            id: true,
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

    const isHome = result.fixture.homeTeamId === teamid;
    const goalsExpected = isHome ? result.homeScore : result.awayScore;
    const scorers = scorerText.trim() ? parseScorers(scorerText) : [];
    const goalsRecorded = scorers.reduce((sum, row) => sum + row.goals, 0);

    if (goalsRecorded > goalsExpected) {
      throw new Error(
        "Recorded scorer goals cannot exceed the official result.",
      );
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
        playerOfMatchName: playerOfMatchName || null,
      },
      create: {
        matchResultId: resultId,
        teamId: teamid,
        scorers,
        goalsRecorded,
        playerOfMatchName: playerOfMatchName || null,
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
    if (description.length < 10) {
      throw new Error("Dispute reason must be at least 10 characters.");
    }

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
    select: { id: true, name: true },
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

  const query = (filters.q ?? "").trim().toLowerCase();

  const rows = fixtures
    .map((fixture) => {
      const isHome = fixture.homeTeamId === teamid;
      const goalsFor = getGoalsFor(fixture.result!, isHome);
      const goalsAgainst = getGoalsAgainst(fixture.result!, isHome);
      const outcome = getOutcome(goalsFor, goalsAgainst);
      const opponent = isHome ? fixture.awayTeam.name : fixture.homeTeam.name;
      const metadata =
        fixture.result!.teamMetadata.find((item) => item.teamId === teamid) ??
        null;
      const latestDispute = fixture.result!.disputes[0] ?? null;
      const scorers = Array.isArray(metadata?.scorers)
        ? (metadata!.scorers as ScorerRow[])
        : [];
      const needsScorers = (metadata?.goalsRecorded ?? 0) < goalsFor;
      const needsPom = !metadata?.playerOfMatchName;

      return {
        fixture,
        opponent,
        goalsFor,
        goalsAgainst,
        outcome,
        metadata,
        scorers,
        needsScorers,
        needsPom,
        latestDispute,
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
        row.metadata?.playerOfMatchName ?? "",
        ...row.scorers.map((item) => item.name),
      ]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-white/10 bg-white/5 p-6">
        <p className="text-sm uppercase tracking-[0.2em] text-emerald-300/80">
          Page title
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Results</h1>
        <p className="mt-2 text-sm text-white/65">
          Complete scorers and Player of the Match safely. Official scores
          remain admin-owned in this phase.
        </p>
      </section>

      {filters.saved === "1" ? (
        <section className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4 text-sm text-emerald-100">
          Result metadata saved successfully.
        </section>
      ) : null}

      {filters.saved === "dispute" ? (
        <section className="rounded-2xl border border-amber-400/20 bg-amber-500/10 p-4 text-sm text-amber-100">
          Dispute submitted successfully. Admin can now review it.
        </section>
      ) : null}

      {filters.error ? (
        <section className="rounded-2xl border border-red-400/20 bg-red-500/10 p-4 text-sm text-red-100">
          {filters.error}
        </section>
      ) : null}

      <section className="rounded-2xl border border-white/10 bg-white/5 p-6">
        <h2 className="text-xl font-semibold">Results filters</h2>
        <form className="mt-4 grid gap-3 md:grid-cols-4">
          <input
            type="text"
            name="q"
            defaultValue={filters.q ?? ""}
            placeholder="Search opponent, scorer, POM"
            className="rounded-xl border border-white/10 bg-[#0d1428] px-4 py-3 text-sm text-white outline-none"
          />
          <select
            name="outcome"
            defaultValue={filters.outcome ?? ""}
            className="rounded-xl border border-white/10 bg-[#0d1428] px-4 py-3 text-sm text-white outline-none"
          >
            <option value="">All outcomes</option>
            <option value="W">Wins</option>
            <option value="D">Draws</option>
            <option value="L">Losses</option>
          </select>
          <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-[#0d1428] px-4 py-3 text-sm text-white/80">
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
              className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm font-medium text-emerald-200"
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
          rows.map((row) => (
            <section
              key={row.fixture.id}
              className="rounded-2xl border border-white/10 bg-white/5 p-6"
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-sm text-white/55">
                    {formatDate(row.fixture.kickoffAt)}
                  </p>
                  <h3 className="mt-1 text-2xl font-semibold">
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
                  ) : null}
                </div>
              </div>

              <div className="mt-5 grid gap-6 lg:grid-cols-2">
                <div className="space-y-6">
                  <div className="rounded-xl border border-white/10 bg-[#0d1428] p-4">
                    <h4 className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-300/80">
                      Current metadata
                    </h4>
                    <p className="mt-3 text-sm text-white/70">
                      Scorers:{" "}
                      {row.scorers.length > 0
                        ? row.scorers
                            .map((item) => `${item.name} x${item.goals}`)
                            .join(", ")
                        : "Not recorded"}
                    </p>
                    <p className="mt-2 text-sm text-white/70">
                      Player of the Match:{" "}
                      {row.metadata?.playerOfMatchName ?? "Not recorded"}
                    </p>
                    <p className="mt-2 text-sm text-white/50">
                      Recorded {row.metadata?.goalsRecorded ?? 0} of{" "}
                      {row.goalsFor} goals.
                    </p>
                  </div>

                  <div className="rounded-xl border border-white/10 bg-[#0d1428] p-4">
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
                        {row.latestDispute.adminNote ? (
                          <p>
                            <span className="text-white/45">Admin note:</span>{" "}
                            {row.latestDispute.adminNote}
                          </p>
                        ) : null}
                      </div>
                    ) : (
                      <form action={createResultDispute} className="mt-3">
                        <input type="hidden" name="teamid" value={team.id} />
                        <input
                          type="hidden"
                          name="resultId"
                          value={row.fixture.result!.id}
                        />

                        <select
                          name="type"
                          defaultValue="GENERAL"
                          className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none"
                        >
                          <option value="GENERAL">General issue</option>
                          <option value="SCORE">Score issue</option>
                          <option value="PLAYER">Player/scorer issue</option>
                        </select>

                        <textarea
                          name="description"
                          rows={4}
                          placeholder="Explain what is wrong with this result or why it needs review."
                          className="mt-3 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none"
                        />

                        <button
                          type="submit"
                          className="mt-3 rounded-full border border-amber-400/30 bg-amber-500/10 px-4 py-2 text-sm font-medium text-amber-100"
                        >
                          Raise dispute
                        </button>
                      </form>
                    )}
                  </div>
                </div>

                <form
                  action={saveTeamMetadata}
                  className="rounded-xl border border-white/10 bg-[#0d1428] p-4"
                >
                  <input type="hidden" name="teamid" value={team.id} />
                  <input
                    type="hidden"
                    name="resultId"
                    value={row.fixture.result!.id}
                  />
                  <h4 className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-300/80">
                    Edit scorers & POM
                  </h4>
                  <p className="mt-2 text-xs text-white/50">
                    Enter one scorer per line as Name|Goals, for example A.
                    Smith|2
                  </p>
                  <textarea
                    name="scorers"
                    rows={4}
                    defaultValue={row.scorers
                      .map((item) => `${item.name}|${item.goals}`)
                      .join("\n")}
                    className="mt-3 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none"
                  />
                  <input
                    type="text"
                    name="playerOfMatchName"
                    defaultValue={row.metadata?.playerOfMatchName ?? ""}
                    placeholder="Player of the Match"
                    className="mt-3 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none"
                  />
                  <button
                    type="submit"
                    className="mt-3 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-200"
                  >
                    Save metadata
                  </button>
                </form>
              </div>
            </section>
          ))
        )}
      </div>
    </div>
  );
}