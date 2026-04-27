// ========================================
// File: src/app/(admin)/admin/messaging/page.tsx
// ========================================

import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import {
  getAdminInboxSummary,
  getAdminInboxThreads,
  getMessageThreadById,
} from "@/lib/messaging/service";
import CommunicationsLeadLauncher from "@/components/admin/communications/CommunicationsLeadLauncher";
import CommunicationsLeagueLauncher from "@/components/admin/communications/CommunicationsLeagueLauncher";
import CommunicationsProspectLauncher from "@/components/admin/communications/CommunicationsProspectLauncher";
import CommunicationsTeamLauncher from "@/components/admin/communications/CommunicationsTeamLauncher";
import TeamCommunicationsComposer from "@/components/admin/communications/TeamCommunicationsComposer";
import AdminMessagesInbox from "@/components/admin/messages/AdminMessagesInbox";

function normaliseFilter(value?: string) {
  if (value === "unread" || value === "open" || value === "archived" || value === "all") {
    return value;
  }

  return "unread";
}

function getLatestInboundTitle(summary: Awaited<ReturnType<typeof getAdminInboxSummary>>) {
  const thread = summary.latestInbound?.thread;

  if (thread?.team?.teamMode === "MANAGED") {
    return (
      thread.contactName ||
      thread.recipient?.displayName ||
      thread.contactEmail ||
      thread.emailNormalized ||
      thread.contactPhone ||
      thread.phoneNormalized ||
      thread.team.name ||
      "No replies yet"
    );
  }

  return (
    thread?.team?.name ||
    thread?.recipient?.displayName ||
    thread?.contactName ||
    thread?.contactEmail ||
    thread?.contactPhone ||
    "No replies yet"
  );
}

function getComposeNotice(input: {
  saved?: string;
  channel?: string;
  count?: string;
  skipped?: string;
  error?: string;
}) {
  if (input.error?.trim()) {
    return {
      tone: "error" as const,
      message: decodeURIComponent(input.error),
    };
  }

  if (input.saved === "queued") {
    const channel = input.channel?.toUpperCase() === "SMS" ? "SMS" : "Email";
    const count = Number(input.count ?? "1");
    const skipped = Number(input.skipped ?? "0");

    return {
      tone: "success" as const,
      message: `${channel} queued to ${Number.isFinite(count) ? count : 1} recipient${count === 1 ? "" : "s"}${skipped > 0 ? ` · ${skipped} skipped because contact details were missing` : ""}.`,
    };
  }

  return null;
}

