// ========================================
// File: src/app/faq/page.tsx
// ========================================

import type { Metadata } from "next";
import Link from "next/link";

type FAQItem = {
  question: string;
  answer: string;
};

const faqs: FAQItem[] = [
  {
    question: "What is SIXFL?",
    answer:
      "SIXFL is a professionally run 6-a-side football league platform designed to provide a better organised and more enjoyable playing experience. Our leagues focus on reliable fixtures, clear communication, proper officiating, and a well-managed competition structure. While our initial leagues focus on adult men's football, SIXFL also plans to introduce women's and youth leagues as the platform grows.",
  },

  {
    question: "How do I register a team?",
    answer:
      "You can register your team through the SIXFL website. Once submitted, we will review your details and confirm the next steps for joining a league.",
  },

  {
    question: "Can I join without a full team?",
    answer:
      "Yes. If you are an individual player or do not yet have a full squad, you can still register your interest and we may be able to place you with other players or teams looking for additional players.",
  },

  {
    question: "Where are matches played?",
    answer:
      "Matches are played at approved local venues selected by SIXFL. Venue details are always shared clearly before teams confirm their place in a league.",
  },

  {
    question: "When are matches played?",
    answer:
      "Most matches take place on weekday evenings. Exact kick-off times depend on the venue and league schedule.",
  },

  {
    question: "How long are matches?",
    answer:
      "Match duration may vary depending on the league format and venue, but full details are always confirmed before the season begins.",
  },

  {
    question: "How much does it cost to play?",
    answer:
      "League pricing depends on the venue and league format. All costs are made clear before registration is finalised.",
  },

  {
    question: "Are there any hidden fees?",
    answer:
      "No. SIXFL aims to keep pricing simple and transparent so teams always know exactly what they are paying for.",
  },

  {
    question: "How many players can we have in a squad?",
    answer:
      "Teams play with six players on the pitch, but squads can include additional players so teams have cover for injuries, holidays, and availability across the season.",
  },

  {
    question: "Do we need a kit?",
    answer:
      "A matching kit is recommended, but exact requirements may depend on the league and venue. Teams will be informed before the season begins.",
  },

  {
    question: "Are referees provided?",
    answer:
      "Yes. SIXFL aims to provide properly organised officiating so matches are managed consistently and fairly.",
  },

  {
    question: "What happens if our team cannot play one week?",
    answer:
      "Teams should notify the league as early as possible if they cannot play. The league will manage the situation according to league rules and scheduling.",
  },

  {
    question: "What happens if it rains or the pitch is unplayable?",
    answer:
      "If weather or pitch conditions make matches unsafe or unplayable, fixtures may be postponed and rescheduled.",
  },

  {
    question: "Will there be league tables and results?",
    answer:
      "Yes. Fixtures, results, and league tables will be tracked through the SIXFL platform so teams can easily follow the competition.",
  },

  {
    question: "Will there be women's or youth leagues?",
    answer:
      "Yes. As SIXFL grows we plan to introduce women's and youth competitions alongside our adult leagues. Our goal is to create a well-organised football platform that provides opportunities for different age groups and teams to enjoy competitive small-sided football.",
  },

  {
    question: "What happens after I register?",
    answer:
      "After registering, we will review your submission, confirm availability, and contact you with the next steps for joining a league.",
  },
];

const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faqs.map((item) => ({
    "@type": "Question",
    name: item.question,
    acceptedAnswer: {
      "@type": "Answer",
      text: item.answer,
    },
  })),
};

export const metadata: Metadata = {
  title: "FAQ | SIXFL",
  description:
    "Answers to common questions about joining SIXFL leagues, registering a team, venues, pricing, fixtures, and how the competition works.",
};

export default function FAQPage() {
  return (
    <div className="space-y-10">

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />

      <section className="rounded-3xl border border-white/10 bg-white/5 px-6 py-10 md:px-10">
        <div className="max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-400">
            SIXFL FAQ
          </p>

          <h1 className="mt-3 text-4xl font-black tracking-tight text-white md:text-5xl">
            Frequently asked questions
          </h1>

          <p className="mt-4 max-w-2xl text-base text-white/70 md:text-lg">
            Everything you need to know about joining a SIXFL league, registering
            a team, and how the competition works.
          </p>
        </div>
      </section>

      <section className="space-y-4">
        {faqs.map((item) => (
          <details
            key={item.question}
            className="group rounded-2xl border border-white/10 bg-white/5 transition hover:bg-white/[0.07]"
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-5 text-left md:px-6">
              <span className="text-base font-bold text-white md:text-lg">
                {item.question}
              </span>

              <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-sm font-bold text-emerald-400 transition group-open:rotate-45">
                +
              </span>
            </summary>

            <div className="px-5 pb-5 md:px-6 md:pb-6">
              <p className="max-w-3xl leading-7 text-white/75">
                {item.answer}
              </p>
            </div>
          </details>
        ))}
      </section>

      <section className="rounded-3xl border border-emerald-500/20 bg-emerald-500/10 px-6 py-8 md:px-8">
        <h2 className="text-2xl font-black text-white">
          Still got questions?
        </h2>

        <p className="mt-3 max-w-2xl text-white/75">
          If you're interested in entering a team or joining a league as an
          individual player, get in touch and we will point you in the right
          direction.
        </p>

        <div className="mt-6 flex flex-wrap gap-4">
          <Link
            href="/contact"
            className="inline-flex items-center justify-center rounded-full bg-emerald-500 px-6 py-3 text-sm font-extrabold text-black transition hover:bg-emerald-400"
          >
            Contact SIXFL
          </Link>

          <Link
            href="/register-team"
            className="inline-flex items-center justify-center rounded-full border border-white/15 px-6 py-3 text-sm font-bold text-white transition hover:bg-white/10"
          >
            Register Your Team
          </Link>
        </div>
      </section>

    </div>
  );
}