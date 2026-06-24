// ========================================
// File: src/components/captain/CaptainOnboardingChecklist.tsx
// ========================================

import Link from "next/link";

import {
  CAPTAIN_AGREEMENT_TEXT,
  type CaptainOnboardingStatus,
} from "@/lib/captain/onboarding";
import { formatDateTimeInLondon } from "@/lib/datetime/london";
import { acceptCaptainAgreementAction } from "@/app/captain/team/[teamid]/onboarding/actions";

type ChecklistTone = "complete" | "attention" | "waiting";

type ChecklistItem = {
  title: string;
  text: string;
  tone: ChecklistTone;
  href?: string;
  actionLabel?: string;
};

function getToneClasses(tone: ChecklistTone) {
  switch (tone) {
    case "complete":
      return {
        icon: "border-emerald-400/25 bg-emerald-500/15 text-emerald-100",
        label: "Complete",
        labelClassName: "border-emerald-400/25 bg-emerald-500/10 text-emerald-100",
      };
    case "attention":
      return {
        icon: "border-amber-400/25 bg-amber-500/15 text-amber-100",
        label: "Needs attention",
        labelClassName: "border-amber-400/25 bg-amber-500/10 text-amber-100",
      };
    default:
      return {
        icon: "border-white/10 bg-white/[0.04] text-white/55",
        label: "Waiting",
        labelClassName: "border-white/10 bg-white/[0.04] text-white/60",
      };
  }
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

function ChecklistRow({ item }: { item: ChecklistItem }) {
  const tone = getToneClasses(item.tone);

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-black/20 p-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 gap-3">
        <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-sm font-bold ${tone.icon}`}>
          {item.tone === "complete" ? "✓" : item.tone === "attention" ? "!" : "·"}
        </div>

        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-white">{item.title}</h3>
            <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] ${tone.labelClassName}`}>
              {tone.label}
            </span>
          </div>
          <p className="mt-1 text-sm leading-6 text-white/62">{item.text}</p>
        </div>
      </div>

      {item.href && item.actionLabel ? (
        <Link
          href={item.href}
          className="inline-flex shrink-0 items-center justify-center rounded-full border border-emerald-400/25 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-500/15"
        >
          {item.actionLabel}
        </Link>
      ) : null}
    </div>
  );
}

export default function CaptainOnboardingChecklist({
  teamId,
  status,
}: {
  teamId: string;
  status: CaptainOnboardingStatus;
}) {
  const squadComplete = status.squadPlayerCount >= 6;
  const emailsComplete = status.squadPlayerCount > 0 && status.squadMissingEmailCount === 0;
  const availabilityComplete =
    !status.hasUpcomingFixture ||
    status.nextFixtureConfirmationStatus === "CONFIRMED" ||
    status.nextFixtureConfirmationStatus === "ISSUE_RAISED";
  const acceptedAt = formatAcceptedAt(status.captainAgreementAcceptedAt);

  const items: ChecklistItem[] = [
    {
      title: "Add your squad",
      text: squadComplete
        ? `${status.squadPlayerCount} squad players are saved.`
        : status.squadPlayerCount > 0
          ? `${status.squadPlayerCount} squad players are saved. Aim to add at least 6 before your first game.`
          : "Add your player names before your first fixture so the squad, availability and payment tools work properly.",
      tone: squadComplete ? "complete" : "attention",
      href: `/captain/team/${teamId}/captain-squad`,
      actionLabel: "Open squad",
    },
    {
      title: "Add player emails for squad payments",
      text: emailsComplete
        ? "Every saved squad player has an email address for payment links."
        : status.squadPlayerCount > 0
          ? `${status.squadMissingEmailCount} saved squad player${status.squadMissingEmailCount === 1 ? " is" : "s are"} missing an email address.`
          : "Player payment links can only be emailed when player email addresses are saved.",
      tone: emailsComplete ? "complete" : status.squadPlayerCount > 0 ? "attention" : "waiting",
      href: `/captain/team/${teamId}/captain-squad`,
      actionLabel: "Check emails",
    },
    {
      title: "Confirm availability",
      text: status.hasUpcomingFixture
        ? availabilityComplete
          ? "Your next fixture has been confirmed or an issue has been raised for admin review."
          : "Availability should be confirmed at least 72 hours before kick-off. Late confirmation may affect your fixture or lead to an admin fee."
        : "Your availability task will appear when your first fixture is scheduled.",
      tone: status.hasUpcomingFixture ? (availabilityComplete ? "complete" : "attention") : "waiting",
      href: `/captain/team/${teamId}/fixtures`,
      actionLabel: status.hasUpcomingFixture ? "Open fixtures" : "View fixtures",
    },
    {
      title: "Understand payments",
      text:
        status.openTeamChargeCount > 0
          ? `${status.openTeamChargeCount} team charge${status.openTeamChargeCount === 1 ? " is" : "s are"} currently open. Fees more than 7 days overdue may incur a £10 admin fee.`
          : "Team fee is £40 per match unless SIXFL has agreed otherwise. Squad payments can help captains collect from players.",
      tone: status.isAgreementAccepted ? "complete" : "attention",
      href: `/captain/team/${teamId}/payments`,
      actionLabel: "Open payments",
    },
    {
      title: "Read matchday rules",
      text: "Check kick-off times, late arrival expectations, footwear, shin pads, referee decisions and team conduct before your first game.",
      tone: status.isAgreementAccepted ? "complete" : "attention",
      href: `/captain/team/${teamId}/guide`,
      actionLabel: "Read guide",
    },
  ];

  return (
    <section className="overflow-hidden rounded-3xl border border-emerald-400/15 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.14),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.03))] shadow-[0_24px_80px_rgba(0,0,0,0.28)]">
      <div className="border-b border-white/10 px-6 py-6 lg:px-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-300/75">
              New team setup
            </p>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight text-white">
              Welcome to SIXFL — complete these before your first game
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-white/62">
              This keeps the important bits in your captain area instead of sending you lots of long emails.
            </p>
          </div>

          <Link
            href={`/captain/team/${teamId}/guide`}
            className="inline-flex items-center justify-center rounded-full border border-white/10 bg-black/20 px-5 py-3 text-sm font-semibold text-white/80 transition hover:border-white/20 hover:bg-white/5 hover:text-white"
          >
            Captain Guide
          </Link>
        </div>
      </div>

      <div className="grid gap-3 p-4 sm:p-6">
        {items.map((item) => (
          <ChecklistRow key={item.title} item={item} />
        ))}
      </div>

      <div className="border-t border-white/10 bg-black/20 px-6 py-6 lg:px-8">
        {status.isAgreementAccepted ? (
          <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4 text-sm text-emerald-100/85">
            Captain agreement accepted{acceptedAt ? ` on ${acceptedAt}` : ""}.
          </div>
        ) : (
          <form action={acceptCaptainAgreementAction} className="space-y-4">
            <input type="hidden" name="teamid" value={teamId} />
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
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
  );
}
