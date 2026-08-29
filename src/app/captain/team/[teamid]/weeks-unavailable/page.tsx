// ========================================
// File: src/app/captain/team/[teamid]/weeks-unavailable/page.tsx
// ========================================

import Link from "next/link";
import { notFound } from "next/navigation";

import { getCaptainRelatedTeamContext } from "@/lib/captain/related-teams";
import { prisma } from "@/lib/prisma";
import { requireCaptain } from "@/lib/requireCaptain";
import {
  addWeeks,
  formatWeekLabel,
  getCurrentWeekStart,
  getWeekStartForDate,
  listTeamWeekUnavailability,
} from "@/lib/team-week-unavailability";

import { saveTeamWeekUnavailabilityAction } from "./actions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "Fixture planning | SIXFL",
};

type SearchParams = {
  saved?: string;
  error?: string;
};

function decodeMessage(value?: string) {
  return value ? decodeURIComponent(value) : null;
}

function weekKey(value: Date) {
  return value.toISOString().slice(0, 10);
}

function restrictionSummary(input: {
  type: "UNAVAILABLE" | "TIME_RESTRICTION" | "AVAILABLE";
  earliestKickoff?: string | null;
  latestKickoff?: string | null;
}) {
  if (input.type === "UNAVAILABLE") return "Team unavailable";
  if (input.type !== "TIME_RESTRICTION") return "Assumed available";
  if (input.earliestKickoff && input.latestKickoff) {
    return `Can only play ${input.earliestKickoff}–${input.latestKickoff}`;
  }
  if (input.earliestKickoff) return `Can only play from ${input.earliestKickoff}`;
  if (input.latestKickoff) return `Can only play up to ${input.latestKickoff}`;
  return "Temporary time restriction";
}

