// ========================================
// File: src/app/(public)/referee-agreement/page.tsx
// ========================================

import Link from "next/link";

const documentDetails = [
  { label: "Document", value: "Referee Service Agreement" },
  { label: "Version", value: "1.0" },
  { label: "Status", value: "Active" },
  { label: "Last updated", value: "2 July 2026" },
  { label: "Next review", value: "2 July 2027" },
  { label: "Owner", value: "SIXFL League Operations" },
  { label: "Applies to", value: "Referees providing services to SIXFL" },
];

export default function RefereeAgreementPage() {
  return (
    <div className="space-y-10">
      <section className="rounded-3xl border border-white/10 bg-white/5 px-6 py-10 md:px-10">
        <div className="grid gap-8 lg:grid-cols-[1fr_360px] lg:items-start">
          <div className="max-w-3xl">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-400">
              SIXFL OFFICIATING
            </p>

            <h1 className="mt-3 text-4xl font-black tracking-tight text-white md:text-5xl">
              Referee Service Agreement
            </h1>

            <p className="mt-4 text-white/70 md:text-lg">
              This agreement outlines the terms under which referees provide
              officiating services for SIXFL competitions.
            </p>

            <div className="mt-6 rounded-2xl border border-emerald-400/25 bg-emerald-400/10 p-5">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-300">
                Officiating statement
              </p>
              <p className="mt-3 text-sm leading-6 text-white/75">
                This agreement sets expectations for referee conduct, match
                administration, availability and payment arrangements.
              </p>
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-black/20 p-6">
            <h2 className="text-xl font-bold text-white">Document control</h2>
            <dl className="mt-5 divide-y divide-white/10">
              {documentDetails.map((detail) => (
                <div
                  key={detail.label}
                  className="grid grid-cols-[120px_1fr] gap-4 py-3 text-sm"
                >
                  <dt className="font-semibold text-white/55">{detail.label}</dt>
                  <dd className="font-semibold text-white/90">{detail.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>

      <div className="space-y-6">
        <AgreementSection
          title="1. Independent Contractor Status"
          text="Referees providing services for SIXFL act as independent contractors and are not employees of SIXFL. Referees are responsible for their own tax, insurance and regulatory obligations."
        />

        <AgreementSection
          title="2. Duties and Responsibilities"
          text="Referees are responsible for officiating matches fairly and impartially in accordance with SIXFL rules. This includes enforcing match rules, managing player behaviour and ensuring matches are conducted safely and professionally."
        />

        <AgreementSection
          title="3. Match Administration"
          text="Referees must record and submit match results, scores and any disciplinary incidents following each match night in accordance with SIXFL procedures."
        />

        <AgreementSection
          title="4. Payment"
          text="Referees are paid a fixed fee per match night for officiating services. Payment arrangements may vary by league or venue and will be confirmed in advance. Referees are responsible for any tax obligations relating to payments received."
        />

        <AgreementSection
          title="5. Availability"
          text="Referees should provide reasonable notice if they are unable to attend a scheduled match night. SIXFL may appoint alternative referees where necessary."
        />

        <AgreementSection
          title="6. Conduct and Professional Standards"
          text="Referees must conduct themselves professionally at all times, remain impartial, and treat players, captains, spectators and league staff with respect."
        />

        <AgreementSection
          title="7. Safety and Liability"
          text="Participation in football carries inherent risks. SIXFL is not responsible for injuries sustained during matches unless required by law. Referees are responsible for carrying out their role with reasonable care."
        />

        <AgreementSection
          title="8. Termination of Services"
          text="SIXFL reserves the right to discontinue the services of any referee where conduct, performance or reliability does not meet the standards expected by the league."
        />
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/5 px-6 py-6 text-sm text-white/70">
        By providing officiating services for SIXFL competitions, referees
        acknowledge and agree to the terms outlined in this agreement.
      </div>

      <div className="flex flex-wrap gap-4 text-sm">
        <Link
          href="/match-rules"
          className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-4 py-2 text-white/80 transition hover:border-emerald-400/40 hover:text-white"
        >
          View Match Rules
        </Link>

        <Link
          href="/league-rules"
          className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-4 py-2 text-white/80 transition hover:border-emerald-400/40 hover:text-white"
        >
          View League Rules
        </Link>

        <Link
          href="/league-agreement"
          className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-4 py-2 text-white/80 transition hover:border-emerald-400/40 hover:text-white"
        >
          View League Agreement
        </Link>
      </div>
    </div>
  );
}

function AgreementSection({
  title,
  text,
}: {
  title: string;
  text: string;
}) {
  return (
    <section className="rounded-2xl border border-white/10 bg-white/5 px-6 py-6">
      <h2 className="text-lg font-semibold text-white">{title}</h2>
      <p className="mt-2 text-white/70">{text}</p>
    </section>
  );
}
