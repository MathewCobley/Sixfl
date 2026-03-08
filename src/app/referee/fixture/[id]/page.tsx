/ src/app/referee/fixture/[id]/page.tsx

import Link from "next/link";
import { notFound } from "next/navigation";
import { requireReferee } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { FixtureStatus } from "@prisma/client";
import { submitRefereeResultAction } from "../../actions";

function formatDate(d: Date) {
  return d.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function formatTime(d: Date) {
  return d.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getStatusBadgeClasses(status: FixtureStatus) {
  switch (status) {
    case "COMPLETED":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
    case "POSTPONED":
      return "border-amber-500/30 bg-amber-500/10 text-amber-300";
    case "CANCELLED":
      return "border-red-500/30 bg-red-500/10 text-red-300";
    case "SCHEDULED":
    default:
      return "border-white/10 bg-white/5 text-white/80";
  }
}

function formatStatusLabel(status: FixtureStatus) {
  return status.charAt(0) + status.slice(1).toLowerCase();
}

export default async function RefereeFixturePage({
  params,
}: {
  params: { id: string };
}) {
  const { user } = await requireReferee();

  const fixture = await prisma.fixture.findUnique({
    where: { id: params.id },
    include: {
      league: {
        select: {
          id: true,
          name: true,
          season: true,
        },
      },
      homeTeam: {
        select: {
          id: true,
          name: true,
        },
      },
      awayTeam: {
        select: {
          id: true,
          name: true,
        },
      },
      venue: {
        select: {
          id: true,
          name: true,
        },
      },
      referee: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      result: {
        select: {
          id: true,
          homeScore: true,
          awayScore: true,
          enteredAt: true,
          isDisputed: true,
          disputeNote: true,
        },
      },
    },
  });

  if (!fixture) {
    notFound();
  }

  const canAccess =
    fixture.refereeId === user.id || user.role === "ADMIN";

  if (!canAccess) {
    notFound();
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-white">
            Enter Match Result
          </h1>
          <p className="mt-1 text-sm text-white/70">
            Submit the final score for this fixture.
          </p>
        </div>

        <Link
          href="/referee"
          className="rounded-xl border border-white/10 bg-black/20 px-4 py-2 text-sm text-white hover:bg-black/30"
        >
          Back to referee dashboard
        </Link>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
        <div className="flex flex-wrap items-center gap-2 text-xs text-white/60">
          <span>{formatDate(fixture.kickoffAt)}</span>
          <span>•</span>
          <span>{formatTime(fixture.kickoffAt)}</span>

          {fixture.round ? (
            <>
              <span>•</span>
              <span>Round {fixture.round}</span>
            </>
          ) : null}

          {fixture.league ? (
            <>
              <span>•</span>
              <span>
                {fixture.league.name}
                {fixture.league.season ? ` — ${fixture.league.season}` : ""}
              </span>
            </>
          ) : null}

          {fixture.venue?.name ? (
            <>
              <span>•</span>
              <span>{fixture.venue.name}</span>
            </>
          ) : null}
        </div>

        <div className="mt-4 text-lg text-white">
          <span className="font-semibold">{fixture.homeTeam.name}</span>{" "}
          <span className="text-white/50">vs</span>{" "}
          <span className="font-semibold">{fixture.awayTeam.name}</span>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <span
            className={`inline-flex rounded-full border px-2 py-1 text-xs ${getStatusBadgeClasses(
              fixture.status
            )}`}
          >
            {formatStatusLabel(fixture.status)}
          </span>

          {fixture.referee ? (
            <span className="text-xs text-white/60">
              Referee: {fixture.referee.name ?? fixture.referee.email}
            </span>
          ) : null}
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
        <h2 className="text-lg font-semibold text-white">Result</h2>

        <form action={submitRefereeResultAction} className="mt-4 space-y-4">
          <input type="hidden" name="fixtureId" value={fixture.id} />

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label
                htmlFor="homeScore"
                className="block text-sm text-white/70"
              >
                {fixture.homeTeam.name} score
              </label>
              <input
                id="homeScore"
                name="homeScore"
                type="number"
                min={0}
                step={1}
                defaultValue={fixture.result?.homeScore ?? 0}
                className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none"
                required
              />
            </div>

            <div className="space-y-2">
              <label
                htmlFor="awayScore"
                className="block text-sm text-white/70"
              >
                {fixture.awayTeam.name} score
              </label>
              <input
                id="awayScore"
                name="awayScore"
                type="number"
                min={0}
                step={1}
                defaultValue={fixture.result?.awayScore ?? 0}
                className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none"
                required
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              className="rounded-xl border border-emerald-500/30 bg-emerald-500/15 px-4 py-2 text-sm text-emerald-300 hover:bg-emerald-500/20"
            >
              {fixture.result ? "Update result" : "Submit result"}
            </button>

            <Link
              href="/referee"
              className="rounded-xl border border-white/10 bg-black/20 px-4 py-2 text-sm text-white hover:bg-black/30"
            >
              Cancel
            </Link>
          </div>
        </form>
      </div>

      {fixture.result ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
          <h2 className="text-lg font-semibold text-white">Current result</h2>

          <div className="mt-3 text-sm text-white/70">
            Score recorded: {fixture.homeTeam.name} {fixture.result.homeScore} -{" "}
            {fixture.result.awayScore} {fixture.awayTeam.name}
          </div>

          <div className="mt-2 text-xs text-white/50">
            Entered {formatDate(fixture.result.enteredAt)} at{" "}
            {formatTime(fixture.result.enteredAt)}
          </div>

          {fixture.result.isDisputed ? (
            <div className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-sm text-amber-200">
              This result has been marked as disputed.
              {fixture.result.disputeNote
                ? ` Note: ${fixture.result.disputeNote}`
                : ""}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}