export default async function TeamWeeksUnavailablePage({
  params,
  searchParams,
}: {
  params: Promise<{ teamid: string }>;
  searchParams?: Promise<SearchParams>;
}) {
  const { teamid } = await params;
  await requireCaptain(teamid);

  const [context, filters] = await Promise.all([
    getCaptainRelatedTeamContext(teamid),
    searchParams ? searchParams : Promise.resolve({} as SearchParams),
  ]);

  if (!context) notFound();

  const currentWeekStart = getCurrentWeekStart();
  const finalWeekEnd = addWeeks(currentWeekStart, 12);
  const weeks = Array.from({ length: 12 }, (_, index) =>
    addWeeks(currentWeekStart, index),
  );

  const [notices, publishedFixtures] = await Promise.all([
    listTeamWeekUnavailability({
      teamIds: [teamid],
      from: currentWeekStart,
      to: finalWeekEnd,
    }),
    context.currentLeagueId
      ? prisma.fixture.findMany({
          where: {
            leagueId: context.currentLeagueId,
            publishedAt: { not: null },
            kickoffAt: { gte: currentWeekStart, lt: finalWeekEnd },
            status: { in: ["SCHEDULED", "COMPLETED"] },
          },
          select: { kickoffAt: true },
        })
      : Promise.resolve([]),
  ]);

  const noticeByWeek = new Map(
    notices.map((notice) => [weekKey(notice.weekStart), notice]),
  );
  const publishedWeekKeys = new Set(
    publishedFixtures.map((fixture) => weekKey(getWeekStartForDate(fixture.kickoffAt))),
  );

  const savedMessage = decodeMessage(filters.saved);
  const errorMessage = decodeMessage(filters.error);
  const noticeCount = notices.length;

  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-3xl border border-emerald-400/15 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.18),transparent_38%),linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.03))] shadow-[0_24px_80px_rgba(0,0,0,0.3)]">
        <div className="grid gap-6 px-6 py-7 lg:grid-cols-[1fr_auto] lg:items-end lg:px-8 lg:py-9">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-300/80">
              Advance fixture planning
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              Tell us about a week you cannot play normally
            </h1>
            <p className="mt-4 max-w-3xl text-sm leading-6 text-white/70 sm:text-base">
              Your team is assumed available every week. Use this page only when you already know a specific future week will be different — either you cannot field a team, or you need a temporary kick-off restriction such as “after 8pm”.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs font-medium text-white/75">
                {context.currentLeague?.name ?? context.team.league?.name ?? "No league assigned"}
              </span>
              <span className="rounded-full border border-amber-400/20 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-100">
                {noticeCount} future notice{noticeCount === 1 ? "" : "s"}
              </span>
            </div>
          </div>
          <Link
            href={`/captain/team/${teamid}/fixtures`}
            className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-white/10 bg-black/20 px-5 text-sm font-semibold text-white/80 transition hover:border-white/20 hover:bg-white/5 hover:text-white"
          >
            Open published fixtures
          </Link>
        </div>
      </section>

      {savedMessage ? (
        <div className="rounded-2xl border border-emerald-400/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
          {savedMessage}
        </div>
      ) : null}
      {errorMessage ? (
        <div className="rounded-2xl border border-red-400/25 bg-red-500/10 px-4 py-3 text-sm text-red-100">
          {errorMessage}
        </div>
      ) : null}

      <section className="rounded-3xl border border-amber-400/20 bg-amber-500/[0.07] p-5 sm:p-6">
        <h2 className="text-xl font-semibold text-white">Please tell us as early as you can</h2>
        <p className="mt-2 max-w-4xl text-sm leading-6 text-amber-50/75">
          The earlier SIXFL knows about a week off or a one-off time restriction, the easier it is to build fixtures around it. These restrictions are for specific weeks only. If your team needs a permanent kick-off restriction every week, contact SIXFL and we can record that separately.
        </p>
        <p className="mt-3 max-w-4xl text-xs leading-5 text-amber-50/55">
          You can change a notice until fixtures for that league week are published. Once published, contact SIXFL rather than using this page as a late cancellation or fixture-change tool.
        </p>
      </section>

      <section className="space-y-4">
        {weeks.map((weekStart) => {
          const key = weekKey(weekStart);
          const notice = noticeByWeek.get(key) ?? null;
          const locked = publishedWeekKeys.has(key);
          const currentType = notice?.restrictionType ?? "AVAILABLE";

          return (
            <form
              key={key}
              action={saveTeamWeekUnavailabilityAction}
              className={`rounded-3xl border p-5 sm:p-6 ${
                currentType === "UNAVAILABLE"
                  ? "border-red-400/25 bg-red-500/[0.08]"
                  : currentType === "TIME_RESTRICTION"
                    ? "border-amber-400/25 bg-amber-500/[0.07]"
                    : locked
                      ? "border-white/10 bg-white/[0.025]"
                      : "border-white/10 bg-white/[0.04]"
              }`}
            >
              <input type="hidden" name="teamId" value={teamid} />
              <input type="hidden" name="weekStart" value={key} />

              <div className="grid gap-5 xl:grid-cols-[minmax(260px,0.85fr)_minmax(0,1.35fr)_auto] xl:items-start">
                <div>
                  <div className="text-base font-semibold text-white">
                    Week commencing {key.split("-").reverse().join("/")}
                  </div>
                  <div className="mt-1 text-sm text-white/55">{formatWeekLabel(weekStart)}</div>
                  <span className={`mt-3 inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${
                    currentType === "UNAVAILABLE"
                      ? "border-red-400/25 bg-red-500/10 text-red-100"
                      : currentType === "TIME_RESTRICTION"
                        ? "border-amber-400/25 bg-amber-500/10 text-amber-100"
                        : locked
                          ? "border-white/10 bg-white/5 text-white/50"
                          : "border-emerald-400/20 bg-emerald-500/10 text-emerald-100"
                  }`}>
                    {locked
                      ? "Fixtures published - locked"
                      : restrictionSummary({
                          type: currentType,
                          earliestKickoff: notice?.earliestKickoff,
                          latestKickoff: notice?.latestKickoff,
                        })}
                  </span>
                </div>

                {locked ? (
                  <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm leading-6 text-white/50">
                    Fixtures for this week have already been published. Contact SIXFL if circumstances have changed.
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="grid gap-3 md:grid-cols-3">
                      <label className="rounded-2xl border border-emerald-400/20 bg-emerald-500/[0.05] p-4 text-sm text-white/75">
                        <input
                          type="radio"
                          name="restrictionType"
                          value="AVAILABLE"
                          defaultChecked={currentType === "AVAILABLE"}
                          className="mr-2 accent-emerald-400"
                        />
                        Normal availability
                      </label>
                      <label className="rounded-2xl border border-red-400/20 bg-red-500/[0.05] p-4 text-sm text-white/75">
                        <input
                          type="radio"
                          name="restrictionType"
                          value="UNAVAILABLE"
                          defaultChecked={currentType === "UNAVAILABLE"}
                          className="mr-2 accent-red-400"
                        />
                        Cannot play that week
                      </label>
                      <label className="rounded-2xl border border-amber-400/20 bg-amber-500/[0.05] p-4 text-sm text-white/75">
                        <input
                          type="radio"
                          name="restrictionType"
                          value="TIME_RESTRICTION"
                          defaultChecked={currentType === "TIME_RESTRICTION"}
                          className="mr-2 accent-amber-400"
                        />
                        Temporary time restriction
                      </label>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <label className="text-sm font-medium text-white/65">
                        <span className="mb-2 block">Earliest kick-off</span>
                        <input
                          type="time"
                          name="earliestKickoff"
                          defaultValue={notice?.earliestKickoff ?? ""}
                          className="h-12 w-full rounded-2xl border border-white/10 bg-black/30 px-4 text-sm text-white outline-none focus:border-amber-400/40"
                        />
                        <span className="mt-2 block text-xs font-normal text-white/40">Example: 20:00 means “we can only play from 8pm”.</span>
                      </label>
                      <label className="text-sm font-medium text-white/65">
                        <span className="mb-2 block">Latest kick-off</span>
                        <input
                          type="time"
                          name="latestKickoff"
                          defaultValue={notice?.latestKickoff ?? ""}
                          className="h-12 w-full rounded-2xl border border-white/10 bg-black/30 px-4 text-sm text-white outline-none focus:border-amber-400/40"
                        />
                        <span className="mt-2 block text-xs font-normal text-white/40">Leave blank if you only have an earliest-time restriction.</span>
                      </label>
                    </div>

                    <label className="block">
                      <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.18em] text-white/40">
                        Optional note
                      </span>
                      <input
                        name="note"
                        defaultValue={notice?.note ?? ""}
                        maxLength={500}
                        placeholder="Example: work commitments — after 8pm only"
                        className="h-12 w-full rounded-2xl border border-white/10 bg-black/30 px-4 text-sm text-white outline-none placeholder:text-white/30 focus:border-emerald-400/40"
                      />
                    </label>
                  </div>
                )}

                {!locked ? (
                  <button
                    type="submit"
                    className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-emerald-400 px-5 text-sm font-semibold text-black transition hover:bg-emerald-300"
                  >
                    Save this week
                  </button>
                ) : null}
              </div>
            </form>
          );
        })}
      </section>
    </div>
  );
}
