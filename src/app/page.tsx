export default function HomePage() {
  return (
    <div className="relative overflow-hidden">
      {/* Background */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 left-1/2 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-emerald-500/15 blur-3xl" />
        <div className="absolute -bottom-40 left-1/2 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-white/5 blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.10),transparent_55%)]" />
      </div>

      <main className="relative mx-auto max-w-6xl px-4 py-14 sm:py-20">
        {/* Top bar */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {/* Replace this with your real logo image later */}
            <div className="grid h-11 w-11 place-items-center rounded-xl border border-white/10 bg-white/5 shadow-sm">
              <span className="text-lg font-extrabold tracking-wide">
                <span className="text-white">SIX</span>
                <span className="text-emerald-400">FL</span>
              </span>
            </div>
            <div className="leading-tight">
              <div className="text-sm font-semibold text-white">SIXFL</div>
              <div className="text-xs text-white/60">6-a-side football leagues</div>
            </div>
          </div>

          <a
            href="mailto:hello@sixfl.co.uk"
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white/90 hover:bg-white/10"
          >
            Contact
          </a>
        </div>

        {/* Hero + Right card */}
        <div className="mt-14 grid gap-10 lg:grid-cols-2 lg:items-center">
          {/* Left */}
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-white/80">
              <span className="inline-block h-2 w-2 rounded-full bg-emerald-400" />
              Launching soon in the UK
            </div>

            <h1 className="mt-5 text-4xl font-extrabold tracking-tight text-white sm:text-5xl">
              6-a-side football. <br />
              <span className="text-emerald-400">Done properly.</span>
            </h1>

            <p className="mt-4 max-w-xl text-base leading-relaxed text-white/70">
              Join competitive, well-run leagues with reliable teams, proper fixtures, and zero hassle.
              Built for players. Designed for captains.
            </p>

            {/* Notify form */}
            <form
              action="https://formspree.io/f/xeelpjor"
              method="POST"
              className="mt-7 rounded-2xl border border-white/10 bg-white/5 p-4"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <input
                  type="email"
                  name="email"
                  required
                  placeholder="Email for launch updates"
                  className="h-11 w-full flex-1 rounded-xl border border-white/10 bg-black/30 px-4 text-sm text-white placeholder:text-white/40 outline-none ring-0 focus:border-emerald-400/50"
                />

                <input
                  type="text"
                  name="location"
                  placeholder="Your town/city (optional)"
                  className="h-11 w-full sm:w-56 rounded-xl border border-white/10 bg-black/30 px-4 text-sm text-white placeholder:text-white/40 outline-none"
                />

                <input type="hidden" name="source" value="sixfl holding page" />

                <button
                  type="submit"
                  className="h-11 rounded-xl bg-emerald-400 px-5 text-sm font-extrabold text-black hover:bg-emerald-300"
                >
                  Notify me
                </button>
              </div>

              <p className="mt-2 text-xs text-white/50">No spam. One email when we launch.</p>
              <p className="mt-2 text-xs font-semibold text-emerald-400">
                ⚽ Limited early access — first leagues launching soon
              </p>
            </form>

            {/* Social/links */}
            <div className="mt-5 flex flex-wrap gap-3 text-sm">
              <a
                href="#"
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 font-semibold text-white/80 hover:bg-white/10"
              >
                Instagram (soon)
              </a>
              <a
                href="#"
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 font-semibold text-white/80 hover:bg-white/10"
              >
                Facebook (soon)
              </a>
              <a
                href="mailto:hello@sixfl.co.uk"
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 font-semibold text-white/80 hover:bg-white/10"
              >
                hello@sixfl.co.uk
              </a>
            </div>
          </div>

          {/* Right */}
          <div className="relative">
            <div className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl">
              <div className="flex items-center justify-between">
                <div className="text-sm font-bold text-white">What’s coming</div>
                <div className="text-xs font-semibold text-white/60">SIXFL v1</div>
              </div>

              <div className="mt-5 grid gap-4">
                <Feature
                  title="Fixtures that actually work"
                  desc="Clear schedules, instant standings, and clean match views."
                />
                <Feature
                  title="Captains stay in control"
                  desc="Confirm players, manage squads, and avoid last-minute dropouts."
                />
                <Feature
                  title="Serious but social"
                  desc="Competitive leagues with the right balance of quality and enjoyment."
                />
              </div>

              <div className="mt-6 rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="text-xs font-semibold text-white/60">Planned launch areas</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {["York", "Leeds", "Harrogate", "Manchester", "London"].map((x) => (
                    <span
                      key={x}
                      className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-white/80"
                    >
                      {x}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-emerald-500/20 blur-3xl" />
          </div>
        </div>

        {/* Bottom strip */}
        <section className="mt-16 rounded-3xl border border-white/10 bg-white/5 p-6">
          <div className="grid gap-6 md:grid-cols-3">
            <Stat label="Built for" value="Players & Captains" />
            <Stat label="Designed for" value="Fast organising" />
            <Stat label="Focused on" value="Reliable attendance" />
          </div>
        </section>

        <footer className="mt-14 flex flex-col gap-2 text-center text-xs text-white/50">
          <p>© {new Date().getFullYear()} SIXFL. All rights reserved.</p>
          <p className="text-white/40">
            Want early access? Email{" "}
            <a className="underline hover:text-white/70" href="mailto:hello@sixfl.co.uk">
              hello@sixfl.co.uk
            </a>
          </p>
        </footer>
      </main>
    </div>
  );
}

function Feature({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <div className="flex items-start gap-3">
        <div className="mt-1 h-3.5 w-3.5 rounded-full bg-emerald-400" />
        <div>
          <div className="text-sm font-extrabold text-white">{title}</div>
          <div className="mt-1 text-sm leading-relaxed text-white/65">{desc}</div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
      <div className="text-xs font-semibold text-white/50">{label}</div>
      <div className="mt-1 text-lg font-extrabold text-white">{value}</div>
    </div>
  );
}