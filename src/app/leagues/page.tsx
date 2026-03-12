// ========================================
// File: src/app/leagues/page.tsx
// ========================================

import Image from "next/image";
import Link from "next/link";

export default function LeaguesPage() {
  const leagues = [
    {
      name: "Harrogate Tuesday League",
      location: "Harrogate",
      night: "Tuesday",
      type: "Men's League",
      venue: "Rossett Sports",
      badge: "/leagues/harrogate-tuesday-mens-rossett-sports.png",
      teams: 10,
      capacity: 16,
      href: "/register-team",
      accent: "text-emerald-400",
      button: "bg-emerald-500 hover:bg-emerald-400",
      border: "hover:border-emerald-400/40",
    },
    {
      name: "Leeds Monday League",
      location: "Leeds",
      night: "Monday",
      type: "Men's League",
      venue: "Goals Leeds",
      badge: "/leagues/leeds-monday-mens-goals-leeds.png",
      teams: 6,
      capacity: 16,
      href: "/register-team",
      accent: "text-emerald-400",
      button: "bg-emerald-500 hover:bg-emerald-400",
      border: "hover:border-emerald-400/40",
    },
    {
      name: "York Wednesday League",
      location: "York",
      night: "Wednesday",
      type: "Women's League",
      venue: "Huntington 4G",
      badge: "/leagues/york-wednesday-womens-huntington-4g.png",
      teams: 4,
      capacity: 12,
      href: "/register-team",
      accent: "text-purple-400",
      button: "bg-purple-500 hover:bg-purple-400",
      border: "hover:border-purple-400/40",
    },
    {
      name: "Ripon Sunday League",
      location: "Ripon",
      night: "Sunday",
      type: "Youth League",
      venue: "Ripon Grammar",
      badge: "/leagues/ripon-sunday-youth-ripon-grammar.png",
      teams: 3,
      capacity: 12,
      href: "/register-team",
      accent: "text-sky-400",
      button: "bg-sky-500 hover:bg-sky-400",
      border: "hover:border-sky-400/40",
    },
  ];

  return (
    <main className="min-h-screen bg-black text-white">
      <section className="border-b border-white/10 bg-gradient-to-b from-emerald-950/30 to-black">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8">
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-emerald-400">
            SIXFL Leagues
          </p>

          <h1 className="mt-4 text-4xl font-black tracking-tight sm:text-5xl">
            Find your league.
          </h1>

          <p className="mt-4 max-w-2xl text-lg text-white/70">
            Premium 6-a-side football leagues across Yorkshire. Choose your
            location, pick your night, and register your team.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid justify-items-center gap-6 md:grid-cols-2 xl:grid-cols-3">
          {leagues.map((league) => {
            const spacesLeft = league.capacity - league.teams;

            return (
              <div
                key={league.name}
                className={`group flex h-full w-full max-w-[380px] flex-col overflow-hidden rounded-3xl border border-white/10 bg-white/5 transition ${league.border} hover:bg-white/[0.07]`}
              >
                <div className="flex h-full flex-col gap-6 p-6">
                  <div className="flex items-start gap-5">
                    <div className="shrink-0">
                      <Image
                        src={league.badge}
                        alt={`${league.location} ${league.night} ${league.type} badge`}
                        width={130}
                        height={173}
                        className="h-auto w-[110px] object-contain sm:w-[130px]"
                        priority={league.location === "Harrogate"}
                      />
                    </div>

                    <div className="min-w-0 flex-1">
                      <h2 className="text-2xl font-extrabold tracking-tight text-white">
                        {league.location}
                      </h2>

                      <div className="mt-4 space-y-2 text-sm text-white/75">
                        <p>
                          <span className="font-semibold text-white">Night:</span>{" "}
                          {league.night}
                        </p>
                        <p>
                          <span className="font-semibold text-white">Type:</span>{" "}
                          {league.type}
                        </p>
                        <p>
                          <span className="font-semibold text-white">Venue:</span>{" "}
                          {league.venue}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                    <p
                      className={`text-sm font-semibold uppercase tracking-[0.18em] ${league.accent}`}
                    >
                      League
                    </p>

                    <p className="mt-2 text-lg font-bold text-white">
                      {league.name}
                    </p>

                    <p className="mt-1 text-sm text-white/60">
                      {league.teams}/{league.capacity} teams
                    </p>

                    <p className={`text-sm font-semibold ${league.accent}`}>
                      {spacesLeft} spaces left
                    </p>
                  </div>

                  <Link
                    href={league.href}
                    className={`mt-auto inline-flex h-12 items-center justify-center rounded-full px-6 text-sm font-extrabold uppercase tracking-wide text-black transition ${league.button}`}
                  >
                    Register your team
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </main>
  );
}