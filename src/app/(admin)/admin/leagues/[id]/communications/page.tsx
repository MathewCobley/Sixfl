// ========================================
// File: src/app/(admin)/admin/leagues/[id]/communications/page.tsx
// ========================================

import EmailHtmlPreview from "@/components/admin/email/EmailHtmlPreview";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  FixtureStatus,
  NotificationChannel,
  NotificationDispatchStatus,
  Prisma,
} from "@prisma/client";

import LeagueCommunicationsComposer from "@/components/admin/communications/LeagueCommunicationsComposer";
import { formatDateTimeInLondon } from "@/lib/datetime/london";
import { getLeagueSeasonTeams } from "@/lib/league-season-teams";
import { getTeamContactSnapshot } from "@/lib/notifications/team-contacts";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "League Communications | SIXFL",
};

type SearchParams = {
  saved?: string;
  channel?: string;
  error?: string;
  warning?: string;
  count?: string;
  skipped?: string;
  failed?: string;
};

type FixtureLineInput = {
  kickoffAt: Date;
  pitch: string | null;
  homeTeam: { name: string };
  awayTeam: { name: string };
  venue: { name: string } | null;
};

type PollRow = {
  id: string;
  title: string;
  question: string;
  status: string;
  optionId: string;
  optionLabel: string;
  optionSortOrder: number;
};

function getChannelLabel(value?: string) {
  return value === "sms" ? "SMS" : "email";
}

