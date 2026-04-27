// ========================================
// File: src/app/(admin)/admin/social/page.tsx
// ========================================

import Link from "next/link";
import { SocialPostStatus } from "@prisma/client";
import AdminCard from "@/components/admin/AdminCard";
import {
  markFixtureSocialDraftedAction,
  markFixtureSocialPublishedAction,
} from "@/app/(admin)/admin/social/actions";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import CopyCaptionButton from "@/components/admin/social/CopyCaptionButton";

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



export default async function AdminSocialPage() {
  await requireAdmin();

  const fixtures = await prisma.fixture.findMany({
    where: {
      socialPostStatus: {
        in: [
          SocialPostStatus.QUEUED,
          SocialPostStatus.DRAFTED,
          SocialPostStatus.APPROVED,
          SocialPostStatus.PUBLISHED,
          SocialPostStatus.FAILED,
        ],
      },
    },
    orderBy: [{ updatedAt: "desc" }],
    select: {
      id: true,
      status: true,
      socialPostType: true,
      socialPostStatus: true,
      socialCaption: true,
      socialImageUrl: true,
      socialQueuedAt: true,
      socialApprovedAt: true,
      socialPublishedAt: true,
      leagueId: true,
      league: {
        select: {
          name: true,
          season: true,
        },
      },
      homeTeam: {
        select: {
          name: true,
        },
      },
      awayTeam: {
        select: {
          name: true,
        },
      },
      result: {
        select: {
          homeScore: true,
          awayScore: true,
        },
      },
      kickoffAt: true,
    },
  });

  const counts = {
    drafted: fixtures.filter((f) => f.socialPostStatus === "DRAFTED").length,
    approved: fixtures.filter((f) => f.socialPostStatus === "APPROVED").length,
    published: fixtures.filter((f) => f.socialPostStatus === "PUBLISHED").length,
    failed: fixtures.filter((f) => f.socialPostStatus === "FAILED").length,
  };

  return (
    <div className="w-full space-y-8 px-4 pb-10 pt-6 sm:px-6 lg:px-8">
      <div className="rounded-3xl border border-white/10 bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.14),transparent_32%),rgba(255,255,255,0.03)] p-6 shadow-[0_20px_80px_rgba(0,0,0,0.35)] md:p-8">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-300">
              Social queue
            </div>
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-white md:text-4xl">
                Publish to Meta Business Suite
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-white/60 md:text-base">
                Open the image, copy the caption, publish in Meta Business Suite,
                then mark the post as published here.
              </p>
            </div>
          </div>

          <div className="grid w-full gap-3 sm:grid-cols-2 xl:w-auto xl:grid-cols-4">
            <div className="min-w-0 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
              <div className="truncate text-[11px] font-semibold uppercase tracking-[0.16em] text-white/40">
                Draft ready
              </div>
              <div className="mt-1 text-lg font-semibold text-white">{counts.drafted}</div>
            </div>
            <div className="min-w-0 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
              <div className="truncate text-[11px] font-semibold uppercase tracking-[0.16em] text-white/40">
                Approved
              </div>
              <div className="mt-1 text-lg font-semibold text-white">{counts.approved}</div>
            </div>
            <div className="min-w-0 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
              <div className="truncate text-[11px] font-semibold uppercase tracking-[0.16em] text-white/40">
                Published
              </div>
              <div className="mt-1 text-lg font-semibold text-white">{counts.published}</div>
            </div>
            <div className="min-w-0 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
              <div className="truncate text-[11px] font-semibold uppercase tracking-[0.16em] text-white/40">
                Failed
              </div>
              <div className="mt-1 text-lg font-semibold text-white">{counts.failed}</div>
            </div>
          </div>
        </div>
      </div>

      <AdminCard className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] p-0 shadow-[0_24px_80px_rgba(0,0,0,0.32)]">
        <div className="border-b border-white/10 px-6 py-6 md:px-8">
          <div className="space-y-2">
            <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-300/80">
              Ready to post
            </div>
            <h2 className="text-2xl font-semibold tracking-tight text-white">
              Social drafts
            </h2>
          </div>
        </div>

        {fixtures.length === 0 ? (
          <div className="px-6 py-10 md:px-8">
            <div className="rounded-3xl border border-dashed border-white/10 bg-black/20 px-6 py-12 text-center">
              <h3 className="text-lg font-semibold text-white">No social drafts yet</h3>
              <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-white/50">
                Generate a draft from Fixtures and it will appear here.
              </p>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-white/10">
            {fixtures.map((fixture) => {
              const title = `${fixture.homeTeam?.name ?? "Team 1"} vs ${fixture.awayTeam?.name ?? "Team 2"}`;
              const homeScore = fixture.result?.homeScore ?? null;
const awayScore = fixture.result?.awayScore ?? null;

const resultLabel =
  homeScore !== null && awayScore !== null
    ? `${homeScore}-${awayScore}`
    : null;

              return (
                <div
                  key={fixture.id}
                  className="grid gap-6 px-6 py-6 md:grid-cols-[minmax(0,1.2fr)_auto] md:px-8"
                >
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="text-lg font-semibold text-white">{title}</div>

                      {resultLabel ? (
                        <span className="inline-flex rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-white/80">
                          {resultLabel}
                        </span>
                      ) : null}

                      <span
                        className={[
                          "inline-flex rounded-full border px-3 py-1 text-xs font-semibold",
                          getStatusTone(fixture.socialPostStatus),
                        ].join(" ")}
                      >
                        {formatStatus(fixture.socialPostStatus)}
                      </span>
                    </div>

                    <div className="text-sm text-white/45">
                      {(fixture.league?.season
                        ? `${fixture.league.name} • ${fixture.league.season}`
                        : fixture.league?.name) ?? "League"}
                      {" • "}
                      {new Intl.DateTimeFormat("en-GB", {
                        weekday: "short",
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      }).format(fixture.kickoffAt)}
                    </div>

                    {fixture.socialCaption ? (
                      <div className="rounded-2xl border border-white/10 bg-black/25 p-4 text-sm leading-6 text-white/78">
                        {fixture.socialCaption}
                      </div>
                    ) : null}

                    <div className="flex flex-wrap gap-4 text-xs text-white/45">
                      {fixture.socialQueuedAt ? (
                        <span>Queued {formatTimestamp(fixture.socialQueuedAt)}</span>
                      ) : null}
                      {fixture.socialApprovedAt ? (
                        <span>Approved {formatTimestamp(fixture.socialApprovedAt)}</span>
                      ) : null}
                      {fixture.socialPublishedAt ? (
                        <span>Published {formatTimestamp(fixture.socialPublishedAt)}</span>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 md:flex-col md:items-end">
                    {fixture.socialImageUrl ? (
                      <a
                        href={fixture.socialImageUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex h-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] px-3 text-xs font-semibold text-white transition hover:border-white/20 hover:bg-white/[0.08]"
                      >
                        Open image
                      </a>
                    ) : null}

                    {fixture.socialCaption ? (
                      <CopyCaptionButton caption={fixture.socialCaption} />
                    ) : null}

                    <Link
                      href={`/admin/fixtures`}
                      className="inline-flex h-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] px-3 text-xs font-semibold text-white transition hover:border-white/20 hover:bg-white/[0.08]"
                    >
                      Open fixtures
                    </Link>

                    {fixture.socialPostStatus !== "PUBLISHED" ? (
                      <form action={markFixtureSocialPublishedAction}>
                        <input type="hidden" name="fixtureId" value={fixture.id} />
                        <button
                          type="submit"
                          className="inline-flex h-10 items-center justify-center rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-3 text-xs font-semibold text-emerald-200 transition hover:border-emerald-300/30 hover:bg-emerald-400/15"
                        >
                          Mark as published
                        </button>
                      </form>
                    ) : (
                      <form action={markFixtureSocialDraftedAction}>
                        <input type="hidden" name="fixtureId" value={fixture.id} />
                        <button
                          type="submit"
                          className="inline-flex h-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] px-3 text-xs font-semibold text-white transition hover:border-white/20 hover:bg-white/[0.08]"
                        >
                          Move back to draft
                        </button>
                      </form>
                    )}
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