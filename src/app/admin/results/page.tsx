// src/app/admin/results/page.tsx

import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

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

export default async function AdminResultsPage() {
  await requireAdmin();

  const fixtures = await prisma.fixture.findMany({
    orderBy: { kickoffAt: "desc" },
    include: {
      homeTeam: { select: { name: true } },
      awayTeam: { select: { name: true } },
      result: { select: { homeScore: true, awayScore: true } },
    },
  });

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-2xl font-semibold">Enter Results</h1>

      <div className="rounded-xl border border-white/10 divide-y divide-white/10">
        {fixtures.map((fixture) => (
          <div
            key={fixture.id}
            className="flex items-center justify-between p-4"
          >
            <div className="space-y-1">
              <div className="text-sm text-white/60">
                {formatDate(fixture.kickoffAt)} • {formatTime(fixture.kickoffAt)}
              </div>

              <div className="text-sm">
                <span className="font-medium">
                  {fixture.homeTeam.name}
                </span>{" "}
                vs{" "}
                <span className="font-medium">
                  {fixture.awayTeam.name}
                </span>

                {fixture.result && (
                  <span className="ml-3 text-white/70">
                    ({fixture.result.homeScore}-{fixture.result.awayScore})
                  </span>
                )}
              </div>
            </div>

            <Link
              href={`/referee/fixture/${fixture.id}`}
              className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-sm text-emerald-300 hover:bg-emerald-500/20"
            >
              Enter Result
            </Link>
          </div>
        ))}

        {fixtures.length === 0 && (
          <div className="p-4 text-white/60">No fixtures found</div>
        )}
      </div>
    </div>
  );
}