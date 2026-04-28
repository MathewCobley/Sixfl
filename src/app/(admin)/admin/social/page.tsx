// ========================================
// File: src/app/(admin)/admin/social/page.tsx
// ========================================

import Link from "next/link";
import { FixtureStatus, SocialPostStatus, SocialPostType } from "@prisma/client";
import AdminCard from "@/components/admin/AdminCard";
import CopyCaptionButton from "@/components/admin/social/CopyCaptionButton";
import {
  approveWeeklyMatchCardAction,
  deleteWeeklyMatchCardAction,
  generateWeeklyMatchCardAction,
  markWeeklyMatchCardPublishedAction,
  publishWeeklyMatchCardAction,
} from "@/app/(admin)/admin/social/weekly-actions";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import {
  formatDateTimeInLondon,
  formatTimeInLondon,
  toLondonDateInputValue,
} from "@/lib/datetime/london";
import {
  formatWeeklyCardShortDate,
  getWeeklyPostTypeLabel,
} from "@/lib/social/weekly-match-card";

type WeeklyCardRow = {
  id: string;
  leagueId: string;
  leagueName: string;
  leagueSeason: string | null;
  leagueSlug: string | null;
  fixtureDate: Date;
  postType: SocialPostType;
  postStatus: SocialPostStatus;
  caption: string | null;
  imageUrl: string | null;
  externalPostId: string | null;
  lastError: string | null;
  queuedAt: Date | null;
  approvedAt: Date | null;
  publishedAt: Date | null;
  updatedAt: Date;
  fixtureCount: number;
};

