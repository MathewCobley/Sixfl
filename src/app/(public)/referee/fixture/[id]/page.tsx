import { notFound } from "next/navigation";
import { FixtureStatus } from "@prisma/client";

import RefereeAppShell from "@/components/referee/RefereeAppShell";
import { requireReferee } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { submitRefereeResultAction } from "../../actions";

function formatDate(d: Date) {
  return d.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
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
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-200";
    case "POSTPONED":
      return "border-amber-500/30 bg-amber-500/10 text-amber-200";
    case "CANCELLED":
      return "border-red-500/30 bg-red-500/10 text-red-200";
    default:
      return "border-white/10 bg-white/5 text-white/70";
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
      league: { select: { id: true, name: true, season: true } },
      homeTeam: { select: { id: true, name: true } },
      awayTeam: { select: { id: true, name: true } },
      venue: { select: { id: true, name: true } },
      referee: { select: { id: true, name: true, email: true } },
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

  if (!fixture) notFound();
  if (fixture.refereeId !== user.id && user.role !== "ADMIN") notFound();

  return (
    <RefereeAppShell active="nights" title="Match result">
      <section className="rounded-[1.35rem] border border-white/10 bg-white/[0.035] p-3.5">
        <div className="flex items-center justify-between gap-3">
          <span className={`inline-flex rounded-lg border px-2.5 py-1 text-[10px] font-bold ${getStatusBadgeClasses(fixture.status)}`}>
            {formatStatusLabel(fixture.status)}
          </span>
          <span className="text-xs text-white/45">
            {formatDate(fixture.kickoffAt)} · {formatTime(fixture.kickoffAt)}
          </span>
        </div>

        <p className="mt-3 text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-300/70">
          {fixture.league?.name || "SIXFL"}
          {fixture.league?.season ? ` · ${fixture.league.season}` : ""}
        </p>
        <h1 className="mt-1 text-lg font-black leading-tight text-white">
          {fixture.homeTeam.name} <span className="text-white/35">v</span> {fixture.awayTeam.name}
        </h1>
        <p className="mt-1 text-xs text-white/45">
          {fixture.venue?.name || "Venue TBC"}
          {fixture.round ? ` · Week ${fixture.round}` : ""}
        </p>
      </section>

      <section className="rounded-[1.35rem] border border-emerald-400/20 bg-emerald-500/[0.07] p-3.5">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-300/75">
          Final score
        </p>

        <form action={submitRefereeResultAction} className="mt-3">
          <input type="hidden" name="fixtureId" value={fixture.id} />

          <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
            <label className="min-w-0 text-center">
              <span className="block truncate text-xs font-bold text-white/70">
                {fixture.homeTeam.name}
              </span>
              <input
                name="homeScore"
                type="number"
                min={0}
                step={1}
                defaultValue={fixture.result?.homeScore ?? 0}
                aria-label={`${fixture.homeTeam.name} score`}
                className="mt-2 h-16 w-full rounded-xl border border-white/10 bg-black/35 px-2 text-center text-2xl font-black text-white outline-none focus:border-emerald-400/50"
                required
              />
            </label>
            <div className="pb-5 text-sm font-bold text-white/30">–</div>
            <label className="min-w-0 text-center">
              <span className="block truncate text-xs font-bold text-white/70">
                {fixture.awayTeam.name}
              </span>
              <input
                name="awayScore"
                type="number"
                min={0}
                step={1}
                defaultValue={fixture.result?.awayScore ?? 0}
                aria-label={`${fixture.awayTeam.name} score`}
                className="mt-2 h-16 w-full rounded-xl border border-white/10 bg-black/35 px-2 text-center text-2xl font-black text-white outline-none focus:border-emerald-400/50"
                required
              />
            </label>
          </div>

          <button
            type="submit"
            className="mt-3 min-h-12 w-full rounded-xl bg-emerald-400 px-5 text-sm font-black text-[#04130c] active:bg-emerald-300"
          >
            {fixture.result ? "Update score" : "Save score"}
          </button>
        </form>
      </section>

      {fixture.result ? (
        <section className="rounded-[1.2rem] border border-white/10 bg-black/20 p-3.5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/40">Saved result</p>
              <p className="mt-1 text-sm font-black text-white">
                {fixture.homeTeam.name} {fixture.result.homeScore}–{fixture.result.awayScore} {fixture.awayTeam.name}
              </p>
            </div>
            <span className="text-[10px] text-white/35">
              {formatTime(fixture.result.enteredAt)}
            </span>
          </div>
          {fixture.result.isDisputed ? (
            <div className="mt-3 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2.5 text-xs leading-5 text-amber-100">
              Result disputed{fixture.result.disputeNote ? `: ${fixture.result.disputeNote}` : "."}
            </div>
          ) : null}
        </section>
      ) : null}
    </RefereeAppShell>
  );
}
