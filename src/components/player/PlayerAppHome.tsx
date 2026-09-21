import Link from "next/link";
import {
  BanknotesIcon,
  CalendarDaysIcon,
  ChartBarSquareIcon,
  ChatBubbleLeftRightIcon,
  CheckCircleIcon,
  ChevronRightIcon,
  ClockIcon,
  UserCircleIcon,
} from "@heroicons/react/24/outline";

import PlayerFixtureTeams from "@/components/player/PlayerFixtureTeams";

type FixtureTeam = {
  name: string;
  logoUrl: string | null;
};

type AppFixture = {
  id: string;
  dateLabel: string;
  venueLabel: string | null;
  homeTeam: FixtureTeam;
  awayTeam: FixtureTeam;
};

type RecentResult = {
  id: string;
  opponent: string;
  dateLabel: string;
  goalsFor: number;
  goalsAgainst: number;
  outcome: "W" | "D" | "L";
};

type PlayerStats = {
  appearances: number;
  goals: number;
  assists: number;
};

function addPreviewMembershipId(
  href: string,
  previewMembershipId: string | null,
) {
  if (!previewMembershipId) return href;
  const separator = href.includes("?") ? "&" : "?";
  return `${href}${separator}previewMembershipId=${encodeURIComponent(previewMembershipId)}`;
}

function availabilityCopy(response: string | null) {
  switch (response) {
    case "AVAILABLE":
      return { label: "Available", dot: "bg-emerald-400" };
    case "MAYBE":
      return { label: "Maybe", dot: "bg-amber-300" };
    case "UNAVAILABLE":
      return { label: "Unavailable", dot: "bg-red-400" };
    default:
      return { label: "Respond", dot: "bg-amber-300" };
  }
}

function formatMoney(amountPence: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(amountPence / 100);
}

function initials(name: string | null) {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean).slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("") || "P";
}

