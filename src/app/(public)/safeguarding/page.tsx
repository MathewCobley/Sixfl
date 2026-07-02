// ========================================
// File: src/app/(public)/safeguarding/page.tsx
// ========================================

import Link from "next/link";

const documentDetails = [
  { label: "Document set", value: "SIXFL Safeguarding Documents" },
  { label: "Version", value: "1.0" },
  { label: "Status", value: "Active" },
  { label: "Last updated", value: "2 July 2026" },
  { label: "Next review", value: "2 July 2027" },
  { label: "Owner", value: "SIXFL Safeguarding" },
  { label: "Applies to", value: "All SIXFL participants, officials and attendees" },
];

const safeguardingDocuments = [
  {
    title: "Safeguarding Policy",
    href: "/safeguarding/safeguarding-policy",
    description:
      "Our commitment to safeguarding children, young people, adults at risk and all participants involved in SIXFL activities.",
  },
  {
    title: "Code of Conduct",
    href: "/safeguarding/code-of-conduct",
    description:
      "The behaviour expected from players, teams, spectators, referees and everyone involved in SIXFL leagues.",
  },
  {
    title: "Anti-Bullying Policy",
    href: "/safeguarding/anti-bullying",
    description:
      "How SIXFL prevents and responds to bullying, harassment, intimidation and discriminatory behaviour.",
  },
  {
    title: "Reporting Concerns",
    href: "/safeguarding/reporting-concerns",
    description:
      "How safeguarding, welfare and behaviour concerns should be reported and how SIXFL will consider them.",
  },
];

export default function SafeguardingPage() {
  return (
    <main className="min-h-screen bg-black text-white">
      <section className="border-b border-white/10 bg-gradient-to-b from-emerald-950/40 via-black to-black">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
          <div className="grid gap-10 lg:grid-cols-[1fr_380px] lg:items-start">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.25em] text-emerald-400">
                SIXFL Safeguarding
              </p>

              <h1 className="mt-4 text-4xl font-black tracking-tight sm:text-5xl lg:text-6xl">
                Safeguarding
              </h1>

              <p className="mt-5 text-lg leading-8 text-white/75 sm:text-xl">
                SIXFL is committed to providing safe, respectful and inclusive
                football for children, young people, adults, disabled people and
                everyone involved in our leagues.
              </p>

              <div className="mt-8 rounded-3xl border border-emerald-400/25 bg-emerald-400/10 p-6">
                <p className="text-sm font-bold uppercase tracking-[0.18em] text-emerald-300">
                  Safeguarding statement
                </p>
                <p className="mt-3 leading-7 text-white/80">
                  Concerns about safety, welfare, bullying, harassment,
                  discrimination or poor conduct should be raised as soon as
                  possible so that SIXFL can consider appropriate action.
                </p>
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 shadow-2xl shadow-black/20">
              <h2 className="text-xl font-bold text-white">Document control</h2>
              <dl className="mt-5 divide-y divide-white/10">
                {documentDetails.map((detail) => (
                  <div
                    key={detail.label}
                    className="grid grid-cols-[130px_1fr] gap-4 py-3 text-sm"
                  >
                    <dt className="font-semibold text-white/55">{detail.label}</dt>
                    <dd className="font-semibold text-white/90">{detail.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
        <div className="grid gap-6 md:grid-cols-2">
          {safeguardingDocuments.map((document) => (
            <Link
              key={document.href}
              href={document.href}
              className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 shadow-2xl shadow-black/20 transition hover:border-emerald-400/40 hover:bg-white/[0.07] md:p-8"
            >
              <h2 className="text-2xl font-bold text-white">{document.title}</h2>
              <p className="mt-3 leading-7 text-white/70">
                {document.description}
              </p>
              <p className="mt-5 text-sm font-bold uppercase tracking-[0.18em] text-emerald-400">
                View document →
              </p>
            </Link>
          ))}
        </div>

        <div className="mt-10 rounded-3xl border border-emerald-400/30 bg-emerald-400/10 p-6">
          <h2 className="text-xl font-bold text-white">Report a concern</h2>
          <p className="mt-3 text-sm leading-6 text-white/75">
            If you have a safeguarding, welfare or behaviour concern relating to
            SIXFL, contact us as soon as possible.
          </p>
          <a
            href="mailto:hello@sixfl.co.uk"
            className="mt-5 inline-flex rounded-full bg-emerald-400 px-5 py-3 text-sm font-black text-black transition hover:bg-emerald-300"
          >
            hello@sixfl.co.uk
          </a>
        </div>

        <div className="mt-10 border-t border-white/10 pt-6">
          <Link
            href="/"
            className="font-semibold text-emerald-400 transition hover:text-emerald-300"
          >
            ← Return to home
          </Link>
        </div>
      </section>
    </main>
  );
}
