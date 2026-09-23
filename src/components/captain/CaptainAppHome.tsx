import Link from "next/link";
import {
  BanknotesIcon,
  CalendarDaysIcon,
  CheckCircleIcon,
  ClipboardDocumentCheckIcon,
  PlayCircleIcon,
  UserGroupIcon,
} from "@heroicons/react/24/outline";

type ActionTone = "emerald" | "amber" | "red" | "neutral";

function toneClasses(tone: ActionTone) {
  if (tone === "red") return "border-red-400/25 bg-red-500/10 text-red-100";
  if (tone === "amber") return "border-amber-400/25 bg-amber-500/10 text-amber-100";
  if (tone === "emerald") return "border-emerald-400/25 bg-emerald-500/10 text-emerald-100";
  return "border-white/10 bg-white/[0.04] text-white/70";
}

export default function CaptainAppHome({
  teamId,
  nextFixture,
  leaguePosition,
  reportsDue,
  openIssues,
  paymentDueNowLabel,
  overdueConfirmations,
}: {
  teamId: string;
  nextFixture: null | {
    label: string;
    dateLabel: string;
    venueLabel: string;
    statusLabel: string;
    statusTone: ActionTone;
    countdownLabel: string;
  };
  leaguePosition: string;
  reportsDue: number;
  openIssues: number;
  paymentDueNowLabel: string;
  overdueConfirmations: number;
}) {
  const actions = [
    ...(overdueConfirmations > 0
      ? [{
          href: `/captain/team/${teamId}/fixtures`,
          title: "Confirm your fixture",
          body: `${overdueConfirmations} fixture${overdueConfirmations === 1 ? "" : "s"} need confirmation now`,
          tone: "red" as const,
        }]
      : []),
    ...(reportsDue > 0
      ? [{
          href: `/captain/team/${teamId}/results`,
          title: "Finish match reports",
          body: `${reportsDue} report${reportsDue === 1 ? "" : "s"} still need scorers or Player of the Match`,
          tone: "amber" as const,
        }]
      : []),
    ...(paymentDueNowLabel !== "£0.00"
      ? [{
          href: `/captain/team/${teamId}/payments`,
          title: "Team payment due",
          body: `${paymentDueNowLabel} is currently due`,
          tone: "amber" as const,
        }]
      : []),
  ];

  const quickActions = [
    {
      href: `/captain/team/${teamId}/availability`,
      title: "Availability",
      body: "See who can play",
      Icon: CheckCircleIcon,
    },
    {
      href: `/captain/team/${teamId}/results`,
      title: "Match reports",
      body: reportsDue > 0 ? `${reportsDue} need attention` : "Results & scorers",
      Icon: ClipboardDocumentCheckIcon,
    },
    {
      href: `/captain/team/${teamId}/player-pool`,
      title: "PlayerPool",
      body: "Find extra players",
      Icon: UserGroupIcon,
    },
    {
      href: `/captain/team/${teamId}/tv`,
      title: "SIXFL TV",
      body: "Matches & media",
      Icon: PlayCircleIcon,
    },
  ];

  return (
    <div className="space-y-3">
      <section className="rounded-[1.35rem] border border-emerald-400/20 bg-emerald-500/[0.07] p-3.5">
        <h1 className="text-xl font-black tracking-tight text-white">Your team</h1>
        <p className="mt-1 text-xs leading-5 text-white/45">
          The things that need your attention before the next match.
        </p>

        <div className="mt-3 grid grid-cols-3 gap-1.5 text-center">
          <div className="rounded-xl border border-white/[0.08] bg-black/20 px-2 py-2.5">
            <div className="text-base font-black tabular-nums text-white">{leaguePosition}</div>
            <div className="mt-0.5 text-[9px] text-white/40">League</div>
          </div>
          <div className="rounded-xl border border-amber-400/15 bg-amber-500/[0.07] px-2 py-2.5">
            <div className="text-base font-black tabular-nums text-amber-100">{reportsDue}</div>
            <div className="mt-0.5 text-[9px] text-amber-100/50">Reports due</div>
          </div>
          <div className="rounded-xl border border-emerald-400/15 bg-emerald-500/[0.07] px-2 py-2.5">
            <div className="text-base font-black tabular-nums text-emerald-100">{paymentDueNowLabel}</div>
            <div className="mt-0.5 text-[9px] text-emerald-100/50">Due now</div>
          </div>
        </div>
      </section>

      <section className="rounded-[1.35rem] border border-sky-400/25 bg-[linear-gradient(145deg,rgba(14,165,233,0.12),rgba(5,20,15,0.96))] p-3.5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs font-black text-sky-100">
            <CalendarDaysIcon className="h-4 w-4 text-sky-300" />
            Next match
          </div>
          {nextFixture ? (
            <span className="text-[10px] font-semibold text-white/40">{nextFixture.countdownLabel}</span>
          ) : null}
        </div>

        {nextFixture ? (
          <>
            <h2 className="mt-3 text-lg font-black leading-tight text-white">{nextFixture.label}</h2>
            <p className="mt-1 text-xs font-semibold text-white/65">{nextFixture.dateLabel}</p>
            <p className="mt-0.5 text-xs text-white/40">{nextFixture.venueLabel}</p>
            <div className="mt-3 flex items-center justify-between gap-3">
              <span className={`rounded-lg border px-2.5 py-1 text-[10px] font-bold ${toneClasses(nextFixture.statusTone)}`}>
                {nextFixture.statusLabel}
              </span>
              <Link
                href={`/captain/team/${teamId}/fixtures`}
                className="inline-flex min-h-10 items-center rounded-xl bg-sky-300 px-3.5 text-xs font-black text-[#04131a]"
              >
                Open fixture
              </Link>
            </div>
          </>
        ) : (
          <div className="mt-3 rounded-xl border border-dashed border-white/10 bg-black/20 p-3 text-sm text-white/50">
            No upcoming published fixture yet.
          </div>
        )}
      </section>

      <section>
        <div className="flex items-center justify-between px-1">
          <h2 className="text-sm font-black text-white">Needs attention</h2>
          <span className="text-[10px] font-semibold text-white/35">
            {actions.length + openIssues} item{actions.length + openIssues === 1 ? "" : "s"}
          </span>
        </div>

        {actions.length === 0 && openIssues === 0 ? (
          <div className="mt-2 flex items-center gap-3 rounded-[1.2rem] border border-emerald-400/15 bg-emerald-500/[0.06] p-3.5">
            <CheckCircleIcon className="h-6 w-6 shrink-0 text-emerald-300" />
            <div>
              <div className="text-sm font-black text-white">You&apos;re up to date</div>
              <div className="mt-0.5 text-xs text-white/45">Nothing needs your attention right now.</div>
            </div>
          </div>
        ) : (
          <div className="mt-2 space-y-2">
            {actions.map((action) => (
              <Link
                key={action.title}
                href={action.href}
                className={`flex min-h-16 items-center justify-between gap-3 rounded-[1.15rem] border px-3.5 py-3 ${toneClasses(action.tone)}`}
              >
                <span className="min-w-0">
                  <span className="block text-sm font-black text-white">{action.title}</span>
                  <span className="mt-0.5 block text-xs opacity-60">{action.body}</span>
                </span>
                <span aria-hidden="true" className="text-lg">→</span>
              </Link>
            ))}
            {openIssues > 0 ? (
              <Link
                href={`/captain/team/${teamId}/results`}
                className="flex min-h-16 items-center justify-between gap-3 rounded-[1.15rem] border border-red-400/20 bg-red-500/[0.07] px-3.5 py-3 text-red-100"
              >
                <span>
                  <span className="block text-sm font-black text-white">Open result issue</span>
                  <span className="mt-0.5 block text-xs text-red-100/60">
                    {openIssues} dispute{openIssues === 1 ? "" : "s"} open or under review
                  </span>
                </span>
                <span aria-hidden="true" className="text-lg">→</span>
              </Link>
            ) : null}
          </div>
        )}
      </section>

      <section>
        <h2 className="px-1 text-sm font-black text-white">Quick actions</h2>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {quickActions.map(({ href, title, body, Icon }) => (
            <Link
              key={title}
              href={href}
              className="flex min-h-[4.8rem] items-center gap-3 rounded-[1.15rem] border border-white/10 bg-white/[0.035] p-3 active:bg-white/[0.06]"
            >
              <Icon className="h-6 w-6 shrink-0 text-emerald-300" />
              <span className="min-w-0">
                <span className="block text-sm font-black text-white">{title}</span>
                <span className="mt-0.5 block truncate text-[10px] text-white/40">{body}</span>
              </span>
            </Link>
          ))}
        </div>
      </section>

      <Link
        href={`/captain/team/${teamId}/payments`}
        className="flex min-h-14 items-center justify-between rounded-[1.15rem] border border-white/10 bg-black/20 px-3.5 text-sm font-bold text-white/70"
      >
        <span className="flex items-center gap-2">
          <BanknotesIcon className="h-5 w-5 text-emerald-300" />
          Team payments
        </span>
        <span aria-hidden="true">→</span>
      </Link>
    </div>
  );
}
