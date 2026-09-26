import Link from "next/link";
import {
  BanknotesIcon,
  CalendarDaysIcon,
  ChartBarSquareIcon,
  ChatBubbleLeftRightIcon,
  CheckCircleIcon,
  NewspaperIcon,
  ChevronRightIcon,
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
  opponentLogoUrl: string | null;
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

type PlayerSelectionStatus = "SELECTED" | "NOT_SELECTED_YET" | "NOT_IN_SQUAD";

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

function selectionCopy(status: PlayerSelectionStatus) {
  switch (status) {
    case "SELECTED":
      return {
        label: "SELECTED",
        classes: "border-emerald-400/35 bg-emerald-500/15 text-emerald-100",
      };
    case "NOT_IN_SQUAD":
      return {
        label: "NOT IN SQUAD",
        classes: "border-red-400/25 bg-red-500/10 text-red-100",
      };
    default:
      return {
        label: "NOT SELECTED YET",
        classes: "border-white/10 bg-white/[0.05] text-white/60",
      };
  }
}

export default function PlayerAppHome({
  teamId,
  playerRoleLabel,
  squadNumber,
  preferredPosition,
  stats,
  nextFixture,
  nextAvailability,
  outstandingPence,
  nextPaymentUrl,
  recentResults,
  nextSelectionStatus,
  unreadChatCount,
  previewMembershipId,
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
  nextSelectionStatus: PlayerSelectionStatus | null;
  unreadChatCount: number;
  previewMembershipId: string | null;
}) {
  const availability = availabilityCopy(nextAvailability);
  const selection = nextSelectionStatus ? selectionCopy(nextSelectionStatus) : null;
  const unreadMessageLabel =
    unreadChatCount > 0
      ? `${unreadChatCount} unread message${unreadChatCount === 1 ? "" : "s"}`
      : "Messages";
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
  const resultsHref = `${fixturesHref}#recent-results`;
  const chatHref = addPreviewMembershipId(
    `/player/team/${teamId}/chat`,
    previewMembershipId,
  );
  const fourthAction = {
    href: chatHref,
    title: "SIXFL Chat",
    body: unreadMessageLabel,
    icon: ChatBubbleLeftRightIcon,
    classes: "border-violet-400/35 bg-violet-500/15 text-violet-100",
  };

  const FourthIcon = fourthAction.icon;

  return (
    <section className="player-app-home px-3 pb-24 pt-2 text-white">
      <div className="mx-auto w-full max-w-xl space-y-3">
        <section className="px-0.5" aria-label="Player overview">
          <div className="mb-2 flex min-h-6 items-center justify-between gap-2 px-1">
            <div className="flex min-w-0 items-center gap-1.5">
              {squadNumber ? (
                <span className="shrink-0 rounded-full border border-emerald-400/25 bg-emerald-500/10 px-2 py-0.5 text-[9px] font-black text-emerald-100">
                  #{squadNumber}
                </span>
              ) : null}
              <span className="truncate rounded-full border border-white/10 bg-white/[0.035] px-2 py-0.5 text-[9px] font-semibold text-white/55">
                {preferredPosition || playerRoleLabel || "Player"}
              </span>
            </div>
            {unreadChatCount > 0 ? (
              <Link
                href={chatHref}
                className="shrink-0 rounded-full border border-violet-400/25 bg-violet-500/10 px-2 py-0.5 text-[9px] font-semibold text-violet-100"
              >
                {unreadMessageLabel}
              </Link>
            ) : null}
          </div>

          <div className="grid grid-cols-[1fr_1fr_1fr_1.45fr] divide-x divide-white/[0.07] overflow-hidden rounded-xl border border-white/[0.06] bg-black/20">
            {[
              ["Matches", stats.appearances],
              ["Goals", stats.goals],
              ["Assists", stats.assists],
            ].map(([label, value]) => (
              <Link
                key={String(label)}
                href={statsHref}
                className="px-2 py-2 text-center active:bg-white/[0.04]"
              >
                <div className="text-lg font-black tabular-nums text-white">{value}</div>
                <div className="text-[9px] text-white/40">{label}</div>
              </Link>
            ))}
            <Link
              href={availabilityHref}
              className="flex items-center justify-center gap-1.5 px-2 py-2 active:bg-white/[0.04]"
            >
              <span className={`h-2.5 w-2.5 shrink-0 rounded-full shadow-[0_0_12px_currentColor] ${availability.dot}`} />
              <span className="min-w-0">
                <span className={`block truncate text-[11px] font-bold ${availability.tone}`}>
                  {availability.label}
                </span>
                <span className="block text-[9px] text-white/30">Next match</span>
              </span>
            </Link>
          </div>
        </section>

        <section className="overflow-hidden rounded-[1.45rem] border border-sky-400/35 bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.18),transparent_42%),linear-gradient(145deg,#0b1e2a,#091611)] p-3 shadow-[0_14px_42px_rgba(0,0,0,0.24)]">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <CalendarDaysIcon className="h-4 w-4 shrink-0 text-sky-300" />
              <p className="shrink-0 text-[10px] font-black uppercase tracking-[0.16em] text-white/65">
                Next match
              </p>
              {selection ? (
                <span className={`truncate rounded-full border px-2 py-0.5 text-[8px] font-black tracking-[0.04em] ${selection.classes}`}>
                  {selection.label}
                </span>
              ) : null}
            </div>
            <Link href={fixturesHref} className="text-[11px] font-semibold text-sky-300">
              View all →
            </Link>
          </div>

          {nextFixture ? (
            <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
              <div className="min-w-0 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center">
                  {nextFixture.homeTeam.logoUrl ? (
                    <img
                      src={nextFixture.homeTeam.logoUrl}
                      alt={`${nextFixture.homeTeam.name} badge`}
                      className="max-h-12 max-w-12 object-contain"
                    />
                  ) : (
                    <span className="text-sm font-black text-white/40">
                      {initials(nextFixture.homeTeam.name)}
                    </span>
                  )}
                </div>
                <div className="mt-1.5 truncate text-[11px] font-bold text-white">{nextFixture.homeTeam.name}</div>
              </div>

              <span className="text-base font-black text-white/55">VS</span>

              <div className="min-w-0 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center">
                  {nextFixture.awayTeam.logoUrl ? (
                    <img
                      src={nextFixture.awayTeam.logoUrl}
                      alt={`${nextFixture.awayTeam.name} badge`}
                      className="max-h-12 max-w-12 object-contain"
                    />
                  ) : (
                    <span className="text-sm font-black text-white/40">
                      {initials(nextFixture.awayTeam.name)}
                    </span>
                  )}
                </div>
                <div className="mt-1.5 truncate text-[11px] font-bold text-white">{nextFixture.awayTeam.name}</div>
              </div>

              <div className="col-span-3 mt-2 grid gap-0.5 border-t border-white/10 pt-2 text-center text-[11px] text-white/55">
                <div className="font-semibold text-white/75">
                  {nextFixture.dateLabel} · {nextFixture.timeLabel}
                </div>
                {nextFixture.venueLabel ? <div>{nextFixture.venueLabel}</div> : null}
              </div>
            </div>
          ) : (
            <div className="mt-3 rounded-xl bg-black/20 p-3 text-xs text-white/50">
              Your next fixture will appear here as soon as SIXFL publishes it.
            </div>
          )}
        </section>

        <section className="grid grid-cols-2 gap-2">
          <Link
            href={fixturesHref}
            className="flex min-h-[4.75rem] items-center gap-3 rounded-[1.2rem] border border-sky-400/40 bg-sky-500/15 p-3 active:scale-[0.99]"
          >
            <CalendarDaysIcon className="h-6 w-6 shrink-0 text-sky-300" />
            <div className="min-w-0">
              <div className="text-sm font-black">My Fixtures</div>
              <div className="mt-0.5 truncate text-[10px] text-white/45">Matches & results</div>
            </div>
          </Link>

          <Link
            href={availabilityHref}
            className="flex min-h-[4.75rem] items-center gap-3 rounded-[1.2rem] border border-emerald-400/40 bg-emerald-500/15 p-3 active:scale-[0.99]"
          >
            <CheckCircleIcon className="h-6 w-6 shrink-0 text-emerald-300" />
            <div className="min-w-0">
              <div className="text-sm font-black">Availability</div>
              <div className="mt-0.5 truncate text-[10px] text-white/45">Set your status</div>
            </div>
          </Link>

          <Link
            href={nextPaymentUrl || ledgerHref}
            target={nextPaymentUrl ? "_blank" : undefined}
            className="flex min-h-[4.75rem] items-center gap-3 rounded-[1.2rem] border border-amber-400/40 bg-amber-500/15 p-3 active:scale-[0.99]"
          >
            <BanknotesIcon className="h-6 w-6 shrink-0 text-amber-300" />
            <div className="min-w-0">
              <div className="text-sm font-black">Match Fees</div>
              <div className="mt-0.5 truncate text-[10px] text-white/45">
              {outstandingPence > 0
                ? `${formatMoney(outstandingPence)} outstanding`
                : "View your payments"}
              </div>
            </div>
          </Link>

          <Link
            href={fourthAction.href}
            className={`relative flex min-h-[4.75rem] items-center gap-3 rounded-[1.2rem] border p-3 active:scale-[0.99] ${fourthAction.classes}`}
          >
            {unreadChatCount > 0 ? (
              <span className="absolute right-2 top-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-emerald-400 px-1 text-[9px] font-black leading-none text-black">
                {unreadChatCount > 99 ? "99+" : unreadChatCount}
              </span>
            ) : null}
            <FourthIcon className="h-6 w-6 shrink-0" />
            <div className="min-w-0">
              <div className="text-sm font-black text-white"><span>SIXFL Chat</span></div>
              <div className="mt-0.5 truncate text-[10px] text-white/45">{fourthAction.body}</div>
            </div>
          </Link>
        </section>

        <Link
          href={addPreviewMembershipId(`/player/team/${teamId}/news`, previewMembershipId)}
          className="flex min-h-20 items-center gap-3 rounded-[1.35rem] border border-emerald-400/20 bg-emerald-400/[0.06] p-4 active:bg-emerald-400/10"
        >
          <NewspaperIcon className="h-6 w-6 shrink-0 text-emerald-300" />
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-black">League newsletters</h2>
            <p className="mt-1 text-xs text-white/50">Read the latest matchnight stories</p>
          </div>
          <ChevronRightIcon className="h-5 w-5 shrink-0 text-emerald-200" />
        </Link>

        <section className="rounded-[1.35rem] border border-sky-400/20 bg-white/[0.035] p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <ChartBarSquareIcon className="h-4 w-4 text-sky-300" />
              <h2 className="text-[10px] font-black uppercase tracking-[0.16em] text-white/65">Recent form</h2>
            </div>
            <Link href={resultsHref} className="text-[11px] font-semibold text-sky-300">View all →</Link>
          </div>

          {recentResults.length ? (
            <div className="mt-2.5 grid grid-cols-5 gap-1.5">
              {recentResults.slice(0, 5).map((result) => (
                <div
                  key={result.id}
                  title={`${result.dateLabel} · ${result.opponent}`}
                  className="rounded-xl border border-white/[0.06] bg-black/20 px-1 py-2 text-center"
                >
                  <div className="mx-auto flex h-4 w-4 items-center justify-center">
                    {result.opponentLogoUrl ? (
                      <img
                        src={result.opponentLogoUrl}
                        alt={`${result.opponent} badge`}
                        className="max-h-4 max-w-4 object-contain"
                      />
                    ) : (
                      <span className="text-[7px] font-black text-white/35">
                        {initials(result.opponent)}
                      </span>
                    )}
                  </div>
                  <span className={`mx-auto mt-1 flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-black ${resultTone(result.outcome)}`}>
                    {result.outcome}
                  </span>
                  <div className="mt-1 text-[11px] font-black tabular-nums text-white">
                    {result.goalsFor}-{result.goalsAgainst}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-2.5 text-xs text-white/45">Your recent results will appear here.</p>
          )}
        </section>


      </div>
    </section>
  );
}