export default async function AdminMessagesPage({
  searchParams,
}: {
  searchParams?: Promise<{
    filter?: string;
    thread?: string;
    composeTeam?: string;
    saved?: string;
    channel?: string;
    count?: string;
    skipped?: string;
    error?: string;
  }>;
}) {
  await requireAdmin();

  const sp = (await searchParams) ?? {};
  const selectedFilter = normaliseFilter(sp.filter);
  const selectedThreadId = sp.thread?.trim() || "";
  const composeTeamId = sp.composeTeam?.trim() || "";
  const composeNotice = getComposeNotice({
    saved: sp.saved,
    channel: sp.channel,
    count: sp.count,
    skipped: sp.skipped,
    error: sp.error,
  });

  const [
    summary,
    threads,
    selectedThread,
    leagues,
    teams,
    prospects,
    composeTeam,
    emailTemplates,
    smsTemplates,
  ] = await Promise.all([
    getAdminInboxSummary(),
    getAdminInboxThreads({
      unreadOnly: selectedFilter === "unread",
      status:
        selectedFilter === "archived"
          ? "ARCHIVED"
          : selectedFilter === "open" || selectedFilter === "unread"
            ? "OPEN"
            : "ALL",
      limit: 100,
    }),
    selectedThreadId ? getMessageThreadById(selectedThreadId) : null,
    prisma.league.findMany({
      orderBy: [{ name: "asc" }],
      select: {
        id: true,
        name: true,
        slug: true,
        season: true,
      },
    }),
    prisma.team.findMany({
      orderBy: [{ name: "asc" }],
      select: {
        id: true,
        name: true,
        league: {
          select: {
            name: true,
            season: true,
          },
        },
      },
    }),
    prisma.teamPlayerProspect.findMany({
      orderBy: [{ createdAt: "desc" }],
      take: 300,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        teamId: true,
        team: {
          select: {
            name: true,
            league: {
              select: {
                name: true,
                season: true,
              },
            },
          },
        },
      },
    }),
    composeTeamId
      ? prisma.team.findUnique({
          where: { id: composeTeamId },
          select: {
            id: true,
            name: true,
            claimCode: true,
            joinSlug: true,
            contactName: true,
            contactEmail: true,
            contactPhone: true,
            league: {
              select: {
                id: true,
                name: true,
                season: true,
              },
            },
          },
        })
      : null,
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
  ]);

  const fallbackThread =
    selectedThread ??
    (threads.length > 0 ? await getMessageThreadById(threads[0].id) : null);

  const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  const claimLink = composeTeam?.claimCode
    ? `${baseUrl}/claim?code=${encodeURIComponent(composeTeam.claimCode)}`
    : `${baseUrl}/claim`;
  const teamJoinUrl = composeTeam?.joinSlug
    ? `${baseUrl}/teams/join/${composeTeam.joinSlug}`
    : `${baseUrl}/register-interest`;
  const fixedPaymentUrl = "https://buy.stripe.com/14A14n95tclzg2udgL7IY02";

  const resolvedEmailTemplates = emailTemplates.map((template) => {
    const ctaUrl =
      template.ctaUrlKey === "signupUrl"
        ? `${baseUrl}/register-interest`
        : template.ctaUrlKey === "manageTeamUrl"
          ? claimLink
          : template.ctaUrlKey === "captainDashboardUrl"
            ? claimLink
            : template.ctaUrlKey === "teamJoinUrl"
              ? teamJoinUrl
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

  return (
    <div className="w-full px-4 pb-10 pt-6 sm:px-6 lg:px-8">
      <div className="space-y-8">
        <section className="rounded-3xl border border-white/10 bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.14),transparent_32%),rgba(255,255,255,0.03)] p-6 shadow-[0_20px_80px_rgba(0,0,0,0.35)] md:p-8">
          <div className="flex flex-col gap-6 2xl:flex-row 2xl:items-end 2xl:justify-between">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-300">
                Communications
              </div>

              <div>
                <h1 className="text-3xl font-semibold tracking-tight text-white md:text-4xl">
                  Messages and replies
                </h1>

                <p className="mt-3 max-w-3xl text-sm leading-6 text-white/60 md:text-base">
                  View inbound SMS and email replies, track unread conversations,
                  and use Communications as the central launch point for teams,
                  prospects, leads, and whole-league outreach.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                href="/admin/templates"
                className="inline-flex h-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm font-semibold text-white transition hover:bg-white/[0.08]"
              >
                Templates
              </Link>

              <Link
                href="/admin/teams"
                className="inline-flex h-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm font-semibold text-white transition hover:bg-white/[0.08]"
              >
                Team contacts
              </Link>

              <Link
                href="/admin/leads"
                className="inline-flex h-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm font-semibold text-white transition hover:bg-white/[0.08]"
              >
                Leads console
              </Link>
            </div>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/40">
                Unread threads
              </div>
              <div className="mt-2 text-3xl font-semibold text-white">
                {summary.unreadThreads}
              </div>
              <div className="mt-2 text-sm text-white/55">
                Conversations with replies still needing review.
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/40">
                Open threads
              </div>
              <div className="mt-2 text-3xl font-semibold text-white">
                {summary.openThreads}
              </div>
              <div className="mt-2 text-sm text-white/55">
                Active team conversations across SMS and email.
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/40">
                Unread messages
              </div>
              <div className="mt-2 text-3xl font-semibold text-white">
                {summary.unreadMessages}
              </div>
              <div className="mt-2 text-sm text-white/55">
                Individual inbound replies not yet marked as read.
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/40">
                Latest inbound
              </div>
              <div className="mt-2 text-base font-semibold text-white">
                {getLatestInboundTitle(summary)}
              </div>
              <div className="mt-2 text-sm text-white/55">
                {summary.latestInbound?.body
                  ? summary.latestInbound.body.length > 90
                    ? `${summary.latestInbound.body.slice(0, 87)}...`
                    : summary.latestInbound.body
                  : "Once replies start arriving, the newest one shows here."}
              </div>
            </div>
          </div>
        </section>

        {composeNotice ? (
          <section
            className={`rounded-2xl border p-4 text-sm ${
              composeNotice.tone === "error"
                ? "border-red-400/20 bg-red-500/10 text-red-100"
                : "border-emerald-400/20 bg-emerald-500/10 text-emerald-100"
            }`}
          >
            {composeNotice.message}
          </section>
        ) : null}

        {composeTeam ? (
          <section className="rounded-3xl border border-emerald-400/15 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.12),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.03))] p-6 shadow-[0_20px_60px_rgba(0,0,0,0.3)]">
            <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-300/80">
                  New outbound message
                </div>
                <h2 className="mt-2 text-2xl font-semibold text-white">
                  Contact {composeTeam.name}
                </h2>
                <p className="mt-2 text-sm text-white/60">
                  You are composing a new message for this team from the inbox.
                </p>
              </div>

              <div className="flex flex-wrap gap-2 text-xs text-white/60">
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
                  Email: {composeTeam.contactEmail || "—"}
                </span>
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
                  SMS: {composeTeam.contactPhone || "—"}
                </span>
                {composeTeam.league ? (
                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
                    {composeTeam.league.name}{composeTeam.league.season ? ` · ${composeTeam.league.season}` : ""}
                  </span>
                ) : null}
              </div>
            </div>

            <TeamCommunicationsComposer
              teamId={composeTeam.id}
              fromPath={`/admin/messaging?composeTeam=${composeTeam.id}`}
              toEmail={composeTeam.contactEmail ?? null}
              toPhone={composeTeam.contactPhone ?? null}
              contactName={composeTeam.contactName ?? null}
              teamName={composeTeam.name}
              leagueName={composeTeam.league ? `${composeTeam.league.name}${composeTeam.league.season ? ` — ${composeTeam.league.season}` : ""}` : null}
              claimCode={composeTeam.claimCode}
              claimLink={claimLink}
              captainDashboardUrl={claimLink}
              emailTemplates={resolvedEmailTemplates}
              smsTemplates={smsTemplates}
            />
          </section>
        ) : null}

        <div className="grid gap-6 xl:grid-cols-2 3xl:grid-cols-4">
          <CommunicationsTeamLauncher
            teams={teams.map((team) => ({
              id: team.id,
              name: team.name,
              leagueLabel: team.league
                ? `${team.league.name}${team.league.season ? ` · ${team.league.season}` : ""}`
                : null,
            }))}
          />

          <CommunicationsProspectLauncher
            prospects={prospects.map((prospect) => ({
              id: prospect.id,
              teamId: prospect.teamId,
              label: `${prospect.firstName}${prospect.lastName ? ` ${prospect.lastName}` : ""} · ${prospect.team.name}${prospect.team.league?.name ? ` · ${prospect.team.league.name}${prospect.team.league.season ? ` — ${prospect.team.league.season}` : ""}` : ""}`,
            }))}
          />

          <CommunicationsLeagueLauncher
            leagues={leagues.map((league) => ({
              id: league.id,
              label: `${league.name}${league.season ? ` · ${league.season}` : ""}`,
            }))}
          />

          <CommunicationsLeadLauncher />
        </div>

        <AdminMessagesInbox
          threads={threads.map((thread) => ({
            id: thread.id,
            channel: thread.channel ?? "SMS",
            status: thread.status,
            contactName: thread.contactName,
            contactPhone: thread.contactPhone,
            phoneNormalized: thread.phoneNormalized,
            contactEmail: thread.contactEmail ?? null,
            emailNormalized: thread.emailNormalized ?? null,
            replyAddress: thread.replyAddress ?? null,
            lastMessagePreview: thread.lastMessagePreview,
            unreadForAdminCount: thread.unreadForAdminCount,
            latestMessageAt: thread.latestMessageAt?.toISOString() ?? null,
            latestInboundAt: thread.latestInboundAt?.toISOString() ?? null,
            latestOutboundAt: thread.latestOutboundAt?.toISOString() ?? null,
            team: thread.team
              ? {
                  id: thread.team.id,
                  name: thread.team.name,
                  logoUrl: thread.team.logoUrl,
                  teamMode: thread.team.teamMode,
                }
              : null,
            league: thread.league
              ? {
                  id: thread.league.id,
                  name: thread.league.name,
                  season: thread.league.season,
                  slug: thread.league.slug,
                }
              : null,
            latestMessage:
              thread.messages[0]
                ? {
                    id: thread.messages[0].id,
                    direction: thread.messages[0].direction,
                    body: thread.messages[0].body,
                    createdAt: thread.messages[0].createdAt.toISOString(),
                  }
                : null,
          }))}
          selectedFilter={selectedFilter}
          selectedThreadId={fallbackThread?.id ?? null}
          selectedThread={
            fallbackThread
              ? {
                  id: fallbackThread.id,
                  channel: fallbackThread.channel ?? "SMS",
                  status: fallbackThread.status,
                  contactName: fallbackThread.contactName,
                  contactPhone: fallbackThread.contactPhone,
                  phoneNormalized: fallbackThread.phoneNormalized,
                  contactEmail: fallbackThread.contactEmail ?? null,
                  emailNormalized: fallbackThread.emailNormalized ?? null,
                  replyAddress: fallbackThread.replyAddress ?? null,
                  unreadForAdminCount: fallbackThread.unreadForAdminCount,
                  latestMessageAt: fallbackThread.latestMessageAt?.toISOString() ?? null,
                  latestInboundAt: fallbackThread.latestInboundAt?.toISOString() ?? null,
                  latestOutboundAt:
                    fallbackThread.latestOutboundAt?.toISOString() ?? null,
                  team: fallbackThread.team
                    ? {
                        id: fallbackThread.team.id,
                        name: fallbackThread.team.name,
                        logoUrl: fallbackThread.team.logoUrl,
                        teamMode: fallbackThread.team.teamMode,
                      }
                    : null,
                  league: fallbackThread.league
                    ? {
                        id: fallbackThread.league.id,
                        name: fallbackThread.league.name,
                        season: fallbackThread.league.season,
                        slug: fallbackThread.league.slug,
                      }
                    : null,
                  recipient: fallbackThread.recipient
                    ? {
                        id: fallbackThread.recipient.id,
                        displayName: fallbackThread.recipient.displayName,
                        phone: fallbackThread.recipient.phone,
                        email: fallbackThread.recipient.email,
                        audience: fallbackThread.recipient.audience,
                        sourceType: fallbackThread.recipient.sourceType,
                      }
                    : null,
                  messages: fallbackThread.messages.map((message) => ({
                    id: message.id,
                    channel: message.channel ?? "SMS",
                    direction: message.direction,
                    participantRole: message.participantRole,
                    body: message.body,
                    htmlBody: message.htmlBody ?? null,
                    subject: message.subject ?? null,
                    fromNumber: message.fromNumber,
                    toNumber: message.toNumber,
                    fromEmail: message.fromEmail,
                    toEmail: message.toEmail,
                    providerStatus: message.providerStatus,
                    sentAt: message.sentAt?.toISOString() ?? null,
                    receivedAt: message.receivedAt?.toISOString() ?? null,
                    readAt: message.readAt?.toISOString() ?? null,
                    createdAt: message.createdAt.toISOString(),
                  })),
                }
              : null
          }
          leagues={leagues}
        />
      </div>
    </div>
  );
}
