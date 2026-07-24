// ========================================
// File: src/components/home/SixflTvHomepageSection.tsx
// ========================================

const SIXFL_TV_CHANNEL_URL =
  "https://youtube.com/@sixfl?si=it2uNcdU3fHIf094";

function SixflTvLogo() {
  return (
    <div className="inline-flex items-center gap-3" aria-label="SIXFL TV">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-red-400/25 bg-red-500/15 shadow-[0_16px_45px_rgba(239,68,68,0.2)] sm:h-16 sm:w-16">
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          className="h-7 w-7 fill-white sm:h-8 sm:w-8"
        >
          <path d="M8 5.5v13l10-6.5-10-6.5Z" />
        </svg>
      </div>

      <div className="flex items-center gap-2 text-3xl font-black tracking-[-0.06em] text-white sm:text-5xl">
        <span>SIXFL</span>
        <span className="rounded-xl border border-fuchsia-300/25 bg-gradient-to-br from-violet-500/45 to-fuchsia-500/35 px-2.5 py-1 text-2xl tracking-[-0.04em] text-white shadow-[0_12px_38px_rgba(168,85,247,0.24)] sm:text-4xl">
          TV
        </span>
      </div>
    </div>
  );
}

export default function SixflTvHomepageSection() {
  return (
    <section aria-labelledby="sixfl-tv-heading">
      <div className="relative overflow-hidden rounded-[1.5rem] border border-violet-400/20 bg-[radial-gradient(circle_at_85%_15%,rgba(236,72,153,0.22),transparent_28%),radial-gradient(circle_at_15%_85%,rgba(139,92,246,0.2),transparent_32%),linear-gradient(135deg,rgba(255,255,255,0.065),rgba(255,255,255,0.025))] p-5 shadow-[0_24px_90px_rgba(0,0,0,0.42)] backdrop-blur-xl sm:rounded-[2rem] sm:p-8 lg:p-10">
        <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-[42%] opacity-15 lg:block">
          <div className="absolute right-10 top-1/2 h-64 w-64 -translate-y-1/2 rounded-full border border-white/20" />
          <div className="absolute right-24 top-1/2 h-40 w-40 -translate-y-1/2 rounded-full border border-white/15" />
          <div className="absolute right-[7.4rem] top-1/2 h-16 w-16 -translate-y-1/2 rounded-full bg-white/10" />
        </div>

        <div className="relative grid gap-8 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:items-center">
          <a
            href={SIXFL_TV_CHANNEL_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="group inline-flex w-fit rounded-3xl border border-white/10 bg-black/35 p-5 transition hover:-translate-y-0.5 hover:border-violet-300/35 hover:bg-black/45 sm:p-6"
            aria-label="Open the SIXFL TV YouTube channel"
          >
            <div>
              <SixflTvLogo />
              <div className="mt-4 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em] text-white/55 transition group-hover:text-white/75">
                <span>Watch on YouTube</span>
                <span aria-hidden="true">↗</span>
              </div>
            </div>
          </a>

          <div>
            <div className="inline-flex rounded-full border border-violet-300/20 bg-violet-400/10 px-4 py-2 text-[11px] font-black uppercase tracking-[0.22em] text-violet-200">
              Matchday on demand
            </div>
            <h2
              id="sixfl-tv-heading"
              className="mt-5 text-3xl font-black tracking-tight text-white sm:text-4xl"
            >
              Watch SIXFL matches, highlights and goals.
            </h2>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-white/68 sm:text-base">
              Selected SIXFL fixtures are recorded and uploaded to SIXFL TV, giving teams and players the chance to watch matches back, relive the best goals and share matchday highlights.
            </p>

            <div className="mt-6 flex flex-wrap gap-2">
              {[
                "Recorded matches",
                "Highlights and goals",
                "Matchday moments",
              ].map((item) => (
                <span
                  key={item}
                  className="rounded-full border border-white/10 bg-black/25 px-3 py-1.5 text-[11px] font-bold tracking-[0.1em] text-white/75"
                >
                  {item}
                </span>
              ))}
            </div>

            <a
              href={SIXFL_TV_CHANNEL_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-7 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-white px-6 text-center text-sm font-extrabold tracking-wide text-black transition hover:scale-[1.02] hover:bg-white/90 sm:w-auto"
            >
              WATCH SIXFL TV
              <span aria-hidden="true">↗</span>
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
