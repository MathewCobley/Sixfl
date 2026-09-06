// ========================================
// File: src/app/(admin)/admin/teams/[id]/page.tsx
// ========================================

import EmailHtmlPreview from "@/components/admin/email/EmailHtmlPreview";
import TeamMoveConfirmationSelect from "@/components/admin/teams/TeamMoveConfirmationSelect";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  NotificationChannel,
  NotificationDispatchStatus,
  UserRole,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import FormListboxField from "@/components/ui/FormListboxField";
import { upsertTeamNotificationRecipient } from "@/lib/notifications/team-contacts";
import { buildChargePaymentUrl } from "@/lib/payments/fixture-match-fees";
import { formatDateTimeInLondon } from "@/lib/datetime/london";
import {
  deleteTeamAction,
  regenerateClaimCodeAction,
  sendTeamMessageAction,
  sendTeamPaymentRequestAction,
  updateTeamDetailsAction,
} from "../actions";
import ConfirmDeleteButton from "@/components/admin/ConfirmDeleteButton";
import CopyToClipboardButton from "@/components/admin/CopyToClipboardButton";
import TeamBadge from "@/components/admin/TeamBadge";
import TeamEmailForm from "@/components/admin/teams/TeamEmailForm";
import PrimaryContactMemberSelector from "@/components/admin/teams/PrimaryContactMemberSelector";

function formatDispatchStatus(status: NotificationDispatchStatus) {
  switch (status) {
    case "QUEUED":
      return "Queued";
    case "PROCESSING":
      return "Processing";
    case "SENT":
      return "Sent";
    case "FAILED":
      return "Failed";
    case "CANCELLED":
      return "Cancelled";
    case "SKIPPED":
      return "Skipped";
    default:
      return status;
  }
}

function formatChannel(channel: NotificationChannel) {
  return channel === "SMS" ? "SMS" : "Email";
}

function formatThreadStatus(status: string) {
  if (status === "OPEN") return "Open";
  if (status === "ARCHIVED") return "Archived";
  return status;
}

function formatMessageDirection(direction: string) {
  return direction === "INBOUND" ? "Reply received" : "Sent";
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

function getDispatchOriginLabel(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return "Sent to team";
  }

  const value = (metadata as Record<string, unknown>).originLabel;

  if (typeof value === "string" && value.trim()) {
    return value;
  }

  return "Sent to team";
}

function getMetadataRecord(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  return metadata as Record<string, unknown>;
}

function getDispatchCta(input: {
  metadata: unknown;
  matchFeeCtaUrl?: string | null;
}) {
  const metadata = getMetadataRecord(input.metadata);

  const ctaLabel =
    typeof metadata?.ctaLabel === "string" && metadata.ctaLabel.trim()
      ? metadata.ctaLabel.trim()
      : null;

  const ctaUrl =
    typeof metadata?.ctaUrl === "string" && metadata.ctaUrl.trim()
      ? metadata.ctaUrl.trim()
      : null;

  if (ctaLabel && ctaUrl) {
    return { label: ctaLabel, url: ctaUrl };
  }

  const paymentUrl =
    typeof metadata?.paymentUrl === "string" && metadata.paymentUrl.trim()
      ? metadata.paymentUrl.trim()
      : null;

  if (paymentUrl) {
    return { label: "Pay now", url: paymentUrl };
  }

  if (input.matchFeeCtaUrl) {
    return {
      label: "Review & pay match fee",
      url: input.matchFeeCtaUrl,
    };
  }

  return null;
}

function formatHistoryBodyText(
  bodyText: string,
  cta: { label: string; url: string } | null,
) {
  const filteredLines = bodyText
    .trim()
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => {
      const trimmed = line.trim();

      if (trimmed === "{{cta}}") {
        return false;
      }

      if (cta && (trimmed === `${cta.label}: ${cta.url}` || trimmed === cta.url)) {
        return false;
      }

      return true;
    });

  return filteredLines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function getPrimaryActionButtonClass(enabled: boolean) {
  return enabled
    ? "rounded-xl bg-emerald-500 px-4 py-2 font-medium text-black transition hover:bg-emerald-400"
    : "cursor-not-allowed rounded-xl border border-white/10 bg-white/5 px-4 py-2 font-medium text-white/40";
}

type TeamMessageHistoryItem = {
  id: string;
  kind: "dispatch" | "legacyLeadEmail";
  channel: NotificationChannel;
  statusLabel: string;
  originLabel: string;
  subject: string;
  bodyText: string;
  bodyHtml: string | null;
  recipientLabel: string;
  recipientValue: string;
  queuedAt: Date;
  sentAt: Date | null;
  failureReason: string | null;
  cta: { label: string; url: string } | null;
};

type Props = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{
    error?: string;
    regenerated?: string;
    saved?: string;
    deleted?: string;
    messageQueued?: string;
    paymentQueued?: string;
    paymentError?: string;
    channel?: string;
    composeError?: string;
  }>;
};

