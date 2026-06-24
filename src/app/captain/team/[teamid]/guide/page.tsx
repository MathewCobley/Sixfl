// ========================================
// File: src/app/captain/team/[teamid]/guide/page.tsx
// ========================================

import Link from "next/link";
import { notFound } from "next/navigation";

import {
  CAPTAIN_AGREEMENT_TEXT,
  getCaptainOnboardingStatus,
} from "@/lib/captain/onboarding";
import { formatDateTimeInLondon } from "@/lib/datetime/london";
import { prisma } from "@/lib/prisma";
import { requireCaptain } from "@/lib/requireCaptain";
import { acceptCaptainAgreementAction } from "../onboarding/actions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "Captain Guide | SIXFL",
};

const guideSections = [
  {
    title: "Before your first game",
    items: [
      "Add your squad and make sure player names are clear.",
      "Add player email addresses if you want to use squad payment links.",
      "Check your first fixture, venue and kick-off time.",
      "Read the matchday rules and captain responsibilities below.",
    ],
  },
  {
    title: "Weekly responsibilities",
    items: [
      "Check your fixtures as soon as they are published.",
      "Confirm availability before the 72-hour deadline.",
      "Keep your squad details up to date.",
      "Make sure the team payment is covered on time.",
      "Record or check results promptly after the game.",
    ],
  },
  {
    title: "Availability confirmation",
    items: [
      "Availability should be confirmed at least 72 hours before kick-off.",
      "If there is a problem, raise it early through the fixture tools rather than waiting until matchday.",
      "Late confirmation may affect the fixture or lead to an admin fee where SIXFL has to chase or rearrange things.",
    ],
  },
  {
    title: "Payments and late fees",
    items: [
      "The standard team fee is £40 per fixture unless SIXFL has agreed otherwise.",
      "The captain remains responsible for the team fee even when squad payments are used.",
      "Fees more than 7 days overdue may incur a £10 admin fee.",
      "Payment issues should be raised early so they can be sorted before they become a problem.",
    ],
  },
  {
    title: "Squad payments",
    items: [
      "Squad payments help captains collect from players using secure Stripe payment links.",
      "Player links only work properly when each player has a valid email address saved.",
      "You can adjust individual player amounts for subs, guests or split payments.",
      "The squad payment tool does not remove the captain's responsibility for the overall team fee.",
    ],
  },
  {
    title: "Matchday conduct",
    items: [
      "Arrive in good time and be ready for your kick-off slot.",
      "Players should wear suitable footwear and shin pads where required by the venue or competition rules.",
      "Referee decisions must be respected. Concerns can be raised afterwards through the proper channel.",
      "Captains are expected to manage their team's behaviour on and around the pitch.",
    ],
  },
  {
    title: "Referees and results",
    items: [
      "Referees manage the game on the night and their decisions should be respected.",
      "Results should be checked promptly after each fixture.",
      "If something is wrong with a result, raise a dispute through the results area rather than informal messages.",
    ],
  },
  {
    title: "What happens if a team cancels",
    items: [
      "Tell SIXFL as early as possible if you cannot fulfil a fixture.",
      "Late cancellations can affect the opposition, referee, venue and league schedule.",
      "Repeated late cancellations may lead to charges, fixture action or review of the team's place in the league.",
    ],
  },
  {
    title: "Contacting SIXFL",
    items: [
      "Use the captain area and official SIXFL contact routes for league issues.",
      "Include the team name, fixture and clear details so the issue can be dealt with quickly.",
      "For urgent matchday problems, contact SIXFL as soon as the issue becomes clear.",
    ],
  },
];

function formatAcceptedAt(value: Date | null) {
  if (!value) return null;

  return formatDateTimeInLondon(value, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function CaptainGuidePage({
  params,
}: {
  params: Promise<{ teamid: string }>;
}) {
  const { teamid } = await params;
  await requireCaptain(teamid);

  const [team, onboardingStatus] = await Promise.all([
    prisma.team.findUnique({
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
    }),
    getCaptainOnboardingStatus(teamid),
  ]);

  if (!team) {
    notFound();
  }

  const acceptedAt = formatAcceptedAt(onboardingStatus.captainAgreementAcceptedAt);

  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-3xl border border-emerald-400/15 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.16),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.03))] shadow-[0_24px_80px_rgba(0,0,0,0.3)]">
        <div className="px-6 py-6 lg:px-8 lg:py-8">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-300/80">
            Captain Guide
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            Everything captains need to know
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-white/68 sm:text-base">
            A short reference for {team.name}. This keeps the key SIXFL rules and responsibilities in one place without bombarding captains with emails.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href={`/captain/team/${team.id}`}
              className="inline-flex items-center rounded-full border border-white/10 bg-black/20 px-5 py-3 text-sm font-medium text-white/80 transition hover:border-white/20 hover:bg-white/5 hover:text-white"
            >
              Back to dashboard
            </Link>
            <Link
              href={`/captain/team/${team.id}/fixtures`}
              className="inline-flex items-center rounded-full border border-emerald-400/30 bg-emerald-500/15 px-5 py-3 text-sm font-medium text-emerald-50 transition hover:bg-emerald-500/20"
            >
              Open fixtures
            </Link>
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        {guideSections.map((section) => (
          <article
            key={section.title}
            className="rounded-3xl border border-white/10 bg-white/[0.04] p-5"
          >
            <h2 className="text-lg font-semibold text-white">{section.title}</h2>
            <ul className="mt-4 space-y-3 text-sm leading-6 text-white/62">
              {section.items.map((item) => (
                <li key={item} className="flex gap-3">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-300" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </article>
        ))}
      </section>

      <section className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04]">
        <div className="border-b border-white/10 px-6 py-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
            Captain agreement
          </p>
          <h2 className="mt-2 text-xl font-semibold text-white">
            Confirm responsibility
          </h2>
        </div>

        <div className="px-6 py-6">
          {onboardingStatus.isAgreementAccepted ? (
            <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4 text-sm text-emerald-100/85">
              Captain agreement accepted{acceptedAt ? ` on ${acceptedAt}` : ""}.
            </div>
          ) : (
            <form action={acceptCaptainAgreementAction} className="space-y-4">
              <input type="hidden" name="teamid" value={team.id} />
              <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
                <p className="text-sm leading-6 text-white/76">{CAPTAIN_AGREEMENT_TEXT}</p>
              </div>
              <button
                type="submit"
                className="inline-flex w-full items-center justify-center rounded-2xl bg-emerald-300 px-5 py-3 text-sm font-bold text-black transition hover:bg-emerald-200 sm:w-auto"
              >
                I understand and accept
              </button>
            </form>
          )}
        </div>
      </section>
    </div>
  );
}
