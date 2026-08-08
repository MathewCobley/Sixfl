import Link from "next/link";

import { requireAdmin } from "@/lib/requireAdmin";
import {
  getGoalOfWeekAnnouncementRecipients,
  sendGoalOfWeekLaunchAnnouncementAction,
} from "./actions";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = { title: "Goal of the Week announcement | SIXFL Admin" };

export default async function GoalOfWeekAnnouncementPage({
  searchParams,
}: {
  searchParams?: Promise<{
    sent?: string;
    queued?: string;
    skipped?: string;
    already?: string;
    failed?: string;
  }>;
}) {
  await requireAdmin();
  const recipients = await getGoalOfWeekAnnouncementRecipients();
  const sp = (await searchParams) ?? {};
  const hasResult = sp.sent === "1";

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/admin/sixfl-tv/goal-of-week"
          className="text-sm font-semibold text-fuchsia-200 hover:text-fuchsia-100"
        >
          ← Back to Goal of the Week
        </Link>
        <Link
          href="/admin/sixfl-tv"
          className="text-sm text-white/55 hover:text-white"
        >
          SIXFL TV admin
        </Link>
      </div>

      <section className="rounded-3xl border border-fuchsia-400/25 bg-[radial-gradient(circle_at_top_right,rgba(217,70,239,0.18),transparent_38%),rgba(255,255,255,0.04)] p-6 lg:p-8">
        <p className="text-[11px] font-black uppercase tracking-[0.2em] text-fuchsia-100/70">
          Goal of the Week launch
        </p>
        <h1 className="mt-2 text-3xl font-black text-white">
          Announce player nominations & voting
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-white/65">
          This queues one SIXFL-branded email to each distinct active player or captain account with a saved email address. It is deduplicated, so pressing send again will not queue a second copy for somebody who already has this launch announcement.
        </p>

        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <div className="text-[10px] font-black uppercase tracking-[0.16em] text-white/40">Recipients found</div>
            <div className="mt-2 text-3xl font-black text-white">{recipients.length}</div>
            <div className="mt-1 text-xs text-white/45">Active SIXFL players and captains</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/20 p-4 sm:col-span-2">
            <div className="text-[10px] font-black uppercase tracking-[0.16em] text-white/40">Audience rule</div>
            <p className="mt-2 text-sm leading-6 text-white/65">
              Only users attached to an active season team — as a player/team member or captain — are included. Prospects, old/inactive teams and people without an email address are not included.
            </p>
          </div>
        </div>
      </section>

      {hasResult ? (
        <section className="rounded-3xl border border-emerald-400/25 bg-emerald-500/10 p-5 text-emerald-50">
          <h2 className="text-lg font-black">Announcement queued</h2>
          <p className="mt-2 text-sm leading-6">
            Queued: {sp.queued ?? "0"} · Skipped: {sp.skipped ?? "0"} · Already queued/sent: {sp.already ?? "0"} · Failed: {sp.failed ?? "0"}.
          </p>
        </section>
      ) : null}

      <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 lg:p-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-fuchsia-200/70">Email preview</p>
            <h2 className="mt-2 text-2xl font-black text-white">Goal of the Week is now yours to decide ⚽</h2>
          </div>
          <span className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-100">
            SIXFL service update
          </span>
        </div>

        <div className="mt-6 space-y-4 rounded-2xl border border-white/10 bg-black/25 p-5 text-sm leading-6 text-white/70">
          <p>Hi [first name],</p>
          <p><strong className="text-white">SIXFL Goal of the Week is changing — the players now choose it.</strong></p>
          <p>
            After a recorded SIXFL TV match, players and captains can nominate the goals they think deserve to be in the running. If more than one person picks the same goal, those nominations are combined.
          </p>
          <p>
            The six most-nominated goals go into the following week's ballot. Every verified SIXFL player and captain gets one vote, and you can change your choice until voting closes.
          </p>
          <p>
            You will now see a Goal of the Week card on your SIXFL dashboard whenever there is something to nominate or a vote is open.
          </p>
          <div className="inline-flex rounded-xl bg-fuchsia-300 px-4 py-2.5 font-black text-black">
            Open my SIXFL dashboard
          </div>
          <p>
            So if somebody scores an absolute worldie, don't just talk about it — nominate it. And when the shortlist opens, you decide the winner.
          </p>
        </div>
      </section>

      <section className="rounded-3xl border border-amber-400/25 bg-amber-500/[0.08] p-6">
        <h2 className="text-xl font-black text-white">Ready to send?</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-amber-50/70">
          This is a league-service announcement to current players and captains. It is queued through SIXFL's normal notification system rather than sent directly from this browser.
        </p>

        <form action={sendGoalOfWeekLaunchAnnouncementAction} className="mt-5">
          <button
            type="submit"
            disabled={recipients.length === 0}
            className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-fuchsia-300 px-6 py-3 text-sm font-black text-black transition hover:bg-fuchsia-200 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Queue announcement to {recipients.length} people
          </button>
        </form>
      </section>
    </div>
  );
}
