import Image from "next/image";

export default function HomePage() {
  return (
    <div className="relative min-h-screen bg-black text-white">
     
      {/* Subtle texture + pitch lines */}
      <div className="pointer-events-none absolute inset-0 opacity-[0.10]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.20),transparent_45%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_bottom,transparent,rgba(0,0,0,0.9))]" />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(255,255,255,0.08)_1px,transparent_1px)] [background-size:48px_48px]" />
        <div className="absolute inset-0 bg-[linear-gradient(0deg,rgba(255,255,255,0.06)_1px,transparent_1px)] [background-size:48px_48px]" />
      </div>

      <header className="relative z-10 mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:py-6">
  <div className="flex items-center gap-4">
    <div className="shrink-0">
      <Image
        src="/logo.png"
        alt="SIXFL"
        width={500}
        height={250}
        priority
        className="w-48 sm:w-64 h-auto object-contain drop-shadow-[0_15px_40px_rgba(0,0,0,0.6)]"
      />
    </div>
  </div>

  <a
    href="mailto:hello@sixfl.co.uk"
    className="rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs font-semibold tracking-wide text-white/85 hover:bg-white/10 transition"
  >
    CONTACT
  </a>
</header>

<main className="relative mx-auto max-w-6xl px-4 pb-20 pt-4">
  {/* Hero */}
  <section className="grid gap-12 lg:grid-cols-12 lg:items-end">
    <div className="lg:col-span-7">
      <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs font-semibold tracking-wide text-white/80">
        <span className="h-2 w-2 rounded-full bg-emerald-500" />
        EARLY ACCESS • UK LAUNCH
      </div>

            <h1 className="mt-6 text-balance text-5xl font-extrabold leading-[0.95] tracking-tight sm:text-6xl">
              6-A-SIDE.
              <br />
              <span className="text-white">DONE</span>{" "}
              <span className="text-emerald-500">PROPERLY.</span>
            </h1>

            <p className="mt-5 max-w-xl text-pretty text-base leading-relaxed text-white/65">
              Fixtures that hold. Tables that update instantly. Captains in control.
              Less admin. More football.
            </p>

            {/* Nike-style CTA row */}
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <a
                href="#waitlist"
                className="inline-flex h-12 items-center justify-center rounded-full bg-emerald-500 px-6 text-sm font-extrabold tracking-wide text-black hover:bg-emerald-400 transition"
              >
                JOIN WAITLIST
              </a>

              <a
                href="#whats-coming"
                className="inline-flex h-12 items-center justify-center rounded-full border border-white/15 bg-white/5 px-6 text-sm font-bold tracking-wide text-white/85 hover:bg-white/10 transition"
              >
                SEE WHAT’S COMING
              </a>
            </div>

            <div className="mt-4 text-xs font-semibold tracking-wide text-emerald-500">
              LIMITED EARLY ACCESS • FIRST LEAGUES OPENING SOON
            </div>
          </div>

          {/* Right panel */}
          <div className="lg:col-span-5">
            <div className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur">
              <div className="flex items-center justify-between">
                <div className="text-xs font-semibold tracking-[0.22em] text-white/70">
                  SIXFL v1
                </div>
                <div className="text-[11px] font-semibold text-white/45">
                  BUILT FOR CAPTAINS
                </div>
              </div>

              <div className="mt-5 grid gap-3">
                <Bullet
                  title="Fixtures that actually work"
                  desc="Clear schedules. Clean match pages. No confusion."
                />
                <Bullet
                  title="Attendance that sticks"
                  desc="Captains confirm squads early to reduce dropouts."
                />
                <Bullet
                  title="Results, tables, done"
                  desc="Fast updates, proper standings, simple admin."
                />
              </div>

              <div className="mt-5 rounded-2xl border border-white/10 bg-black/40 p-4">
                <div className="text-[11px] font-semibold tracking-[0.22em] text-white/60">
                  PLANNED LAUNCH AREAS
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {["YORK", "LEEDS", "HARROGATE", "WETHERBY", "RIPON"].map((x) => (
                    <span
                      key={x}
                      className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-extrabold tracking-wide text-white/80"
                    >
                      {x}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Tiny accent */}
            <div className="mt-4 h-px w-full bg-gradient-to-r from-transparent via-emerald-500/50 to-transparent" />
          </div>
        </section>

        {/* Waitlist */}
        <section id="waitlist" className="mt-14">
          <div className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <div className="text-xs font-semibold tracking-[0.22em] text-white/70">
                  GET THE INVITE
                </div>
                <h2 className="mt-2 text-2xl font-extrabold tracking-tight">
                  Join the SIXFL waitlist.
                </h2>
                <p className="mt-2 text-sm text-white/60">
                  One email at launch. Occasional early-access invites.
                </p>
              </div>
              <div className="text-[11px] font-semibold tracking-wide text-white/45">
                NO SPAM • EVER
              </div>
            </div>

            <form
              action="https://formspree.io/f/xeelpjor"
              method="POST"
              className="mt-5"
            >
              <div className="flex flex-col gap-3 md:flex-row md:items-center">
                <input
                  type="email"
                  name="email"
                  required
                  placeholder="Email address"
                  className="h-12 w-full flex-1 rounded-2xl border border-white/10 bg-black/60 px-4 text-sm text-white placeholder:text-white/35 outline-none focus:border-emerald-500/60"
                />

                <input
                  type="text"
                  name="location"
                  placeholder="Town/City (optional)"
                  className="h-12 w-full md:w-56 rounded-2xl border border-white/10 bg-black/60 px-4 text-sm text-white placeholder:text-white/35 outline-none focus:border-emerald-500/60"
                />

                <input type="hidden" name="source" value="sixfl holding page" />
                <input type="text" name="_gotcha" style={{ display: "none" }} />

                <button
                  type="submit"
                  className="h-12 w-full md:w-auto rounded-2xl bg-emerald-500 px-6 text-sm font-extrabold tracking-wide text-black hover:bg-emerald-400 transition"
                >
                  NOTIFY ME
                </button>
              </div>
            </form>
          </div>
        </section>

        {/* What's coming */}
        <section id="whats-coming" className="mt-14">
          <div className="grid gap-4 md:grid-cols-3">
            <Card
              kicker="CAPTAINS"
              title="Control the chaos"
              desc="Confirm squads early. Reduce last-minute dropouts."
            />
            <Card
              kicker="PLAYERS"
              title="Play more, chase less"
              desc="Clear fixtures, proper tables, fast updates."
            />
            <Card
              kicker="LEAGUES"
              title="Run it clean"
              desc="Simple admin workflows built for 6-a-side."
            />
          </div>
        </section>

        <footer className="mt-16 flex flex-col items-center gap-2 text-center text-xs text-white/45">
          <div className="h-px w-full max-w-6xl bg-white/10" />
          <p className="pt-6">© {new Date().getFullYear()} SIXFL</p>
          <p>
            <a className="underline hover:text-white/70" href="mailto:hello@sixfl.co.uk">
              hello@sixfl.co.uk
            </a>
          </p>
        </footer>
      </main>
    </div>
  );
}

function Bullet({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/40 p-4">
      <div className="flex items-start gap-3">
        <div className="mt-1 h-2.5 w-2.5 rounded-full bg-emerald-500" />
        <div>
          <div className="text-sm font-extrabold tracking-tight text-white">{title}</div>
          <div className="mt-1 text-sm leading-relaxed text-white/60">{desc}</div>
        </div>
      </div>
    </div>
  );
}

function Card({
  kicker,
  title,
  desc,
}: {
  kicker: string;
  title: string;
  desc: string;
}) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur">
      <div className="text-[11px] font-semibold tracking-[0.22em] text-white/60">
        {kicker}
      </div>
      <div className="mt-2 text-xl font-extrabold tracking-tight">{title}</div>
      <div className="mt-2 text-sm leading-relaxed text-white/60">{desc}</div>
      <div className="mt-5 h-px w-full bg-gradient-to-r from-transparent via-emerald-500/40 to-transparent" />
    </div>
  );
}
