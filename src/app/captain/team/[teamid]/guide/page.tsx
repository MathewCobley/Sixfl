// ========================================
// File: src/app/captain/team/[teamid]/guide/page.tsx
// ========================================

import Link from "next/link";
import { notFound } from "next/navigation";

import {
  CAPTAIN_AGREEMENT_TEXT,
  CAPTAIN_AGREEMENT_VERSION,
  getCaptainOnboardingStatus,
} from "@/lib/captain/onboarding";
import { formatDateTimeInLondon } from "@/lib/datetime/london";
import { prisma } from "@/lib/prisma";
import { requireCaptain } from "@/lib/requireCaptain";
import { acceptCaptainAgreementAction } from "../onboarding/actions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "Captain Guide & Terms | SIXFL",
};

const guideSections = [
  {
    title: "Before your first game",
    items: [
      "Add your squad and make sure player names are clear.",
      "Add player email addresses if you want to use squad payment links.",
      "Check your first fixture, venue and kick-off time.",
      "Read the captain responsibilities, League Rules and Match Rules.",
    ],
  },
  {
    title: "Captain terms and conditions",
    items: [
      "The captain is responsible for team communication, squad management, fixture confirmation and making sure team fees are covered.",
      "The captain should raise fixture, payment or player issues early using the captain area or official SIXFL contact routes.",
      "Repeated late payment, late confirmation, poor conduct or avoidable fixture issues may lead to admin fees, fixture action or review of the team's place in the league.",
      "The captain agreement below records acceptance of these responsibilities. Active rules are versioned and previous versions are retained by SIXFL.",
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
      "A £10 late confirmation admin fee may be added if avoidable late confirmation creates extra admin, fixture chasing or rearranging work.",
      "SIXFL may send reminders or warnings first where practical, but captains should not rely on a warning before acting.",
    ],
  },
  {
    title: "Earliest and latest kick-off times",
    items: [
      "Tell SIXFL early if your team has a regular timing rule, such as not being able to play before 19:00 or after 20:20.",
      "Keep the rule clear and realistic so it can be considered when fixtures are generated.",
      "SIXFL will try to accommodate genuine timing restrictions where possible, but this depends on venue slots, referees, opposition and the wider league schedule.",
      "Timing rules are requests rather than guarantees.",
      "If a published kick-off time creates a genuine problem, raise it through the fixture tools as early as possible.",
    ],
  },
  {
    title: "Payments and late fees",
    items: [
      "The standard team fee is £40 per fixture unless SIXFL has agreed otherwise.",
      "The captain remains responsible for the team fee even when squad payments are used.",
      "Match fees are due on match day unless SIXFL has agreed otherwise.",
      "A £10 late payment admin fee may be added if a team fee is more than 7 days overdue and SIXFL has to spend extra time chasing it.",
      "Payment reminders or warnings may be sent first where practical, but payment issues should still be raised early so they can be sorted before they become a problem.",
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
    title: "Safety, referees and results",
    items: [
      "Shin pads are mandatory for every player. A referee may prevent a player taking part until required safety equipment is being worn.",
      "Referees manage the game on the night and decisions regarding facts connected with play are final.",
      "A player shown a red card must promptly leave the playing area and any nearby area the referee reasonably directs them to leave.",
      "Refusal or unreasonable delay in leaving may be treated as further misconduct and can lead to abandonment if the match cannot safely or properly continue.",
      "If something is wrong with a recorded result, raise a dispute through the results area rather than informal messages.",
    ],
  },
  {
    title: "What happens if a team cancels",
    items: [
      "Tell SIXFL directly as early as possible if you cannot fulfil a fixture. An agreement only with the opposition does not cancel or rearrange the fixture.",
      "A team cancelling less than 24 hours before kick-off remains liable for its own match fee unless SIXFL expressly agrees otherwise.",
      "A no-show or repeated avoidable late cancellation may lead to a forfeit, disciplinary action or review of the team's place in the league.",
    ],
  },
  {
    title: "Reviews and evidence",
    items: [
      "SIXFL may consider referee reports, available footage, messages, system records and relevant witness or player accounts.",
      "Video can be incomplete or limited to one angle; something not visible on a recording does not by itself establish that it did not happen.",
      "There is no automatic right to an independent appeal or to a frame-by-frame re-refereeing process.",
      "SIXFL may reconsider a decision if genuinely new and material evidence is provided or an obvious administrative error is identified.",
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

const quickLinks = [
  "Captain terms and conditions",
  "Availability confirmation",
  "Payments and late fees",
  "What happens if a team cancels",
];

function getSectionId(title: string) {
  return title
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

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
            Captain guide
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            Captain guide and terms
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-white/68 sm:text-base">
            A short reference for {team.name}. This keeps payment responsibilities,
            captain terms and key SIXFL processes in one place. The League Rules
            and Match Rules remain the authoritative rule documents.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href={`/captain/team/${team.id}`}
              className="inline-flex items-center rounded-full border border-white/10 bg-black/20 px-5 py-3 text-sm font-medium text-white/80 transition hover:border-white/20 hover:bg-white/5 hover:text-white"
            >
              Back to dashboard
            </Link>
            <Link
              href={`/captain/team/${team.id}/rules`}
              className="inline-flex items-center rounded-full border border-emerald-400/30 bg-emerald-500/15 px-5 py-3 text-sm font-medium text-emerald-50 transition hover:bg-emerald-500/20"
            >
              Open match rules
            </Link>
            <Link
              href="/league-rules"
              className="inline-flex items-center rounded-full border border-white/10 bg-black/20 px-5 py-3 text-sm font-medium text-white/80 transition hover:border-white/20 hover:bg-white/5 hover:text-white"
            >
              Open league rules
            </Link>
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {quickLinks.map((title) => (
          <a
            key={title}
            href={`#${getSectionId(title)}`}
            className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4 transition hover:bg-emerald-500/15"
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-100/70">
              Jump to
            </p>
            <p className="mt-2 text-sm font-semibold text-white">{title}</p>
          </a>
        ))}
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        {guideSections.map((section) => (
          <article
            key={section.title}
            id={getSectionId(section.title)}
            className="scroll-mt-28 rounded-3xl border border-white/10 bg-white/[0.04] p-5"
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
            Captain terms
          </p>
          <h2 className="mt-2 text-xl font-semibold text-white">
            Confirm responsibility
          </h2>
        </div>

        <div className="px-6 py-6">
          {onboardingStatus.isAgreementAccepted ? (
            <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4 text-sm text-emerald-100/85">
              Captain agreement accepted{acceptedAt ? ` on ${acceptedAt}` : ""}
              {onboardingStatus.captainAgreementVersion
                ? ` · version ${onboardingStatus.captainAgreementVersion}`
                : " · accepted before version tracking"}.
            </div>
          ) : (
            <form action={acceptCaptainAgreementAction} className="space-y-4">
              <input type="hidden" name="teamid" value={team.id} />
              <label className="flex cursor-pointer gap-3 rounded-2xl border border-white/10 bg-black/25 p-4">
                <input
                  type="checkbox"
                  name="accepted"
                  required
                  className="mt-1 h-5 w-5 shrink-0 rounded border-white/20 bg-black text-emerald-400"
                />
                <span className="text-sm leading-6 text-white/76">
                  {CAPTAIN_AGREEMENT_TEXT} (Captain terms version{" "}
                  {CAPTAIN_AGREEMENT_VERSION}.)
                </span>
              </label>
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