function formatUkDateTime(value: Date) {
  return formatDateTimeInLondon(value, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getDispatchStatusLabel(status: NotificationDispatchStatus) {
  switch (status) {
    case NotificationDispatchStatus.FAILED:
      return "Failed";
    case NotificationDispatchStatus.SKIPPED:
      return "Skipped";
    case NotificationDispatchStatus.CANCELLED:
      return "Cancelled";
    default:
      return status;
  }
}

function getUpcomingFixtureWindow() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(end.getDate() + 8);

  return { start, end };
}

function formatFixtureLine(fixture: FixtureLineInput) {
  const kickoff = formatDateTimeInLondon(fixture.kickoffAt, {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  const pitch = fixture.pitch?.trim() ? ` · ${fixture.pitch.trim()}` : "";
  const venue = fixture.venue?.name?.trim() ? ` · ${fixture.venue.name.trim()}` : "";

  return `${kickoff} – ${fixture.homeTeam.name} v ${fixture.awayTeam.name}${pitch}${venue}`;
}

async function getPollOptionsForComposer() {
  const rows = await prisma.$queryRaw<PollRow[]>(Prisma.sql`
    SELECT
      poll."id",
      poll."title",
      poll."question",
      poll."status",
      option."id" AS "optionId",
      option."label" AS "optionLabel",
      option."sortOrder" AS "optionSortOrder"
    FROM "SIXFLPoll" poll
    INNER JOIN "SIXFLPollOption" option ON option."pollId" = poll."id"
    WHERE poll."status" IN ('ACTIVE', 'DRAFT')
    ORDER BY poll."createdAt" DESC, option."sortOrder" ASC, option."label" ASC
  `);

  const pollMap = new Map<
    string,
    {
      id: string;
      title: string;
      question: string;
      status: string;
      options: Array<{ id: string; label: string }>;
    }
  >();

  for (const row of rows) {
    const existing = pollMap.get(row.id);

    if (existing) {
      existing.options.push({ id: row.optionId, label: row.optionLabel });
      continue;
    }

    pollMap.set(row.id, {
      id: row.id,
      title: row.title,
      question: row.question,
      status: row.status,
      options: [{ id: row.optionId, label: row.optionLabel }],
    });
  }

  return Array.from(pollMap.values());
}

export default async function AdminLeagueCommunicationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  await requireAdmin();

  const { id } = await params;
  const filters = await searchParams;

  const league = await prisma.league.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      season: true,
    },
  });

  if (!league) {
    notFound();
  }

  const seasonTeams = await getLeagueSeasonTeams({
    leagueId: league.id,
    activeOnly: true,
  });

  const teamSnapshots = await Promise.all(
    seasonTeams.map((team) => getTeamContactSnapshot(team.teamId)),
  );

  const snapshotMap = new Map<string, NonNullable<(typeof teamSnapshots)[number]>>();
  for (const snapshot of teamSnapshots) {
    if (snapshot) {
      snapshotMap.set(snapshot.teamId, snapshot);
    }
  }

  const leagueTeamIds = seasonTeams.map((team) => team.teamId);
  const recentDeliveryCutoff = new Date(Date.now() - 1000 * 60 * 60 * 24);
  const fixtureWindow = getUpcomingFixtureWindow();

  const [
    emailTemplates,
    smsTemplates,
    upcomingFixtures,
    teamThreads,
    recentEmailProblemDispatches,
    polls,
  ] = await Promise.all([
    prisma.emailTemplate.findMany({
      where: {
        isActive: true,
        audience: {
          in: ["TEAM", "GENERAL"],
        },
      },
      orderBy: [{ name: "asc" }],
      select: {
        id: true,
        key: true,
        name: true,
        subject: true,
        body: true,
        description: true,
        ctaLabel: true,
        ctaUrlKey: true,
      },
    }),
    prisma.notificationTemplate.findMany({
      where: {
        isActive: true,
        channel: "SMS",
        audience: {
          in: ["TEAM", "GENERAL"],
        },
      },
      orderBy: [{ name: "asc" }],
      select: {
        id: true,
        key: true,
        name: true,
        body: true,
        description: true,
      },
    }),
    prisma.fixture.findMany({
      where: {
        leagueId: league.id,
        status: FixtureStatus.SCHEDULED,
        kickoffAt: {
          gte: fixtureWindow.start,
          lt: fixtureWindow.end,
        },
      },
      orderBy: [{ kickoffAt: "asc" }, { position: "asc" }],
      select: {
        kickoffAt: true,
        pitch: true,
        homeTeam: {
          select: { name: true },
        },
        awayTeam: {
          select: { name: true },
        },
        venue: {
          select: { name: true },
        },
      },
    }),
    prisma.messageThread.findMany({
      where: {
        leagueId: league.id,
        sourceType: "TEAM",
      },
      include: {
        team: {
          select: {
            id: true,
            name: true,
          },
        },
        messages: {
          orderBy: [{ createdAt: "desc" }],
          take: 3,
        },
      },
      orderBy: [{ latestMessageAt: "desc" }, { updatedAt: "desc" }],
      take: 40,
    }),
    leagueTeamIds.length
      ? prisma.notificationDispatch.findMany({
          where: {
            channel: NotificationChannel.EMAIL,
            sourceType: "TEAM",
            sourceId: {
              in: leagueTeamIds,
            },
            status: {
              in: [
                NotificationDispatchStatus.FAILED,
                NotificationDispatchStatus.SKIPPED,
                NotificationDispatchStatus.CANCELLED,
              ],
            },
            createdAt: {
              gte: recentDeliveryCutoff,
            },
          },
          include: {
            recipient: {
              select: {
                displayName: true,
                email: true,
              },
            },
          },
          orderBy: [{ createdAt: "desc" }],
          take: 12,
        })
      : [],
    getPollOptionsForComposer(),
  ]);

  const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  const fixedPaymentUrl = "https://buy.stripe.com/14A14n95tclzg2udgL7IY02";
  const fixtureLines = upcomingFixtures.map(formatFixtureLine);

  const resolvedEmailTemplates = emailTemplates.map((template) => {
    const ctaUrl =
      template.ctaUrlKey === "signupUrl"
        ? `${baseUrl}/register-interest`
        : template.ctaUrlKey === "paymentUrl"
          ? fixedPaymentUrl
          : null;

    return {
      id: template.id,
      key: template.key,
      name: template.name,
      subject: template.subject,
      body: template.body,
      description: template.description,
      ctaLabel: template.ctaLabel,
      ctaUrl,
    };
  });

  const queuedCount = filters.count || "0";
  const skippedCount = filters.skipped || "0";
  const failedCount = filters.failed || "0";
  const successMessage =
    filters.saved === "queued"
      ? `${getChannelLabel(filters.channel)} queued to ${queuedCount} team${queuedCount === "1" ? "" : "s"}. Skipped: ${skippedCount}. Failed: ${failedCount}.`
      : null;
  const errorMessage = filters.error ? decodeURIComponent(filters.error) : null;
  const warningMessage = filters.warning ? decodeURIComponent(filters.warning) : null;

  const messages = teamThreads
    .flatMap((thread) => thread.messages.map((message) => ({ thread, message })))
    .sort((a, b) => b.message.createdAt.getTime() - a.message.createdAt.getTime());

  const emailReadyCount = seasonTeams.filter((team) => {
    const snapshot = snapshotMap.get(team.teamId);
    return Boolean(snapshot?.primaryContact.email?.trim());
  }).length;
  const smsReadyCount = seasonTeams.filter((team) => {
    const snapshot = snapshotMap.get(team.teamId);
    return Boolean(snapshot?.primaryContact.phone?.trim());
  }).length;

  const teamNameById = new Map(seasonTeams.map((team) => [team.teamId, team.teamName]));

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <Link
            href={`/admin/leagues/${league.id}`}
            className="text-sm text-emerald-300 hover:text-emerald-200"
          >
            ← Back to league
          </Link>
          <h1 className="text-3xl font-semibold text-white">
            {league.name}
            {league.season ? ` · ${league.season}` : ""} communications
          </h1>
          <p className="text-sm text-white/60">
            Queue a broadcast to all teams entered in this season and keep the resulting history inside each team thread.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link
            href={`/admin/leagues/${league.id}`}
            className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-white/10"
          >
            League overview
          </Link>
          <Link
            href="/admin/messaging"
            className="inline-flex items-center justify-center rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-2.5 text-sm font-medium text-emerald-100 transition hover:bg-emerald-500/15"
          >
            Communications hub
          </Link>
        </div>
      </div>

      {successMessage ? (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-100">{successMessage}</div>
      ) : null}

      {warningMessage ? (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">{warningMessage}</div>
      ) : null}

      {errorMessage ? (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-100">{errorMessage}</div>
      ) : null}

      {recentEmailProblemDispatches.length > 0 ? (
        <section className="rounded-3xl border border-red-500/25 bg-red-500/10 p-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-red-200/80">Recent email delivery issues</p>
              <h2 className="mt-2 text-xl font-semibold text-white">
                {recentEmailProblemDispatches.length} email issue{recentEmailProblemDispatches.length === 1 ? "" : "s"} in the last 24 hours
              </h2>
              <p className="mt-1 text-sm text-red-100/75">
                These teams either failed, were skipped, or were cancelled after a league/team email was queued.
              </p>
            </div>
          </div>

          <div className="mt-4 divide-y divide-red-200/10 rounded-2xl border border-red-200/10 bg-black/20">
            {recentEmailProblemDispatches.map((dispatch) => (
              <div key={dispatch.id} className="grid gap-3 px-4 py-3 text-sm md:grid-cols-[1fr_0.7fr_1.4fr] md:items-center">
                <div>
                  <div className="font-semibold text-white">
                    {dispatch.sourceId ? teamNameById.get(dispatch.sourceId) ?? dispatch.recipient.displayName ?? "Team" : dispatch.recipient.displayName ?? "Team"}
                  </div>
                  <div className="mt-1 break-all text-xs text-white/50">{dispatch.recipient.email || "No email stored"}</div>
                </div>
                <div>
                  <span className="inline-flex rounded-full border border-red-200/20 bg-red-500/15 px-2.5 py-1 text-xs font-semibold text-red-100">
                    {getDispatchStatusLabel(dispatch.status)}
                  </span>
                  <div className="mt-1 text-xs text-white/45">{formatUkDateTime(dispatch.createdAt)}</div>
                </div>
                <div className="text-xs leading-5 text-red-100/80">
                  {dispatch.failureReason || "No failure reason was recorded."}
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="overflow-hidden rounded-3xl border border-emerald-400/15 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.16),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.03))] shadow-[0_24px_80px_rgba(0,0,0,0.3)]">
        <div className="grid gap-8 px-6 py-6 lg:grid-cols-[1.05fr_0.95fr] lg:px-8 lg:py-8">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-300/80">League broadcast</p>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight text-white sm:text-3xl">Whole-season outreach</h2>
            <p className="mt-3 max-w-2xl text-sm text-white/70 sm:text-base">
              Uses the teams entered into this season, not the team’s permanent/default league field.
            </p>

            <div className="mt-5 flex flex-wrap gap-2">
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white/75">Season teams: {seasonTeams.length}</span>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white/75">Email ready: {emailReadyCount}</span>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white/75">SMS ready: {smsReadyCount}</span>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white/75">Fixtures loaded: {fixtureLines.length}</span>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/55">Teams</p>
              <p className="mt-3 text-3xl font-semibold text-white">{seasonTeams.length}</p>
            </div>
            <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/55">Threads</p>
              <p className="mt-3 text-3xl font-semibold text-white">{teamThreads.length}</p>
            </div>
            <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/55">Recent messages</p>
              <p className="mt-3 text-3xl font-semibold text-white">{messages.length}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="grid min-w-0 items-start gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] [&>*]:min-w-0">
        <LeagueCommunicationsComposer
          leagueId={league.id}
          fromPath={`/admin/leagues/${league.id}/communications`}
          leagueName={`${league.name}${league.season ? ` — ${league.season}` : ""}`}
          teamCount={seasonTeams.length}
          teams={seasonTeams.map((team) => {
            const snapshot = snapshotMap.get(team.teamId);
            return {
              id: team.teamId,
              name: team.teamName,
              emailReady: Boolean(snapshot?.primaryContact.email?.trim()),
              smsReady: Boolean(snapshot?.primaryContact.phone?.trim()),
            };
          })}
          fixtureLines={fixtureLines}
          emailTemplates={resolvedEmailTemplates}
          smsTemplates={smsTemplates}
          polls={polls}
        />

        <div className="rounded-3xl border border-white/10 bg-white/5">
          <div className="flex items-center justify-between border-b border-white/10 px-6 py-5">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">RECENT THREAD HISTORY</p>
              <h2 className="mt-2 text-xl font-semibold text-white">Latest team messages</h2>
            </div>
          </div>

          <div className="divide-y divide-white/10">
            {messages.length === 0 ? (
              <div className="px-6 py-10 text-sm text-white/55">No messages have been logged for teams in this league yet.</div>
            ) : (
              messages.map(({ thread, message }) => (
                <div key={message.id} className="space-y-3 px-6 py-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-white/70">{message.channel}</span>
                    <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-white/70">{thread.team?.name || thread.contactName || "Team"}</span>
                    <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-white/55">{message.providerStatus || "RECORDED"}</span>
                  </div>

                  <div className="text-sm font-semibold text-white">{message.subject || `${message.channel} message`}</div>

                  {message.channel === "EMAIL" && message.htmlBody ? (
                    <div className="overflow-hidden rounded-2xl border border-white/10 bg-white">
                      <EmailHtmlPreview html={message.htmlBody} />
                    </div>
                  ) : (
                    <div className="whitespace-pre-wrap rounded-2xl border border-white/10 bg-black/30 p-4 text-sm leading-6 text-white/80">{message.textBody || message.body}</div>
                  )}

                  <div className="text-xs text-white/45">{formatUkDateTime(message.createdAt)}</div>
                </div>
              ))
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
