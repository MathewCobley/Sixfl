import type { Metadata } from "next";
import Link from "next/link";
import Script from "next/script";

const canonicalPath = "/north-yorkshire-heartlands-6-a-side-football";
const liveLeagueHref = "/leagues/heartlands";

export const metadata: Metadata = {
  title: "North Yorkshire Heartlands 6-a-side Football League | SIXFL",
  description:
    "Join organised 6-a-side football in the North Yorkshire Heartlands near Thirsk. Wednesday league for teams and players from Bedale, Richmond, Catterick and surrounding areas.",
  alternates: { canonical: canonicalPath },
  openGraph: {
    title: "North Yorkshire Heartlands 6-a-side Football League | SIXFL",
    description:
      "Wednesday 6-a-side football near Thirsk for teams and players across Bedale, Richmond, Catterick and the wider North Yorkshire Heartlands.",
    url: canonicalPath,
    type: "website",
  },
};

const faqs = [
  {
    question: "Where is the North Yorkshire Heartlands 6-a-side league played?",
    answer:
      "The SIXFL North Yorkshire Heartlands league is based at Queen Mary's School near Thirsk, serving teams and players from across the surrounding area.",
  },
  {
    question: "Which areas does the Heartlands league serve?",
    answer:
      "The league is aimed at teams and players from Bedale, Richmond, Catterick, Thirsk and nearby North Yorkshire communities.",
  },
  {
    question: "What night is the Heartlands league?",
    answer:
      "The current North Yorkshire Heartlands league is planned for Wednesday evenings, with organised weekly fixtures.",
  },
  {
    question: "Can I enter a team?",
    answer:
      "Yes. Team captains can register for the Heartlands league online and SIXFL will confirm availability and next steps.",
  },
  {
    question: "Can I join without a full team?",
    answer:
      "Yes. Individual players can register interest and may be connected with teams looking for additional players.",
  },
  {
    question: "Is this 5-a-side or 6-a-side football?",
    answer:
      "SIXFL Heartlands is a 6-a-side football league. It is organised small-sided football for players who may also be searching for local 5-a-side or small-sided leagues.",
  },
];

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "SportsActivityLocation",
      "@id": `https://www.sixfl.co.uk${canonicalPath}#sports-location`,
      name: "SIXFL North Yorkshire Heartlands 6-a-side football",
      url: `https://www.sixfl.co.uk${canonicalPath}`,
      sport: "Football",
      address: {
        "@type": "PostalAddress",
        addressLocality: "Thirsk",
        addressRegion: "North Yorkshire",
        addressCountry: "GB",
      },
    },
    {
      "@type": "FAQPage",
      "@id": `https://www.sixfl.co.uk${canonicalPath}#faq`,
      mainEntity: faqs.map((faq) => ({
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

export default function NorthYorkshireHeartlandsSeoPage() {
  return (
    <main className="min-h-screen bg-black text-white">
      <Script
        id="heartlands-local-seo-jsonld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <section className="relative overflow-hidden border-b border-white/10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(16,185,129,0.18),transparent_28%),radial-gradient(circle_at_80%_0%,rgba(14,165,233,0.12),transparent_24%)]" />
        <div className="relative mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
          <div className="max-w-4xl">
            <p className="text-[11px] font-black uppercase tracking-[0.28em] text-emerald-300">
              SIXFL North Yorkshire Heartlands
            </p>
            <h1 className="mt-4 text-4xl font-black tracking-tight sm:text-6xl">
              North Yorkshire Heartlands 6-a-side football league
            </h1>
            <p className="mt-5 max-w-3xl text-lg leading-8 text-white/72">
              Organised Wednesday 6-a-side football near Thirsk for teams and players from Bedale, Richmond, Catterick and the wider North Yorkshire Heartlands.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <Link
                href={liveLeagueHref}
                className="inline-flex h-12 items-center justify-center rounded-full bg-emerald-400 px-6 text-sm font-black text-black transition hover:bg-emerald-300"
              >
                View Heartlands league
              </Link>
              <Link
                href="/leagues/heartlands?type=team#register"
                className="inline-flex h-12 items-center justify-center rounded-full border border-emerald-400/25 bg-emerald-500/10 px-6 text-sm font-black text-emerald-200 transition hover:bg-emerald-500/15"
              >
                Register a team
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid gap-4 md:grid-cols-4">
          {[
            ["Area", "North Yorkshire Heartlands"],
            ["Venue", "Queen Mary's School, near Thirsk"],
            ["Night", "Wednesday"],
            ["Status", "New league forming"],
          ].map(([label, value]) => (
            <div key={label} className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/40">{label}</p>
              <p className="mt-2 text-lg font-bold text-white">{value}</p>
            </div>
          ))}
        </div>

        <div className="mt-10 grid gap-6 lg:grid-cols-[1fr_0.85fr]">
          <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 lg:p-8">
            <h2 className="text-2xl font-black tracking-tight">
              Local 6-a-side football for Bedale, Richmond, Catterick and Thirsk
            </h2>
            <div className="mt-5 space-y-4 text-sm leading-7 text-white/68">
              <p>
                SIXFL is building a properly organised small-sided football league for the North Yorkshire Heartlands, giving local teams a regular weekly competition without having to travel into a major city.
              </p>
              <p>
                Fixtures, results, league information and team communication are managed online, while match nights are run with qualified referees and a clear league structure.
              </p>
              <p>
                Teams can register together, while individual players can also put their name forward if they are looking for a local side to join.
              </p>
            </div>
          </section>

          <aside className="rounded-3xl border border-emerald-400/20 bg-emerald-500/[0.07] p-6 lg:p-8">
            <h2 className="text-xl font-black tracking-tight">League details</h2>
            <dl className="mt-5 space-y-4 text-sm">
              <div>
                <dt className="font-bold uppercase tracking-[0.16em] text-emerald-100/55">Kick-offs</dt>
                <dd className="mt-1 text-white/80">Wednesday evenings, around 7pm–9pm</dd>
              </div>
              <div>
                <dt className="font-bold uppercase tracking-[0.16em] text-emerald-100/55">Format</dt>
                <dd className="mt-1 text-white/80">Organised 6-a-side league football</dd>
              </div>
              <div>
                <dt className="font-bold uppercase tracking-[0.16em] text-emerald-100/55">Nearby areas</dt>
                <dd className="mt-2 flex flex-wrap gap-2">
                  {["Bedale", "Richmond", "Catterick", "Thirsk", "Northallerton"].map((area) => (
                    <span key={area} className="rounded-full border border-white/10 bg-black/25 px-3 py-1 text-white/70">
                      {area}
                    </span>
                  ))}
                </dd>
              </div>
            </dl>
          </aside>
        </div>

        <section className="mt-10 rounded-3xl border border-sky-400/20 bg-sky-500/[0.06] p-6 lg:p-8">
          <p className="text-[11px] font-black uppercase tracking-[0.22em] text-sky-200/70">
            Small-sided football in North Yorkshire
          </p>
          <h2 className="mt-2 text-2xl font-black tracking-tight text-white">
            Looking for 5-a-side or small-sided football near Bedale, Richmond or Thirsk?
          </h2>
          <div className="mt-4 max-w-4xl space-y-4 text-sm leading-7 text-white/68">
            <p>
              SIXFL Heartlands is a 6-a-side league rather than a 5-a-side competition, but it is designed for the same players searching for regular local small-sided football.
            </p>
            <p>
              You can register a full team or join as an individual player, then follow the league online as fixtures and results go live.
            </p>
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href={liveLeagueHref}
              className="inline-flex h-11 items-center justify-center rounded-full bg-sky-300 px-5 text-sm font-black text-black transition hover:bg-sky-200"
            >
              View Heartlands league
            </Link>
            <Link
              href="/leagues/heartlands?type=player#register"
              className="inline-flex h-11 items-center justify-center rounded-full border border-sky-300/25 bg-sky-400/10 px-5 text-sm font-black text-sky-100 transition hover:bg-sky-400/15"
            >
              Join as an individual player
            </Link>
          </div>
        </section>

        <section className="mt-10 rounded-3xl border border-white/10 bg-white/[0.04] p-6 lg:p-8">
          <h2 className="text-2xl font-black tracking-tight">
            North Yorkshire Heartlands 6-a-side football FAQs
          </h2>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {faqs.map((faq) => (
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
