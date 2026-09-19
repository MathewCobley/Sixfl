import Link from "next/link";

type AdminActivityItem = {
  id: string;
  href: string;
  kind: string;
  title: string;
  detail: string;
  occurredAtLabel: string;
  relativeLabel: string;
};

type NextFixtureSummary = {
  matchup: string;
  kickoffLabel: string;
  leagueLabel: string;
  venueLabel: string;
  refereeLabel: string;
  hasReferee: boolean;
} | null;

type AdminPwaHomeProps = {
  nextFixture: NextFixtureSummary;
  upcomingFixturesCount: number;
  unreadThreads: number;
  newLeadsCount: number;
  fixturesWithoutRefereeCount: number;
  disputedResultsCount: number;
  teamsNeedingContactCleanupCount: number;
  latestActivity: AdminActivityItem[];
};

function attentionTone(value: number, urgent = false) {
  if (value <= 0) return "border-white/10 bg-white/[0.03] text-white/70";
  if (urgent) return "border-red-400/20 bg-red-500/10 text-red-100";
  return "border-amber-400/20 bg-amber-500/10 text-amber-100";
}

function activityTone(kind: string) {
  if (kind === "MESSAGE") return "border-sky-400/20 bg-sky-500/10 text-sky-100";
  if (kind === "LEAD") return "border-violet-400/20 bg-violet-500/10 text-violet-100";
  if (kind === "TEAM_PAYMENT" || kind === "PLAYER_PAYMENT") {
    return "border-emerald-400/20 bg-emerald-500/10 text-emerald-100";
  }
  if (kind === "CONFIRMATION") return "border-cyan-400/20 bg-cyan-500/10 text-cyan-100";
  if (kind === "POLL") return "border-fuchsia-400/20 bg-fuchsia-500/10 text-fuchsia-100";
  if (kind === "CUP") return "border-amber-400/20 bg-amber-500/10 text-amber-100";
  if (kind === "DISPUTE") return "border-red-400/20 bg-red-500/10 text-red-100";
  return "border-white/10 bg-white/[0.04] text-white/70";
}

function formatKind(kind: string) {
  if (kind === "TEAM_PAYMENT") return "Payment";
  if (kind === "PLAYER_PAYMENT") return "Player payment";
  if (kind === "CONFIRMATION") return "Fixture";
  return kind.charAt(0) + kind.slice(1).toLowerCase();
}

