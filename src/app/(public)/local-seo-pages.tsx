// ========================================
// File: src/app/(public)/local-seo-pages.tsx
// ========================================

import Link from "next/link";
import Script from "next/script";

type LocalSeoPageConfig = {
  area: string;
  title: string;
  description: string;
  venue: string;
  night: string;
  kickoffInfo: string;
  surface: string;
  status: string;
  primaryCta: string;
  primaryHref: string;
  secondaryCta: string;
  secondaryHref: string;
  canonicalPath: string;
  nearbyAreas: string[];
  searchIntentHeading?: string;
  searchIntentCopy?: string[];
  faqs: Array<{ question: string; answer: string }>;
};

export const localSeoPages: Record<string, LocalSeoPageConfig> = {
  harrogate: {
    area: "Harrogate",
    title: "Harrogate 6-a-side football league",
    description:
      "Play organised 6-a-side football in Harrogate with SIXFL at Rossett Sports Centre. Tuesday league fixtures, live results, tables and registration for teams and individual players.",
    venue: "Rossett Sports Centre",
    night: "Tuesday",
    kickoffInfo: "Tuesday evenings",
    surface: "3G small-sided football pitches",
    status: "Live league",
    primaryCta: "View live Harrogate league",
    primaryHref: "/leagues/rossett-mens-tuesday",
    secondaryCta: "Register for Harrogate",
    secondaryHref: "/register-interest?area=Harrogate&type=team&night=Tuesday",
    canonicalPath: "/harrogate-6-a-side-football",
    nearbyAreas: ["Knaresborough", "Ripon", "Pannal", "Starbeck", "Wetherby"],
    searchIntentHeading: "Looking for 5-a-side football in Harrogate?",
    searchIntentCopy: [
      "People often search for 5-a-side football when they are really looking for a local small-sided football league. SIXFL Harrogate is a 6-a-side competition rather than a 5-a-side league, played on Tuesday evenings at Rossett Sports Centre.",
      "If you want regular small-sided football in Harrogate, you can enter a full team or register as an individual player. The live league page shows the current teams, fixtures, results and standings before you join.",
    ],
    faqs: [
      {
        question: "Where is SIXFL 6-a-side football in Harrogate played?",
        answer: "The Harrogate SIXFL league is played at Rossett Sports Centre on Tuesday evenings, with published fixtures, results and league standings available online.",
      },
      {
        question: "Is SIXFL Harrogate 5-a-side or 6-a-side?",
        answer: "SIXFL Harrogate is a 6-a-side football league. If you are searching for 5-a-side or small-sided football in Harrogate, the SIXFL league offers the same regular local small-sided format with six players per team.",
      },
      {
        question: "Can I enter a team into the Harrogate league?",
        answer: "Yes. Captains can register a team online and SIXFL will confirm current availability, match-night details and next steps.",
      },
      {
        question: "Can individual players join in Harrogate?",
        answer: "Yes. Individual players can register interest and may be matched with teams looking for extra players or other available playing opportunities.",
      },
      {
        question: "What night is the Harrogate 6-a-side league?",
        answer: "The current SIXFL Harrogate league plays on Tuesday evenings at Rossett Sports Centre.",
      },
      {
        question: "Can I see the Harrogate league before registering?",
        answer: "Yes. The live SIXFL Harrogate league page shows current teams, upcoming fixtures, recent results and the league table.",
      },
    ],
  },
  northallerton: {
    area: "Northallerton",
    title: "6-a-side Football in Northallerton",
    description:
      "Join SIXFL 6-a-side football in Northallerton. Wednesday night football league with team entries, player interest and weekly fixtures.",
    venue: "Northallerton Leisure Centre",
    night: "Wednesday",
    kickoffInfo: "Evening kick-offs",
    surface: "Small-sided football pitches",
    status: "League growing",
    primaryCta: "Register a team",
    primaryHref: "/register-interest?area=Northallerton&type=team&night=Wednesday",
    secondaryCta: "Join as a player",
    secondaryHref: "/register-interest?area=Northallerton&type=player&night=Wednesday",
    canonicalPath: "/northallerton-6-a-side-football",
    nearbyAreas: ["Thirsk", "Bedale", "Catterick", "Richmond", "Stokesley"],
    faqs: [
      {
        question: "Is there a 6-a-side football league in Northallerton?",
        answer: "Yes. SIXFL runs and develops organised 6-a-side football in Northallerton, with team and player interest open online.",
      },
      {
        question: "What night is Northallerton 6-a-side football?",
        answer: "The current Northallerton league night is Wednesday, with additional nights considered when demand is strong.",
      },
      {
        question: "Can my team join the Northallerton league?",
        answer: "Yes. Teams can register interest and SIXFL will confirm the next available space and fixtures.",
      },
      {
        question: "Can I join without a full team?",
        answer: "Yes. Individual players can register interest and SIXFL can pass details to teams looking for players.",
      },
    ],
  },
  wetherby: {
    area: "Wetherby",
    title: "6-a-side Football in Wetherby",
    description:
      "Join SIXFL 6-a-side football in Wetherby at Boston Spa Academy. Register a team or join as a player for organised weekly football.",
    venue: "Boston Spa Academy",
    night: "Wednesday",
    kickoffInfo: "Evening kick-offs",
    surface: "3G / small-sided football pitches",
    status: "Registrations open",
    primaryCta: "Register a Wetherby team",
    primaryHref: "/register-interest?area=Wetherby&type=team&night=Wednesday",
    secondaryCta: "Join as a player",
    secondaryHref: "/register-interest?area=Wetherby&type=player&night=Wednesday",
    canonicalPath: "/wetherby-6-a-side-football",
    nearbyAreas: ["Boston Spa", "Tadcaster", "Bramham", "Collingham", "Spofforth"],
    faqs: [
      {
        question: "Where is Wetherby 6-a-side football played?",
        answer: "SIXFL Wetherby is based at Boston Spa Academy, with organised evening league football.",
      },
      {
        question: "Can I register a team for Wetherby?",
        answer: "Yes. Captains can register a team online and SIXFL will follow up with available league details.",
      },
      {
        question: "Can individual players join the Wetherby league?",
        answer: "Yes. Players without a team can register interest and may be connected with teams looking for extra players.",
      },
      {
        question: "What night is the Wetherby league?",
        answer: "The planned Wetherby league night is Wednesday, subject to final team numbers and pitch availability.",
      },
    ],
  },
};

