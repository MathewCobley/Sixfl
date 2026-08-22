import Link from "next/link";

export const metadata = {
  title: "Team registration already exists | SIXFL",
};

type PageProps = {
  searchParams?: Promise<{
    reason?: string;
  }>;
};

export default async function TeamAlreadyRegisteredPage({ searchParams }: PageProps) {
  const sp = (await searchParams) ?? {};
  const sameTeam = sp.reason === "same-team";

  return (
    <main className="min-h-screen bg-black px-4 py-10 text-white">
      <div className="mx-auto max-w-3xl">
        <Link href="/" className="text-sm text-white/60 transition hover:text-white">
          ← Back to home
        </Link>

        <section className="mt-6 overflow-hidden rounded-3xl border border-emerald-400/20 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.18),transparent_38%),rgba(255,255,255,0.05)] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.35)] sm:p-8">
          <div className="inline-flex rounded-full border border-emerald-400/20 bg-emerald-500/10 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.2em] text-emerald-300">
            SIXFL team registration
          </div>

          <h1 className="mt-5 text-3xl font-black tracking-tight sm:text-4xl">
            {sameTeam
              ? "This team is already registered"
              : "This email is already linked to another team"}
          </h1>

          <div className="mt-6 space-y-4 rounded-2xl border border-white/10 bg-black/25 p-5 text-sm leading-7 text-white/75">
            {sameTeam ? (
              <>
                <p>
                  We already have a SIXFL team registration using this email and team name, so we have not created a duplicate lead.
                </p>
                <p>
                  You do not need to register again. If you need to change any team details, contact SIXFL and we can update the existing record.
                </p>
              </>
            ) : (
              <>
                <p>
                  To keep team ownership, payments and captain communications clear, one email address cannot register two different SIXFL teams through the public form.
                </p>
                <p>
                  Please use the other team’s captain or manager email. If you genuinely manage more than one team, contact SIXFL and we can review and set that up manually.
                </p>
              </>
            )}
          </div>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <a
              href="mailto:hello@sixfl.co.uk?subject=SIXFL%20team%20registration%20help"
              className="inline-flex h-12 items-center justify-center rounded-full bg-emerald-500 px-6 text-sm font-extrabold tracking-wide text-black transition hover:bg-emerald-400"
            >
              CONTACT SIXFL
            </a>

            <Link
              href="/register-team"
              className="inline-flex h-12 items-center justify-center rounded-full border border-white/10 bg-white/5 px-6 text-sm font-extrabold tracking-wide text-white transition hover:bg-white/10"
            >
              USE A DIFFERENT EMAIL
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
