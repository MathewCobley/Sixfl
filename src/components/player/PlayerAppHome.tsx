import Link from "next/link";
import {
  BanknotesIcon,
  CalendarDaysIcon,
  ChartBarSquareIcon,
  ChatBubbleLeftRightIcon,
  CheckCircleIcon,
  ChevronRightIcon,
  TrophyIcon,
  UserCircleIcon,
} from "@heroicons/react/24/outline";

type FixtureTeam = {
  name: string;
  logoUrl: string | null;
};

type AppFixture = {
  id: string;
  dateLabel: string;
  timeLabel: string;
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
      return { label: "Available", tone: "text-emerald-100", dot: "bg-emerald-400" };
    case "MAYBE":
      return { label: "Maybe", tone: "text-amber-100", dot: "bg-amber-300" };
    case "UNAVAILABLE":
      return { label: "Unavailable", tone: "text-red-100", dot: "bg-red-400" };
    default:
      return { label: "Respond", tone: "text-amber-100", dot: "bg-amber-300" };
  }
}

function formatMoney(amountPence: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(amountPence / 100);
}

function initials(value: string | null) {
  const parts = (value ?? "").trim().split(/\s+/).filter(Boolean).slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("") || "P";
}

function resultTone(outcome: RecentResult["outcome"]) {
  if (outcome === "W") return "bg-emerald-400/20 text-emerald-100";
  if (outcome === "L") return "bg-red-400/18 text-red-100";
  return "bg-white/10 text-white/75";
}