export default async function AdminTeamPage({
  params,
  searchParams,
}: Props) {
  await requireAdmin();

  const { id } = await params;
  const sp = (await searchParams) ?? {};

  if (!id) {
    notFound();
  }

  const [team, leagues, emailTemplates] = await Promise.all([
    prisma.team.findUnique({
      where: { id },
      include: {
        members: {
          where: { role: "CAPTAIN" },
          include: {
            user: {
              select: {
                email: true,
                name: true,
                role: true,
              },
            },
          },
        },
        league: {
          select: {
            id: true,
            name: true,
            season: true,
            slug: true,
            isMoving: true,
          },
        },
        convertedFromLead: {
          select: {
            id: true,
            contactName: true,
            email: true,
            phone: true,
            area: true,
            emails: {
              orderBy: {
                sentAt: "desc",
              },
              select: {
                id: true,
                subject: true,
                body: true,
                sentTo: true,
                sentAt: true,
              },
            },
          },
        },
        createdByUser: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    }),
    prisma.league.findMany({
      orderBy: [{ isActive: "desc" }, { name: "asc" }, { season: "asc" }],
      select: {
        id: true,
        name: true,
        season: true,
        isActive: true,
      },
    }),
    prisma.emailTemplate.findMany({
      where: {
        isActive: true,
        audience: {
          in: ["TEAM", "GENERAL"],
        },
      },
      orderBy: [{ audience: "asc" }, { name: "asc" }],
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
  ]);

  if (!team) {
    notFound();
  }

  const { snapshot: contactSnapshot, recipient } =
    await upsertTeamNotificationRecipient(id);

  const [dispatches, messageThreads] = await Promise.all([
    prisma.notificationDispatch.findMany({
      where: {
        OR: [
          {
            sourceType: "TEAM",
            sourceId: id,
          },
          {
            recipientId: recipient.id,
          },
        ],
      },
      include: {
        recipient: true,
        attempts: {
          orderBy: {
            attemptedAt: "desc",
          },
          take: 3,
        },
      },
      orderBy: [{ createdAt: "desc" }],
      take: 100,
    }),
    prisma.messageThread.findMany({
      where: {
        channel: "SMS",
        OR: [{ teamId: id }, { recipientId: recipient.id }],
      },
      include: {
        team: {
          select: {
            id: true,
            name: true,
            logoUrl: true,
          },
        },
        recipient: true,
        league: {
          select: {
            id: true,
            name: true,
            season: true,
            slug: true,
          },
        },
        messages: {
          where: {
            channel: "SMS",
          },
          orderBy: [{ createdAt: "desc" }],
          take: 20,
        },
      },
      orderBy: [{ latestMessageAt: "desc" }, { updatedAt: "desc" }],
      take: 20,
    }),
  ]);

  const matchFeeChargeIds = Array.from(
    new Set(
      dispatches
        .filter(
          (dispatch) =>
            dispatch.sourceType === "FIXTURE_MATCH_FEE" ||
            dispatch.sourceType === "FIXTURE_MATCH_FEE_REMINDER",
        )
        .map((dispatch) => dispatch.sourceId)
        .filter((value): value is string => Boolean(value)),
    ),
  );

  const matchFeeCharges = matchFeeChargeIds.length
    ? await prisma.paymentCharge.findMany({
        where: {
          id: {
            in: matchFeeChargeIds,
          },
        },
        select: {
          id: true,
          paymentToken: true,
        },
      })
    : [];

  const matchFeeCtaUrlByChargeId = new Map(
    matchFeeCharges
      .filter((charge) => Boolean(charge.paymentToken))
      .map((charge) => [
        charge.id,
        buildChargePaymentUrl(charge.paymentToken as string),
      ]),
  );

  const legacyLeadEmails = team.convertedFromLead?.emails ?? [];
  const historyItems: TeamMessageHistoryItem[] = [
    ...dispatches.map((dispatch) => {
      const matchFeeCtaUrl =
        dispatch.sourceType === "FIXTURE_MATCH_FEE" ||
        dispatch.sourceType === "FIXTURE_MATCH_FEE_REMINDER"
          ? dispatch.sourceId
            ? matchFeeCtaUrlByChargeId.get(dispatch.sourceId) ?? null
            : null
          : null;

      const cta = getDispatchCta({
        metadata: dispatch.metadata,
        matchFeeCtaUrl,
      });

      return {
        id: `dispatch-${dispatch.id}`,
        kind: "dispatch" as const,
        channel: dispatch.channel,
        statusLabel: formatDispatchStatus(dispatch.status),
        originLabel: getDispatchOriginLabel(dispatch.metadata),
        subject:
          dispatch.subject?.trim() ||
          (dispatch.channel === NotificationChannel.SMS
            ? "SMS message"
            : "Email"),
        bodyText: formatHistoryBodyText(dispatch.bodyText, cta),
        bodyHtml:
          dispatch.channel === NotificationChannel.EMAIL
            ? dispatch.bodyHtml ?? null
            : null,
        recipientLabel: dispatch.recipient.displayName || team.name,
        recipientValue:
          dispatch.channel === NotificationChannel.SMS
            ? dispatch.recipient.phone || "No phone"
            : dispatch.recipient.email || "No email",
        queuedAt: dispatch.createdAt,
        sentAt: dispatch.sentAt,
        failureReason: dispatch.failureReason,
        cta,
      };
    }),
    ...legacyLeadEmails.map((email) => ({
      id: `lead-email-${email.id}`,
      kind: "legacyLeadEmail" as const,
      channel: NotificationChannel.EMAIL,
      statusLabel: "Sent",
      originLabel: "Converted lead history",
      subject: email.subject?.trim() || "Email",
      bodyText: email.body,
      bodyHtml: null,
      recipientLabel: team.convertedFromLead?.contactName || team.name,
      recipientValue: email.sentTo,
      queuedAt: email.sentAt,
      sentAt: email.sentAt,
      failureReason: null,
      cta: null,
    })),
  ].sort((a, b) => {
    const aTime = (a.sentAt ?? a.queuedAt).getTime();
    const bTime = (b.sentAt ?? b.queuedAt).getTime();
    return bTime - aTime;
  });

  const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  const claimPath = `/claim?code=${encodeURIComponent(team.claimCode)}`;
  const claimLink = `${baseUrl}${claimPath}`;
  const captainDashboardUrl = claimLink;
  const teamJoinUrl = team.joinSlug
    ? `${baseUrl}/teams/join/${team.joinSlug}`
    : null;
  const FIXED_TEAM_PAYMENT_URL =
    "https://buy.stripe.com/14A14n95tclzg2udgL7IY02";

  const captainUser = team.members[0]?.user;
  const hasCaptain = Boolean(captainUser?.email);
  const isAdminCaptain = captainUser?.role === UserRole.ADMIN;

  const captainAccessLabel =
    team.captainClaimedAt && hasCaptain && !isAdminCaptain
      ? "Claimed"
      : team.captainInviteSentAt
        ? "Invite sent"
        : hasCaptain && !isAdminCaptain
          ? "Captain linked"
          : hasCaptain && isAdminCaptain
            ? "Admin linked"
            : "Unlinked";

  const queuedMessage = sp.messageQueued === "1";
  const queuedChannel = sp.channel === "sms" ? "SMS" : "Email";
  const emailReplyConfigured = Boolean(process.env.EMAIL_REPLY_DOMAIN?.trim());

  const teamLeagueName = team.league
    ? `${team.league.name}${team.league.season ? ` — ${team.league.season}` : ""}`
    : null;

  const teamEmailTemplates = emailTemplates.map((template) => {
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
                ? FIXED_TEAM_PAYMENT_URL
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
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <Link
            href="/admin/teams"
            className="text-sm text-emerald-300 hover:text-emerald-200"
          >
            ← Back to teams
          </Link>

          <h1 className="text-3xl font-semibold text-white">{team.name}</h1>

          <p className="text-sm text-white/60">
            Admin view for this team. Manage league assignment, branding,
            captain claim status, team access, fixture timing preferences, team
            contacts, and email/SMS history.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link
            href={`/captain/team/${team.id}`}
            className="inline-flex items-center justify-center rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-2.5 text-sm font-medium text-amber-100 transition hover:bg-amber-500/15"
          >
            Captain view
          </Link>

          <Link
            href={`/admin/teams/${team.id}/prospects`}
            className="inline-flex items-center justify-center rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-2.5 text-sm font-medium text-emerald-100 transition hover:bg-emerald-500/15"
          >
            Prospects
          </Link>

          <Link
            href={`/admin/teams/${team.id}/communications`}
            className="inline-flex items-center justify-center rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-2.5 text-sm font-medium text-emerald-100 transition hover:bg-emerald-500/15"
          >
            Communications
          </Link>
          <Link
            href={`/admin/teams/${team.id}/match-fees`}
            className="inline-flex items-center justify-center rounded-xl border border-sky-400/30 bg-sky-500/10 px-4 py-2.5 text-sm font-medium text-sky-100 transition hover:bg-sky-500/15"
          >
            Player match fees
          </Link>
          {team.league ? (
            <Link
              href={`/admin/leagues/${team.league.id}`}
              className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-white/10"
            >
              Open league
            </Link>
          ) : null}

          <Link
            href="/admin/teams"
            className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-white/10"
          >
            All teams
          </Link>
        </div>
      </div>

      {(sp.saved === "1" ||
        sp.regenerated === "1" ||
        sp.error ||
        queuedMessage ||
        sp.paymentQueued === "1" ||
        sp.composeError ||
        sp.paymentError) && (
        <div className="space-y-2 rounded-2xl border border-white/10 bg-black/30 p-4 text-sm">
          {sp.saved === "1" ? (
            <div className="text-emerald-300">Team details updated.</div>
          ) : null}

          {sp.regenerated === "1" ? (
            <div className="text-emerald-300">
              New claim code generated and the team was unclaimed.
            </div>
          ) : null}

          {queuedMessage ? (
            <div className="text-emerald-300">
              {queuedChannel} queued for this team.
            </div>
          ) : null}

          {sp.paymentQueued === "1" ? (
            <div className="text-emerald-300">
              Payment request email queued for this team.
            </div>
          ) : null}

          {sp.error === "has_fixtures" ? (
            <div className="text-red-300">
              Can’t delete this team because fixtures already exist for it.
            </div>
          ) : null}

          {sp.error === "missing_name" ? (
            <div className="text-red-300">Team name is required.</div>
          ) : null}

          {sp.composeError === "missing_subject" ? (
            <div className="text-red-300">Email subject is required.</div>
          ) : null}

          {sp.composeError === "missing_body" ? (
            <div className="text-red-300">Message body is required.</div>
          ) : null}

          {sp.composeError === "missing_email" ? (
            <div className="text-red-300">
              No primary team email is available yet.
            </div>
          ) : null}

          {sp.composeError === "missing_phone" ? (
            <div className="text-red-300">
              No primary team mobile number is available yet.
            </div>
          ) : null}

          {sp.composeError === "reply_not_configured" ? (
            <div className="text-red-300">
              Reply-by-email is not configured yet. Add EMAIL_REPLY_DOMAIN in
              the deployed environment before sending queued team emails.
            </div>
          ) : null}

          {sp.paymentError === "missing_url" ? (
            <div className="text-red-300">Payment link is required.</div>
          ) : null}

          {sp.paymentError === "missing_email" ? (
            <div className="text-red-300">
              This team does not have a primary email address yet.
            </div>
          ) : null}

          {sp.paymentError === "reply_not_configured" ? (
            <div className="text-red-300">
              Reply-by-email is not configured yet. Add EMAIL_REPLY_DOMAIN in
              the deployed environment before sending payment emails.
            </div>
          ) : null}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[1.4fr_0.9fr]">
        <div className="space-y-6">
          <div className="rounded-3xl border border-white/10 bg-white/5 p-6 md:p-8">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <TeamBadge name={team.name} logoUrl={team.logoUrl} size="lg" />

              <div className="space-y-1">
                <div>
                  <div className="text-sm text-white/60">Team name</div>
                  <div className="text-lg text-white">{team.name}</div>
                </div>

                <div className="text-sm text-white/60">
                  {team.league
                    ? `${team.league.name}${team.league.season ? ` — ${team.league.season}` : ""}`
                    : "No league assigned"}
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/5 p-6 md:p-8">
            <h2 className="mb-6 text-lg font-semibold text-white">
              Team settings
            </h2>

            {team.league?.isMoving === true ? (
            <div className="mb-6 rounded-2xl border border-white/10 bg-black/20 p-4">
              <TeamMoveConfirmationSelect
                enabled={team.league?.isMoving === true}
                teamId={team.id}
                teamName={team.name}
                initialStatus={team.moveConfirmationStatus}
                initialUpdatedAt={team.moveConfirmationUpdatedAt?.toISOString() ?? null}
                initialUpdatedBy={team.moveConfirmationUpdatedBy}
              />
              <p className="mt-2 text-xs leading-5 text-white/50">Record whether this team has agreed to the planned move. This does not change its league, fixtures or squad, and does not send a message.</p>
            </div>
            ) : null}

            <form action={updateTeamDetailsAction} className="space-y-5">
              <input type="hidden" name="id" value={team.id} />

              <div className="space-y-2">
                <label htmlFor="name" className="text-sm text-white/60">
                  Team name
                </label>

                <input
                  id="name"
                  name="name"
                  type="text"
                  defaultValue={team.name}
                  placeholder="Enter team name"
                  className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-white placeholder:text-white/35 outline-none transition focus:border-emerald-500/60"
                />

                <div className="text-xs text-white/50">
                  This updates the public team name, admin listings, and team
                  messaging label.
                </div>
              </div>

              <div className="space-y-2">
                <label htmlFor="leagueId" className="text-sm text-white/60">
                  League
                </label>

                <select
                  id="leagueId"
                  name="leagueId"
                  defaultValue={team.leagueId ?? ""}
                  className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-white outline-none transition focus:border-emerald-500/60"
                >
                  <option value="">No league</option>
                  {leagues.map((league) => (
                    <option key={league.id} value={league.id}>
                      {league.name}
                      {league.season ? ` — ${league.season}` : ""}
                      {league.isActive ? "" : " (inactive)"}
                    </option>
                  ))}
                </select>

                <div className="text-xs text-white/50">
                  Current:{" "}
                  {team.league
                    ? `${team.league.name}${team.league.season ? ` — ${team.league.season}` : ""}`
                    : "No league assigned"}
                </div>
              </div>

              <div className="space-y-2">
                <label htmlFor="logoUrl" className="text-sm text-white/60">
                  Logo URL
                </label>

                <input
                  id="logoUrl"
                  name="logoUrl"
                  type="text"
                  defaultValue={team.logoUrl ?? ""}
                  placeholder="/team-logos/ripon-rovers.png"
                  className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-white placeholder:text-white/35 outline-none transition focus:border-emerald-500/60"
                />

                <div className="text-xs text-white/50">
                  Use a path from{" "}
                  <span className="font-mono text-white/70">
                    public/team-logos
                  </span>
                  , for example{" "}
                  <span className="font-mono text-white/70">
                    /team-logos/ripon-rovers.png
                  </span>
                </div>

                <div className="text-xs text-white/50">
                  Current:{" "}
                  <span className="font-mono text-white/70">
                    {team.logoUrl || "No logo set"}
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <label
                  htmlFor="latestKickoffTime"
                  className="text-sm text-white/60"
                >
                  Latest kickoff time
                </label>

                <input
                  id="latestKickoffTime"
                  name="latestKickoffTime"
                  type="time"
                  defaultValue={team.latestKickoffTime ?? ""}
                  className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-white outline-none transition focus:border-emerald-500/60"
                />

                <div className="text-xs text-white/50">
                  Leave blank if this team can play any slot. Generated fixtures
                  will avoid kick-off times later than this.
                </div>

                <div className="text-xs text-white/50">
                  Current:{" "}
                  <span className="font-mono text-white/70">
                    {team.latestKickoffTime || "No restriction"}
                  </span>
                </div>
              </div>
              <div className="grid gap-5 lg:grid-cols-2">
                <div className="space-y-2">
                  <FormListboxField
                    name="teamMode"
                    label="Team mode"
                    value={team.teamMode ?? "STANDARD"}
                    options={[
                      { value: "STANDARD", label: "Standard team" },
                      { value: "MANAGED", label: "Managed team" },
                    ]}
                    placeholder="Select team mode"
                  />
                  <div className="text-xs text-white/50">
                    Managed teams are organiser-led and can later use
                    recruitment tools.
                  </div>
                </div>

                <label className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white/80">
                  <input
                    type="checkbox"
                    name="isRecruiting"
                    defaultChecked={Boolean(team.isRecruiting)}
                  />
                  Recruiting players
                </label>

                <div className="space-y-2">
                  <label htmlFor="joinSlug" className="text-sm text-white/60">
                    Join slug
                  </label>
                  <input
                    id="joinSlug"
                    name="joinSlug"
                    type="text"
                    defaultValue={team.joinSlug ?? ""}
                    placeholder="rossett-managed-team"
                    className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-white placeholder:text-white/35 outline-none transition focus:border-emerald-500/60"
                  />
                  <div className="text-xs text-white/50">
                    Future public join link: /teams/join/{team.joinSlug ?? "your-slug"}
                  </div>
                </div>

                <div className="space-y-2">
                  <label htmlFor="squadTargetSize" className="text-sm text-white/60">
                    Squad target size
                  </label>
                  <input
                    id="squadTargetSize"
                    name="squadTargetSize"
                    type="number"
                    min="0"
                    defaultValue={team.squadTargetSize ?? ""}
                    placeholder="10"
                    className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-white placeholder:text-white/35 outline-none transition focus:border-emerald-500/60"
                  />
                </div>

                <div className="space-y-2">
                  <label htmlFor="matchdayTargetSize" className="text-sm text-white/60">
                    Matchday target size
                  </label>
                  <input
                    id="matchdayTargetSize"
                    name="matchdayTargetSize"
                    type="number"
                    min="0"
                    defaultValue={team.matchdayTargetSize ?? ""}
                    placeholder="7"
                    className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-white placeholder:text-white/35 outline-none transition focus:border-emerald-500/60"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label htmlFor="managerNotes" className="text-sm text-white/60">
                  Manager notes
                </label>
                <textarea
                  id="managerNotes"
                  name="managerNotes"
                  rows={4}
                  defaultValue={team.managerNotes ?? ""}
                  placeholder="Internal notes about recruitment, squad gaps, or organiser setup."
                  className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-white placeholder:text-white/35 outline-none transition focus:border-emerald-500/60"
                />
              </div>

              <div className="grid gap-5 lg:grid-cols-2">
                <PrimaryContactMemberSelector
                  teamId={team.id}
                  defaultName={
                    team.contactName ?? contactSnapshot.primaryContact.name ?? ""
                  }
                  defaultEmail={
                    team.contactEmail ?? contactSnapshot.primaryContact.email ?? ""
                  }
                  defaultPhone={
                    team.contactPhone ?? contactSnapshot.primaryContact.phone ?? ""
                  }
                />

                <div className="space-y-2">
                  <label
                    htmlFor="secondaryContactName"
                    className="text-sm text-white/60"
                  >
                    Secondary contact name
                  </label>
                  <input
                    id="secondaryContactName"
                    name="secondaryContactName"
                    type="text"
                    defaultValue={team.secondaryContactName ?? ""}
                    placeholder="Assistant manager"
                    className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-white placeholder:text-white/35 outline-none transition focus:border-emerald-500/60"
                  />
                </div>

                <div className="space-y-2">
                  <label
                    htmlFor="secondaryContactEmail"
                    className="text-sm text-white/60"
                  >
                    Secondary contact email
                  </label>
                  <input
                    id="secondaryContactEmail"
                    name="secondaryContactEmail"
                    type="email"
                    defaultValue={team.secondaryContactEmail ?? ""}
                    placeholder="assistant@team.com"
                    className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-white placeholder:text-white/35 outline-none transition focus:border-emerald-500/60"
                  />
                </div>

                <div className="space-y-2">
                  <label
                    htmlFor="secondaryContactPhone"
                    className="text-sm text-white/60"
                  >
                    Secondary contact mobile
                  </label>
                  <input
                    id="secondaryContactPhone"
                    name="secondaryContactPhone"
                    type="text"
                    defaultValue={team.secondaryContactPhone ?? ""}
                    placeholder="07700 900456"
                    className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-white placeholder:text-white/35 outline-none transition focus:border-emerald-500/60"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="inline-flex items-center rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500"
              >
                Save team details
              </button>
            </form>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/5 p-6 md:p-8">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-white">
                  SMS inbox activity
                </h2>
                <p className="mt-1 text-sm text-white/60">
                  Inbound replies and outbound SMS linked to this team.
                </p>
              </div>

              <div className="rounded-full border border-white/10 bg-black/30 px-3 py-1 text-xs font-medium text-white/70">
                {messageThreads.length} thread{messageThreads.length === 1 ? "" : "s"}
              </div>
            </div>

            {messageThreads.length === 0 ? (
              <div className="mt-6 rounded-2xl border border-white/10 bg-black/20 px-4 py-5 text-sm text-white/55">
                No SMS conversations are linked to this team yet.
              </div>
            ) : (
              <div className="mt-6 space-y-5">
                {messageThreads.map((thread) => (
                  <div
                    key={thread.id}
                    className="overflow-hidden rounded-2xl border border-white/10 bg-black/20"
                  >
                    <div className="flex flex-col gap-4 border-b border-white/10 px-4 py-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-white/70">
                            {formatThreadStatus(thread.status)}
                          </span>
                          {thread.unreadForAdminCount > 0 ? (
                            <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-1 text-[11px] text-emerald-200">
                              {thread.unreadForAdminCount} unread
                            </span>
                          ) : null}
                          <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-white/55">
                            {thread.contactPhone ||
                              thread.phoneNormalized ||
                              "No phone"}
                          </span>
                        </div>

                        <div>
                          <div className="text-base font-semibold text-white">
                            {thread.team?.name ||
                              thread.contactName ||
                              thread.recipient?.displayName ||
                              "SMS conversation"}
                          </div>

                          <div className="mt-1 text-xs text-white/45">
                            Latest activity:{" "}
                            {thread.latestMessageAt ? formatUkDateTime(thread.latestMessageAt) : "—"}
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-3">
                        <Link
                          href={`/admin/messaging?thread=${thread.id}`}
                          className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/10"
                        >
                          Open in inbox
                        </Link>
                      </div>
                    </div>

                    <div className="divide-y divide-white/10">
                      {thread.messages.length === 0 ? (
                        <div className="px-4 py-4 text-sm text-white/55">
                          No messages recorded in this thread yet.
                        </div>
                      ) : (
                        thread.messages.map((message) => (
                          <div key={message.id} className="space-y-3 px-4 py-4">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-white/70">
                                {formatMessageDirection(message.direction)}
                              </span>
                              <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-white/55">
                                {message.participantRole}
                              </span>
                              {message.direction === "INBOUND" &&
                              !message.readAt ? (
                                <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-1 text-[11px] text-emerald-200">
                                  Unread
                                </span>
                              ) : null}
                            </div>

                            <div className="whitespace-pre-wrap rounded-2xl border border-white/10 bg-black/30 p-4 text-sm leading-6 text-white/80">
                              {message.body}
                            </div>

                            <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-white/45">
                              <div>From: {message.fromNumber || "—"}</div>
                              <div>To: {message.toNumber || "—"}</div>
                              <div>
                                Time:{" "}
                                {formatUkDateTime(
                                  message.receivedAt ??
                                    message.sentAt ??
                                    message.createdAt,
                                )}
                              </div>
                              <div>Status: {message.providerStatus || "—"}</div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/5 p-6 md:p-8">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-white">
                  Team contacts
                </h2>
                <p className="mt-1 text-sm text-white/60">
                  All known contact points for this team, including email
                  addresses and mobile numbers.
                </p>
              </div>

              <div className="rounded-full border border-white/10 bg-black/30 px-3 py-1 text-xs font-medium text-white/70">
                {contactSnapshot.contacts.length} contact
                {contactSnapshot.contacts.length === 1 ? "" : "s"}
              </div>
            </div>

            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4">
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-200/90">
                  Primary contact
                </div>
                <div className="mt-3 space-y-2 text-sm text-white/80">
                  <div>
                    <span className="text-white/45">Name:</span>{" "}
                    {contactSnapshot.primaryContact.name ?? "—"}
                  </div>
                  <div>
                    <span className="text-white/45">Email:</span>{" "}
                    {contactSnapshot.primaryContact.email ?? "—"}
                  </div>
                  <div>
                    <span className="text-white/45">Phone:</span>{" "}
                    {contactSnapshot.primaryContact.phone ?? "—"}
                  </div>
                  <div>
                    <span className="text-white/45">Source:</span>{" "}
                    {contactSnapshot.primaryContact.source ?? "—"}
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-white/55">
                  Lead / origin details
                </div>
                <div className="mt-3 space-y-2 text-sm text-white/80">
                  <div>
                    <span className="text-white/45">Converted from lead:</span>{" "}
                    {team.convertedFromLead ? "Yes" : "No"}
                  </div>
                  <div>
                    <span className="text-white/45">Lead name:</span>{" "}
                    {team.convertedFromLead?.contactName ?? "—"}
                  </div>
                  <div>
                    <span className="text-white/45">Lead email:</span>{" "}
                    {team.convertedFromLead?.email ?? "—"}
                  </div>
                  <div>
                    <span className="text-white/45">Lead phone:</span>{" "}
                    {team.convertedFromLead?.phone ?? "—"}
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 overflow-hidden rounded-2xl border border-white/10">
              <div className="divide-y divide-white/10">
                {contactSnapshot.contacts.length === 0 ? (
                  <div className="bg-black/20 px-4 py-5 text-sm text-white/55">
                    No team contact details are available yet.
                  </div>
                ) : (
                  contactSnapshot.contacts.map((contact) => (
                    <div
                      key={contact.key}
                      className="grid gap-3 bg-black/20 px-4 py-4 md:grid-cols-[1fr_1fr_1fr_auto] md:items-center"
                    >
                      <div>
                        <div className="text-sm font-medium text-white">
                          {contact.name ?? "Unnamed contact"}
                        </div>
                        <div className="mt-1 text-xs text-white/45">
                          {contact.label} · {contact.source}
                        </div>
                      </div>

                      <div className="text-sm text-white/80">
                        {contact.email ?? "—"}
                      </div>

                      <div className="text-sm text-white/80">
                        {contact.phone ?? "—"}
                      </div>

                      <div>
                        {contact.isPrimary ? (
                          <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-1 text-[11px] text-emerald-200">
                            Primary
                          </span>
                        ) : null}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/5 p-6 md:p-8">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-white">
                  Team message history
                </h2>
                <p className="mt-1 text-sm text-white/60">
                  Everything sent to this team from team level or league level,
                  plus any legacy email history from the converted lead,
                  appears here.
                </p>
              </div>

              <div className="rounded-full border border-white/10 bg-black/30 px-3 py-1 text-xs font-medium text-white/70">
                {historyItems.length} item{historyItems.length === 1 ? "" : "s"}
              </div>
            </div>

            <div className="mt-6 overflow-hidden rounded-2xl border border-white/10">
              <div className="divide-y divide-white/10">
                {historyItems.length === 0 ? (
                  <div className="bg-black/20 px-4 py-5 text-sm text-white/55">
                    No team, league, or converted lead email/SMS history for
                    this team yet.
                  </div>
                ) : (
                  historyItems.map((item) => (
                    <div key={item.id} className="space-y-3 bg-black/20 px-4 py-4">
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-white/70">
                              {formatChannel(item.channel)}
                            </span>
                            <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-white/70">
                              {item.statusLabel}
                            </span>
                            <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-white/55">
                              {item.originLabel}
                            </span>
                          </div>

                          <div className="mt-3 text-sm font-semibold text-white">
                            {item.subject}
                          </div>

                          <div className="mt-1 text-xs text-white/45">
                            To: {item.recipientLabel} · {item.recipientValue}
                          </div>
                        </div>

                        <div className="text-right text-xs text-white/45">
                          {item.kind === "legacyLeadEmail" ? (
                            <div>Sent: {item.sentAt ? formatUkDateTime(item.sentAt) : "—"}</div>
                          ) : (
                            <>
                              <div>Queued: {formatUkDateTime(item.queuedAt)}</div>
                              {item.sentAt ? (
                                <div>Sent: {formatUkDateTime(item.sentAt)}</div>
                              ) : null}
                            </>
                          )}
                        </div>
                      </div>

                      {item.channel === NotificationChannel.EMAIL && item.bodyHtml ? (
                        <div className="overflow-hidden rounded-2xl border border-white/10 bg-white">
                          <EmailHtmlPreview html={item.bodyHtml} />
                        </div>
                      ) : (
                        <>
                          <div className="whitespace-pre-wrap rounded-2xl border border-white/10 bg-black/30 p-4 text-sm leading-6 text-white/80">
                            {item.bodyText}
                          </div>

                          {item.cta ? (
                            <div className="mt-3">
                              <a
                                href={item.cta.url}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500"
                              >
                                {item.cta.label}
                              </a>
                              <div className="mt-2 break-all text-xs text-emerald-300">
                                {item.cta.url}
                              </div>
                            </div>
                          ) : null}
                        </>
                      )}

                      {item.failureReason ? (
                        <div className="text-xs text-red-300">
                          Failure: {item.failureReason}
                        </div>
                      ) : null}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
            <h2 className="text-lg font-semibold text-white">Team snapshot</h2>

            <div className="mt-4 space-y-4 text-sm text-white/70">
              <div className="flex items-center justify-between">
                <span>Captain status</span>
                <span className="font-medium text-white">
                  {captainAccessLabel}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span>Captain linked</span>
                <span className="text-right font-medium text-white">
                  {team.captainLinkedAt
                    ? formatUkDateTime(team.captainLinkedAt)
                    : "—"}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span>Linked source</span>
                <span className="text-right font-medium text-white">
                  {team.captainLinkedSource ?? "—"}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span>Invite sent</span>
                <span className="text-right font-medium text-white">
                  {team.captainInviteSentAt
                    ? formatUkDateTime(team.captainInviteSentAt)
                    : "—"}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span>Invite email</span>
                <span className="text-right font-medium text-white">
                  {team.captainInviteSentTo ?? "—"}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span>Claimed at</span>
                <span className="text-right font-medium text-white">
                  {team.captainClaimedAt
                    ? formatUkDateTime(team.captainClaimedAt)
                    : "—"}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span>Claim source</span>
                <span className="text-right font-medium text-white">
                  {team.captainClaimSource ?? "—"}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span>Primary email</span>
                <span className="text-right font-medium text-white">
                  {contactSnapshot.primaryContact.email ?? "—"}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span>Primary phone</span>
                <span className="text-right font-medium text-white">
                  {contactSnapshot.primaryContact.phone ?? "—"}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span>Unread SMS replies</span>
                <span className="text-right font-medium text-white">
                  {messageThreads.reduce(
                    (sum, thread) => sum + thread.unreadForAdminCount,
                    0,
                  )}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span>Team ID</span>
                <span className="font-mono text-xs text-white">{team.id}</span>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
            <h2 className="text-lg font-semibold text-white">
              Send payment request
            </h2>

            {!emailReplyConfigured ? (
              <div className="mt-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                Reply-by-email is not configured yet. Add{" "}
                <span className="font-mono">EMAIL_REPLY_DOMAIN</span> in the
                deployed environment, for example{" "}
                <span className="font-mono">replies.sixfl.co.uk</span>, before
                queueing payment emails.
              </div>
            ) : null}

            <form
              action={sendTeamPaymentRequestAction}
              className="mt-4 space-y-4"
            >
              <input type="hidden" name="teamId" value={team.id} />
              <input
                type="hidden"
                name="from"
                value={`/admin/teams/${team.id}`}
              />

              <div>
                <label className="mb-1 block text-sm text-white/70">To</label>
                <input
                  value={contactSnapshot.primaryContact.email ?? ""}
                  disabled
                  className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-white/50"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm text-white/70">
                  Payment link
                </label>
                <input
                  name="paymentUrl"
                  placeholder="https://buy.stripe.com/..."
                  className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-white outline-none focus:border-emerald-400"
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm text-white/70">
                    Amount
                  </label>
                  <input
                    name="paymentAmount"
                    placeholder="£30.00"
                    className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-white outline-none focus:border-emerald-400"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm text-white/70">
                    Reason
                  </label>
                  <input
                    name="paymentReason"
                    placeholder="Match fee for last night's game"
                    className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-white outline-none focus:border-emerald-400"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={!emailReplyConfigured}
                className={getPrimaryActionButtonClass(emailReplyConfigured)}
              >
                Queue payment email
              </button>
            </form>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
            <h2 className="text-lg font-semibold text-white">Send email</h2>

            {!emailReplyConfigured ? (
              <div className="mt-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                Reply-by-email is not configured yet. Add{" "}
                <span className="font-mono">EMAIL_REPLY_DOMAIN</span> in the
                deployed environment, for example{" "}
                <span className="font-mono">replies.sixfl.co.uk</span>, before
                queueing team emails.
              </div>
            ) : null}

            <TeamEmailForm
              teamId={team.id}
              toEmail={contactSnapshot.primaryContact.email ?? null}
              contactName={contactSnapshot.primaryContact.name ?? null}
              teamName={contactSnapshot.teamName}
              leagueName={teamLeagueName}
              claimCode={team.claimCode}
              claimLink={claimLink}
              captainDashboardUrl={captainDashboardUrl}
              fromPath={`/admin/teams/${team.id}`}
              templates={teamEmailTemplates}
              emailReplyConfigured={emailReplyConfigured}
            />
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
            <h2 className="text-lg font-semibold text-white">Send SMS</h2>

            <form action={sendTeamMessageAction} className="mt-4 space-y-4">
              <input type="hidden" name="teamId" value={team.id} />
              <input
                type="hidden"
                name="from"
                value={`/admin/teams/${team.id}`}
              />
              <input type="hidden" name="channel" value="SMS" />

              <div>
                <label className="mb-1 block text-sm text-white/70">
                  Mobile
                </label>
                <input
                  value={contactSnapshot.primaryContact.phone ?? ""}
                  disabled
                  className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-white/50"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm text-white/70">
                  Message
                </label>
                <textarea
                  name="body"
                  rows={6}
                  className="w-full resize-none rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm leading-6 text-white outline-none focus:border-emerald-400"
                  placeholder="SIXFL: quick update for your team. Please check your email or reply if you need anything."
                />
              </div>

              <button
                type="submit"
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 font-medium text-white transition hover:bg-white/10"
              >
                Queue SMS
              </button>
            </form>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
            <h2 className="text-lg font-semibold text-white">Captain access</h2>

            <div className="mt-4 space-y-4">
              <div>
                <div className="text-sm text-white/60">Claim code</div>
                <div className="mt-2 flex items-center gap-3">
                  <div className="font-mono text-sm text-white/80">
                    {team.claimCode}
                  </div>
                  <CopyToClipboardButton
                    text={team.claimCode}
                    label="Copy code"
                    className="rounded-md border border-white/10 px-3 py-1.5 text-xs hover:bg-white/5"
                  />
                </div>
              </div>

              <div>
                <div className="text-sm text-white/60">Claim link</div>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <a
                    href={claimLink}
                    className="break-all text-sm text-emerald-400 underline underline-offset-4 hover:text-emerald-300"
                  >
                    {claimLink}
                  </a>
                  <CopyToClipboardButton
                    text={claimLink}
                    label="Copy link"
                    className="rounded-md border border-white/10 px-3 py-1.5 text-xs hover:bg-white/5"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-yellow-500/30 bg-yellow-500/5 p-6">
            <h2 className="text-lg font-semibold text-yellow-200">
              Regenerate captain code
            </h2>

            <p className="mt-2 text-sm text-white/60">
              Regenerating the claim code invalidates the old link, clears invite/claim tracking, and removes the current captain assignment.
            </p>

            <form action={regenerateClaimCodeAction} className="mt-5">
              <input type="hidden" name="id" value={team.id} />
              <input
                type="hidden"
                name="from"
                value={`/admin/teams/${team.id}`}
              />
              <ConfirmDeleteButton
                label="Regenerate claim code"
                confirmText={`Regenerate claim code for "${team.name}" and unclaim the team?`}
                className="rounded-md bg-yellow-600 px-4 py-2 text-black hover:bg-yellow-500"
              />
            </form>
          </div>

          <div className="rounded-3xl border border-red-500/30 bg-red-500/5 p-6">
            <h2 className="text-lg font-semibold text-red-400">Danger zone</h2>

            <p className="mt-2 text-sm text-white/60">
              Deleting a team cannot be undone.
            </p>

            <form action={deleteTeamAction} className="mt-5">
              <input type="hidden" name="id" value={team.id} />
              <input
                type="hidden"
                name="from"
                value={`/admin/teams/${team.id}`}
              />
              <ConfirmDeleteButton
                label="Delete team"
                confirmText={`Delete "${team.name}"? This cannot be undone.`}
                className="rounded-md bg-red-600 px-4 py-2 text-white hover:bg-red-500"
              />
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
