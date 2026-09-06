// ========================================
// File: src/app/(admin)/admin/teams/[id]/players/[membershipId]/communications/page.tsx
// ========================================

import EmailHtmlPreview from "@/components/admin/email/EmailHtmlPreview";
import Link from "next/link";
import { notFound } from "next/navigation";
import { NotificationChannel, NotificationDispatchStatus } from "@prisma/client";

import { cancelQueuedSmsMessageAction } from "@/app/(admin)/admin/messages/actions";
import CommunicationStatusBadge, {
  CommunicationStatusExplanation,
} from "@/components/admin/communications/CommunicationStatusBadge";
import TeamCommunicationsComposer from "@/components/admin/communications/TeamCommunicationsComposer";
import LinkedRoleLinks from "@/components/admin/people/LinkedRoleLinks";
import { formatDateTimeInLondon } from "@/lib/datetime/london";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import { getTeamMemberProfilesByTeamMemberIds } from "@/lib/teamMemberProfiles";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "Player Communications | SIXFL",
};

type SearchParams = {
  saved?: string;
  channel?: string;
  count?: string;
  skipped?: string;
  error?: string;
};

type TimelineItem = {
  id: string;
  channel: NotificationChannel;
  direction: "INBOUND" | "OUTBOUND";
  statusLabel: string;
  sourceLabel: string;
  templateName: string | null;
  templateKey: string | null;
  subject: string;
  bodyText: string;
  bodyHtml: string | null;
  contactName: string;
  contactValue: string | null;
  occurredAt: Date;
  failureReason: string | null;
  messageEntryId: string | null;
  threadId: string | null;
  canCancelQueuedSms: boolean;
};

const PLAYER_MATCH_FEE_SOURCE_TYPES = [
  "PLAYER_MATCH_FEE_REQUEST",
  "PLAYER_MATCH_FEE_CHASE_24H",
  "PLAYER_MATCH_FEE_CHASE_72H",
];

const MANAGED_AVAILABILITY_SOURCE_TYPES = [
  "MANAGED_SQUAD_AVAILABILITY_REQUEST",
  "MANAGED_SQUAD_AVAILABILITY_CHASE_24H",
  "MANAGED_SQUAD_AVAILABILITY_CHASE_72H",
];

function getChannelLabel(value?: string) {
  return value === "sms" ? "SMS" : "email";
}