export default function PlayerAppHome({
  teamId,
  teamName,
  teamLogoUrl,
  playerName,
  playerImageUrl,
  playerRoleLabel,
  squadNumber,
  preferredPosition,
  stats,
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
  playerImageUrl: string | null;
  playerRoleLabel: string | null;
  squadNumber: number | null;
  preferredPosition: string | null;
  stats: PlayerStats;
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
  const chatHref = addPreviewMembershipId(
    `/player/team/${teamId}/chat`,
    previewMembershipId,
  );
  const fourthAction = showTeamChat
    ? {
        href: chatHref,
        title: "Messages",
        body: "Whole Squad Chat and private messages",
        icon: ChatBubbleLeftRightIcon,
        classes: "border-violet-400/35 bg-violet-500/15 text-violet-100",
      }
    : {
        href: statsHref,
        title: "My Stats",
        body: "Goals, assists and appearances",
        icon: ChartBarSquareIcon,
        classes: "border-violet-400/30 bg-violet-500/10 text-violet-100",
      };

  const FourthIcon = fourthAction.icon;

  return (
    <section className="player-app-home px-3 pb-28 pt-3 text-white sm:px-4">
      <div className="mx-auto w-full max-w-xl space-y-4">
        <section className="overflow-hidden rounded-[1.7rem] border border-sky-400/20 bg-[radial-gradient(circle_at_top_right,rgba(14,165,233,0.12),transparent_38%),linear-gradient(145deg,#0b1a22,#09140f)] shadow-[0_18px_55px_rgba(0,0,0,0.32)]">
          <div className="flex items-center gap-4 px-4 pb-4 pt-5">
            <div className="flex h-[4.6rem] w-[4.6rem] shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-sky-300/25 bg-black/30">
              {playerImageUrl ? (
                <img
                  src={playerImageUrl}
                  alt={playerName ? `${playerName} profile` : "Player profile"}
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="text-xl font-black text-white/60">
                  {initials(playerName)}
                </span>
              )}
            </div>

            <div className="min-w-0 flex-1">
              <h1 className="truncate text-2xl font-black tracking-tight text-white">
                {playerName || "SIXFL Player"}
              </h1>
              <p className="mt-0.5 truncate text-base font-medium text-white/65">{teamName}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {squadNumber ? (
                  <span className="rounded-full border border-emerald-400/35 bg-emerald-500/15 px-2.5 py-1 text-xs font-black text-emerald-100">
                    #{squadNumber}
                  </span>
                ) : null}
                <span className="rounded-full border border-emerald-400/25 bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-100">
                  {preferredPosition || playerRoleLabel || "Player"}
                </span>
              </div>
            </div>

            <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-white">
              {teamLogoUrl ? (
                <img
                  src={teamLogoUrl}
                  alt={`${teamName} badge`}
                  className="h-full w-full object-contain"
                />
              ) : (
                <span className="text-sm font-black text-black/65">
                  {initials(teamName)}
                </span>
              )}
            </div>
          </div>

          <div className="mx-3 mb-3 grid grid-cols-[1fr_1fr_1fr_1.45fr] divide-x divide-white/10 overflow-hidden rounded-2xl border border-white/[0.07] bg-black/25">
            {[
              ["Matches", stats.appearances],
              ["Goals", stats.goals],
              ["Assists", stats.assists],
            ].map(([label, value]) => (
              <Link
                key={String(label)}
                href={statsHref}
                className="px-2 py-3 text-center active:bg-white/[0.04]"
              >
                <div className="text-xl font-black tabular-nums text-white">{value}</div>
                <div className="mt-0.5 text-[11px] text-white/45">{label}</div>
              </Link>
            ))}
            <Link
              href={availabilityHref}
              className="flex items-center justify-center gap-2 px-2 py-3 active:bg-white/[0.04]"
            >
              <span className={`h-3 w-3 shrink-0 rounded-full shadow-[0_0_14px_currentColor] ${availability.dot}`} />
              <span className="min-w-0">
                <span className={`block truncate text-xs font-bold ${availability.tone}`}>
                  {availability.label}
                </span>
                <span className="mt-0.5 block text-[10px] text-white/35">Next match</span>
              </span>
            </Link>
          </div>
        </section>

        <section className="overflow-hidden rounded-[1.7rem] border border-sky-400/35 bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.18),transparent_42%),linear-gradient(145deg,#0b1e2a,#091611)] p-4 shadow-[0_18px_55px_rgba(0,0,0,0.28)]">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <CalendarDaysIcon className="h-5 w-5 text-sky-300" />
              <p className="text-xs font-black uppercase tracking-[0.16em] text-white/65">
                Next match
              </p>
            </div>
            <Link href={fixturesHref} className="text-xs font-semibold text-sky-300">
              View all →
            </Link>
          </div>

          {nextFixture ? (
            <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
              <div className="min-w-0 text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-white">
                  {nextFixture.homeTeam.logoUrl ? (
                    <img
                      src={nextFixture.homeTeam.logoUrl}
                      alt={`${nextFixture.homeTeam.name} badge`}
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <span className="text-sm font-black text-black/60">
                      {initials(nextFixture.homeTeam.name)}
                    </span>
                  )}
                </div>
                <div className="mt-2 truncate text-xs font-bold text-white">{nextFixture.homeTeam.name}</div>
              </div>

              <span className="text-lg font-black text-white/55">VS</span>

              <div className="min-w-0 text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-white">
                  {nextFixture.awayTeam.logoUrl ? (
                    <img
                      src={nextFixture.awayTeam.logoUrl}
                      alt={`${nextFixture.awayTeam.name} badge`}
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <span className="text-sm font-black text-black/60">
                      {initials(nextFixture.awayTeam.name)}
                    </span>
                  )}
                </div>
                <div className="mt-2 truncate text-xs font-bold text-white">{nextFixture.awayTeam.name}</div>
              </div>

              <div className="col-span-3 mt-2 grid gap-1 border-t border-white/10 pt-3 text-center text-xs text-white/55">
                <div className="font-semibold text-white/75">
                  {nextFixture.dateLabel} · {nextFixture.timeLabel}
                </div>
                {nextFixture.venueLabel ? <div>{nextFixture.venueLabel}</div> : null}
              </div>
            </div>
          ) : (
            <div className="mt-4 rounded-2xl bg-black/20 p-4 text-sm text-white/50">
              Your next fixture will appear here as soon as SIXFL publishes it.
            </div>
          )}
        </section>

        <section className="grid grid-cols-2 gap-2.5">
          <Link
            href={fixturesHref}
            className="rounded-[1.4rem] border border-sky-400/40 bg-sky-500/15 p-4 active:scale-[0.99]"
          >
            <CalendarDaysIcon className="h-7 w-7 text-sky-300" />
            <div className="mt-4 text-base font-black">My Fixtures</div>
            <div className="mt-1 text-xs leading-5 text-white/50">Upcoming matches and results</div>
          </Link>

          <Link
            href={availabilityHref}
            className="rounded-[1.4rem] border border-emerald-400/40 bg-emerald-500/15 p-4 active:scale-[0.99]"
          >
            <CheckCircleIcon className="h-7 w-7 text-emerald-300" />
            <div className="mt-4 text-base font-black">Availability</div>
            <div className="mt-1 text-xs leading-5 text-white/50">Set your upcoming availability</div>
          </Link>

          <Link
            href={nextPaymentUrl || ledgerHref}
            target={nextPaymentUrl ? "_blank" : undefined}
            className="rounded-[1.4rem] border border-amber-400/40 bg-amber-500/15 p-4 active:scale-[0.99]"
          >
            <BanknotesIcon className="h-7 w-7 text-amber-300" />
            <div className="mt-4 text-base font-black">Match Fees</div>
            <div className="mt-1 text-xs leading-5 text-white/50">
              {outstandingPence > 0
                ? `${formatMoney(outstandingPence)} outstanding`
                : "View your payments"}
            </div>
          </Link>

          <Link
            href={fourthAction.href}
            className={`rounded-[1.4rem] border p-4 active:scale-[0.99] ${fourthAction.classes}`}
          >
            <FourthIcon className="h-7 w-7" />
            <div className="mt-4 text-base font-black text-white">{fourthAction.title}</div>
            <div className="mt-1 text-xs leading-5 text-white/50">{fourthAction.body}</div>
          </Link>
        </section>

        <section className="rounded-[1.5rem] border border-sky-400/20 bg-white/[0.035] p-3.5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <ChartBarSquareIcon className="h-5 w-5 text-sky-300" />
              <h2 className="text-xs font-black uppercase tracking-[0.16em] text-white/65">Recent form</h2>
            </div>
            <Link href={resultsHref} className="text-xs font-semibold text-sky-300">View all →</Link>
          </div>

          {recentResults.length ? (
            <div className="mt-3 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {recentResults.map((result) => (
                <div
                  key={result.id}
                  className="min-w-[8.2rem] rounded-2xl border border-white/[0.06] bg-black/20 px-3 py-3"
                >
                  <div className="flex items-center gap-2">
                    <span className={`flex h-7 w-7 items-center justify-center rounded-lg text-xs font-black ${resultTone(result.outcome)}`}>
                      {result.outcome}
                    </span>
                    <span className="text-sm font-black tabular-nums text-white">
                      {result.goalsFor} - {result.goalsAgainst}
                    </span>
                  </div>
                  <div className="mt-2 truncate text-xs font-semibold text-white/70">{result.opponent}</div>
                  <div className="mt-1 text-[10px] text-white/35">{result.dateLabel}</div>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm text-white/45">Your recent results will appear here.</p>
          )}
        </section>

        <Link
          href="/player/referrals"
          className="flex items-center gap-3 rounded-[1.5rem] border border-emerald-400/35 bg-[linear-gradient(120deg,rgba(16,185,129,0.2),rgba(6,78,59,0.32))] p-4 active:scale-[0.995]"
        >
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-300/15 text-emerald-200">
            <UserCircleIcon className="h-8 w-8" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-black uppercase tracking-[0.14em] text-emerald-200/65">Team referrals</div>
            <div className="mt-1 text-sm font-black text-white">Refer a new team and earn £75</div>
            <div className="mt-1 text-xs leading-5 text-white/45">Share your private referral link.</div>
          </div>
          <ChevronRightIcon className="h-5 w-5 shrink-0 text-emerald-200/60" />
        </Link>
      </div>
    </section>
  );
}
