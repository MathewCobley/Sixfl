import { prisma } from "@/lib/prisma";
import Link from "next/link";
import ScoreForm from "./score-form";

type Params = { id?: string };

export default async function FixturePage({
  params,
}: {
  params: Params | Promise<Params>;
}) {
  const { id } = await Promise.resolve(params);

  if (!id || typeof id !== "string") {
    return (
      <div className="mx-auto max-w-3xl p-6 text-white">
        <p className="text-white/70">Missing fixture id in URL.</p>
        <Link className="text-emerald-400 underline" href="/manager">
          Back to dashboard
        </Link>
      </div>
    );
  }

  const fixture = await prisma.fixture.findUnique({
    where: { id },
    include: { homeTeam: true, awayTeam: true },
  });

  if (!fixture) {
    return (
      <div className="mx-auto max-w-3xl p-6 text-white">
        <p className="text-white/70">Fixture not found.</p>
        <Link className="text-emerald-400 underline" href="/manager">
          Back to dashboard
        </Link>
      </div>
    );
  }

  const dt = new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(fixture.kickoffAt));

  const hasScore = fixture.homeScore != null && fixture.awayScore != null;

  return (
    <div className="mx-auto max-w-3xl p-6 text-white">
      <Link className="text-white/60 hover:text-white" href="/manager">
        ← Back
      </Link>

      <h1 className="mt-4 text-2xl font-bold">
        {fixture.homeTeam.name} vs {fixture.awayTeam.name}
      </h1>

      <div className="mt-2 text-white/60">
        {dt} • {fixture.venue ?? "TBC"}
      </div>

      <div className="mt-6 rounded-xl border border-white/10 bg-white/5 p-5">
        <div className="text-sm text-white/60">Result</div>

        {hasScore ? (
          <div className="mt-2 text-3xl font-extrabold">
            {fixture.homeScore} - {fixture.awayScore}
          </div>
        ) : (
          <div className="mt-2 text-white/70">No result yet.</div>
        )}
      </div>

      {/* ✅ Score entry form goes HERE */}
      <ScoreForm fixtureId={fixture.id} />
    </div>
  );
}