function getQueuedCount(value?: string) {
  const count = Number(value ?? "1");
  return Number.isFinite(count) && count > 0 ? count : 1;
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

function formatDispatchStatus(status: NotificationDispatchStatus) {
  switch (status) {
    case "QUEUED":
      return "QUEUED";
    case "PROCESSING":
      return "PROCESSING";
    case "SENT":
      return "SENT";
    case "FAILED":
      return "FAILED";
    case "CANCELLED":
      return "CANCELLED";
    case "SKIPPED":
      return "SKIPPED";
    default:
      return status;
  }
}

function getRoleLabel(role: string) {
  switch (role) {
    case "CAPTAIN":
      return "Captain";
    case "MANAGER":
      return "Manager";
    case "VICE_CAPTAIN":
      return "Vice captain";
    case "BACKUP_PLAYER":
      return "Backup player";
    case "COACH":
      return "Coach";
    default:
      return "Player";
  }
}

function getMetadataRecord(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  return metadata as Record<string, unknown>;
}

function getOriginLabel(metadata: unknown) {
  const value = getMetadataRecord(metadata)?.originLabel;
  return typeof value === "string" && value.trim() ? value.trim() : "Notification dispatch";
}

function getSourceLabel(input: { metadata: unknown; sourceType?: string | null }) {
  const originLabel = getOriginLabel(input.metadata);

  if (originLabel !== "Notification dispatch") return originLabel;

  if (input.sourceType && PLAYER_MATCH_FEE_SOURCE_TYPES.includes(input.sourceType)) {
    return "Player match fee automation";
  }

  if (input.sourceType && MANAGED_AVAILABILITY_SOURCE_TYPES.includes(input.sourceType)) {
    return "Managed squad availability automation";
  }

  if (input.sourceType === "LEAD") return "Original lead history";
  if (input.sourceType === "TEAM_MEMBER") return "Player communications hub";
  if (input.sourceType === "TEAM_PLAYER_PROSPECT") return "Prospect communications hub";

  return originLabel;
}

function extractSourceLeadIds(...values: Array<string | null | undefined>) {
  const leadIds = new Set<string>();

  for (const value of values) {
    if (!value) continue;

    for (const match of value.matchAll(/Source lead ID:\s*([a-zA-Z0-9_-]+)/gi)) {
      const leadId = match[1]?.trim();
      if (leadId) leadIds.add(leadId);
    }
  }

  return Array.from(leadIds);
}

export default async function AdminPlayerCommunicationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; membershipId: string }>;
  searchParams: Promise<SearchParams>;
}) {
  await requireAdmin();

  const { id, membershipId } = await params;
  const filters = await searchParams;

  const member = await prisma.teamMember.findFirst({
    where: { id: membershipId, teamId: id },
    select: {
      id: true,
      role: true,
      createdAt: true,
      user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      team: {
        select: {
          id: true,
          name: true,
          joinSlug: true,
          claimCode: true,
          contactEmail: true,
          contactPhone: true,
          league: {
            select: {
              name: true,
              season: true,
            },
          },
        },
      },
    },
  });

  if (!member) notFound();

  const profiles = await getTeamMemberProfilesByTeamMemberIds([member.id]);
  const profile = profiles.get(member.id) ?? null;
  const sourceProspectId = profile?.sourceProspectId?.trim() || null;
  const linkedProspect = sourceProspectId
    ? await prisma.teamPlayerProspect.findUnique({
        where: { id: sourceProspectId },
        select: { notes: true },
      })
    : null;
  const sourceLeadIds = extractSourceLeadIds(profile?.notes, linkedProspect?.notes);
  const playerName = member.user.name?.trim() || member.user.email?.trim() || "Player";
  const leagueName = member.team.league
    ? `${member.team.league.name}${member.team.league.season ? ` — ${member.team.league.season}` : ""}`
    : null;

  const playerMatchFees = sourceProspectId
    ? await prisma.playerMatchFee.findMany({
        where: { prospectId: sourceProspectId },
        select: { id: true },
      })
    : [];
  const playerMatchFeeIds = playerMatchFees.map((fee) => fee.id);

  const communicationSourceFilters = [
    { sourceType: "TEAM_MEMBER", sourceId: member.id },
    {
      sourceType: { in: MANAGED_AVAILABILITY_SOURCE_TYPES },
      sourceId: { endsWith: `:${member.id}` },
    },
    ...(sourceProspectId
      ? [
          {
            sourceType: "TEAM_PLAYER_PROSPECT",
            sourceId: sourceProspectId,
          },
        ]
      : []),
    ...(sourceLeadIds.length > 0
      ? [
          {
            sourceType: "LEAD",
            sourceId: { in: sourceLeadIds },
          },
        ]
      : []),
    ...(playerMatchFeeIds.length > 0
      ? [
          {
            sourceType: { in: PLAYER_MATCH_FEE_SOURCE_TYPES },
            sourceId: { in: playerMatchFeeIds },
          },
        ]
      : []),
  ];

  const [threads, dispatches, leadEmails, emailTemplates, smsTemplates] = await Promise.all([
    prisma.messageThread.findMany({
      where: { OR: communicationSourceFilters },
      include: {
        messages: {
          orderBy: [{ createdAt: "desc" }],
          take: 100,
          include: {
            dispatch: {
              select: {
                id: true,
                metadata: true,
                sourceType: true,
                template: {
                  select: {
                    id: true,
                    key: true,
                    name: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: [{ latestMessageAt: "desc" }, { updatedAt: "desc" }],
    }),
    prisma.notificationDispatch.findMany({
      where: { OR: communicationSourceFilters },
      include: {
        recipient: true,
        template: {
          select: {
            id: true,
            key: true,
            name: true,
          },
        },
      },
      orderBy: [{ createdAt: "desc" }],
      take: 100,
    }),
    prisma.interestLeadEmail.findMany({
      where: {
        interestLeadId: { in: sourceLeadIds },
      },
      include: {
        interestLead: {
          select: {
            contactName: true,
            email: true,
          },
        },
      },
      orderBy: [{ sentAt: "desc" }],
      take: 100,
    }),
    prisma.emailTemplate.findMany({
      where: {
        isActive: true,
        audience: { in: ["PLAYER", "GENERAL"] },
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
        audience: { in: ["PLAYER", "GENERAL"] },
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

  const messageTimelineItems: TimelineItem[] = threads.flatMap((thread) =>
    thread.messages.map((message) => {
      const statusLabel = message.providerStatus || "RECORDED";
      const canCancelQueuedSms = Boolean(
        message.notificationDispatchId &&
          message.channel === NotificationChannel.SMS &&
          message.direction === "OUTBOUND" &&
          statusLabel.trim().toUpperCase().startsWith("QUEUED"),
      );

      return {
        id: `message-${message.id}`,
        channel: message.channel,
        direction: message.direction,
        statusLabel,
        sourceLabel: message.dispatch
          ? getSourceLabel({
              metadata: message.dispatch.metadata,
              sourceType: message.dispatch.sourceType,
            })
          : "Inbox thread",
        templateName: message.dispatch?.template?.name ?? null,
        templateKey: message.dispatch?.template?.key ?? null,
        subject: message.subject || `${message.channel} message`,
        bodyText: message.textBody || message.body || "",
        bodyHtml: message.channel === NotificationChannel.EMAIL ? message.htmlBody || null : null,
        contactName: thread.contactName || playerName,
        contactValue: message.toEmail || message.toNumber || message.fromEmail || message.fromNumber || null,
        occurredAt: message.receivedAt ?? message.sentAt ?? message.createdAt,
        failureReason: null,
        messageEntryId: message.id,
        threadId: thread.id,
        canCancelQueuedSms,
      };
    }),
  );

  const loggedDispatchIds = new Set(
    threads
      .flatMap((thread) => thread.messages)
      .map((message) => message.notificationDispatchId)
      .filter((dispatchId): dispatchId is string => Boolean(dispatchId)),
  );

  const unloggedDispatchTimelineItems: TimelineItem[] = dispatches
    .filter((dispatch) => !loggedDispatchIds.has(dispatch.id))
    .map((dispatch) => ({
      id: `dispatch-${dispatch.id}`,
      channel: dispatch.channel,
      direction: "OUTBOUND" as const,
      statusLabel: formatDispatchStatus(dispatch.status),
      sourceLabel: getSourceLabel({
        metadata: dispatch.metadata,
        sourceType: dispatch.sourceType,
      }),
      templateName: dispatch.template?.name ?? null,
      templateKey: dispatch.template?.key ?? null,
      subject:
        dispatch.subject?.trim() ||
        (dispatch.channel === NotificationChannel.SMS ? "SMS message" : "Email"),
      bodyText: dispatch.bodyText,
      bodyHtml: dispatch.channel === NotificationChannel.EMAIL ? dispatch.bodyHtml ?? null : null,
      contactName: dispatch.recipient.displayName || playerName,
      contactValue:
        dispatch.channel === NotificationChannel.SMS
          ? dispatch.recipient.phone || null
          : dispatch.recipient.email || null,
      occurredAt: dispatch.sentAt ?? dispatch.scheduledFor ?? dispatch.createdAt,
      failureReason: dispatch.failureReason,
      messageEntryId: null,
      threadId: null,
      canCancelQueuedSms: false,
    }));

  const leadEmailTimelineItems: TimelineItem[] = leadEmails.map((email) => ({
    id: `lead-email-${email.id}`,
    channel: NotificationChannel.EMAIL,
    direction: "OUTBOUND" as const,
    statusLabel: "SENT",
    sourceLabel: "Original lead email history",
    templateName: null,
    templateKey: null,
    subject: email.subject,
    bodyText: email.body,
    bodyHtml: null,
    contactName: email.interestLead.contactName || playerName,
    contactValue: email.sentTo || email.interestLead.email || null,
    occurredAt: email.sentAt,
    failureReason: null,
    messageEntryId: null,
    threadId: null,
    canCancelQueuedSms: false,
  }));

  const timeline = [
    ...messageTimelineItems,
    ...unloggedDispatchTimelineItems,
    ...leadEmailTimelineItems,
  ].sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());

  const queuedCount = getQueuedCount(filters.count);
  const skippedCount = Number(filters.skipped ?? "0");
  const successMessage =
    filters.saved === "queued"
      ? `${getChannelLabel(filters.channel)} queued to ${queuedCount} recipient${queuedCount === 1 ? "" : "s"}${Number.isFinite(skippedCount) && skippedCount > 0 ? ` · ${skippedCount} skipped because contact details were missing` : ""}.`
      : null;
  const errorMessage = filters.error ? decodeURIComponent(filters.error) : null;

  const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  const joinUrl = member.team.joinSlug
    ? `${baseUrl}/teams/join/${member.team.joinSlug}`
    : `${baseUrl}/register-interest`;
  const claimLink = member.team.claimCode
    ? `${baseUrl}/claim?code=${encodeURIComponent(member.team.claimCode)}`
    : `${baseUrl}/claim`;
  const fixedPaymentUrl = "https://buy.stripe.com/14A14n95tclzg2udgL7IY02";

  const resolvedEmailTemplates = emailTemplates.map((template) => {
    const ctaUrl =
      template.ctaUrlKey === "signupUrl"
        ? `${baseUrl}/register-interest`
        : template.ctaUrlKey === "teamJoinUrl"
          ? joinUrl
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

  const selectedPlayerRecipientValue = `teamMember:${member.id}`;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <Link href={`/captain/team/${member.team.id}/squad`} className="text-sm text-emerald-300 hover:text-emerald-200">
            ← Back to squad
          </Link>
          <h1 className="text-3xl font-semibold text-white">{playerName} communications</h1>
          <p className="text-sm text-white/60">
            Player-level message hub for this linked squad member. It includes direct player messages, managed squad availability reminders, linked prospect/payment history, and original lead history where available.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link href={`/admin/teams/${member.team.id}`} className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-white/10">
            Team overview
          </Link>
          {sourceProspectId ? (
            <Link href={`/admin/teams/${member.team.id}/prospects/${sourceProspectId}/communications`} className="inline-flex items-center justify-center rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-2.5 text-sm font-medium text-emerald-100 transition hover:bg-emerald-500/15">
              Linked prospect comms
            </Link>
          ) : null}
          {sourceLeadIds.length > 0 ? (
            <Link href={`/admin/leads/${sourceLeadIds[0]}`} className="inline-flex items-center justify-center rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-2.5 text-sm font-medium text-amber-100 transition hover:bg-amber-500/15">
              Original lead
            </Link>
          ) : null}
        </div>
      </div>

      {successMessage ? (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-100">{successMessage}</div>
      ) : null}

      {errorMessage ? (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-100">{errorMessage}</div>
      ) : null}

      <LinkedRoleLinks userId={member.user.id} current="player" />

      <section className="overflow-hidden rounded-3xl border border-emerald-400/15 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.16),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.03))] shadow-[0_24px_80px_rgba(0,0,0,0.3)]">
        <div className="grid gap-8 px-6 py-6 lg:grid-cols-[1.05fr_0.95fr] lg:px-8 lg:py-8">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-300/80">Player communications</p>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight text-white sm:text-3xl">Single player timeline</h2>
            <p className="mt-3 max-w-2xl text-sm text-white/70 sm:text-base">
              Use this page to contact {playerName} directly and review messages that belong to this player rather than the whole team.
            </p>

            <div className="mt-5 flex flex-wrap gap-2">
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white/75">Email: {member.user.email || "—"}</span>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white/75">Phone: {profile?.phone || "—"}</span>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white/75">Role: {getRoleLabel(member.role)}</span>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white/75">Team: {member.team.name}</span>
              {sourceProspectId ? (
                <span className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-100">Linked prospect history included</span>
              ) : (
                <span className="rounded-full border border-amber-400/20 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-100">No linked prospect record</span>
              )}
              {sourceLeadIds.length > 0 ? (
                <span className="rounded-full border border-sky-400/20 bg-sky-500/10 px-3 py-1 text-xs font-medium text-sky-100">Original lead history included</span>
              ) : (
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white/55">No source lead detected</span>
              )}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/55">Threads</p>
              <p className="mt-3 text-3xl font-semibold text-white">{threads.length}</p>
            </div>
            <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/55">Timeline</p>
              <p className="mt-3 text-3xl font-semibold text-white">{timeline.length}</p>
            </div>
            <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/55">League</p>
              <p className="mt-3 text-base font-semibold text-white">
                {leagueName ?? "—"}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <TeamCommunicationsComposer
          teamId={member.team.id}
          fromPath={`/admin/teams/${member.team.id}/players/${member.id}/communications`}
          toEmail={member.team.contactEmail ?? null}
          toPhone={member.team.contactPhone ?? null}
          contactName={playerName}
          teamName={member.team.name}
          leagueName={leagueName}
          claimCode={member.team.claimCode}
          claimLink={claimLink}
          captainDashboardUrl={claimLink}
          emailTemplates={resolvedEmailTemplates}
          smsTemplates={smsTemplates}
          showTeamContactRecipient={false}
          initialSelectedRecipientValues={[selectedPlayerRecipientValue]}
          playerRecipients={[
            {
              id: member.id,
              type: "teamMember",
              label: playerName,
              email: member.user.email,
              phone: profile?.phone ?? null,
              roleLabel: getRoleLabel(member.role),
              statusLabel: "Linked squad member",
            },
          ]}
        />

        <div className="rounded-3xl border border-white/10 bg-white/5">
          <div className="flex items-center justify-between border-b border-white/10 px-6 py-5">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">HISTORY</p>
              <h2 className="mt-2 text-xl font-semibold text-white">Timeline</h2>
            </div>
          </div>

          <div className="divide-y divide-white/10">
            {timeline.length === 0 ? (
              <div className="px-6 py-10 text-sm text-white/55">No player-level communications have been logged yet.</div>
            ) : (
              timeline.map((item) => (
                <div key={item.id} className="space-y-3 px-6 py-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-white/70">{item.channel}</span>
                    <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-white/70">{item.direction}</span>
                    <CommunicationStatusBadge status={item.statusLabel} />
                    <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-white/55">{item.sourceLabel}</span>
                    {item.templateName ? (
                      <span className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-2.5 py-1 text-[11px] text-emerald-100">Template: {item.templateName}</span>
                    ) : null}
                    {item.templateKey ? (
                      <span className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 font-mono text-[11px] text-white/60">{item.templateKey}</span>
                    ) : null}
                  </div>

                  <div>
                    <div className="text-sm font-semibold text-white">{item.subject}</div>
                    <div className="mt-1 text-xs text-white/45">
                      {item.contactName}{item.contactValue ? ` · ${item.contactValue}` : ""}
                    </div>
                  </div>

                  {item.channel === NotificationChannel.EMAIL && item.bodyHtml ? (
                    <div className="overflow-hidden rounded-2xl border border-white/10 bg-white">
                      <EmailHtmlPreview html={item.bodyHtml} />
                    </div>
                  ) : (
                    <div className="whitespace-pre-wrap rounded-2xl border border-white/10 bg-black/30 p-4 text-sm leading-6 text-white/80">{item.bodyText}</div>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-white/45">
                    <span>{formatUkDateTime(item.occurredAt)}</span>

                    {item.canCancelQueuedSms && item.messageEntryId && item.threadId ? (
                      <form action={cancelQueuedSmsMessageAction}>
                        <input type="hidden" name="messageId" value={item.messageEntryId} />
                        <input type="hidden" name="threadId" value={item.threadId} />
                        <input type="hidden" name="filter" value="all" />
                        <button type="submit" className="inline-flex items-center rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-100 transition hover:bg-red-500/15">
                          Cancel queued SMS
                        </button>
                      </form>
                    ) : null}
                  </div>

                  <CommunicationStatusExplanation status={item.statusLabel}>
                    {item.failureReason ? `Failure: ${item.failureReason}` : undefined}
                  </CommunicationStatusExplanation>
                </div>
              ))
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
