type Props = {
  searchParams?: Promise<{ answer?: string }>;
};

export default async function CupTestResponsePage({ searchParams }: Props) {
  const answer = ((await searchParams)?.answer ?? "").toUpperCase();
  const selected = answer === "YES" || answer === "NO" ? answer : null;

  return (
    <main className="mx-auto flex min-h-[70vh] w-full max-w-2xl items-center px-4 py-12 sm:px-6">
      <section className="w-full rounded-3xl border border-emerald-400/20 bg-white/[0.04] p-6 shadow-[0_20px_80px_rgba(0,0,0,0.35)] sm:p-8">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-300">
          Cup email test
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">
          No Cup response has been recorded
        </h1>
        <p className="mt-4 text-base leading-7 text-white/70">
          This link came from a SIXFL test email. It is deliberately non-recording, so clicking
          YES or NO here does not enter, decline or otherwise change any team&apos;s Cup status.
        </p>
        {selected ? (
          <div className="mt-6 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white/70">
            Test button selected: <span className="font-semibold text-white">{selected}</span>
          </div>
        ) : null}
        <p className="mt-6 text-sm leading-6 text-white/55">
          To record a real response, use the private link from a genuine SIXFL Cup invitation.
        </p>
      </section>
    </main>
  );
}
