import Link from "next/link";
import type { ReactNode } from "react";
import {
  CalendarDaysIcon,
  ClipboardDocumentListIcon,
  BanknotesIcon,
  BookOpenIcon,
  HomeIcon,
  ArrowRightIcon,
} from "@heroicons/react/24/outline";

type Night = {
  id: string;
  leagueName: string;
  venueName: string | null;
  dateLabel: string;
  fixtureCount: number;
  feeLabel: string;
  isPast: boolean;
  isToday: boolean;
  firstKickoff: string | null;
  colleagues: string | null;
};

export default function RefereeAppHome({
  name,
  nextNight,
  openCount,
  submittedCount,
  dueToYou,
  dueToSixfl,
  confirmation,
  children,
  desktopTabs,
  preview: _preview,
}: {
  name: string;
  nextNight: Night | null;
  openCount: number;
  submittedCount: number;
  dueToYou: string;
  dueToSixfl: string;
  confirmation: ReactNode;
  children: ReactNode;
  desktopTabs: ReactNode;
  preview: ReactNode;
}) {
  const firstName = name.trim().split(/\s+/)[0];
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
  return (
    <main className="min-h-screen bg-[#07130f] text-white">
      <header
        className="sticky top-0 z-40 border-b border-white/[0.07] bg-[#06110e]/95 px-4 pb-3 backdrop-blur-xl"
        style={{ paddingTop: "max(env(safe-area-inset-top), 0.8rem)" }}
      >
        <div className="mx-auto flex w-full max-w-xl items-center gap-3">
          <Link href="/referee" aria-label="SIXFL referee home" className="shrink-0">
            <img src="/logo2.png" alt="SIXFL" className="h-7 w-auto object-contain" />
          </Link>

          <div className="min-w-0 flex-1 text-center">
            <div className="text-sm font-black tracking-tight text-white">
              Referee Portal
            </div>
          </div>

          <div
            aria-label={`Referee ${name}`}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-black/25 text-[10px] font-black text-white/60"
          >
            {initials}
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-xl space-y-3 px-3 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-3">
        <section className="overflow-hidden rounded-[1.45rem] border border-sky-400/20 bg-[radial-gradient(circle_at_top_right,rgba(14,165,233,0.12),transparent_38%),linear-gradient(145deg,#0b1a22,#09140f)] p-3">
          <div className="flex items-center gap-3">
            <div
              aria-hidden="true"
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 border-sky-300/25 bg-black/30 text-sm font-black text-white/70"
            >
              {initials}
            </div>
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-widest text-white/45">
                Ready for match night
              </p>
              <h1 className="mt-0.5 break-words text-xl font-black tracking-tight">
                Hi, {firstName}
              </h1>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-3 divide-x divide-white/10 rounded-xl border border-white/[0.07] bg-black/25 py-2 text-center">
            <a href="#referee-night-picker" className="min-h-11">
              <strong className="block text-lg tabular-nums">
                {openCount}
              </strong>
              <span className="text-[10px] text-white/50">Open nights</span>
            </a>
            <a href="#referee-ledger" className="min-h-11">
              <strong className="block text-lg tabular-nums">
                {submittedCount}
              </strong>
              <span className="text-[10px] text-white/50">Submitted</span>
            </a>
            <a href="#referee-ledger" className="min-h-11">
              <strong className="block text-lg tabular-nums text-emerald-200">
                {dueToYou}
              </strong>
              <span className="text-[10px] text-white/50">Due to you</span>
            </a>
          </div>
        </section>
        <section
          aria-label="Next referee night"
          className="rounded-[1.45rem] border border-sky-400/35 bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.18),transparent_42%),linear-gradient(145deg,#0b1e2a,#091611)] p-4"
        >
          <div className="flex items-center justify-between gap-2">
            <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-sky-200">
              <CalendarDaysIcon className="h-4 w-4" />
              {nextNight?.isPast
                ? "Night needs completing"
                : nextNight?.isToday
                  ? "Tonight"
                  : "Next referee night"}
            </p>
            <a
              href="#referee-night-picker"
              className="py-2 text-xs font-semibold text-sky-300"
            >
              All nights →
            </a>
          </div>
          {nextNight ? (
            <>
              <h2 className="mt-1 text-xl font-black tracking-tight">
                {nextNight.leagueName}
              </h2>
              <p className="mt-1 text-sm font-semibold text-white/85">
                {nextNight.dateLabel}
                {nextNight.firstKickoff ? ` · ${nextNight.firstKickoff}` : ""}
              </p>
              <p className="mt-1 text-xs text-white/55">
                {nextNight.venueName || "Venue to be confirmed"}
                {nextNight.firstKickoff ? " · First kick-off" : ""}
              </p>
              <div className="mt-3 flex gap-2">
                <span className="rounded-lg border border-white/10 bg-black/20 px-3 py-1.5 text-xs">
                  {nextNight.fixtureCount} matches
                </span>
                <span className="rounded-lg border border-emerald-400/20 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-100">
                  {nextNight.isPast ? `${nextNight.feeLabel} night fee` : `Earns ${nextNight.feeLabel} after night`}
                </span>
              </div>
              {nextNight.colleagues && (
                <p className="mt-2 text-xs leading-5 text-white/55">
                  {nextNight.colleagues}
                </p>
              )}
              <Link
                href={`/referee/night/${nextNight.id}`}
                className="mt-4 flex min-h-12 items-center justify-between rounded-xl bg-emerald-400 px-4 text-sm font-black text-[#04130c] active:bg-emerald-300"
              >
                Open night sheet
                <ArrowRightIcon className="h-5 w-5" />
              </Link>
            </>
          ) : (
            <div className="py-5">
              <h2 className="text-lg font-bold">No night assigned yet</h2>
              <p className="mt-2 text-sm leading-6 text-white/60">
                Your next referee night will appear here when it is assigned.
                Keep your availability up to date below.
              </p>
            </div>
          )}
          {confirmation}
        </section>
        <section aria-label="Quick actions" className="grid grid-cols-2 gap-2">
          <Link
            href="/referee/availability"
            title="Mark your dates"
            className="flex min-h-20 items-center gap-3 rounded-[1.2rem] border border-emerald-400/35 bg-emerald-500/10 p-3"
          >
            <CalendarDaysIcon className="h-6 w-6 shrink-0 text-emerald-300" />
            <div>
              <h2 className="text-sm font-black">Availability</h2>
              <p className="mt-1 text-[10px] text-white/50">Mark your dates</p>
            </div>
          </Link>
          <Link
            href="/referee/match-rules"
            className="flex min-h-20 items-center gap-3 rounded-[1.2rem] border border-sky-400/35 bg-sky-500/10 p-3"
          >
            <BookOpenIcon className="h-6 w-6 shrink-0 text-sky-300" />
            <div>
              <h2 className="text-sm font-black">Match rules</h2>
              <p className="mt-1 text-[10px] text-white/50">Quick reference</p>
            </div>
          </Link>
        </section>
        <a
          href="#referee-ledger"
          className="flex min-h-16 items-center gap-3 rounded-[1.2rem] border border-amber-300/20 bg-amber-400/[0.06] p-3"
        >
          <BanknotesIcon className="h-6 w-6 shrink-0 text-amber-200" />
          <div className="flex-1">
            <h2 className="text-sm font-bold">Payments & cashup</h2>
            <p className="mt-1 text-xs text-white/50">
              Due SIXFL: <span className="text-amber-100">{dueToSixfl}</span>
            </p>
          </div>
          <ArrowRightIcon className="h-4 w-4 text-white/40" />
        </a>
        <div className="hidden sm:block">{desktopTabs}</div>
        {children}
      </div>
      <nav
        aria-label="Referee app navigation"
        className="fixed inset-x-0 bottom-0 z-50 border-t border-white/10 bg-[#050807]/95 px-2 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-2 backdrop-blur-xl sm:hidden"
      >
        <div className="mx-auto grid max-w-xl grid-cols-4 gap-1">
          {[
            { href: "/referee", label: "Home", Icon: HomeIcon },
            {
              href: "#referee-night-picker",
              label: "Nights",
              Icon: ClipboardDocumentListIcon,
            },
            {
              href: "/referee/availability",
              label: "Availability",
              Icon: CalendarDaysIcon,
            },
            {
              href: "/referee/match-rules",
              label: "Rules",
              Icon: BookOpenIcon,
            },
          ].map(({ href, label, Icon }, index) => (
            <Link
              key={label}
              href={href}
              aria-current={index === 0 ? "page" : undefined}
              className={`flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl text-[10px] font-semibold ${index === 0 ? "bg-emerald-400/10 text-emerald-200" : "text-white/55"}`}
            >
              <Icon className="h-5 w-5" />
              {label}
            </Link>
          ))}
        </div>
      </nav>
    </main>
  );
}
