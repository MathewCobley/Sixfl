// ========================================
// File: src/app/(admin)/admin/fixtures/issues/page.tsx
// ========================================

import Link from "next/link";
import { NotificationDispatchStatus } from "@prisma/client";

import AdminCard from "@/components/admin/AdminCard";
import { replyToFixtureIssueAction } from "@/app/(admin)/admin/fixtures/issues/actions";
import { formatDateTimeInLondon } from "@/lib/datetime/london";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const FIXTURE_ISSUE_REPLY_SOURCE_TYPE = "FIXTURE_CONFIRMATION_REPLY";

type SearchParams = {
  leagueId?: string;
  notice?: string;
  teamName?: string;
};

function getIssueSourceId(input: { fixtureId: string; teamId: string }) {
  return `${input.fixtureId}:${input.teamId}`;
}

function formatKickoff(value: Date) {
  return formatDateTimeInLondon(value, {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatStamp(value: Date | null) {
  if (!value) return null;

  return formatDateTimeInLondon(value, {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getDispatchTone(status: NotificationDispatchStatus) {
  switch (status) {
    case "QUEUED":
      return "border-sky-400/20 bg-sky-400/10 text-sky-100";
    case "SENT":
      return "border-emerald-400/20 bg-emerald-400/10 text-emerald-100";
    case "FAILED":
      return "border-red-400/20 bg-red-500/10 text-red-100";
    case "SKIPPED":
      return "border-amber-400/20 bg-amber-500/10 text-amber-100";
    default:
      return "border-white/10 bg-white/5 text-white/70";
  }
}

function getNotice(input: SearchParams) {
  const teamName = input.teamName ?? "that team";

  switch (input.notice) {
    case "reply_queued":
      return {
        tone: "success" as const,
        message: `Reply queued for ${teamName}.`,
      };
    case "reply_skipped":
      return {
        tone: "info" as const,
        message: `Reply saved but the email could not be queued for ${teamName}. Check the team contact email and notification settings.`,
      };
    case "reply_error":
      return {
        tone: "error" as const,
        message: `Something went wrong while replying to ${teamName}. If reply-by-email is not configured, check EMAIL_REPLY_DOMAIN.`,
      };
    case "reply_too_short":
      return {
        tone: "error" as const,
        message: "Please enter a longer reply.",
      };
    case "issue_not_found":
      return {
        tone: "error" as const,
        message: "That issue could not be found or is no longer open.",
      };
    case "missing_issue":
      return {
        tone: "error" as const,
        message: "The fixture issue details were missing.",
      };
    default:
      return null;
  }
}

function NoticeCard({
  notice,
}: {
  notice: NonNullable<ReturnType<typeof getNotice>>;
}) {
  return (
    <div
      className={[
        "rounded-2xl border px-4 py-3 text-sm",
        notice.tone === "success"
          ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-100"
          : notice.tone === "error"
            ? "border-red-500/30 bg-red-500/10 text-red-100"
            : "border-white/10 bg-white/[0.05] text-white/75",
      ].join(" ")}
    >
      {notice.message}
    </div>
  );
}

export default async function AdminFixtureIssuesPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  await requireAdmin();

  const sp = (await searchParams) ?? {};
  const notice = getNotice(sp);

  const leagues = await prisma.league.findMany({
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      season: true,
    },
  });

  const selectedLeagueId = leagues.some((league) => league.id === sp.leagueId)
    ? sp.leagueId
    : undefined;

  const issues = await prisma.fixtureCaptainConfirmation.findMany({
    where: {
      status: "ISSUE_RAISED",
      fixture: selectedLeagueId
        ? {
            leagueId: selectedLeagueId,
          }
        : undefined,
    },
    orderBy: [{ issueRaisedAt: "desc" }, { updatedAt: "desc" }],
    select: {
      id: true,
      fixtureId: true,
      teamId: true,
      note: true,
      issueRaisedAt: true,
      lastChasedAt: true,
      team: {
        select: {
          id: true,
          name: true,
          contactName: true,
          contactEmail: true,
          secondaryContactName: true,
          secondaryContactEmail: true,
        },
      },
      fixture: {
        select: {
          id: true,
          leagueId: true,
          kickoffAt: true,
          round: true,
          pitch: true,
          league: {
            select: {
              name: true,
              season: true,
            },
          },
          homeTeam: { select: { id: true, name: true } },
          awayTeam: { select: { id: true, name: true } },
        },
      },
      confirmedByUser: {
        select: {
          name: true,
          email: true,
        },
      },
    },
  });

  const issueSourceIds = issues.map((issue) =>
    getIssueSourceId({ fixtureId: issue.fixtureId, teamId: issue.teamId }),
  );

  const replies = issueSourceIds.length
    ? await prisma.notificationDispatch.findMany({
        where: {
          sourceType: FIXTURE_ISSUE_REPLY_SOURCE_TYPE,
          sourceId: { in: issueSourceIds },
        },
        orderBy: [{ createdAt: "desc" }],
        select: {
          id: true,
          sourceId: true,
          status: true,
          subject: true,
          bodyText: true,
          failureReason: true,
          createdAt: true,
          sentAt: true,
        },
      })
    : [];

  const repliesByIssue = new Map<string, typeof replies>();

  for (const reply of replies) {
    if (!reply.sourceId) continue;
    const current = repliesByIssue.get(reply.sourceId) ?? [];
    current.push(reply);
    repliesByIssue.set(reply.sourceId, current);
  }

  const emailReplyConfigured = Boolean(process.env.EMAIL_REPLY_DOMAIN?.trim());

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 pb-10 pt-6 sm:px-6 lg:px-8">
      <div className="rounded-3xl border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(245,158,11,0.16),transparent_36%),rgba(255,255,255,0.03)] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.34)] md:p-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="inline-flex rounded-full border border-amber-400/20 bg-amber-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-200">
              Fixture issues
            </div>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-white md:text-4xl">
              Reply to raised fixture issues
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-white/60 md:text-base">
              Captains can raise a fixture issue from their dashboard. This page lets SIXFL reply directly to the team contact and keeps previous replies against the same fixture/team issue.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/admin/fixtures"
              className="inline-flex h-11 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] px-4 text-sm font-semibold text-white/80 transition hover:bg-white/[0.08]"
            >
              Back to fixtures
            </Link>
          </div>
        </div>
      </div>

      {notice ? <NoticeCard notice={notice} /> : null}

      {!emailReplyConfigured ? (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          Reply-by-email is not configured yet. Add <span className="font-mono">EMAIL_REPLY_DOMAIN</span> in Railway before sending replies.
        </div>
      ) : null}

      <AdminCard className="rounded-3xl border border-white/10 bg-white/[0.03] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.32)] md:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-white">Open issues</h2>
            <p className="mt-1 text-sm text-white/55">
              {issues.length} raised fixture issue{issues.length === 1 ? "" : "s"} currently open.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              href="/admin/fixtures/issues"
              className={[
                "inline-flex h-10 items-center rounded-xl border px-3 text-xs font-semibold transition",
                !selectedLeagueId
                  ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-100"
                  : "border-white/10 bg-white/[0.04] text-white/65 hover:bg-white/[0.08]",
              ].join(" ")}
            >
              All leagues
            </Link>
            {leagues.map((league) => (
              <Link
                key={league.id}
                href={`/admin/fixtures/issues?leagueId=${league.id}`}
                className={[
                  "inline-flex h-10 items-center rounded-xl border px-3 text-xs font-semibold transition",
                  selectedLeagueId === league.id
                    ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-100"
                    : "border-white/10 bg-white/[0.04] text-white/65 hover:bg-white/[0.08]",
                ].join(" ")}
              >
                {league.season ? `${league.name} · ${league.season}` : league.name}
              </Link>
            ))}
          </div>
        </div>
      </AdminCard>

      {issues.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-white/10 bg-black/20 p-12 text-center">
          <h2 className="text-xl font-semibold text-white">No raised issues</h2>
          <p className="mt-2 text-sm leading-6 text-white/55">
            When a captain raises an issue against a fixture, it will appear here for a direct reply.
          </p>
        </div>
      ) : (
        <div className="grid gap-5">
          {issues.map((issue) => {
            const sourceId = getIssueSourceId({
              fixtureId: issue.fixtureId,
              teamId: issue.teamId,
            });
            const issueReplies = repliesByIssue.get(sourceId) ?? [];
            const fixtureTitle = `${issue.fixture.homeTeam.name} vs ${issue.fixture.awayTeam.name}`;
            const captainName =
              issue.confirmedByUser?.name ?? issue.confirmedByUser?.email ?? "Captain";

            return (
              <AdminCard
                key={issue.id}
                className="overflow-hidden rounded-3xl border border-amber-400/20 bg-[radial-gradient(circle_at_top_left,rgba(245,158,11,0.12),transparent_30%),rgba(255,255,255,0.03)] p-0"
              >
                <div className="grid gap-0 xl:grid-cols-[minmax(0,1fr)_420px]">
                  <div className="space-y-5 p-5 md:p-6">
                    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="inline-flex rounded-xl border border-amber-400/30 bg-amber-400/15 px-4 py-2 text-sm font-semibold text-amber-50">
                            Issue raised by&nbsp;
                            <span className="font-bold">{issue.team.name}</span>
                          </span>
                          <span className="inline-flex rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-semibold text-white/60">
                            {issue.fixture.league.season
                              ? `${issue.fixture.league.name} · ${issue.fixture.league.season}`
                              : issue.fixture.league.name}
                          </span>
                        </div>

                        <h2 className="mt-3 text-2xl font-semibold tracking-tight text-white">
                          {fixtureTitle}
                        </h2>
                        <p className="mt-2 text-sm leading-6 text-white/55">
                          {formatKickoff(issue.fixture.kickoffAt)}
                          {issue.fixture.round ? ` · Matchweek ${issue.fixture.round}` : ""}
                          {issue.fixture.pitch ? ` · ${issue.fixture.pitch}` : ""}
                        </p>
                      </div>

                      <div className="text-sm text-white/45 md:text-right">
                        <div>Submitted by {captainName}</div>
                        <div>
                          {issue.issueRaisedAt
                            ? formatStamp(issue.issueRaisedAt)
                            : "Time not recorded"}
                        </div>
                        {issue.lastChasedAt ? (
                          <div className="mt-1 text-white/35">
                            Last replied/chased {formatStamp(issue.lastChasedAt)}
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 p-4 text-sm leading-6 text-amber-50/90">
                      <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-100/70">
                        Captain issue note
                      </div>
                      {issue.note}
                    </div>

                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/35">
                          Primary contact
                        </div>
                        <div className="mt-2 text-sm text-white">
                          {issue.team.contactName ?? issue.team.name}
                        </div>
                        <div className="mt-1 text-xs text-white/45">
                          {issue.team.contactEmail ?? "No primary email on team record"}
                        </div>
                      </div>

                      <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/35">
                          Secondary contact
                        </div>
                        <div className="mt-2 text-sm text-white">
                          {issue.team.secondaryContactName ?? "Not set"}
                        </div>
                        <div className="mt-1 text-xs text-white/45">
                          {issue.team.secondaryContactEmail ?? "No secondary email"}
                        </div>
                      </div>
                    </div>

                    {issueReplies.length > 0 ? (
                      <div className="space-y-3">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/35">
                          Previous SIXFL replies
                        </div>
                        {issueReplies.map((reply) => (
                          <div
                            key={reply.id}
                            className="rounded-2xl border border-white/10 bg-black/25 p-4"
                          >
                            <div className="mb-2 flex flex-wrap items-center gap-2">
                              <span
                                className={[
                                  "inline-flex rounded-full border px-3 py-1 text-xs font-semibold",
                                  getDispatchTone(reply.status),
                                ].join(" ")}
                              >
                                {reply.status.toLowerCase()}
                              </span>
                              <span className="text-xs text-white/40">
                                {formatStamp(reply.createdAt)}
                                {reply.sentAt ? ` · sent ${formatStamp(reply.sentAt)}` : ""}
                              </span>
                            </div>
                            {reply.subject ? (
                              <div className="mb-2 text-sm font-semibold text-white/80">
                                {reply.subject}
                              </div>
                            ) : null}
                            <p className="whitespace-pre-wrap text-sm leading-6 text-white/65">
                              {reply.bodyText}
                            </p>
                            {reply.failureReason ? (
                              <div className="mt-3 rounded-xl border border-red-400/20 bg-red-500/10 px-3 py-2 text-xs text-red-100">
                                {reply.failureReason}
                              </div>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>

                  <div className="border-t border-white/10 bg-black/20 p-5 md:p-6 xl:border-l xl:border-t-0">
                    <form action={replyToFixtureIssueAction} className="space-y-4">
                      <input type="hidden" name="fixtureId" value={issue.fixtureId} />
                      <input type="hidden" name="teamId" value={issue.teamId} />
                      <input type="hidden" name="leagueId" value={issue.fixture.leagueId} />

                      <div>
                        <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-white/45">
                          SIXFL reply
                        </label>
                        <textarea
                          name="reply"
                          rows={8}
                          placeholder="Example: Thanks for letting us know. We can help find additional players for this fixture. I’ll contact you shortly to confirm numbers."
                          className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm leading-6 text-white outline-none transition placeholder:text-white/25 focus:border-emerald-400/40 focus:ring-2 focus:ring-emerald-400/20"
                        />
                      </div>

                      <button
                        type="submit"
                        disabled={!emailReplyConfigured}
                        className="inline-flex h-12 w-full items-center justify-center rounded-2xl bg-emerald-400 px-5 text-sm font-semibold text-black transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Send reply to {issue.team.name}
                      </button>

                      <p className="text-xs leading-5 text-white/45">
                        This queues a transactional email to the raising team’s contact and stores the reply against this fixture issue.
                      </p>
                    </form>
                  </div>
                </div>
              </AdminCard>
            );
          })}
        </div>
      )}
    </div>
  );
}
