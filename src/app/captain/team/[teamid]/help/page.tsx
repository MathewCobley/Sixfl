// ========================================
// File: src/app/captain/team/[teamid]/help/page.tsx
// ========================================

import Link from "next/link";
import { notFound } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requireCaptain } from "@/lib/requireCaptain";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "Captain Help | SIXFL",
};

type HelpSection = {
  id: string;
  title: string;
  intro: string;
  steps: string[];
  example?: {
    title: string;
    rows: Array<{ label: string; value: string }>;
    note?: string;
  };
};

const sections: HelpSection[] = [
  {
    id: "getting-started",
    title: "Getting started",
    intro: "Your captain area is where you run the team week to week. Start with squad details, then check fixtures, availability, payments and results.",
    steps: [
      "Open Overview first. This shows your next fixture, open issues and any outstanding balance.",
      "Open Squad and check your player names and emails are correct.",
      "Open Fixtures before each game to confirm availability or raise a problem early.",
      "Open Payments or Squad payments to check whether the team fee is covered.",
    ],
  },
  {
    id: "squad",
    title: "Squad management",
    intro: "Keep your squad list tidy so availability, matchday planning and player payment links work properly.",
    steps: [
      "Add each regular player to your squad.",
      "Add an email address for any player who needs to receive a payment link.",
      "Edit a player if their email is wrong or their details change.",
      "Remove or update players who are no longer part of the team.",
    ],
    example: {
      title: "Dummy player example",
      rows: [
        { label: "Player", value: "Jack Smith" },
        { label: "Email", value: "jack@example.com" },
        { label: "Availability", value: "Available for next fixture" },
        { label: "Payment link", value: "Can be sent because email is saved" },
      ],
    },
  },
  {
    id: "squad-payments",
    title: "Squad payments",
    intro: "Squad payments help you collect the team fee from players. The captain still remains responsible for making sure the team fee is covered.",
    steps: [
      "Choose the fixture you are collecting for.",
      "Set a default amount for each selected player.",
      "Adjust individual amounts if someone is paying more, less or nothing.",
      "Send or share the payment links.",
      "Check who has paid and what is still outstanding.",
    ],
    example: {
      title: "Dummy £40 split example",
      rows: [
        { label: "8 players", value: "£5 each = £40" },
        { label: "Alternative split", value: "One player pays £10, six pay £5, one pays £0" },
        { label: "Important", value: "The total still needs to cover the team fee" },
      ],
      note: "Player payment links only work properly when player email addresses are saved on the squad record.",
    },
  },
  {
    id: "team-payments",
    title: "Team payments and ledger",
    intro: "The team payment ledger shows the actual team charges. Squad payments are a collection tool; the ledger is the team fee record.",
    steps: [
      "Open Team payments to see open, part-paid and paid charges.",
      "Use Pay now if an online payment link is available.",
      "Check the outstanding amount after player payments have come in.",
      "Raise any payment problem early rather than leaving it until after the due date.",
    ],
  },
  {
    id: "admin-fees",
    title: "Avoidable admin fees",
    intro: "Admin fees are not normal weekly charges. SIXFL does not want to charge them. They are only there when avoidable late action creates extra admin work.",
    steps: [
      "The late payment admin fee is £10. It may be added if a team fee is more than 7 days overdue and SIXFL has to spend extra time chasing it.",
      "The late confirmation admin fee is £10. It may be added if avoidable late availability confirmation creates extra fixture chasing or rearranging work.",
      "SIXFL may send reminders or warnings first where practical, but repeated or avoidable late action can still lead to the admin fee being added.",
      "You can avoid both by confirming availability on time and keeping team fees up to date.",
    ],
  },
  {
    id: "availability",
    title: "Fixture availability",
    intro: "Availability confirmation tells SIXFL whether your team is ready for the fixture. It should be done at least 72 hours before kick-off.",
    steps: [
      "Open Fixtures or Availability when your next game appears.",
      "Confirm the fixture if your team can play.",
      "Raise an issue early if you cannot play or are not sure.",
      "Do not wait until matchday if there is a problem. Avoidable late confirmation may lead to a £10 late confirmation admin fee.",
    ],
    example: {
      title: "Dummy availability example",
      rows: [
        { label: "Fixture", value: "Crescent United vs Example FC" },
        { label: "Good timing", value: "Confirmed 4 days before kick-off" },
        { label: "Problem timing", value: "Issue raised 1 day before kick-off needs admin review" },
      ],
    },
  },
  {
    id: "matchday-squad",
    title: "Matchday squad",
    intro: "Use the matchday squad area to organise who is playing in a specific fixture.",
    steps: [
      "Check who is available, maybe or has not responded.",
      "Pick the players you expect to use for that match.",
      "Keep an eye on maybes and no responses before matchday.",
      "Use your squad list as the starting point, then adjust for the fixture.",
    ],
  },
  {
    id: "results",
    title: "Results, scorers and Player of the Match",
    intro: "After a match, check the result and add any details SIXFL asks for, such as scorers or Player of the Match.",
    steps: [
      "Open Results after the game.",
      "Check the score is correct.",
      "Add scorers if the result page asks for them.",
      "Add Player of the Match where available.",
      "Raise an issue through the results area if something is wrong.",
    ],
    example: {
      title: "Dummy result example",
      rows: [
        { label: "Score", value: "Crescent United 5 - 3 Example FC" },
        { label: "Scorers", value: "Jack Smith 2, Ryan Jones 2, Sam Taylor 1" },
        { label: "Player of the Match", value: "Jack Smith" },
      ],
    },
  },
  {
    id: "issues",
    title: "Disputes and issues",
    intro: "Use the official issue routes when something needs checking. It is easier to track than informal messages.",
    steps: [
      "Raise a result issue if the score or match details are wrong.",
      "Include the fixture, what is wrong and what you think it should be.",
      "Wait for admin review before assuming the result has changed.",
    ],
  },
  {
    id: "contact",
    title: "Contacting SIXFL",
    intro: "Use the captain area first where possible. Contact SIXFL directly when something cannot be handled through the normal tools.",
    steps: [
      "Include your team name and fixture when contacting SIXFL.",
      "Use the proper issue route for results and fixture problems where available.",
      "For urgent matchday problems, contact SIXFL as soon as the issue is clear.",
    ],
  },
];

