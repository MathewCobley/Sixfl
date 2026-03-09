import Link from "next/link";

export default function HomePage() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-black text-white">
      {/* Background */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(16,185,129,0.16),transparent_24%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_75%_18%,rgba(16,185,129,0.10),transparent_18%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.08),transparent_28%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(255,255,255,0.04),transparent_20%,rgba(0,0,0,0.7))]" />
        <div className="absolute inset-0 opacity-[0.08] bg-[linear-gradient(90deg,rgba(255,255,255,0.10)_1px,transparent_1px)] [background-size:56px_56px]" />
        <div className="absolute inset-0 opacity-[0.06] bg-[linear-gradient(0deg,rgba(255,255,255,0.10)_1px,transparent_1px)] [background-size:56px_56px]" />
      </div>

      {/* Hero spotlight */}
      <div className="pointer-events-none absolute left-1/2 top-24 h-[420px] w-[420px] -translate-x-1/2 rounded-full bg-emerald-500/10 blur-[120px]" />

      <main className="relative mx-auto max-w-6xl px-4 pb-20 pt-0">
        {/* HERO */}
        <section className="grid gap-10 pt-6 lg:grid-cols-12 lg:items-start">
          {/* LEFT */}
          <div className="lg:col-span-7">
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <div className="inline-flex rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] font-bold tracking-[0.28em] text-white/55">
                SIXFL
              </div>

              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-4 py-2 text-[11px] font-bold tracking-[0.18em] text-emerald-300">
                <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.8)]" />
                EARLY ACCESS • UK LAUNCH
              </div>
            </div>

            <h1 className="text-balance text-5xl font-extrabold leading-[0.95] tracking-tight sm:text-6xl animate-fadeIn">
              6-A-SIDE.
              <br />
              <span className="text-white">DONE</span>{" "}
              <span className="text-emerald-500 animate-glow drop-shadow-[0_0_30px_rgba(16,185,129,0.6)]">
                PROPERLY.
              </span>
            </h1>

            <p className="mt-5 max-w-2xl text-base leading-7 text-white/65 sm:text-lg">
              Fixtures that hold. Tables that update instantly. Captains in
              control.
              <br />
              Less admin. More football.
            </p>

            <p className="mt-4 max-w-2xl text-sm leading-7 text-white/55 sm:text-base">
              Men’s, women’s and youth leagues. Join with a full team or register
              as a player if you’re still looking for one.
            </p>

            <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link
                href="/register-team"
                className="inline-flex h-12 items-center justify-center rounded-full bg-emerald-500 px-6 text-sm font-extrabold tracking-wide text-black transition hover:scale-[1.02] hover:bg-emerald-400"
              >
                REGISTER YOUR TEAM
              </Link>

              <Link
                href="/join-as-player"
                className="inline-flex h-12 items-center justify-center rounded-full border border-white/10 bg-white/5 px-6 text-sm font-extrabold tracking-wide text-white transition hover:bg-white/10"
              >
                JOIN AS A PLAYER
              </Link>
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-4 py-2 text-[12px] font-semibold text-emerald-300">
                <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.8)]" />
                Early interest building across North Yorkshire
              </div>

              <div className="text-[12px] text-white/45">
                York, Leeds, Harrogate and Ripon targeted for first launch areas.
              </div>
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <Link
                href="/referrals"
                className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-[12px] font-semibold text-white/90 transition hover:bg-white/10"
              >
                <span className="text-emerald-400 drop-shadow-[0_0_10px_rgba(16,185,129,0.6)]">
                  £50
                </span>
                for introducing a new team
                <span className="text-white/50">→</span>
              </Link>

              <span className="text-[12px] text-white/40">
                Paid after registration + first payment.
              </span>
            </div>

            <div className="mt-4 text-xs font-bold tracking-[0.18em] text-emerald-500">
              LIMITED EARLY ACCESS • FIRST LEAGUES OPENING SOON
            </div>
          </div>

          {/* RIGHT PANEL */}
          <div className="lg:col-span-5">
            <div className="rounded-[28px] border border-white/10 bg-white/[0.06] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-xl">
              <div className="flex items-center justify-between">
                <div className="text-[11px] font-bold tracking-[0.24em] text-white/65">
                  SIXFL PLATFORM
                </div>

                <div className="rounded-full border border-white/10 bg-black/40 px-3 py-1 text-[10px] font-bold tracking-[0.18em] text-white/45">
                  BUILT FOR CAPTAINS
                </div>
              </div>

              <div className="mt-6 grid gap-3">
                <Bullet
                  title="Fixtures that actually work"
                  desc="Clear schedules. Clean match pages. No confusion."
                />
                <Bullet
                  title="Tables that feel live"
                  desc="Fast updates. Proper standings. A sharper league experience."
                />
                <Bullet
                  title="Admin without the mess"
                  desc="Simple workflows built specifically for well run 6-a-side leagues."
                />
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <MiniPanel
                  label="LEAGUE TYPES"
                  items={["MEN’S", "WOMEN’S", "YOUTH"]}
                />

                <MiniPanel
                  label="WAYS TO JOIN"
                  items={["FULL TEAM", "INDIVIDUAL PLAYER"]}
                />
              </div>
            </div>
          </div>
        </section>

        {/* FLOATING GLASS STRIP */}
        <section className="mt-10">
          <div className="grid gap-3 rounded-[28px] border border-white/10 bg-white/[0.05] p-4 shadow-[0_20px_80px_rgba(0,0,0,0.35)] backdrop-blur-xl md:grid-cols-4">
            <StripItem label="FORMAT" value="Men’s" />
            <StripItem label="FORMAT" value="Women’s" />
            <StripItem label="FORMAT" value="Youth" />
            <StripItem label="JOIN AS" value="Team or Player" />
          </div>
        </section>

        {/* PATHWAYS */}
        <section id="pathways" className="mt-16">
          <div className="mb-6">
            <div className="text-[11px] font-bold tracking-[0.24em] text-white/60">
              ONE LEAGUE. MULTIPLE PATHWAYS.
            </div>
            <h2 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">
              Built for every kind of player.
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-white/60 sm:text-base">
              Whether you already run a team or you are looking for one, SIXFL
              is being built to give men’s, women’s and youth football a more
              professional, structured experience.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <PathwayCard
              title="Men’s Leagues"
              desc="Competitive 6-a-side football with proper fixtures, live tables and a cleaner weekly experience."
            />
            <PathwayCard
              title="Women’s Leagues"
              desc="Well-run leagues for women’s teams who want consistency, quality and properly organised football."
            />
            <PathwayCard
              title="Youth Leagues"
              desc="Structured football for younger players in a serious league environment with referees, fixtures and tables."
            />
          </div>
        </section>

        {/* HOW IT WORKS */}
        <section id="how-it-works" className="mt-16">
          <div className="mb-6">
            <div className="text-[11px] font-bold tracking-[0.24em] text-white/60">
              HOW SIXFL WORKS
            </div>
            <h2 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">
              Join as a team or as a player.
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-white/60 sm:text-base">
              The aim is straightforward: make it easier to register, easier to
              join and easier to trust that your league is being run properly.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-4">
            <StepCard
              number="01"
              title="Choose how you join"
              desc="Register a full team or join as an individual player."
            />
            <StepCard
              number="02"
              title="Pick your area"
              desc="Tell us your town or city so we can place you in the right launch area."
            />
            <StepCard
              number="03"
              title="Select your format"
              desc="Men’s, women’s or youth — depending on the type of football you want."
            />
            <StepCard
              number="04"
              title="Get launch access"
              desc="We contact you first when spaces open in your area or when teams need players."
            />
          </div>
        </section>

        {/* FINAL CTA */}
        <section id="final-cta" className="mt-16">
          <div className="rounded-[32px] border border-white/10 bg-white/[0.05] p-6 shadow-[0_24px_90px_rgba(0,0,0,0.38)] backdrop-blur-xl sm:p-8">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-2xl">
                <div className="text-[11px] font-bold tracking-[0.24em] text-white/60">
                  EARLY ACCESS REGISTRATION
                </div>
                <h2 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">
                  Ready to get involved with SIXFL?
                </h2>
                <p className="mt-3 text-sm leading-7 text-white/60 sm:text-base">
                  Register your team now, or join as a player and we’ll let you
                  know when launch spaces open in your area.
                </p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/register-team"
                  className="inline-flex h-12 items-center justify-center rounded-full bg-emerald-500 px-6 text-sm font-extrabold tracking-wide text-black transition hover:scale-[1.02] hover:bg-emerald-400"
                >
                  REGISTER YOUR TEAM
                </Link>

                <Link
                  href="/join-as-player"
                  className="inline-flex h-12 items-center justify-center rounded-full border border-white/10 bg-white/5 px-6 text-sm font-extrabold tracking-wide text-white transition hover:bg-white/10"
                >
                  JOIN AS A PLAYER
                </Link>
              </div>
            </div>
          </div>
        </section>

        <footer className="mt-16 flex flex-col items-center gap-2 text-center text-xs text-white/45">
          <div className="h-px w-full max-w-6xl bg-white/10" />
          <p className="pt-6">© {new Date().getFullYear()} SIXFL</p>
          <p>
            <a
              className="underline transition hover:text-white/70"
              href="mailto:hello@sixfl.co.uk"
            >
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
    <div className="rounded-2xl border border-white/10 bg-black/40 p-4 transition hover:bg-black/50">
      <div className="flex items-start gap-3">
        <div className="mt-1 h-2.5 w-2.5 rounded-full bg-emerald-500" />
        <div>
          <div className="text-sm font-bold text-white">{title}</div>
          <div className="mt-1 text-sm text-white/60">{desc}</div>
        </div>
      </div>
    </div>
  );
}