export default function AdminPwaHome({
  nextFixture,
  upcomingFixturesCount,
  unreadThreads,
  newLeadsCount,
  fixturesWithoutRefereeCount,
  disputedResultsCount,
  teamsNeedingContactCleanupCount,
  latestActivity,
}: AdminPwaHomeProps) {
  const totalAttention =
    unreadThreads +
    newLeadsCount +
    fixturesWithoutRefereeCount +
    disputedResultsCount;

  return (
    <div className="pwa-app-home min-h-screen bg-[#050807] px-4 pb-6 pt-5 text-white">
      <section>
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-emerald-300/75">
              Live operations
            </p>
            <h1 className="mt-2 text-[2rem] font-black leading-none tracking-tight">
              Admin
            </h1>
          </div>
          <Link
            href="/admin/pwa"
            className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-white/60"
          >
            App tools
          </Link>
        </div>
      </section>

      <section className="mt-5 overflow-hidden rounded-[1.8rem] border border-emerald-400/20 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.20),transparent_38%),linear-gradient(180deg,rgba(255,255,255,0.055),rgba(255,255,255,0.025))] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.35)]">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[10px] font-black uppercase tracking-[0.22em] text-emerald-300">
            Next up
          </span>
          <span className="rounded-full border border-white/10 bg-black/25 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-white/55">
            {upcomingFixturesCount} upcoming
          </span>
        </div>

        {nextFixture ? (
          <>
            <h2 className="mt-4 text-2xl font-black leading-tight tracking-tight text-white">
              {nextFixture.matchup}
            </h2>
            <p className="mt-2 text-sm font-semibold text-emerald-100/85">
              {nextFixture.kickoffLabel}
            </p>
            <p className="mt-1 text-sm leading-6 text-white/50">
              {nextFixture.leagueLabel}
            </p>
            <p className="text-sm leading-6 text-white/50">
              {nextFixture.venueLabel}
            </p>

            <div className="mt-4 flex flex-wrap gap-2">
              <span
                className={[
                  "rounded-full border px-3 py-1.5 text-xs font-semibold",
                  nextFixture.hasReferee
                    ? "border-white/10 bg-black/25 text-white/65"
                    : "border-amber-400/20 bg-amber-500/10 text-amber-100",
                ].join(" ")}
              >
                {nextFixture.refereeLabel}
              </span>
              {fixturesWithoutRefereeCount > 0 ? (
                <span className="rounded-full border border-red-400/20 bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-100">
                  {fixturesWithoutRefereeCount} without referee
                </span>
              ) : null}
            </div>

            <div className="mt-5 grid grid-cols-2 gap-2">
              <Link
                href="/admin/fixtures"
                className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-emerald-400 px-4 text-sm font-black text-black"
              >
                Open fixtures
              </Link>
              <Link
                href="/admin/night-board"
                className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-white/10 bg-black/25 px-4 text-sm font-bold text-white"
              >
                Night Board
              </Link>
            </div>
          </>
        ) : (
          <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4">
            <div className="font-semibold text-white">No upcoming published fixtures</div>
            <p className="mt-2 text-sm leading-6 text-white/45">
              The next match night will appear here once fixtures are scheduled.
            </p>
          </div>
        )}
      </section>

      <section className="mt-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/35">
              Needs attention
            </p>
            <h2 className="mt-1 text-xl font-black tracking-tight text-white">
              {totalAttention > 0 ? `${totalAttention} things to check` : "All clear"}
            </h2>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3">
          <Link
            href="/admin/messages?filter=unread"
            className={`rounded-2xl border p-4 ${attentionTone(unreadThreads)}`}
          >
            <div className="text-3xl font-black leading-none">{unreadThreads}</div>
            <div className="mt-2 text-xs font-bold uppercase tracking-[0.13em] opacity-75">
              Unread
            </div>
          </Link>
          <Link
            href="/admin/leads"
            className={`rounded-2xl border p-4 ${attentionTone(newLeadsCount)}`}
          >
            <div className="text-3xl font-black leading-none">{newLeadsCount}</div>
            <div className="mt-2 text-xs font-bold uppercase tracking-[0.13em] opacity-75">
              New leads
            </div>
          </Link>
          <Link
            href="/admin/fixtures"
            className={`rounded-2xl border p-4 ${attentionTone(fixturesWithoutRefereeCount, true)}`}
          >
            <div className="text-3xl font-black leading-none">{fixturesWithoutRefereeCount}</div>
            <div className="mt-2 text-xs font-bold uppercase tracking-[0.13em] opacity-75">
              No referee
            </div>
          </Link>
          <Link
            href="/admin/results"
            className={`rounded-2xl border p-4 ${attentionTone(disputedResultsCount, true)}`}
          >
            <div className="text-3xl font-black leading-none">{disputedResultsCount}</div>
            <div className="mt-2 text-xs font-bold uppercase tracking-[0.13em] opacity-75">
              Disputes
            </div>
          </Link>
        </div>

        {teamsNeedingContactCleanupCount > 0 ? (
          <Link
            href="/admin/teams"
            className="mt-3 flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm"
          >
            <span className="font-semibold text-white/70">Contact cleanup</span>
            <span className="rounded-full bg-white/[0.06] px-2.5 py-1 text-xs font-bold text-white/60">
              {teamsNeedingContactCleanupCount}
            </span>
          </Link>
        ) : null}
      </section>

      <section className="mt-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/35">
              Latest activity
            </p>
            <h2 className="mt-1 text-xl font-black tracking-tight text-white">
              What&apos;s just happened
            </h2>
          </div>
        </div>

        <div className="mt-3 overflow-hidden rounded-[1.5rem] border border-white/10 bg-white/[0.025]">
          {latestActivity.length === 0 ? (
            <div className="p-5 text-sm text-white/45">No recent activity yet.</div>
          ) : (
            latestActivity.map((item, index) => (
              <Link
                key={item.id}
                href={item.href}
                className={[
                  "block px-4 py-4",
                  index > 0 ? "border-t border-white/8" : "",
                ].join(" ")}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-full border px-2 py-1 text-[9px] font-black uppercase tracking-[0.12em] ${activityTone(item.kind)}`}
                  >
                    {formatKind(item.kind)}
                  </span>
                  <span className="text-[11px] font-semibold text-white/30">
                    {item.relativeLabel}
                  </span>
                </div>
                <div className="mt-2 text-sm font-bold leading-5 text-white">
                  {item.title}
                </div>
                <div className="mt-1 line-clamp-2 text-xs leading-5 text-white/45">
                  {item.detail}
                </div>
              </Link>
            ))
          )}
        </div>
      </section>

      <section className="mt-6">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/35">
          Quick actions
        </p>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <Link
            href="/admin/matchweek-reports"
            className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm font-bold text-white/80"
          >
            Matchweek reports
          </Link>
          <Link
            href="/admin/sixfl-tv"
            className="rounded-2xl border border-fuchsia-400/15 bg-fuchsia-500/[0.07] p-4 text-sm font-bold text-fuchsia-100"
          >
            SIXFL TV
          </Link>
          <Link
            href="/admin/pwa"
            className="rounded-2xl border border-sky-400/15 bg-sky-500/[0.07] p-4 text-sm font-bold text-sky-100"
          >
            App tools
          </Link>
          <Link
            href="/admin/more"
            className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm font-bold text-white/80"
          >
            More admin tools
          </Link>
        </div>
      </section>
    </div>
  );
}