function getSiteUrl() {
  return "https://www.sixfl.co.uk";
}

function buildJsonLd(page: LocalSeoPageConfig) {
  const siteUrl = getSiteUrl();

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "SportsActivityLocation",
        "@id": `${siteUrl}${page.canonicalPath}#sports-location`,
        name: `SIXFL ${page.area} 6-a-side football`,
        url: `${siteUrl}${page.canonicalPath}`,
        sport: "Football",
        address: {
          "@type": "PostalAddress",
          addressLocality: page.area,
          addressCountry: "GB",
        },
      },
      {
        "@type": "FAQPage",
        "@id": `${siteUrl}${page.canonicalPath}#faq`,
        mainEntity: page.faqs.map((faq) => ({
          "@type": "Question",
          name: faq.question,
          acceptedAnswer: {
            "@type": "Answer",
            text: faq.answer,
          },
        })),
      },
    ],
  };
}

export function LocalSeoLandingPage({ page }: { page: LocalSeoPageConfig }) {
  return (
    <main className="min-h-screen bg-black text-white">
      <Script
        id={`local-seo-${page.area.toLowerCase()}-jsonld`}
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(buildJsonLd(page)) }}
      />

      <section className="relative overflow-hidden border-b border-white/10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(16,185,129,0.18),transparent_28%),radial-gradient(circle_at_80%_0%,rgba(14,165,233,0.12),transparent_24%)]" />
        <div className="relative mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
          <div className="max-w-4xl">
            <p className="text-[11px] font-black uppercase tracking-[0.28em] text-emerald-300">
              SIXFL {page.area}
            </p>
            <h1 className="mt-4 text-4xl font-black tracking-tight sm:text-6xl">
              {page.title}
            </h1>
            <p className="mt-5 max-w-3xl text-lg leading-8 text-white/72">
              {page.description}
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <Link
                href={page.primaryHref}
                className="inline-flex h-12 items-center justify-center rounded-full bg-emerald-400 px-6 text-sm font-black text-black transition hover:bg-emerald-300"
              >
                {page.primaryCta}
              </Link>
              <Link
                href={page.secondaryHref}
                className="inline-flex h-12 items-center justify-center rounded-full border border-emerald-400/25 bg-emerald-500/10 px-6 text-sm font-black text-emerald-200 transition hover:bg-emerald-500/15"
              >
                {page.secondaryCta}
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid gap-4 md:grid-cols-4">
          {[
            ["Area", page.area],
            ["Venue", page.venue],
            ["Night", page.night],
            ["Status", page.status],
          ].map(([label, value]) => (
            <div key={label} className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/40">{label}</p>
              <p className="mt-2 text-lg font-bold text-white">{value}</p>
            </div>
          ))}
        </div>

        <div className="mt-10 grid gap-6 lg:grid-cols-[1fr_0.85fr]">
          <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 lg:p-8">
            <h2 className="text-2xl font-black tracking-tight">Join a local 6-a-side football league in {page.area}</h2>
            <div className="mt-5 space-y-4 text-sm leading-7 text-white/68">
              <p>
                SIXFL makes weekly small-sided football easier to organise and follow, with fixtures, results, tables and team communication handled online.
              </p>
              <p>
                Teams can enter a league, individual players can register interest, and referees can get involved with current and upcoming match nights.
              </p>
              <p>
                The {page.area} league is designed for local teams looking for reliable, competitive and well-run football without the hassle of organising everything themselves.
              </p>
            </div>
          </section>

          <aside className="rounded-3xl border border-emerald-400/20 bg-emerald-500/[0.07] p-6 lg:p-8">
            <h2 className="text-xl font-black tracking-tight">League details</h2>
            <dl className="mt-5 space-y-4 text-sm">
              <div>
                <dt className="font-bold uppercase tracking-[0.16em] text-emerald-100/55">Kick-offs</dt>
                <dd className="mt-1 text-white/80">{page.kickoffInfo}</dd>
              </div>
              <div>
                <dt className="font-bold uppercase tracking-[0.16em] text-emerald-100/55">Surface</dt>
                <dd className="mt-1 text-white/80">{page.surface}</dd>
              </div>
              <div>
                <dt className="font-bold uppercase tracking-[0.16em] text-emerald-100/55">Nearby areas</dt>
                <dd className="mt-2 flex flex-wrap gap-2">
                  {page.nearbyAreas.map((area) => (
                    <span key={area} className="rounded-full border border-white/10 bg-black/25 px-3 py-1 text-white/70">
                      {area}
                    </span>
                  ))}
                </dd>
              </div>
            </dl>
          </aside>
        </div>

        {page.searchIntentHeading && page.searchIntentCopy?.length ? (
          <section className="mt-10 rounded-3xl border border-sky-400/20 bg-sky-500/[0.06] p-6 lg:p-8">
            <p className="text-[11px] font-black uppercase tracking-[0.22em] text-sky-200/70">
              Small-sided football in {page.area}
            </p>
            <h2 className="mt-2 text-2xl font-black tracking-tight text-white">
              {page.searchIntentHeading}
            </h2>
            <div className="mt-4 max-w-4xl space-y-4 text-sm leading-7 text-white/68">
              {page.searchIntentCopy.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href={page.primaryHref}
                className="inline-flex h-11 items-center justify-center rounded-full bg-sky-300 px-5 text-sm font-black text-black transition hover:bg-sky-200"
              >
                See Harrogate fixtures & table
              </Link>
              <Link
                href="/register-interest?area=Harrogate&type=player&night=Tuesday"
                className="inline-flex h-11 items-center justify-center rounded-full border border-sky-300/25 bg-sky-400/10 px-5 text-sm font-black text-sky-100 transition hover:bg-sky-400/15"
              >
                Join as an individual player
              </Link>
            </div>
          </section>
        ) : null}

        <section className="mt-10 rounded-3xl border border-white/10 bg-white/[0.04] p-6 lg:p-8">
          <h2 className="text-2xl font-black tracking-tight">{page.area} 6-a-side football FAQs</h2>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {page.faqs.map((faq) => (
              <div key={faq.question} className="rounded-2xl border border-white/10 bg-black/25 p-5">
                <h3 className="font-bold text-white">{faq.question}</h3>
                <p className="mt-2 text-sm leading-6 text-white/62">{faq.answer}</p>
              </div>
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}
