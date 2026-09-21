import Link from "next/link";
import {
  BanknotesIcon,
  CalendarDaysIcon,
  ChatBubbleLeftRightIcon,
  CheckCircleIcon,
  ChevronRightIcon,
  ClockIcon,
  PlayCircleIcon,
  TrophyIcon,
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
  opponent: string;
  dateLabel: string;
  goalsFor: number;
  goalsAgainst: number;
  outcome: "W" | "D" | "L";
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
      return { label: "You're available", tone: "text-emerald-200", dot: "bg-emerald-400" };
    case "MAYBE":
      return { label: "You said maybe", tone: "text-amber-100", dot: "bg-amber-300" };
    case "UNAVAILABLE":
      return { label: "You're unavailable", tone: "text-red-100", dot: "bg-red-400" };
    default:
      return { label: "Availability needed", tone: "text-amber-100", dot: "bg-amber-300" };
  }
}

function formatMoney(amountPence: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(amountPence / 100);
}

export default function PlayerAppHome({
  teamId,
  playerName,
  leagueName,
  nextFixture,
  nextAvailability,
  outstandingPence,
  nextPaymentUrl,
  recentResult,
  previewMembershipId,
  showTeamChat,
}: {
  teamId: string;
  playerName: string | null;
  leagueName: string | null;
  nextFixture: AppFixture | null;
  nextAvailability: string | null;
  outstandingPence: number;
  nextPaymentUrl: string | null;
  recentResult: RecentResult | null;
  previewMembershipId: string | null;
  showTeamChat: boolean;
}) {
  const firstName = playerName?.trim().split(/\s+/)[0] || null;
  const availability = availabilityCopy(nextAvailability);
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
  const tvHref = addPreviewMembershipId(
    `/player/team/${teamId}/tv`,
    previewMembershipId,
  );
  const goalHref = `/goal-of-the-month?from=player&teamId=${encodeURIComponent(teamId)}${
    previewMembershipId
      ? `&previewMembershipId=${encodeURIComponent(previewMembershipId)}`
      : ""
  }`;

  return (
    <section className="player-app-home px-4 pb-28 pt-3 text-white">
      <div className="mx-auto w-full max-w-xl">
        <div className="mb-5">
          <p className="text-sm font-medium text-white/50">
            {firstName ? `Hi ${firstName}` : "Your SIXFL app"}
          </p>
          <h1 className="mt-1 text-2xl font-black tracking-tight text-white">
            Here&apos;s what matters next
          </h1>
          {leagueName ? (
            <p className="mt-1 text-sm text-white/40">{leagueName}</p>
          ) : null}
        </div>

        {nextFixture ? (
          <section className="overflow-hidden rounded-[1.8rem] bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.22),transparent_42%),linear-gradient(145deg,#10271f,#0a1713)] p-5 shadow-[0_22px_60px_rgba(0,0,0,0.32)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-emerald-300/75">
                  Next match
                </p>
                <div className="mt-2 flex items-center gap-2 text-sm font-semibold text-white/80">
                  <CalendarDaysIcon className="h-4 w-4 text-emerald-300" />
                  <span>{nextFixture.dateLabel}</span>
                </div>
              </div>
              <span className="rounded-full bg-black/25 px-3 py-1 text-[11px] font-bold text-white/55">
                Upcoming
              </span>
            </div>

            <div className="my-6 rounded-[1.45rem] bg-black/20 px-4 py-5">
              <PlayerFixtureTeams
                homeTeam={nextFixture.homeTeam}
                awayTeam={nextFixture.awayTeam}
              />
            </div>

            {nextFixture.venueLabel ? (
              <div className="flex items-center gap-2 text-sm text-white/55">
                <ClockIcon className="h-4 w-4" />
                <span>{nextFixture.venueLabel}</span>
              </div>
            ) : null}

            <div className="mt-4 flex items-center gap-2">
              <span className={`h-2.5 w-2.5 rounded-full ${availability.dot}`} />
              <span className={`text-sm font-semibold ${availability.tone}`}>
                {availability.label}
              </span>
            </div>

            <Link
              href={availabilityHref}
              className="mt-5 flex min-h-12 w-full items-center justify-center rounded-2xl bg-emerald-400 px-5 text-sm font-black text-black transition active:scale-[0.99]"
            >
              {nextAvailability ? "Update availability" : "Confirm availability"}
            </Link>
          </section>
        ) : (
          <section className="rounded-[1.8rem] bg-white/[0.05] p-5">
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-emerald-300/75">
              Next match
            </p>
            <h2 className="mt-2 text-xl font-bold">Nothing published yet</h2>
            <p className="mt-2 text-sm leading-6 text-white/50">
              Your next fixture will appear here as soon as SIXFL publishes it.
            </p>
          </section>
        )}

        <section className="mt-6">
          <div className="mb-3 flex items-end justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/35">
                Your actions
              </p>
              <h2 className="mt-1 text-lg font-bold">Keep yourself match-ready</h2>
            </div>
          </div>

          <div className="overflow-hidden rounded-[1.5rem] bg-white/[0.045]">
            <Link
              href={availabilityHref}
              className="flex min-h-16 items-center gap-4 border-b border-white/[0.06] px-4 py-3 active:bg-white/[0.04]"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-400/12 text-emerald-300">
                <CheckCircleIcon className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold text-white">Availability</span>
                <span className="mt-0.5 block text-xs text-white/45">
                  {nextFixture ? availability.label : "No fixture to respond to yet"}
                </span>
              </span>
              <ChevronRightIcon className="h-5 w-5 text-white/25" />
            </Link>

            {showTeamChat ? (
              <Link
                href={chatHref}
                className="flex min-h-16 items-center gap-4 border-b border-white/[0.06] px-4 py-3 active:bg-white/[0.04]"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-violet-400/10 text-violet-200">
                  <ChatBubbleLeftRightIcon className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold text-white">SIXFL Chat</span>
                  <span className="mt-0.5 block text-xs text-white/45">
                    Team conversation and private captain messages
                  </span>
                </span>
                <ChevronRightIcon className="h-5 w-5 text-white/25" />
              </Link>
            ) : null}

            <Link
              href={nextPaymentUrl || ledgerHref}
              target={nextPaymentUrl ? "_blank" : undefined}
              className="flex min-h-16 items-center gap-4 border-b border-white/[0.06] px-4 py-3 active:bg-white/[0.04]"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-amber-400/12 text-amber-200">
                <BanknotesIcon className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold text-white">Match fees</span>
                <span className="mt-0.5 block text-xs text-white/45">
                  {outstandingPence > 0
                    ? `${formatMoney(outstandingPence)} waiting to be paid`
                    : "You're all paid up"}
                </span>
              </span>
              {outstandingPence > 0 ? (
                <span className="rounded-full bg-amber-300 px-2.5 py-1 text-xs font-black text-black">
                  Pay
                </span>
              ) : (
                <ChevronRightIcon className="h-5 w-5 text-white/25" />
              )}
            </Link>

            <Link
              href={statsHref}
              className="flex min-h-16 items-center gap-4 px-4 py-3 active:bg-white/[0.04]"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-sky-400/10 text-sky-200">
                <TrophyIcon className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold text-white">Your stats</span>
                <span className="mt-0.5 block text-xs text-white/45">
                  Goals, appearances and player performance
                </span>
              </span>
              <ChevronRightIcon className="h-5 w-5 text-white/25" />
            </Link>
          </div>
        </section>

        <section className="mt-6">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/35">
            Latest
          </p>

          {recentResult ? (
            <Link
              href={resultsHref}
              className="mt-3 flex items-center justify-between gap-4 rounded-[1.5rem] bg-white/[0.045] px-4 py-4 active:bg-white/[0.07]"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex h-8 w-8 items-center justify-center rounded-xl text-sm font-black ${
                      recentResult.outcome === "W"
                        ? "bg-emerald-400/15 text-emerald-200"
                        : recentResult.outcome === "L"
                          ? "bg-red-400/12 text-red-100"
                          : "bg-white/[0.08] text-white/70"
                    }`}
                  >
                    {recentResult.outcome}
                  </span>
                  <div>
                    <div className="truncate text-sm font-bold text-white">
                      vs {recentResult.opponent}
                    </div>
                    <div className="mt-0.5 text-xs text-white/40">
                      {recentResult.dateLabel}
                    </div>
                  </div>
                </div>
              </div>
              <div className="shrink-0 text-2xl font-black tabular-nums text-white">
                {recentResult.goalsFor} - {recentResult.goalsAgainst}
              </div>
            </Link>
          ) : (
            <div className="mt-3 rounded-[1.5rem] bg-white/[0.045] px-4 py-4 text-sm text-white/45">
              Your latest result will appear here.
            </div>
          )}

          <div className="mt-3 grid grid-cols-2 gap-3">
            <Link
              href={tvHref}
              className="rounded-[1.45rem] bg-fuchsia-400/[0.08] p-4 active:bg-fuchsia-400/[0.12]"
            >
              <PlayCircleIcon className="h-6 w-6 text-fuchsia-200" />
              <div className="mt-4 text-sm font-bold text-white">SIXFL TV</div>
              <div className="mt-1 text-xs leading-5 text-white/40">
                Highlights and match clips
              </div>
            </Link>

            <Link
              href={goalHref}
              className="rounded-[1.45rem] bg-emerald-400/[0.08] p-4 active:bg-emerald-400/[0.12]"
            >
              <TrophyIcon className="h-6 w-6 text-emerald-200" />
              <div className="mt-4 text-sm font-bold text-white">Goal of the Month</div>
              <div className="mt-1 text-xs leading-5 text-white/40">
                Watch nominees and vote
              </div>
            </Link>
          </div>
        </section>

        <div className="mt-6 flex items-center justify-center gap-4 text-xs text-white/35">
          <Link href={resultsHref} className="py-2">League results</Link>
          <span>·</span>
          <Link href="/player/referrals" className="py-2">Refer a team</Link>
          <span>·</span>
          <Link href="/api/auth/signout" className="py-2">Sign out</Link>
        </div>
      </div>
    </section>
  );
}