function MiniPanel({ label, items }: { label: string; items: string[] }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/40 p-4">
      <div className="text-[10px] font-bold tracking-[0.2em] text-white/60">
        {label}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {items.map((x) => (
          <span
            key={x}
            className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-bold text-white/80"
          >
            {x}
          </span>
        ))}
      </div>
    </div>
  );
}

function StripItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/35 px-4 py-5">
      <div className="text-[10px] font-bold tracking-[0.18em] text-white/45">
        {label}
      </div>
      <div className="mt-2 text-2xl font-black tracking-tight text-white">
        {value}
      </div>
    </div>
  );
}

function PathwayCard({
  title,
  desc,
}: {
  title: string;
  desc: string;
}) {
  return (
    <div className="rounded-[28px] border border-white/10 bg-white/[0.05] p-6 shadow-[0_18px_60px_rgba(0,0,0,0.28)] backdrop-blur transition hover:-translate-y-0.5 hover:bg-white/[0.07]">
      <div className="text-[11px] font-bold tracking-[0.24em] text-white/55">
        LEAGUE TYPE
      </div>
      <div className="mt-2 text-2xl font-black tracking-tight text-white">
        {title}
      </div>
      <div className="mt-3 text-sm leading-7 text-white/60">{desc}</div>
      <div className="mt-6 h-px w-full bg-gradient-to-r from-transparent via-emerald-500/40 to-transparent" />
    </div>
  );
}

function StepCard({
  number,
  title,
  desc,
}: {
  number: string;
  title: string;
  desc: string;
}) {
  return (
    <div className="rounded-[28px] border border-white/10 bg-white/[0.05] p-6 shadow-[0_18px_60px_rgba(0,0,0,0.22)] backdrop-blur">
      <div className="text-[11px] font-bold tracking-[0.24em] text-emerald-400">
        {number}
      </div>
      <div className="mt-3 text-xl font-black tracking-tight text-white">
        {title}
      </div>
      <div className="mt-3 text-sm leading-7 text-white/60">{desc}</div>
    </div>
  );
}