type MatchNightGroup = {
  key: string;
  leagueId: string;
  leagueName: string;
  leagueSeason: string | null;
  leagueSlug: string;
  fixtureDateInput: string;
  fixtureDateLabel: string;
  firstKickoffAt: Date;
  lastKickoffAt: Date;
  fixtureCount: number;
  scheduledCount: number;
  completedCount: number;
  updateCount: number;
  disputedCount: number;
};

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function formatTimestamp(value: Date | null) {
  if (!value) return null;

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

function getStatusTone(status: SocialPostStatus) {
  switch (status) {
    case "PUBLISHED":
      return "border-emerald-400/20 bg-emerald-400/10 text-emerald-200";
    case "APPROVED":
      return "border-sky-400/20 bg-sky-400/10 text-sky-200";
    case "DRAFTED":
      return "border-violet-400/20 bg-violet-400/10 text-violet-200";
    case "QUEUED":
      return "border-amber-400/20 bg-amber-400/10 text-amber-200";
    case "FAILED":
      return "border-rose-400/20 bg-rose-500/10 text-rose-200";
    case "NONE":
    default:
      return "border-white/10 bg-white/5 text-white/70";
  }
}

function formatStatus(status: SocialPostStatus) {
  switch (status) {
    case "NONE":
      return "Not drafted";
    case "QUEUED":
      return "Queued";
    case "DRAFTED":
      return "Draft ready";
    case "APPROVED":
      return "Approved";
    case "PUBLISHED":
      return "Published";
    case "FAILED":
      return "Failed";
    default:
      return status;
  }
}

function leagueLabel(input: { leagueName: string; leagueSeason: string | null }) {
  return input.leagueSeason
    ? `${input.leagueName} • ${input.leagueSeason}`
    : input.leagueName;
}

function MetricPill({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="min-w-0 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
      <div className="truncate text-[11px] font-semibold uppercase tracking-[0.16em] text-white/40">
        {label}
      </div>
      <div className="mt-1 text-lg font-semibold text-white">{value}</div>
    </div>
  );
}

function ActionButton({
  children,
  tone = "default",
}: {
  children: React.ReactNode;
  tone?: "default" | "emerald" | "sky" | "rose";
}) {
  return (
    <button
      type="submit"
      className={cx(
        "inline-flex h-10 items-center justify-center rounded-xl border px-3 text-xs font-semibold transition",
        tone === "emerald" &&
          "border-emerald-400/20 bg-emerald-400/10 text-emerald-200 hover:border-emerald-300/30 hover:bg-emerald-400/15",
        tone === "sky" &&
          "border-sky-400/20 bg-sky-400/10 text-sky-200 hover:border-sky-300/30 hover:bg-sky-400/15",
        tone === "rose" &&
          "border-rose-400/20 bg-rose-500/10 text-rose-200 hover:border-rose-300/30 hover:bg-rose-500/15",
        tone === "default" &&
          "border-white/10 bg-white/[0.05] text-white hover:border-white/20 hover:bg-white/[0.08]",
      )}
    >
      {children}
    </button>
  );
}

function groupFixturesByMatchNight(
  fixtures: Array<{
    id: string;
    kickoffAt: Date;
    status: FixtureStatus;
    league: {
      id: string;
      name: string;
      season: string | null;
      slug: string;
    };
    result: {
      isDisputed: boolean;
    } | null;
  }>,
) {
  const map = new Map<string, MatchNightGroup>();

  for (const fixture of fixtures) {
    const dateInput = toLondonDateInputValue(fixture.kickoffAt);
    const key = `${fixture.league.id}:${dateInput}`;
    const current = map.get(key);

    if (!current) {
      map.set(key, {
        key,
        leagueId: fixture.league.id,
        leagueName: fixture.league.name,
        leagueSeason: fixture.league.season,
        leagueSlug: fixture.league.slug,
        fixtureDateInput: dateInput,
        fixtureDateLabel: formatDateTimeInLondon(fixture.kickoffAt, {
          weekday: "long",
          day: "numeric",
          month: "long",
        }),
        firstKickoffAt: fixture.kickoffAt,
        lastKickoffAt: fixture.kickoffAt,
        fixtureCount: 0,
        scheduledCount: 0,
        completedCount: 0,
        updateCount: 0,
        disputedCount: 0,
      });
    }

    const group = map.get(key);

    if (!group) continue;

    group.fixtureCount += 1;
    group.scheduledCount += fixture.status === "SCHEDULED" ? 1 : 0;
    group.completedCount += fixture.status === "COMPLETED" ? 1 : 0;
    group.updateCount +=
      fixture.status === "POSTPONED" || fixture.status === "CANCELLED" ? 1 : 0;
    group.disputedCount += fixture.result?.isDisputed ? 1 : 0;

    if (fixture.kickoffAt < group.firstKickoffAt) {
      group.firstKickoffAt = fixture.kickoffAt;
    }

    if (fixture.kickoffAt > group.lastKickoffAt) {
      group.lastKickoffAt = fixture.kickoffAt;
    }
  }

  return Array.from(map.values()).sort(
    (a, b) => a.firstKickoffAt.getTime() - b.firstKickoffAt.getTime(),
  );
}

export default async function AdminSocialPage() {
  await requireAdmin();

  const today = new Date();
  const start = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
  const end = new Date(today.getTime() + 45 * 24 * 60 * 60 * 1000);

  const [sourceFixtures, weeklyCards] = await Promise.all([
    prisma.fixture.findMany({
      where: {
        kickoffAt: {
          gte: start,
          lt: end,
        },
        status: {
          in: ["SCHEDULED", "COMPLETED", "POSTPONED", "CANCELLED"],
        },
        league: {
          isActive: true,
        },
      },
      orderBy: [{ kickoffAt: "asc" }, { pitch: "asc" }, { position: "asc" }],
      select: {
        id: true,
        kickoffAt: true,
        status: true,
        league: {
          select: {
            id: true,
            name: true,
            season: true,
            slug: true,
          },
        },
        result: {
          select: {
            isDisputed: true,
          },
        },
      },
    }),
    prisma.$queryRaw<WeeklyCardRow[]>`
      SELECT
        c."id",
        c."leagueId",
        l."name" AS "leagueName",
        l."season" AS "leagueSeason",
        l."slug" AS "leagueSlug",
        c."fixtureDate",
        c."postType",
        c."postStatus",
        c."caption",
        c."imageUrl",
        c."externalPostId",
        c."lastError",
        c."queuedAt",
        c."approvedAt",
        c."publishedAt",
        c."updatedAt",
        COUNT(cf."id")::int AS "fixtureCount"
      FROM "SocialMatchCard" c
      INNER JOIN "League" l ON l."id" = c."leagueId"
      LEFT JOIN "SocialMatchCardFixture" cf ON cf."socialMatchCardId" = c."id"
      GROUP BY c."id", l."name", l."season", l."slug"
      ORDER BY c."updatedAt" DESC
      LIMIT 40
    `,
  ]);

  const matchNights = groupFixturesByMatchNight(sourceFixtures).slice(0, 18);

  const counts = {
    drafted: weeklyCards.filter((card) => card.postStatus === "DRAFTED").length,
    approved: weeklyCards.filter((card) => card.postStatus === "APPROVED").length,
    published: weeklyCards.filter((card) => card.postStatus === "PUBLISHED").length,
    failed: weeklyCards.filter((card) => card.postStatus === "FAILED").length,
  };

  return (
    <div className="w-full space-y-8 px-4 pb-10 pt-6 sm:px-6 lg:px-8">
      <div className="rounded-3xl border border-white/10 bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.14),transparent_32%),rgba(255,255,255,0.03)] p-6 shadow-[0_20px_80px_rgba(0,0,0,0.35)] md:p-8">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-300">
              Weekly social cards
            </div>
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-white md:text-4xl">
                Publish one match card per league night
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-white/60 md:text-base">
                Generate a single unified image and caption for each match night,
                then publish it to Facebook and Instagram from one controlled queue.
              </p>
            </div>
          </div>

          <div className="grid w-full gap-3 sm:grid-cols-2 xl:w-auto xl:grid-cols-4">
            <MetricPill label="Draft ready" value={counts.drafted} />
            <MetricPill label="Approved" value={counts.approved} />
            <MetricPill label="Published" value={counts.published} />
            <MetricPill label="Failed" value={counts.failed} />
          </div>
        </div>
      </div>

      <AdminCard className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] p-0 shadow-[0_24px_80px_rgba(0,0,0,0.32)]">
        <div className="border-b border-white/10 px-6 py-6 md:px-8">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div className="space-y-2">
              <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-300/80">
                Generate weekly cards
              </div>
              <h2 className="text-2xl font-semibold tracking-tight text-white">
                Suggested match nights
              </h2>
              <p className="max-w-2xl text-sm leading-6 text-white/55">
                These are grouped from the fixture list, so each button creates one
                Facebook/Instagram card for the whole night.
              </p>
            </div>
            <Link
              href="/admin/fixtures"
              className="inline-flex h-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] px-3 text-xs font-semibold text-white transition hover:border-white/20 hover:bg-white/[0.08]"
            >
              Open fixtures
            </Link>
          </div>
        </div>

        {matchNights.length === 0 ? (
          <div className="px-6 py-10 md:px-8">
            <div className="rounded-3xl border border-dashed border-white/10 bg-black/20 px-6 py-12 text-center">
              <h3 className="text-lg font-semibold text-white">No match nights found</h3>
              <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-white/50">
                Add or publish fixtures first, then return here to generate weekly
                social cards.
              </p>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-white/10">
            {matchNights.map((night) => {
              const kickoffWindow = `${formatTimeInLondon(night.firstKickoffAt)} - ${formatTimeInLondon(night.lastKickoffAt)}`;
              const canGenerateResults =
                night.completedCount > 0 && night.disputedCount === 0;

              return (
                <div
                  key={night.key}
                  className="grid gap-6 px-6 py-6 lg:grid-cols-[minmax(0,1fr)_auto] md:px-8"
                >
                  <div className="space-y-4">
                    <div>
                      <div className="text-lg font-semibold text-white">
                        {leagueLabel(night)}
                      </div>
                      <div className="mt-1 text-sm text-white/50">
                        {night.fixtureDateLabel} • {kickoffWindow}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-white/70">
                        {night.fixtureCount} fixtures
                      </span>
                      <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-200">
                        {night.scheduledCount} scheduled
                      </span>
                      <span className="rounded-full border border-sky-400/20 bg-sky-400/10 px-3 py-1 text-xs font-semibold text-sky-200">
                        {night.completedCount} completed
                      </span>
                      {night.updateCount > 0 ? (
                        <span className="rounded-full border border-amber-400/20 bg-amber-400/10 px-3 py-1 text-xs font-semibold text-amber-200">
                          {night.updateCount} updates
                        </span>
                      ) : null}
                      {night.disputedCount > 0 ? (
                        <span className="rounded-full border border-rose-400/20 bg-rose-500/10 px-3 py-1 text-xs font-semibold text-rose-200">
                          {night.disputedCount} disputed
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 lg:justify-end">
                    {night.scheduledCount + night.updateCount > 0 ? (
                      <form action={generateWeeklyMatchCardAction}>
                        <input type="hidden" name="leagueId" value={night.leagueId} />
                        <input
                          type="hidden"
                          name="fixtureDate"
                          value={night.fixtureDateInput}
                        />
                        <input type="hidden" name="postType" value="FIXTURE" />
                        <ActionButton tone="emerald">Generate match card</ActionButton>
                      </form>
                    ) : null}

                    {canGenerateResults ? (
                      <form action={generateWeeklyMatchCardAction}>
                        <input type="hidden" name="leagueId" value={night.leagueId} />
                        <input
                          type="hidden"
                          name="fixtureDate"
                          value={night.fixtureDateInput}
                        />
                        <input type="hidden" name="postType" value="RESULT" />
                        <ActionButton tone="sky">Generate results card</ActionButton>
                      </form>
                    ) : null}

                    {night.updateCount > 0 ? (
                      <form action={generateWeeklyMatchCardAction}>
                        <input type="hidden" name="leagueId" value={night.leagueId} />
                        <input
                          type="hidden"
                          name="fixtureDate"
                          value={night.fixtureDateInput}
                        />
                        <input type="hidden" name="postType" value="UPDATE" />
                        <ActionButton>Generate update card</ActionButton>
                      </form>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </AdminCard>

      <AdminCard className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] p-0 shadow-[0_24px_80px_rgba(0,0,0,0.32)]">
        <div className="border-b border-white/10 px-6 py-6 md:px-8">
          <div className="space-y-2">
            <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-300/80">
              Ready to post
            </div>
            <h2 className="text-2xl font-semibold tracking-tight text-white">
              Weekly social queue
            </h2>
            <p className="max-w-2xl text-sm leading-6 text-white/55">
              Approve, publish, copy captions, and open the generated image from
              one queue. This replaces the old one-post-per-fixture flow.
            </p>
          </div>
        </div>

        {weeklyCards.length === 0 ? (
          <div className="px-6 py-10 md:px-8">
            <div className="rounded-3xl border border-dashed border-white/10 bg-black/20 px-6 py-12 text-center">
              <h3 className="text-lg font-semibold text-white">No weekly cards yet</h3>
              <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-white/50">
                Generate one from a suggested match night above and it will appear here.
              </p>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-white/10">
            {weeklyCards.map((card) => {
              const title = `${getWeeklyPostTypeLabel(card.postType)} • ${leagueLabel(card)}`;
              const dateLabel = formatWeeklyCardShortDate(card.fixtureDate);

              return (
                <div
                  key={card.id}
                  className="grid gap-6 px-6 py-6 xl:grid-cols-[minmax(0,1.2fr)_auto] md:px-8"
                >
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="text-lg font-semibold text-white">{title}</div>

                      <span className="inline-flex rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-white/70">
                        {dateLabel}
                      </span>

                      <span className="inline-flex rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-white/70">
                        {card.fixtureCount} fixtures
                      </span>

                      <span
                        className={cx(
                          "inline-flex rounded-full border px-3 py-1 text-xs font-semibold",
                          getStatusTone(card.postStatus),
                        )}
                      >
                        {formatStatus(card.postStatus)}
                      </span>
                    </div>

                    {card.caption ? (
                      <div className="whitespace-pre-line rounded-2xl border border-white/10 bg-black/25 p-4 text-sm leading-6 text-white/78">
                        {card.caption}
                      </div>
                    ) : null}

                    {card.lastError ? (
                      <div className="rounded-2xl border border-rose-400/20 bg-rose-500/10 p-4 text-sm leading-6 text-rose-100">
                        {card.lastError}
                      </div>
                    ) : null}

                    <div className="flex flex-wrap gap-4 text-xs text-white/45">
                      {card.queuedAt ? (
                        <span>Generated {formatTimestamp(card.queuedAt)}</span>
                      ) : null}
                      {card.approvedAt ? (
                        <span>Approved {formatTimestamp(card.approvedAt)}</span>
                      ) : null}
                      {card.publishedAt ? (
                        <span>Published {formatTimestamp(card.publishedAt)}</span>
                      ) : null}
                      {card.externalPostId ? <span>External ID saved</span> : null}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 xl:flex-col xl:items-end">
                    {card.imageUrl ? (
                      <a
                        href={card.imageUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex h-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] px-3 text-xs font-semibold text-white transition hover:border-white/20 hover:bg-white/[0.08]"
                      >
                        Open image
                      </a>
                    ) : null}

                    {card.caption ? <CopyCaptionButton caption={card.caption} /> : null}

                    <form action={generateWeeklyMatchCardAction}>
                      <input type="hidden" name="leagueId" value={card.leagueId} />
                      <input
                        type="hidden"
                        name="fixtureDate"
                        value={toLondonDateInputValue(card.fixtureDate)}
                      />
                      <input type="hidden" name="postType" value={card.postType} />
                      <ActionButton>Regenerate</ActionButton>
                    </form>

                    {card.postStatus === "DRAFTED" || card.postStatus === "FAILED" ? (
                      <form action={approveWeeklyMatchCardAction}>
                        <input type="hidden" name="cardId" value={card.id} />
                        <ActionButton tone="sky">Approve</ActionButton>
                      </form>
                    ) : null}

                    {card.postStatus === "APPROVED" ? (
                      <form action={publishWeeklyMatchCardAction}>
                        <input type="hidden" name="cardId" value={card.id} />
                        <ActionButton tone="emerald">Publish to Meta</ActionButton>
                      </form>
                    ) : null}

                    {card.postStatus !== "PUBLISHED" ? (
                      <form action={markWeeklyMatchCardPublishedAction}>
                        <input type="hidden" name="cardId" value={card.id} />
                        <ActionButton>Mark published</ActionButton>
                      </form>
                    ) : null}

                    <form action={deleteWeeklyMatchCardAction}>
                      <input type="hidden" name="cardId" value={card.id} />
                      <ActionButton tone="rose">Delete card</ActionButton>
                    </form>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </AdminCard>
    </div>
  );
}
