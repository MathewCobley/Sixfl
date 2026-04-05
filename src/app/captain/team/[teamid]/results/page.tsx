// ========================================
// File: src/app/captain/team/[teamid]/results/page.tsx
// ========================================

import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";
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
  dispute?: string;
};

function formatDate(date: Date) {
  return date.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function getGoalsFor(result: { homeScore: number; awayScore: number }, isHome: boolean) {
  return isHome ? result.homeScore : result.awayScore;
}

function getGoalsAgainst(result: { homeScore: number; awayScore: number }, isHome: boolean) {
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
      if (parts.length < 2) {
        throw new Error(`Scorer line must look like Name|2. Invalid line: ${line}`);
      }

      const goals = Number(parts[1]);
      if (!Number.isInteger(goals) || goals < 1) {
        throw new Error(`Goals must be a whole number. Invalid line: ${line}`);
      }

      return {
        name: parts[0],
        goals,
      };
    });
}

async function saveTeamMetadata(formData: FormData) {
  "use server";

  const teamid = String(formData.get("teamid") ?? "");
  const resultId = String(formData.get("resultId") ?? "");
  const scorerText = String(formData.get("scorers") ?? "");
  const playerOfMatchName = String(formData.get("playerOfMatchName") ?? "").trim();

  await requireCaptain(teamid);

  const result = await prisma.matchResult.findUnique({
    where: { id: resultId },
    include: { fixture: true },
  });

  if (!result) {
    throw new Error("Result not found.");
  }

  const isHome = result.fixture.homeTeamId === teamid;
  const goalsExpected = isHome ? result.homeScore : result.awayScore;
  const scorers = scorerText.trim() ? parseScorers(scorerText) : [];
  const goalsRecorded = scorers.reduce((sum, row) => sum + row.goals, 0);

  if (goalsRecorded > goalsExpected) {
    throw new Error("Recorded scorer goals cannot exceed the official result.");
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
}

async function submitDispute(formData: FormData) {
  "use server";

  const teamid = String(formData.get("teamid") ?? "");
  const resultId = String(formData.get("resultId") ?? "");
  const disputeType = String(formData.get("disputeType") ?? "OTHER") as ResultDisputeType;
  const description = String(formData.get("description") ?? "").trim();

  await requireCaptain(teamid);

  if (!description) {
    throw new Error("Please add a short description for the dispute.");
  }

  const existing = await prisma.resultDispute.findFirst({
    where: {
      matchResultId: resultId,
      teamId: teamid,
      status: {
        in: [ResultDisputeStatus.OPEN, ResultDisputeStatus.UNDER_REVIEW],
      },
    },
  });

  if (existing) {
    throw new Error("There is already an active dispute for this result.");
  }

  await prisma.resultDispute.create({
    data: {
      matchResultId: resultId,
      teamId: teamid,
      disputeType,
      description,
      status: ResultDisputeStatus.OPEN,
    },
  });

  await prisma.matchResult.update({
    where: { id: resultId },
    data: {
      isDisputed: true,
      disputeNote: description,
    },
  });

  revalidatePath(`/captain/team/${teamid}`);
  revalidatePath(`/captain/team/${teamid}/results`);
  revalidatePath(`/admin/results`);
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

  if (!team) notFound();

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
            where: { teamId: teamid },
            orderBy: { createdAt: "desc" },
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
      const meta = fixture.result!.teamMetadata.find((item) => item.teamId === teamid) ?? null;
      const scorers = Array.isArray(meta?.scorers) ? (meta!.scorers as Array<{ name: string; goals: number }>) : [];
      const needsScorers = (meta?.goalsRecorded ?? 0) < goalsFor;
      const needsPom = !meta?.playerOfMatchName;
      const latestDispute = fixture.result!.disputes[0] ?? null;

      return {
        fixture,
        opponent,
        goalsFor,
        goalsAgainst,
        outcome,
        meta,
        scorers,
        needsScorers,
        needsPom,
        latestDispute,
      };
    })
    .filter((row) => {
      if (filters.outcome && row.outcome !== filters.outcome) return false;
      if (filters.needsCompletion === "1" && !(row.needsScorers || row.needsPom)) return false;
      if (filters.dispute === "open" && !row.latestDispute) return false;
      if (!query) return true;
      return [
        row.opponent,
        row.meta?.playerOfMatchName ?? "",
        ...row.scorers.map((item) => item.name),
      ]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-white/10 bg-white/5 p-6">
        <p className="text-sm uppercase tracking-[0.2em] text-emerald-300/80">Page title</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Results</h1>
        <p className="mt-2 text-sm text-white/65">
          Search results, complete scorers and Player of the Match, and raise disputes for official-score issues.
        </p>
      </section>

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
            <input type="checkbox" name="needsCompletion" value="1" defaultChecked={filters.needsCompletion === "1"} />
            Needs completion
          </label>
          <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-[#0d1428] px-4 py-3 text-sm text-white/80">
            <input type="checkbox" name="dispute" value="open" defaultChecked={filters.dispute === "open"} />
            Active dispute
          </label>
          <button
            type="submit"
            className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm font-medium text-emerald-200 md:col-span-4 md:justify-self-start"
          >
            Apply filters
          </button>
        </form>
      </section>

      <div className="space-y-4">
        {rows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/10 bg-white/5 p-6 text-white/60">
            No results matched the current filters.
          </div>
        ) : (
          rows.map((row) => {
            const disputeStatusLabel = row.latestDispute?.status
              ? row.latestDispute.status.replaceAll("_", " ").toLowerCase()
              : null;

            return (
              <section key={row.fixture.id} className="rounded-2xl border border-white/10 bg-white/5 p-6">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <p className="text-sm text-white/55">{formatDate(row.fixture.kickoffAt)}</p>
                    <h3 className="mt-1 text-2xl font-semibold">
                      {row.fixture.homeTeam.name} {row.fixture.result!.homeScore}-{row.fixture.result!.awayScore} {row.fixture.awayTeam.name}
                    </h3>
                    <p className="mt-2 text-sm text-white/65">Your opponent: {row.opponent}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1 text-sm text-emerald-200">
                      {row.outcome}
                    </span>
                    <span className="rounded-full border border-white/10 px-3 py-1 text-sm text-white/70">
                      {row.needsScorers || row.needsPom ? "Needs completion" : "Complete"}
                    </span>
                    {disputeStatusLabel ? (
                      <span className="rounded-full border border-red-400/30 bg-red-500/10 px-3 py-1 text-sm text-red-200">
                        {disputeStatusLabel}
                      </span>
                    ) : null}
                  </div>
                </div>

                <div className="mt-5 grid gap-6 lg:grid-cols-2">
                  <div className="rounded-xl border border-white/10 bg-[#0d1428] p-4">
                    <h4 className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-300/80">
                      Current metadata
                    </h4>
                    <p className="mt-3 text-sm text-white/70">
                      Scorers:{" "}
                      {row.scorers.length > 0
                        ? row.scorers.map((item) => `${item.name} x${item.goals}`).join(", ")
                        : "Not recorded"}
                    </p>
                    <p className="mt-2 text-sm text-white/70">
                      Player of the Match: {row.meta?.playerOfMatchName ?? "Not recorded"}
                    </p>
                    <p className="mt-2 text-sm text-white/50">
                      Recorded {row.meta?.goalsRecorded ?? 0} of {row.goalsFor} goals.
                    </p>
                    {row.latestDispute ? (
                      <div className="mt-4 rounded-xl border border-red-400/20 bg-red-500/10 p-3 text-sm text-red-100/90">
                        <p className="font-medium">Latest dispute</p>
                        <p className="mt-1">{row.latestDispute.description}</p>
                        <p className="mt-2 text-red-100/70">
                          Status: {row.latestDispute.status.replaceAll("_", " ").toLowerCase()}
                        </p>
                        {row.latestDispute.adminNote ? (
                          <p className="mt-2 text-red-100/70">Admin note: {row.latestDispute.adminNote}</p>
                        ) : null}
                      </div>
                    ) : null}
                  </div>

                  <div className="space-y-4">
                    <form action={saveTeamMetadata} className="rounded-xl border border-white/10 bg-[#0d1428] p-4">
                      <input type="hidden" name="teamid" value={team.id} />
                      <input type="hidden" name="resultId" value={row.fixture.result!.id} />
                      <h4 className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-300/80">
                        Edit scorers & POM
                      </h4>
                      <p className="mt-2 text-xs text-white/50">
                        Enter one scorer per line as Name|Goals, for example A. Smith|2
                      </p>
                      <textarea
                        name="scorers"
                        rows={4}
                        defaultValue={row.scorers.map((item) => `${item.name}|${item.goals}`).join("\n")}
                        className="mt-3 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none"
                      />
                      <input
                        type="text"
                        name="playerOfMatchName"
                        defaultValue={row.meta?.playerOfMatchName ?? ""}
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

                    <form action={submitDispute} className="rounded-xl border border-white/10 bg-[#0d1428] p-4">
                      <input type="hidden" name="teamid" value={team.id} />
                      <input type="hidden" name="resultId" value={row.fixture.result!.id} />
                      <h4 className="text-sm font-semibold uppercase tracking-[0.2em] text-red-300/80">
                        Report issue
                      </h4>
                      <select
                        name="disputeType"
                        defaultValue={ResultDisputeType.WRONG_SCORE}
                        className="mt-3 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none"
                      >
                        <option value={ResultDisputeType.WRONG_SCORE}>Wrong score</option>
                        <option value={ResultDisputeType.WRONG_FIXTURE_DETAILS}>Wrong fixture details</option>
                        <option value={ResultDisputeType.WRONG_OPPONENT}>Wrong opponent/team</option>
                        <option value={ResultDisputeType.ELIGIBILITY}>Player eligibility issue</option>
                        <option value={ResultDisputeType.DUPLICATE_OR_MISSING}>Duplicate or missing result</option>
                        <option value={ResultDisputeType.OTHER}>Other</option>
                      </select>
                      <textarea
                        name="description"
                        rows={3}
                        placeholder="Tell admin what needs checking"
                        className="mt-3 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none"
                      />
                      <button
                        type="submit"
                        className="mt-3 rounded-full border border-red-400/30 bg-red-500/10 px-4 py-2 text-sm font-medium text-red-200"
                      >
                        Submit dispute
                      </button>
                    </form>
                  </div>
                </div>
              </section>
            );
          })
        )}
      </div>
    </div>
  );
}
