import { prisma } from "@/lib/prisma";
import Link from "next/link";

export default async function ManagerPage() {
  const session = { user: { email: "test@sixfl.com" } };

  const fixtures = await prisma.fixture.findMany({
    orderBy: { kickoffAt: "asc" },
    take: 10,
    include: { homeTeam: true, awayTeam: true },
  });

  return (
    <div className="mx-auto max-w-6xl p-6 text-white">
      <h1 className="text-4xl font-extrabold">Manager Dashboard</h1>
      <p className="mt-2 text-white/70">Signed in as: {session.user.email}</p>

      <div className="mt-10 grid grid-cols-1 gap-8 md:grid-cols-2">
        <section className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <h2 className="mb-4 text-xl font-bold">My Teams</h2>
          <div className="rounded-lg border border-white/10 bg-black/30 p-4">
            My First Team
          </div>
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <h2 className="mb-4 text-xl font-bold">Upcoming Fixtures</h2>

          {fixtures.length === 0 ? (
            <p className="text-sm text-white/60">No upcoming fixtures.</p>
          ) : (
            <div className="space-y-3">
              {fixtures.map((fixture) => (
                <Link key={fixture.id} href={`/manager/fixtures/${fixture.id}`}>
                  <div className="cursor-pointer rounded-lg border border-white/10 bg-white/5 p-4 transition hover:bg-white/10">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold">
                        {fixture.homeTeam.name} vs {fixture.awayTeam.name}
                      </span>

                      <span className="font-bold text-emerald-400">
                        {fixture.homeScore != null && fixture.awayScore != null
                          ? `${fixture.homeScore} - ${fixture.awayScore}`
                          : "- : -"}
                      </span>
                    </div>

                    <div className="mt-1 text-sm text-white/60">
                      {new Date(fixture.kickoffAt).toLocaleString()} •{" "}
                      {fixture.venue ?? "TBC"}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}