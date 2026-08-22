// ========================================
// File: src/app/(admin)/admin/rules-archive/page.tsx
// ========================================

import { archivedLeagueRulesV2 } from "@/lib/archived-league-rules-v2";
import {
  LEAGUE_AGREEMENT_EFFECTIVE_DATE,
  LEAGUE_AGREEMENT_VERSION,
} from "@/lib/league-agreement";
import {
  LEAGUE_RULES_EFFECTIVE_DATE,
  LEAGUE_RULES_VERSION,
} from "@/lib/league-rules";
import {
  KIT_OFFER_TERMS_EFFECTIVE_DATE,
  KIT_OFFER_TERMS_VERSION,
  archivedKitOfferTermsDocuments,
} from "@/lib/kits/terms";
import { MATCH_RULES_VERSION } from "@/lib/match-rules";
import { archivedRuleDocuments } from "@/lib/rules-archive";
import { requireAdmin } from "@/lib/requireAdmin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "Rules Archive | SIXFL Admin",
};

const currentDocuments = [
  {
    document: "League Rules",
    version: LEAGUE_RULES_VERSION,
    effectiveDate: LEAGUE_RULES_EFFECTIVE_DATE,
  },
  {
    document: "Match Rules",
    version: MATCH_RULES_VERSION.replace("Version ", ""),
    effectiveDate: "22 August 2026",
  },
  {
    document: "League Participation Agreement",
    version: LEAGUE_AGREEMENT_VERSION,
    effectiveDate: LEAGUE_AGREEMENT_EFFECTIVE_DATE,
  },
  {
    document: "Founding Team Kit Offer Terms",
    version: KIT_OFFER_TERMS_VERSION,
    effectiveDate: KIT_OFFER_TERMS_EFFECTIVE_DATE,
  },
];

const supersededDocuments = [
  archivedLeagueRulesV2,
  ...archivedRuleDocuments,
  ...archivedKitOfferTermsDocuments,
];

export default async function RulesArchivePage() {
  await requireAdmin();

  return (
    <div className="space-y-8">
      <section className="rounded-3xl border border-emerald-400/20 bg-emerald-500/10 p-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-100/70">
          Back end functions
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">
          Rules archive
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-emerald-50/75">
          Superseded rules and terms are retained here so SIXFL can identify the wording
          that applied at an earlier date. Before publishing a new version,
          the outgoing active version should be copied into this archive.
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {currentDocuments.map((document) => (
          <div
            key={document.document}
            className="rounded-3xl border border-white/10 bg-white/[0.04] p-5"
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
              Current
            </p>
            <h2 className="mt-2 text-lg font-semibold text-white">
              {document.document}
            </h2>
            <p className="mt-3 text-2xl font-semibold text-emerald-200">
              v{document.version}
            </p>
            <p className="mt-2 text-sm text-white/55">
              Effective {document.effectiveDate}
            </p>
          </div>
        ))}
      </section>

      <section className="space-y-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
            Superseded
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-white">
            Previous versions
          </h2>
        </div>

        {supersededDocuments.map((document) => (
          <article
            key={document.id}
            className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04]"
          >
            <div className="flex flex-col gap-4 border-b border-white/10 px-6 py-5 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-xl font-semibold text-white">
                    {document.document}
                  </h3>
                  <span className="rounded-full border border-amber-400/20 bg-amber-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-amber-100">
                    v{document.version}
                  </span>
                </div>
                <p className="mt-2 text-sm text-white/55">
                  Effective {document.effectiveDate} · superseded{" "}
                  {document.supersededDate}
                </p>
              </div>
              <span className="text-sm font-semibold text-white/45">
                {document.sections.length} sections
              </span>
            </div>

            <div className="divide-y divide-white/10">
              {document.sections.map((section) => (
                <details key={section.title} className="group px-6 py-4">
                  <summary className="cursor-pointer list-none font-semibold text-white/80">
                    {section.title}
                  </summary>
                  <div className="mt-3 space-y-2 text-sm leading-6 text-white/60">
                    {section.points.map((point) => (
                      <p key={point}>{point}</p>
                    ))}
                  </div>
                </details>
              ))}
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