function StepList({ steps }: { steps: string[] }) {
  return (
    <ol className="mt-4 space-y-3 text-sm leading-6 text-white/66">
      {steps.map((step, index) => (
        <li key={step} className="flex gap-3">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-emerald-400/25 bg-emerald-500/10 text-xs font-bold text-emerald-100">
            {index + 1}
          </span>
          <span>{step}</span>
        </li>
      ))}
    </ol>
  );
}

function ExampleCard({ example }: { example: NonNullable<HelpSection["example"]> }) {
  return (
    <div className="mt-5 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-100/70">
        Example
      </p>
      <h3 className="mt-2 text-base font-semibold text-white">{example.title}</h3>
      <div className="mt-4 divide-y divide-emerald-400/10 rounded-xl border border-emerald-400/10 bg-black/20">
        {example.rows.map((row) => (
          <div key={row.label} className="grid gap-1 px-4 py-3 text-sm sm:grid-cols-[0.8fr_1.2fr]">
            <div className="font-semibold text-emerald-100/80">{row.label}</div>
            <div className="text-white/72">{row.value}</div>
          </div>
        ))}
      </div>
      {example.note ? <p className="mt-3 text-sm leading-6 text-emerald-50/75">{example.note}</p> : null}
    </div>
  );
}

export default async function CaptainHelpPage({
  params,
}: {
  params: Promise<{ teamid: string }>;
}) {
  const { teamid } = await params;
  await requireCaptain(teamid);

  const team = await prisma.team.findUnique({
    where: { id: teamid },
    select: {
      id: true,
      name: true,
      league: {
        select: {
          name: true,
          season: true,
        },
      },
    },
  });

  if (!team) {
    notFound();
  }

  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-3xl border border-emerald-400/15 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.16),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.03))] shadow-[0_24px_80px_rgba(0,0,0,0.3)]">
        <div className="px-6 py-6 lg:px-8 lg:py-8">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-300/80">
            Captain Help
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            How to run {team.name} on SIXFL
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-white/68 sm:text-base">
            Practical walkthroughs for squad, payments, availability, fixtures, results and matchday admin.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href={`/captain/team/${team.id}`}
              className="inline-flex items-center rounded-full border border-white/10 bg-black/20 px-5 py-3 text-sm font-medium text-white/80 transition hover:border-white/20 hover:bg-white/5 hover:text-white"
            >
              Back to dashboard
            </Link>
            <Link
              href={`/captain/team/${team.id}/guide`}
              className="inline-flex items-center rounded-full border border-emerald-400/30 bg-emerald-500/15 px-5 py-3 text-sm font-medium text-emerald-50 transition hover:bg-emerald-500/20"
            >
              Captain rules guide
            </Link>
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {sections.slice(0, 8).map((section) => (
          <a
            key={section.id}
            href={`#${section.id}`}
            className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 transition hover:border-emerald-400/25 hover:bg-emerald-500/10"
          >
            <p className="text-sm font-semibold text-white">{section.title}</p>
            <p className="mt-2 text-xs leading-5 text-white/50">Jump to this guide</p>
          </a>
        ))}
      </section>

      <section className="space-y-5">
        {sections.map((section) => (
          <article
            key={section.id}
            id={section.id}
            className="scroll-mt-24 overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04]"
          >
            <div className="border-b border-white/10 px-6 py-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-300/70">
                How it works
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-white">{section.title}</h2>
              <p className="mt-2 max-w-4xl text-sm leading-6 text-white/62">{section.intro}</p>
            </div>
            <div className="px-6 py-5">
              <StepList steps={section.steps} />
              {section.example ? <ExampleCard example={section.example} /> : null}
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