function roleLabel(value: string | null) {
  if (!value) return "Player";
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function resultTone(outcome: RecentResult["outcome"]) {
  if (outcome === "W") return "bg-emerald-500 text-white";
  if (outcome === "L") return "bg-red-500 text-white";
  return "bg-slate-500 text-white";
}

export default function PlayerAppHome({
  teamId,
  teamName,
  teamLogoUrl,
  playerName,
  playerRole,
  squadNumber,
  preferredPosition,
  playerStats,
  nextFixture,
  nextAvailability,
  outstandingPence,
  nextPaymentUrl,
  recentResults,
  previewMembershipId,
  showTeamChat,
}: {
  teamId: string;
  teamName: string;
  teamLogoUrl: string | null;
  playerName: string | null;
  playerRole: string | null;
  squadNumber: number | null;
  preferredPosition: string | null;
  playerStats: PlayerStats;
  nextFixture: AppFixture | null;
  nextAvailability: string | null;
  outstandingPence: number;
  nextPaymentUrl: string | null;
  recentResults: RecentResult[];
  previewMembershipId: string | null;
  showTeamChat: boolean;
}) {
  const availability = availabilityCopy(nextAvailability);
  const fixturesHref = addPreviewMembershipId(
    `/player/team/${teamId}/availability`,
    previewMembershipId,
  );
  const availabilityHref = addPreviewMembershipId(
    nextFixture
      ? `/player/team/${teamId}/availability?fixtureId=${encodeURIComponent(nextFixture.id)}`
      : `/player/team/${teamId}/availability`,
    previewMembershipId,
  );
  const chatHref = addPreviewMembershipId(
    `/player/team/${teamId}/chat`,
    previewMembershipId,
  );
  const statsHref = addPreviewMembershipId(
    `/player/team/${teamId}/stats`,
    previewMembershipId,
  );
  const ledgerHref = addPreviewMembershipId(
    `/player/team/${teamId}/ledger`,
    previewMembershipId,
  );
  const resultsHref = addPreviewMembershipId(
    `/player/team/${teamId}/league-results`,
    previewMembershipId,
  );

  const secondaryLabel =
    preferredPosition?.trim() || roleLabel(playerRole);

  return (
    <section className="player-app-home px-3 pb-28 pt-3 text-white">
      <div className="mx-auto w-full max-w-xl space-y-4">
        <section className="overflow-hidden rounded-[1.7rem] border border-sky-400/20 bg-[radial-gradient(circle_at_top_right,rgba(14,165,233,0.12),transparent_35%),linear-gradient(145deg,#0b1a20,#07130f)] p-4 shadow-[0_22px_60px_rgba(0,0,0,0.32)]">
          <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
            <div className="flex h-16 w-16 items-center justify-center rounded-full border border-sky-300/25 bg-black/25 text-lg font-black text-white/75">
              {initials(playerName)}
            </div>

            <div className="min-w-0">
              <h1 className="truncate text-xl font-black tracking-tight">
                {playerName?.trim() || "SIXFL player"}
              </h1>
              <p className="mt-0.5 truncate text-sm text-white/65">{teamName}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {squadNumber ? (
                  <span className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-black text-emerald-200">
                    #{squadNumber}
                  </span>
                ) : null}
                <span className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-200">
                  {secondaryLabel}
                </span>
              </div>
            </div>

            <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl bg-white/[0.04]">
              {teamLogoUrl ? (
                <img
                  src={teamLogoUrl}
                  alt={`${teamName} badge`}
                  className="h-full w-full object-contain p-1"
                />
              ) : (
                <UserCircleIcon className="h-10 w-10 text-white/25" />
              )}
            </div>
          </div>

          <div className="mt-4 grid grid-cols-3 divide-x divide-white/10 rounded-2xl border border-white/[0.07] bg-black/20 py-3">
            <div className="px-3">
              <div className="text-xl font-black tabular-nums">{playerStats.appearances}</div>
              <div className="mt-0.5 text-[11px] text-white/45">Matches</div>
            </div>
            <div className="px-3">
              <div className="text-xl font-black tabular-nums">{playerStats.goals}</div>
              <div className="mt-0.5 text-[11px] text-white/45">Goals</div>
            </div>
            <div className="px-3">
              <div className="text-xl font-black tabular-nums">{playerStats.assists}</div>
              <div className="mt-0.5 text-[11px] text-white/45">Assists</div>
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl border border-white/[0.07] bg-black/20 px-3 py-2.5">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${availability.dot}`} />
              <div className="min-w-0">
                <div className="text-sm font-bold">{availability.label}</div>
                <div className="truncate text-[11px] text-white/40">Next match availability</div>
              </div>
            </div>
            <Link
              href={availabilityHref}
              className="inline-flex min-h-9 shrink-0 items-center gap-2 rounded-xl border border-emerald-400/40 bg-emerald-500/10 px-3 text-xs font-bold text-emerald-200"
            >
              <CalendarDaysIcon className="h-4 w-4" />
              Edit
            </Link>
          </div>
        </section>

        {nextFixture ? (
          <section className="overflow-hidden rounded-[1.65rem] border border-sky-400/35 bg-[radial-gradient(circle_at_top_right,rgba(37,99,235,0.18),transparent_38%),rgba(2,13,20,0.92)] p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.16em] text-sky-200/75">
                <CalendarDaysIcon className="h-4 w-4 text-sky-300" />
                Next match
              </p>
              <Link href={fixturesHref} className="text-xs font-semibold text-sky-300">
                View all →
              </Link>
            </div>

            <div className="mt-4 rounded-2xl border border-white/[0.06] bg-black/20 px-3 py-4">
              <PlayerFixtureTeams
                homeTeam={nextFixture.homeTeam}
                awayTeam={nextFixture.awayTeam}
              />
            </div>

            <div className="mt-3 grid gap-1.5 text-xs text-white/55">
              <div className="flex items-center gap-2">
                <ClockIcon className="h-4 w-4 shrink-0 text-sky-200/70" />
                <span>{nextFixture.dateLabel}</span>
              </div>
              {nextFixture.venueLabel ? (
                <div className="pl-6">{nextFixture.venueLabel}</div>
              ) : null}
            </div>
          </section>
        ) : (
          <section className="rounded-[1.65rem] border border-white/10 bg-white/[0.04] p-4">
            <p className="text-[11px] font-black uppercase tracking-[0.16em] text-sky-200/70">
              Next match
            </p>
            <h2 className="mt-2 text-lg font-bold">Nothing published yet</h2>
            <p className="mt-1 text-sm text-white/45">
              Your next fixture will appear here when SIXFL publishes it.
            </p>
          </section>
        )}

        <section className="grid grid-cols-2 gap-3">
          <Link
            href={fixturesHref}
            className="rounded-[1.45rem] border border-sky-400/35 bg-sky-500/10 p-4"
          >
            <CalendarDaysIcon className="h-7 w-7 text-sky-300" />
            <div className="mt-4 text-sm font-black">My Fixtures</div>
            <div className="mt-1 text-xs leading-5 text-white/45">Upcoming matches</div>
          </Link>

          <Link
            href={availabilityHref}
            className="rounded-[1.45rem] border border-emerald-400/35 bg-emerald-500/10 p-4"
          >
            <CheckCircleIcon className="h-7 w-7 text-emerald-300" />
            <div className="mt-4 text-sm font-black">Availability</div>
            <div className="mt-1 text-xs leading-5 text-white/45">Set your availability</div>
          </Link>

          <Link
            href={nextPaymentUrl || ledgerHref}
            target={nextPaymentUrl ? "_blank" : undefined}
            className="rounded-[1.45rem] border border-amber-400/35 bg-amber-500/10 p-4"
          >
            <BanknotesIcon className="h-7 w-7 text-amber-300" />
            <div className="mt-4 text-sm font-black">Match Fees</div>
            <div className="mt-1 text-xs leading-5 text-white/45">
              {outstandingPence > 0 ? `${formatMoney(outstandingPence)} due` : "View payment history"}
            </div>
          </Link>

          <Link
            href={showTeamChat ? chatHref : statsHref}
            className="rounded-[1.45rem] border border-violet-400/35 bg-violet-500/10 p-4"
          >
            {showTeamChat ? (
              <ChatBubbleLeftRightIcon className="h-7 w-7 text-violet-300" />
            ) : (
              <ChartBarSquareIcon className="h-7 w-7 text-violet-300" />
            )}
            <div className="mt-4 text-sm font-black">
              {showTeamChat ? "Messages" : "My Stats"}
            </div>
            <div className="mt-1 text-xs leading-5 text-white/45">
              {showTeamChat ? "Admin preview of chat" : "Goals, assists and form"}
            </div>
          </Link>
        </section>

        <section className="overflow-hidden rounded-[1.55rem] border border-white/10 bg-white/[0.035]">
          <div className="flex items-center justify-between px-4 pt-4">
            <p className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.16em] text-white/55">
              <ChartBarSquareIcon className="h-4 w-4 text-sky-300" />
              Recent form
            </p>
            <Link href={resultsHref} className="text-xs font-semibold text-sky-300">
              View all →
            </Link>
          </div>

          {recentResults.length ? (
            <div className="mt-3 flex gap-2 overflow-x-auto px-4 pb-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {recentResults.map((result) => (
                <div
                  key={result.id}
                  className="min-w-[7.4rem] rounded-2xl border border-white/[0.06] bg-black/20 p-3"
                >
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex h-7 w-7 items-center justify-center rounded-lg text-xs font-black ${resultTone(result.outcome)}`}>
                      {result.outcome}
                    </span>
                    <span className="text-sm font-black tabular-nums">
                      {result.goalsFor} - {result.goalsAgainst}
                    </span>
                  </div>
                  <div className="mt-2 truncate text-xs font-semibold text-white/70">
                    {result.opponent}
                  </div>
                  <div className="mt-1 text-[11px] text-white/35">{result.dateLabel}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="px-4 pb-4 pt-3 text-sm text-white/40">
              Your recent results will appear here.
            </div>
          )}
        </section>

        <Link
          href="/player/referrals"
          className="flex items-center justify-between gap-4 rounded-[1.55rem] border border-emerald-400/35 bg-[linear-gradient(120deg,rgba(16,185,129,0.16),rgba(4,120,87,0.10))] p-4"
        >
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-200/70">
              Team referrals
            </p>
            <h2 className="mt-1 text-base font-black">Refer a new team and earn £75</h2>
            <p className="mt-1 text-xs leading-5 text-emerald-50/55">
              Share your private referral link.
            </p>
          </div>
          <span className="inline-flex shrink-0 items-center gap-1 rounded-xl bg-emerald-400 px-3 py-2 text-xs font-black text-black">
            Get link
            <ChevronRightIcon className="h-4 w-4" />
          </span>
        </Link>
      </div>
    </section>
  );
}
